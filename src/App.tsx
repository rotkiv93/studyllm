import { errorText } from "./lib/localizedError";
import { useCallback, useEffect, useRef, useState } from "react";
import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import {
  ProviderRouter,
  routerReasonKey,
  type ChatMessage,
  type ConfiguredProvider,
  type StreamEvent,
} from "./lib/providerRouter";
import { LOCAL_ROUTER_PLACEHOLDER_KEY, PROVIDER_MANIFEST } from "./lib/providers";
import type { QuotaSnapshot } from "./components/QuotaMeter";
import { fetchProviderModels } from "./lib/providerModels";
import { setCredential, getCredential, deleteCredential } from "./lib/credentials";
import {
  listProviders,
  insertProvider,
  updateProvider,
  deleteProvider,
  recordProviderUsage,
  getProviderUsageToday,
  localDateKey,
  createConversation,
  updateConversationSettings,
  getConversation,
  deleteConversation,
  insertMessage,
  listConversations,
  listMessages,
  touchConversation,
  listMcpServers,
  insertMcpServer,
  updateMcpServer,
  deleteMcpServer,
  insertToolCall,
  listToolCallsForConversation,
  renameConversation,
  deleteMessagesFrom,
  listRagDocuments,
  deleteRagDocument,
  listCourseProgress,
  migrateCourseModuleOrder,
  markCourseTaskDone,
  unmarkCourseTask,
  resetCourseProgress,
  type ConversationRow,
  type ProviderRow,
  type McpServerRow,
  type ToolCallRow,
  type RagDocumentRow,
} from "./lib/db";
import { ProvidersPanel, type ProviderDraft, type ProviderEditDraft } from "./components/ProvidersPanel";
import { AppSettingsPanel } from "./components/AppSettingsPanel";
import { McpPanel } from "./components/McpPanel";
import { type ResolvedInstall } from "./components/McpMarketplace";
import { PluginsPanel } from "./components/PluginsPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { Sidebar } from "./components/Sidebar";
import { LibraryPanel } from "./components/LibraryPanel";
import { CoursePanel, type CourseAppState } from "./components/CoursePanel";
import { AppTopBar, type AppMode } from "./components/AppTopBar";
import { courseProgress } from "./lib/course/checks";
import { COURSE_MODULES, type CourseTarget } from "./lib/course/modules";
import type { LabRequest } from "./lib/course/labs";
import { listOmniConnections, omniStart, omniStop, probeOmniRoute } from "./lib/omniroute";
import type { ProviderMode } from "./components/OmniRouteView";
import { RetrievedSources } from "./components/RetrievedSources";
import { ToolCallBlock } from "./components/ToolCallBlock";
import { Markdown } from "./components/Markdown";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconEdit,
  IconLoader,
  IconPaperclip,
  IconRefresh,
  IconSend,
  IconStop,
  IconX,
} from "./components/icons";
import {
  PlaygroundPanel,
  DEFAULT_CHAT_SETTINGS,
  isChatSettingsActive,
  type ChatSettings,
} from "./components/PlaygroundPanel";
import {
  RESEARCH_TOOL_CATALOG_IDS,
  isResearchServer,
  type ResearchMode,
} from "./lib/researchModes";
import { CURATED_ENTRIES, repairCuratedArgs } from "./lib/curatedMcp";
import { sanitizeToolSchema } from "./lib/toolSchema";
import { computeTrustTier } from "./lib/mcpCatalog";
import {
  ingestDocument,
  retrieve,
  resolveEmbedder,
  embedderErrorText,
  LIBRARY_MAX_CHARS,
  buildRagSystemBlock,
  type RetrievedChunk,
} from "./lib/rag";
import {
  loadEmbeddingConfig,
  saveEmbeddingConfig,
  type EmbeddingConfig,
} from "./lib/embeddings";
import {
  buildTranscriptMarkdown,
  buildTranscriptPlainText,
  findDocsServerId,
  extractDocId,
  extractDocUrl,
} from "./lib/exportChat";
import {
  buildExportDoc,
  EXPORT_EXTENSIONS,
  renderExport,
  suggestFileName,
  type ExportFormat,
} from "./lib/exportFile";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  parseAttachment,
  buildOutgoingContent,
  isSupportedAttachment,
  MAX_ATTACHMENTS,
  SUPPORTED_ATTACHMENT_HINT,
  type ParsedAttachment,
} from "./lib/attachments";
import { UserMessageContent } from "./components/MessageAttachments";
import {
  callMcpTool,
  filesystemServerArgs,
  getToolPermission,
  isMcpServerRunning,
  listMcpTools,
  onMcpServerStatusChanged,
  parseToolPermissions,
  startMcpServer,
  startRemoteMcpServer,
  stopMcpServer,
  type McpToolInfo,
} from "./lib/mcp";
import { oauthConnect, oauthReconnect } from "./lib/oauth";
import { appendCrashLog } from "./lib/crashlog";
import { CONNECTORS, DESTRUCTIVE_GOOGLE_TOOLS, type OAuthConnector } from "./lib/googleConnectors";
import { useT } from "./lib/i18n";
import { checkForUpdate } from "./lib/updater";
import "./App.css";

/** localStorage key remembering whether the app was last left in Chat or Course mode. */
const APP_MODE_STORAGE_KEY = "studyllm.mode";
const LAB_OPEN_STORAGE_KEY = "studyllm.lab.open";
const PROVIDER_MODE_STORAGE_KEY = "studyllm.provider.mode";
const LAB_TARGET_STORAGE_KEY = "studyllm.lab.target";

function newId(): string {
  return crypto.randomUUID();
}

/** Map the UI chat-lab settings to the nullable DB column shape (empty prompt → null). */
function chatSettingsToRow(s: ChatSettings) {
  return {
    system_prompt: s.systemPrompt.trim() ? s.systemPrompt : null,
    temperature: s.temperature,
    top_p: s.topP,
    max_tokens: s.maxTokens,
  };
}

/** Rebuild UI chat-lab settings from a persisted conversation row. */
function chatSettingsFromRow(row: ConversationRow): ChatSettings {
  return {
    systemPrompt: row.system_prompt ?? "",
    temperature: row.temperature,
    topP: row.top_p,
    maxTokens: row.max_tokens,
  };
}

type DisplayMessage =
  | { role: "user" | "assistant"; content: string; id?: string; providerLabel?: string; model?: string }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: string;
      isError: boolean;
      pending: boolean;
    }
  // Ephemeral (not persisted): the library passages retrieved for a RAG-grounded turn, shown above
  // the answer so the student sees what the assistant was given to work from.
  | { role: "sources"; sources: RetrievedChunk[] };

/** Some providers (e.g. Gemini, reached via OpenRouter) reject function/tool names that don't
 * start with a letter or underscore — MCP server ids are UUIDs, which often start with a digit.
 * The leading "t" guarantees a valid first character regardless of the id. */
function sanitizeToolKey(raw: string): string {
  return "t" + raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatApprovalInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="message-copy"
      title={t("chat.copyMessage")}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}

/**
 * Heal servers whose stored argv was persisted before the curated catalog fixed it (see
 * `repairCuratedArgs`) — an install writes `args_json` once, so editing CURATED_ENTRIES alone
 * leaves existing rows launching the broken command forever. Runs at startup, before autostart,
 * and rewrites only the rows that actually need it.
 */
async function repairStoredMcpArgs(rows: McpServerRow[]): Promise<McpServerRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      let args: unknown;
      try {
        args = JSON.parse(row.args_json);
      } catch {
        return row;
      }
      if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) return row;
      const repaired = repairCuratedArgs(row.command, args as string[]);
      if (!repaired) return row;
      const args_json = JSON.stringify(repaired);
      await updateMcpServer(row.id, { args_json });
      return { ...row, args_json };
    }),
  );
}

export default function App() {
  const t = useT();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const listedProvidersRef = useRef<ProviderRow[]>([]);
  const [quota, setQuota] = useState<QuotaSnapshot>({ requests: {}, cooldowns: {} });
  const [showProviders, setShowProviders] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  // Chat mode vs Course mode. Remembered across launches so a student resumes where they were.
  const [showCourse, setShowCourse] = useState(() => {
    try {
      return localStorage.getItem(APP_MODE_STORAGE_KEY) === "course";
    } catch {
      return false;
    }
  });
  // Course progress: finished task ids + the reflections saved with them.
  const [courseDone, setCourseDone] = useState<Set<string>>(new Set());
  const [courseNotes, setCourseNotes] = useState<Record<string, string>>({});
  const [showPlugins, setShowPlugins] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Deep Research: active mode (null = off) + whether any research-capable tool is running.
  const [researchMode, setResearchMode] = useState<ResearchMode | null>(null);
  // RAG: whether this turn should retrieve from the document library.
  const [useLibrary, setUseLibrary] = useState(false);
  // Chat lab: per-conversation system prompt + decoding knobs the student controls, plus whether
  // the control panel is open. Hydrated from the conversation row on select, reset on new chat.
  const [chatSettings, setChatSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  // The Lab bar on the right is always there; this is whether it is expanded or a narrow rail.
  // Which provider (and model) the student pinned in the Lab; null provider = automatic, in list order.
  const [labTarget, setLabTargetState] = useState<{ providerId: string | null; model: string | null }>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LAB_TARGET_STORAGE_KEY) ?? "null");
      if (raw && typeof raw === "object") {
        return {
          providerId: typeof raw.providerId === "string" ? raw.providerId : null,
          model: typeof raw.model === "string" ? raw.model : null,
        };
      }
    } catch {
      /* start automatic */
    }
    return { providerId: null, model: null };
  });
  const setLabTarget = useCallback((next: { providerId: string | null; model: string | null }) => {
    setLabTargetState(next);
    try {
      localStorage.setItem(LAB_TARGET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, []);
  const [labExpanded, setLabExpandedState] = useState(() => {
    try {
      return localStorage.getItem(LAB_OPEN_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setLabExpanded = useCallback((next: boolean) => {
    setLabExpandedState(next);
    try {
      localStorage.setItem(LAB_OPEN_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* non-fatal: the bar just won't be remembered */
    }
  }, []);
  const [ragDocuments, setRagDocuments] = useState<RagDocumentRow[]>([]);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig | null>(() =>
    loadEmbeddingConfig(),
  );
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [installingResearchTools, setInstallingResearchTools] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ParsedAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Auto-grow the composer textarea to fit its content (capped by max-height in CSS).
  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Notices are informational (saved, copied, failover…): clear them on their own.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [notice]);
  // Silent update check once per launch; failures (offline, no release yet) are not worth surfacing.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    checkForUpdate()
      .then((update) => {
        if (update) setNotice(t("notice.updateAvailable", { version: update.version }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on launch
  }, []);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportAnswersOnly, setExportAnswersOnly] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerRow[]>([]);
  const [mcpToolsByServer, setMcpToolsByServer] = useState<Record<string, McpToolInfo[]>>({});
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "1",
  );
  const [pendingApproval, setPendingApproval] = useState<{
    id: string;
    serverName: string;
    toolName: string;
    input: unknown;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Own provider keys, or OmniRoute handling them — one or the other (persisted).
  const [providerMode, setProviderModeState] = useState<ProviderMode>(() => {
    try {
      return localStorage.getItem(PROVIDER_MODE_STORAGE_KEY) === "omniroute" ? "omniroute" : "own";
    } catch {
      return "own";
    }
  });
  const providerModeRef = useRef<ProviderMode>(providerMode);
  const [providerModeBusy, setProviderModeBusy] = useState(false);
  const routerRef = useRef<ProviderRouter>(new ProviderRouter([]));
  /** The last list handed to the router, so a Course lab can answer with one provider only. */
  const configuredProvidersRef = useRef<ConfiguredProvider[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendLockRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const approvalResolvers = useRef<Map<string, (approved: boolean) => void>>(new Map());

  useEffect(() => {
    (async () => {
      const rows = await listProviders();
      setProviders(rows);
      if (rows.length === 0 && localStorage.getItem("onboardingDismissed") !== "1") {
        setShowOnboarding(true);
      }
      await refreshProviders();
    })();
    refreshConversations();
    refreshRagDocuments();
    // In OmniRoute mode the router starts with the app.
    if (providerModeRef.current === "omniroute") void omniStart().catch(() => {});
    migrateCourseModuleOrder()
      .catch(() => {})
      .then(() => listCourseProgress())
      .then((rows) => {
        setCourseDone(new Set(rows.map((r) => r.task_id)));
        setCourseNotes(
          Object.fromEntries(rows.filter((r) => r.note).map((r) => [r.task_id, r.note as string])),
        );
      })
      .catch(() => {
        // Progress is a convenience; a failed read just starts the Course from the top.
      });
    (async () => {
      const rows = await repairStoredMcpArgs(await listMcpServers());
      setMcpServers(rows);
      for (const server of rows) {
        try {
          // A webview reload (or dev hot-reload) leaves servers running in the Rust host but empties this
          // tool state, so the chat would offer no tools while the panel says "running". Re-adopt them.
          if (await isMcpServerRunning(server.id)) {
            const tools = await listMcpTools(server.id);
            setMcpToolsByServer((prev) => ({ ...prev, [server.id]: tools }));
          } else if (server.autostart) {
            await handleStartMcpServer(server);
          }
        } catch {
          // Best-effort autostart; leave the server stopped and let the user retry from the panel.
        }
      }
    })();
    const unlisten = onMcpServerStatusChanged(async (event) => {
      if (event.status === "running") {
        try {
          const tools = await listMcpTools(event.id);
          setMcpToolsByServer((prev) => ({ ...prev, [event.id]: tools }));
          await updateMcpServer(event.id, { cached_tools_json: JSON.stringify(tools) });
          await refreshMcpServers();
        } catch {
          // Server reported running but tool listing failed; leave tools as-is.
        }
      } else {
        setMcpToolsByServer((prev) => {
          if (!(event.id in prev)) return prev;
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(APP_MODE_STORAGE_KEY, showCourse ? "course" : "chat");
    } catch {
      /* non-fatal: the app just reopens in Chat mode */
    }
  }, [showCourse]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function refreshMcpServers() {
    const rows = await listMcpServers();
    setMcpServers(rows);
  }

  // Stable identities: the Course's auto-check effect depends on `onMark`.
  const handleCourseMark = useCallback(async (taskId: string, note?: string | null) => {
    await markCourseTaskDone(taskId, note ?? null);
    setCourseDone((prev) => (prev.has(taskId) ? prev : new Set(prev).add(taskId)));
    if (note) setCourseNotes((prev) => ({ ...prev, [taskId]: note }));
  }, []);

  const handleCourseUnmark = useCallback(async (taskId: string) => {
    await unmarkCourseTask(taskId);
    setCourseDone((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setCourseNotes((prev) => {
      if (!(taskId in prev)) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const handleCourseReset = useCallback(async () => {
    await resetCourseProgress();
    setCourseDone(new Set());
    setCourseNotes({});
  }, []);

  /** Where a task's shortcut button leads. The overlays open on top of the Course page. */
  function handleCourseOpen(target: CourseTarget) {
    if (target === "chat") setShowCourse(false);
    else if (target === "providers") setShowProviders(true);
    else if (target === "mcp") setShowMcp(true);
    else if (target === "plugins") setShowPlugins(true);
    else setShowLibrary(true);
  }

  /** The Prompt Builder hands its text to the chat composer, ready to send. */
  function handleCourseUsePrompt(prompt: string) {
    setInput(prompt);
    setShowCourse(false);
  }

  /** The providers the chat actually uses right now: the OmniRoute one, or everything but it. */
  const activeProviders = providers.filter((p) =>
    providerMode === "omniroute" ? p.type === "omniroute" : p.type !== "omniroute",
  );

  /** Switches between your own keys and OmniRoute; OmniRoute starts when chosen and stops when left. */
  async function handleProviderMode(next: ProviderMode) {
    if (next === providerModeRef.current) return;
    setProviderModeBusy(true);
    try {
      providerModeRef.current = next;
      setProviderModeState(next);
      try {
        localStorage.setItem(PROVIDER_MODE_STORAGE_KEY, next);
      } catch {
        /* non-fatal */
      }
      if (next === "omniroute") {
        const existing = providers.find((p) => p.type === "omniroute");
        const manifest = PROVIDER_MANIFEST.omniroute;
        if (!existing) {
          await handleAddProvider({
            type: "omniroute",
            label: manifest.label,
            model: manifest.defaultModel,
            apiKey: LOCAL_ROUTER_PLACEHOLDER_KEY,
            baseURL: manifest.baseURL,
          });
        } else if (!existing.enabled) {
          await updateProvider(existing.id, { enabled: 1 });
        }
        void omniStart().catch(() => {});
      } else {
        await omniStop().catch(() => {});
      }
      await refreshProviders();
    } finally {
      setProviderModeBusy(false);
    }
  }

  /** Live model ids for one provider, for the Lab's model picker. null when the provider can't list them. */
  async function loadProviderModels(providerId: string): Promise<string[] | null> {
    const row = providers.find((p) => p.id === providerId);
    if (!row) return null;
    const apiKey = (await getCredential(row.secret_ref)) ?? "";
    const list = await fetchProviderModels(row.type, apiKey, row.base_url_override ?? undefined);
    return list ? list.map((m) => m.id) : null;
  }

  const toggleSidebar = () =>
    setSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      return next;
    });

  /** The slice of Course state the app already holds; the panel adds the values that need a query. */
  const courseAppState: CourseAppState = {
    enabledProviderCount: providers.filter((p) => p.enabled && p.type !== "omniroute").length,
    hasOmniroute: providers.some((p) => p.type === "omniroute"),
    hasOllama: providers.some((p) => p.type === "ollama"),
    runningServerNames: mcpServers.filter((s) => s.id in mcpToolsByServer).map((s) => s.name.toLowerCase()),
    // Gmail & co. default their destructive tools to "ask", so only hand-set permissions count here.
    hasAskPermission: mcpServers.some(
      (s) => !s.oauth_provider && Object.values(parseToolPermissions(s.tool_permissions_json)).includes("ask"),
    ),
    googleConnected: mcpServers.some((s) => s.oauth_provider === "google"),
    ragDocumentCount: ragDocuments.length,
  };

  async function refreshConversations() {
    const rows = await listConversations();
    setConversations(rows);
  }

  function handleNewChat() {
    if (isStreaming) return;
    conversationIdRef.current = null;
    setActiveConversationId(null);
    setMessages([]);
    setChatSettings(DEFAULT_CHAT_SETTINGS);
    setError(null);
    setNotice(null);
  }

  /** Edit the chat-lab settings and, if the conversation already exists, persist them immediately.
   * When no conversation exists yet (fresh chat), they ride along at first-send creation instead. */
  function handleChatSettingsChange(next: ChatSettings) {
    setChatSettings(next);
    const id = conversationIdRef.current;
    if (id) void updateConversationSettings(id, chatSettingsToRow(next));
  }

  async function handleSelectConversation(id: string) {
    if (isStreaming || id === activeConversationId) return;
    const [rows, toolRows, conversation] = await Promise.all([
      listMessages(id),
      listToolCallsForConversation(id),
      getConversation(id),
    ]);
    const toolsByMessage = new Map<string, ToolCallRow[]>();
    for (const t of toolRows) {
      const arr = toolsByMessage.get(t.message_id);
      if (arr) arr.push(t);
      else toolsByMessage.set(t.message_id, [t]);
    }
    const display: DisplayMessage[] = rows.flatMap((m) => {
      const providerLabel =
        m.role === "assistant"
          ? (providers.find((p) => p.id === m.provider_used)?.label ?? m.provider_used ?? undefined)
          : undefined;
      const model = m.role === "assistant" ? (m.model_used ?? undefined) : undefined;
      const tools = (toolsByMessage.get(m.id) ?? []).slice().sort((a, b) => a.seq - b.seq);

      if (tools.length === 0) {
        return [{ role: m.role, content: m.content, id: m.id, providerLabel, model }];
      }

      // Interleave persisted tool calls back with the text segments they fell between, using
      // each call's text_offset (a snapshot of how much assistant text had streamed in by the
      // time the call was made) — matches the original live-streaming interleave order instead
      // of always rendering "all tool calls, then the text".
      const parts: DisplayMessage[] = [];
      let cursor = 0;
      for (const t of tools) {
        const offset = Math.max(cursor, Math.min(t.text_offset, m.content.length));
        if (offset > cursor) {
          parts.push({ role: "assistant", content: m.content.slice(cursor, offset) });
        }
        parts.push({
          role: "tool",
          toolCallId: t.tool_call_id,
          toolName: t.tool_key,
          input: safeJsonParse(t.input_json),
          output: t.output_text ?? "",
          isError: !!t.is_error,
          pending: false,
        });
        cursor = offset;
      }
      // Trailing segment always carries the message id (even if empty) so retry/edit can still
      // locate this turn; an empty-content assistant entry is filtered out at render time.
      parts.push({ role: "assistant", content: m.content.slice(cursor), id: m.id, providerLabel, model });
      return parts;
    });
    setMessages(display);
    conversationIdRef.current = id;
    setActiveConversationId(id);
    setChatSettings(conversation ? chatSettingsFromRow(conversation) : DEFAULT_CHAT_SETTINGS);
    setError(null);
    setNotice(null);
  }

  async function handleDeleteConversation(id: string) {
    await deleteConversation(id);
    if (id === activeConversationId) {
      handleNewChat();
    }
    await refreshConversations();
  }

  async function handleRenameConversation(id: string, title: string) {
    await renameConversation(id, title);
    await refreshConversations();
  }

  async function handleAddFilesystemServer(scopedPath: string) {
    const id = newId();
    const args = filesystemServerArgs(scopedPath);
    await insertMcpServer({
      id,
      name: "Filesystem",
      kind: "filesystem",
      command: "npx",
      args_json: JSON.stringify(args),
      scoped_path: scopedPath,
      enabled: 1,
      created_at: Date.now(),
      transport: "stdio",
      url: null,
      env_refs_json: "{}",
      trust_tier: "official",
      tool_permissions_json: "{}",
      autostart: 0,
      cached_tools_json: "[]",
      oauth_provider: null,
      oauth_expires_at: null,
    });
    await refreshMcpServers();
    await startMcpServer(id, args);
  }

  async function resolveServerEnv(server: McpServerRow): Promise<Record<string, string>> {
    const refs = JSON.parse(server.env_refs_json || "{}") as Record<
      string,
      { secret: boolean; value: string }
    >;
    const resolved: Record<string, string> = {};
    for (const [name, ref] of Object.entries(refs)) {
      resolved[name] = ref.secret ? ((await getCredential(ref.value)) ?? "") : ref.value;
    }
    return resolved;
  }

  async function handleStartMcpServer(server: McpServerRow) {
    if (server.oauth_provider) {
      // OAuth-backed rows must never fall into the static-header path below — their access
      // token expires hourly, so every (re)start goes through a real Google refresh call
      // instead of resolving whatever was last cached in the (unused, always "{}") env refs.
      const target = CONNECTORS.flatMap((c) => c.targets).find((t) => t.serverId === server.id);
      if (!target) throw new Error(`No connector target found for OAuth server '${server.id}'`);
      const result = await oauthReconnect(server.id, target.provider);
      setMcpToolsByServer((prev) => ({ ...prev, [server.id]: result.tools }));
      await updateMcpServer(server.id, {
        oauth_expires_at: result.expiresAt,
        cached_tools_json: JSON.stringify(result.tools),
      });
      return;
    }
    const env = await resolveServerEnv(server);
    if (server.transport === "remote-http" && server.url) {
      await startRemoteMcpServer(server.id, server.url, env);
    } else {
      const args: string[] =
        server.kind === "filesystem" && server.scoped_path
          ? filesystemServerArgs(server.scoped_path)
          : JSON.parse(server.args_json);
      await startMcpServer(server.id, args, env, server.command === "uvx" ? "uvx" : "npx");
    }
  }

  async function handleInstallFromCatalog(resolved: ResolvedInstall) {
    const id = newId();
    const isRemote = resolved.entry.install.kind === "remoteHttp";
    const envRefs: Record<string, { secret: boolean; value: string }> = {};
    for (const v of resolved.envValues) {
      if (v.isSecret) {
        const secretRef = `mcp:${id}:${v.name}`;
        await setCredential(secretRef, v.value);
        envRefs[v.name] = { secret: true, value: secretRef };
      } else {
        envRefs[v.name] = { secret: false, value: v.value };
      }
    }

    const row: McpServerRow = {
      id,
      name: resolved.entry.name,
      kind: "catalog",
      command: isRemote ? "" : resolved.entry.install.kind === "uvx" ? "uvx" : "npx",
      args_json: JSON.stringify(resolved.finalArgs),
      scoped_path: null,
      enabled: 1,
      created_at: Date.now(),
      transport: isRemote ? "remote-http" : "stdio",
      url: resolved.entry.install.kind === "remoteHttp" ? resolved.entry.install.url : null,
      env_refs_json: JSON.stringify(envRefs),
      trust_tier: resolved.trustTier,
      tool_permissions_json: "{}",
      autostart: 0,
      cached_tools_json: "[]",
      oauth_provider: null,
      oauth_expires_at: null,
    };
    await insertMcpServer(row);
    await refreshMcpServers();
    await handleStartMcpServer(row);
  }

  // ── Deep Research + RAG ──────────────────────────────────────────────────────

  async function refreshRagDocuments() {
    setRagDocuments(await listRagDocuments());
  }

  /** True when at least one *running* MCP server is a real web-search / page-reader / academic tool. */
  function hasResearchTools(): boolean {
    return Object.entries(mcpToolsByServer).some(([serverId, tools]) => {
      if (tools.length === 0) return false;
      const server = mcpServers.find((s) => s.id === serverId);
      return isResearchServer(server?.name, tools.map((t) => t.name));
    });
  }

  /**
   * Make sure the keyless curated research servers (Web Reader / Wikipedia / OpenAlex) are both
   * *installed* and *running*: install any that are missing, and — crucially — start any that are
   * already installed but currently stopped (e.g. after an app restart with autostart off).
   * Without the second step, clicking "Set up research tools" once a server exists but is stopped
   * would silently do nothing and Deep Research would stay ungated-off.
   */
  async function handleInstallResearchTools() {
    setInstallingResearchTools(true);
    setError(null);
    try {
      const researchNames = new Set(
        CURATED_ENTRIES.filter((e) => RESEARCH_TOOL_CATALOG_IDS.includes(e.id)).map((e) => e.name),
      );
      const installedNames = new Set(mcpServers.map((s) => s.name));
      const toInstall = CURATED_ENTRIES.filter(
        (e) => RESEARCH_TOOL_CATALOG_IDS.includes(e.id) && !installedNames.has(e.name),
      );
      for (const entry of toInstall) {
        await handleInstallFromCatalog({
          entry,
          finalArgs:
            entry.install.kind === "npx" || entry.install.kind === "uvx" ? entry.install.args : [],
          envValues: [],
          trustTier: computeTrustTier(entry),
        });
      }
      // Start already-installed research servers that aren't currently reporting tools (i.e. stopped).
      const running = new Set(
        Object.keys(mcpToolsByServer).filter((id) => (mcpToolsByServer[id]?.length ?? 0) > 0),
      );
      const toStart = mcpServers.filter((s) => researchNames.has(s.name) && !running.has(s.id));
      for (const server of toStart) {
        await handleStartMcpServer(server);
      }
      if (toInstall.length > 0 || toStart.length > 0) {
        setNotice(t("notice.researchToolsStarting"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.researchToolsSetup"));
    } finally {
      setInstallingResearchTools(false);
    }
  }

  /**
   * Drive a standalone Deep Research run for the Explore panel's process trace — reuses the exact
   * chat machinery (the provider router + MCP tools + the mode's system prompt & step budget), but
   * forwards raw stream events to a callback instead of the transcript. Persists nothing.
   */
  async function runResearchTrace(
    question: string,
    mode: ResearchMode,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const tools = buildMcpTools();
    const history: ChatMessage[] = [{ role: "user", content: question }];
    for await (const event of routerRef.current.streamReply(history, tools, signal, {
      system: mode.systemPrompt,
      maxSteps: mode.maxSteps,
    })) {
      onEvent(event);
    }
  }

  /**
   * Explore → "Tools (MCP)": run one model turn with ONLY the chosen server's tools attached, and
   * forward raw stream events so the playground can show the model choosing a tool and the
   * request/result loop. Reuses the exact chat machinery; persists nothing.
   */
  async function runToolProbe(
    question: string,
    serverId: string,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const tools = buildMcpTools(serverId);
    const history: ChatMessage[] = [{ role: "user", content: question }];
    for await (const event of routerRef.current.streamReply(history, tools, signal, {
      // Model-facing text is never localized — the UI language must not steer the LLM.
      system:
        "You have tools available. When the user's request can be answered with a tool, call it. " +
        "Keep your reply brief.",
    })) {
      onEvent(event);
    }
  }

  /**
   * Explore → "Guessing vs. grounded": answer one question with NO tools, optionally under a RAG
   * grounding system block. The grounding playground calls this twice (plain, then grounded) to show
   * the contrast. Persists nothing.
   */
  async function runExploreAnswer(
    question: string,
    system: string | undefined,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const history: ChatMessage[] = [{ role: "user", content: question }];
    for await (const event of routerRef.current.streamReply(history, undefined, signal, { system })) {
      onEvent(event);
    }
  }

  /** Library quiz: one model call through the failover router, returned as the full reply text. */
  async function askModel(system: string, user: string, signal: AbortSignal): Promise<string> {
    let text = "";
    let failure: string | null = null;
    for await (const event of routerRef.current.streamReply([{ role: "user", content: user }], undefined, signal, { system })) {
      if (event.type === "chunk") text += event.text;
      else if (event.type === "error") failure = event.message;
    }
    if (!text.trim() && failure) throw new Error(failure);
    return text;
  }

  /**
   * Course labs: one practice model call. Normally the whole failover router answers; with a
   * `providerId` only that provider does (the comparison lab). Persists nothing.
   */
  async function runCourseLab(
    request: LabRequest,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const router = request.providerId
      ? new ProviderRouter(configuredProvidersRef.current.filter((p) => p.id === request.providerId))
      : routerRef.current;
    for await (const event of router.streamReply(request.history, undefined, signal, {
      system: request.system,
      temperature: request.temperature,
    })) {
      onEvent(event);
    }
  }

  async function handleAddLibraryFiles(files: File[]) {
    setLibraryError(null);
    const resolved = await resolveEmbedder(providers);
    if ("error" in resolved) {
      setLibraryError(embedderErrorText(t, resolved));
      return;
    }
    setLibraryBusy(true);
    try {
      const cut: string[] = [];
      for (const file of files) {
        const { truncated } = await ingestDocument(file, resolved.embedder);
        if (truncated) cut.push(file.name);
      }
      await refreshRagDocuments();
      if (cut.length > 0) {
        setLibraryError(t("error.libraryTruncated", { names: cut.join(", "), max: LIBRARY_MAX_CHARS.toLocaleString() }));
      }
    } catch (err) {
      await refreshRagDocuments(); // earlier files in the batch were indexed before this one failed
      setLibraryError(errorText(t, err, t("error.indexDocument")));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function handleDeleteRagDocument(id: string) {
    await deleteRagDocument(id);
    await refreshRagDocuments();
    const remaining = await listRagDocuments();
    if (remaining.length === 0) setUseLibrary(false);
  }

  function handleSaveEmbeddingConfig(config: EmbeddingConfig) {
    saveEmbeddingConfig(config);
    setEmbeddingConfig(config);
    setNotice(t("notice.embeddingModelSaved"));
  }

  async function handleConnectPlugin(connector: OAuthConnector) {
    const results = await oauthConnect(
      connector.id,
      connector.scopes,
      connector.targets.map((t) => ({ serverId: t.serverId, provider: t.provider })),
    );
    for (const result of results) {
      const target = connector.targets.find((t) => t.serverId === result.serverId);
      if (!target) continue;
      // Seed "ask" for any destructive tool this connection actually exposes, so send/delete calls
      // block on the approval modal until the user relaxes them. Existing installs keep their own
      // permissions (only fresh rows get seeded).
      const seededPermissions: Record<string, "ask"> = {};
      for (const tool of result.tools) {
        if (DESTRUCTIVE_GOOGLE_TOOLS.includes(tool.name)) seededPermissions[tool.name] = "ask";
      }
      const existing = mcpServers.find((s) => s.id === result.serverId);
      if (existing) {
        await updateMcpServer(result.serverId, {
          oauth_expires_at: result.expiresAt,
          cached_tools_json: JSON.stringify(result.tools),
        });
      } else {
        await insertMcpServer({
          id: result.serverId,
          name: target.name,
          kind: "oauth",
          command: "",
          args_json: "[]",
          scoped_path: null,
          enabled: 1,
          created_at: Date.now(),
          transport: "native",
          url: null,
          env_refs_json: "{}",
          trust_tier: "official",
          tool_permissions_json: JSON.stringify(seededPermissions),
          autostart: 1,
          cached_tools_json: JSON.stringify(result.tools),
          oauth_provider: connector.id,
          oauth_expires_at: result.expiresAt,
        });
      }
      setMcpToolsByServer((prev) => ({ ...prev, [result.serverId]: result.tools }));
    }
    // oauth_connect already started each connection Rust-side (host.start_remote), so there's no
    // need to call handleStartMcpServer here the way handleInstallFromCatalog does.
    await refreshMcpServers();
  }

  async function handleDisconnectPlugin(serverIds: string[]) {
    for (const id of serverIds) {
      await stopMcpServer(id); // also cancels the Rust-side refresh task (McpHost::stop)
      await deleteCredential(`mcp:${id}:oauth_access`);
      await deleteCredential(`mcp:${id}:oauth_refresh`);
      await deleteMcpServer(id);
      setMcpToolsByServer((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    await refreshMcpServers();
  }

  async function handleUpdateMcpServer(
    id: string,
    patch: Partial<
      Pick<
        McpServerRow,
        "name" | "args_json" | "scoped_path" | "url" | "env_refs_json" | "tool_permissions_json" | "autostart"
      >
    >,
  ) {
    await updateMcpServer(id, patch);
    await refreshMcpServers();
  }

  async function handleUpdateMcpServerEnv(
    server: McpServerRow,
    updates: Record<string, { isSecret: boolean; value: string }>,
    removedKeys: string[] = [],
  ) {
    const existing = JSON.parse(server.env_refs_json || "{}") as Record<
      string,
      { secret: boolean; value: string }
    >;
    for (const key of removedKeys) {
      const current = existing[key];
      if (current?.secret) await deleteCredential(current.value);
      delete existing[key];
    }
    for (const [name, update] of Object.entries(updates)) {
      const current = existing[name];
      if (update.isSecret) {
        const secretRef = current?.secret ? current.value : `mcp:${server.id}:${name}`;
        await setCredential(secretRef, update.value);
        existing[name] = { secret: true, value: secretRef };
      } else {
        existing[name] = { secret: false, value: update.value };
      }
    }
    const env_refs_json = JSON.stringify(existing);
    await updateMcpServer(server.id, { env_refs_json });
    await refreshMcpServers();
    if (await isMcpServerRunning(server.id)) {
      await stopMcpServer(server.id);
      await handleStartMcpServer({ ...server, env_refs_json });
    }
  }

  async function handleEditFilesystemPath(server: McpServerRow, newPath: string) {
    const args = filesystemServerArgs(newPath);
    await updateMcpServer(server.id, { scoped_path: newPath, args_json: JSON.stringify(args) });
    await refreshMcpServers();
    if (await isMcpServerRunning(server.id)) {
      await stopMcpServer(server.id);
      await startMcpServer(server.id, args);
    }
  }

  async function handleRemoveMcpServer(id: string) {
    await deleteMcpServer(id);
    setMcpToolsByServer((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await refreshMcpServers();
  }

  function requestToolApproval(serverName: string, toolName: string, input: unknown): Promise<boolean> {
    return new Promise((resolve) => {
      const id = newId();
      approvalResolvers.current.set(id, resolve);
      setPendingApproval({ id, serverName, toolName, input });
    });
  }

  function resolveApproval(approved: boolean) {
    setPendingApproval((current) => {
      if (!current) return current;
      const resolver = approvalResolvers.current.get(current.id);
      resolver?.(approved);
      approvalResolvers.current.delete(current.id);
      return null;
    });
  }

  function buildMcpTools(serverIdFilter?: string): ToolSet | undefined {
    const entries = Object.entries(mcpToolsByServer).flatMap(([serverId, tools]) => {
      if (serverIdFilter && serverId !== serverIdFilter) return [];
      const server = mcpServers.find((s) => s.id === serverId);
      const permissions = parseToolPermissions(server?.tool_permissions_json ?? "{}");
      return tools.flatMap((tool) => {
        const permission = getToolPermission(permissions, tool.name);
        if (permission === "deny") return [];
        const key = sanitizeToolKey(`${serverId}_${tool.name}`);
        return [
          [
            key,
            dynamicTool({
              description: tool.description ?? undefined,
              inputSchema: jsonSchema(sanitizeToolSchema(tool.inputSchema as Record<string, unknown>)),
              execute: async (input) => {
                if (permission === "ask") {
                  const approved = await requestToolApproval(
                    server?.name ?? t("mcp.defaultServerName"),
                    tool.name,
                    input,
                  );
                  if (!approved) throw new Error(t("error.toolDenied"));
                }
                const outcome = await callMcpTool(serverId, tool.name, input);
                if (outcome.isError) throw new Error(outcome.text || t("error.toolFailed"));
                return outcome.text;
              },
            }),
          ] as const,
        ];
      });
    });
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  /** Re-read today's request counts and the router's cooldowns for the usage meters. */
  async function refreshQuota() {
    const rows = listedProvidersRef.current;
    const counts = await Promise.all(rows.map((p) => getProviderUsageToday(p.id)));
    const requests: Record<string, number> = {};
    rows.forEach((p, i) => {
      requests[p.id] = counts[i]?.request_count ?? 0;
    });
    setQuota({ requests, cooldowns: routerRef.current.getCooldowns() });
  }

  async function refreshProviders() {
    const rows = await listProviders();
    setProviders(rows);
    listedProvidersRef.current = rows;
    const inMode = (r: ProviderRow) => (providerModeRef.current === "omniroute" ? r.type === "omniroute" : r.type !== "omniroute");
    const configured: ConfiguredProvider[] = await Promise.all(
      rows
        .filter((r) => r.enabled && inMode(r))
        .map(async (r) => {
          const apiKey = (await getCredential(r.secret_ref)) ?? "";
          return {
            id: r.id,
            type: r.type,
            label: r.label,
            apiKey,
            baseURL: r.base_url_override ?? PROVIDER_MANIFEST[r.type].baseURL,
            model: r.model,
            priority: r.priority,
          };
        }),
    );
    configuredProvidersRef.current = configured;
    routerRef.current.updateProviders(configured);
    void refreshQuota();
  }

  async function handleAddProvider(draft: ProviderDraft) {
    const id = newId();
    const secretRef = `provider:${id}`;
    await setCredential(secretRef, draft.apiKey);
    await insertProvider({
      id,
      type: draft.type,
      label: draft.label,
      model: draft.model,
      base_url_override: draft.baseURL?.trim() || null,
      priority: providers.length,
      enabled: 1,
      secret_ref: secretRef,
      created_at: Date.now(),
    });
    await refreshProviders();
  }

  async function handleRemoveProvider(id: string) {
    const row = providers.find((p) => p.id === id);
    await deleteProvider(id);
    if (row) await deleteCredential(row.secret_ref);
    await refreshProviders();
  }

  async function handleToggleProvider(id: string, enabled: boolean) {
    await updateProvider(id, { enabled: enabled ? 1 : 0 });
    await refreshProviders();
  }

  async function handleEditProvider(id: string, draft: ProviderEditDraft) {
    await updateProvider(id, {
      label: draft.label,
      model: draft.model,
      ...(draft.baseURL !== undefined ? { base_url_override: draft.baseURL || null } : {}),
    });
    if (draft.apiKey) {
      const row = providers.find((p) => p.id === id);
      if (row) await setCredential(row.secret_ref, draft.apiKey);
    }
    await refreshProviders();
  }

  async function handleReorderProvider(id: string, direction: "up" | "down") {
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    const index = sorted.findIndex((p) => p.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[swapWith];
    await updateProvider(a.id, { priority: b.priority });
    await updateProvider(b.id, { priority: a.priority });
    await refreshProviders();
  }

  // `isStreaming` is state and lags a render behind, so a double Enter would otherwise start two sends.
  async function runSend(text: string) {
    if (sendLockRef.current) return;
    sendLockRef.current = true;
    try {
      await runSendUnlocked(text);
    } finally {
      sendLockRef.current = false;
    }
  }

  async function runSendUnlocked(text: string) {
    if (!text.trim() || isStreaming) return;
    if (activeProviders.filter((p) => p.enabled).length === 0) {
      setError(t(activeProviders.length === 0 ? "error.addProviderFirst" : "error.enableProviderFirst"));
      return;
    }

    // Deep Research without a running search/reader tool would still demand cited sources, so the model
    // invents them. Refuse up front instead of producing confident, fabricated citations.
    if (researchMode && !hasResearchTools()) {
      setError(t("error.researchNeedsTools"));
      return;
    }

    // OmniRoute can't answer without a key of its own, and with none it spends minutes failing
    // upstream before it gives up — so say so up front instead of leaving the chat hanging.
    if (providerModeRef.current === "omniroute") {
      if ((await probeOmniRoute()) === null) {
        setError(t("error.omniNotReady"));
        return;
      }
      try {
        const keys = await listOmniConnections();
        if (!keys.some((k) => k.isActive)) {
          setError(t("error.omniNoKeys"));
          return;
        }
      } catch {
        /* can't tell (e.g. a changed dashboard password): let the request try */
      }
    }

    setError(null);
    setNotice(null);

    if (!conversationIdRef.current) {
      conversationIdRef.current = newId();
      await createConversation(conversationIdRef.current, text.trim().slice(0, 60));
      // Persist any chat-lab settings the student set before the first message existed to save to.
      if (isChatSettingsActive(chatSettings)) {
        await updateConversationSettings(conversationIdRef.current, chatSettingsToRow(chatSettings));
      }
      setActiveConversationId(conversationIdRef.current);
      await refreshConversations();
    }
    const conversationId = conversationIdRef.current;

    const userMessage: ChatMessage = { role: "user", content: text.trim() };
    const userMessageId = newId();
    const userCreatedAt = Date.now();
    const userDisplay: DisplayMessage = { role: "user", content: userMessage.content, id: userMessageId };
    const priorHistory: ChatMessage[] = messages
      .filter((m): m is Extract<DisplayMessage, { role: "user" | "assistant" }> =>
        m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role, content: m.content }));
    const nextHistory = [...priorHistory, userMessage];
    const baseMessages = messages;
    setMessages([...baseMessages, userDisplay]);
    setInput("");
    setIsStreaming(true);
    await insertMessage({
      id: userMessageId,
      conversation_id: conversationId,
      role: "user",
      content: userMessage.content,
      provider_used: null,
      model_used: null,
      created_at: userCreatedAt,
    });

    // Compose transient per-turn steering: a Deep Research directive and/or a RAG grounding block.
    // Neither is persisted to the conversation — they ride the router's `system` param.
    // Note: the UI language is deliberately NOT injected here. i18n is interface-level only; the
    // model answers in whatever language the student writes in.
    const systemParts: string[] = [];
    let maxSteps: number | undefined;
    let ragSources: RetrievedChunk[] = [];

    // The student's standing instruction (chat lab) leads, so their persona/rules frame everything
    // the transient research/RAG steering adds below.
    if (chatSettings.systemPrompt.trim()) {
      systemParts.push(chatSettings.systemPrompt.trim());
    }

    if (researchMode) {
      systemParts.push(researchMode.systemPrompt);
      maxSteps = researchMode.maxSteps;
    }

    if (useLibrary && ragDocuments.length > 0) {
      const resolved = await resolveEmbedder(providers);
      if ("error" in resolved) {
        setNotice(t("notice.librarySearchSkipped", { error: embedderErrorText(t, resolved) }));
      } else {
        try {
          ragSources = await retrieve(userMessage.content, resolved.embedder);
          if (ragSources.length > 0) systemParts.push(buildRagSystemBlock(ragSources));
        } catch (err) {
          setNotice(
            t("notice.librarySearchFailed", {
              error: err instanceof Error ? err.message : t("error.embeddingError"),
            }),
          );
        }
      }
    }

    const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
    // The retrieved-sources card leads the answer and persists across `commitTail` re-renders.
    const prefix: DisplayMessage[] = ragSources.length > 0 ? [{ role: "sources", sources: ragSources }] : [];

    let tail: DisplayMessage[] = [{ role: "assistant", content: "" }];
    const commitTail = () => setMessages([...baseMessages, userDisplay, ...prefix, ...tail]);
    commitTail();

    let finalProviderId: string | null = null;
    let finalProviderLabel: string | null = null;
    let finalModel: string | null = null;
    let finalTokens = 0;
    let assistantText = "";
    const tools = buildMcpTools();
    let toolCallsForTurn: { toolCallId: string; toolName: string; input: unknown; output: string; isError: boolean; textOffset: number }[] = [];
    const toolCallOffsets = new Map<string, number>();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      for await (const event of routerRef.current.streamReply(nextHistory, tools, abortController.signal, {
        system,
        maxSteps,
        temperature: chatSettings.temperature ?? undefined,
        topP: chatSettings.topP ?? undefined,
        maxOutputTokens: chatSettings.maxTokens ?? undefined,
        // Only honour a pinned provider that still exists and is switched on.
        ...(labTarget.providerId && activeProviders.some((p) => p.id === labTarget.providerId && p.enabled)
          ? { providerId: labTarget.providerId, model: labTarget.model ?? undefined }
          : {}),
      })) {
        if (event.type === "chunk") {
          assistantText += event.text;
          const last = tail[tail.length - 1];
          if (last && last.role === "assistant") {
            tail = [...tail.slice(0, -1), { ...last, content: last.content + event.text }];
          } else {
            tail = [...tail, { role: "assistant", content: event.text }];
          }
          commitTail();
        } else if (event.type === "tool-call") {
          toolCallOffsets.set(event.toolCallId, assistantText.length);
          tail = [
            ...tail,
            {
              role: "tool",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
              output: "",
              isError: false,
              pending: true,
            },
          ];
          commitTail();
        } else if (event.type === "tool-result") {
          tail = tail.map((m) =>
            m.role === "tool" && m.toolCallId === event.toolCallId
              ? { ...m, output: event.output, isError: event.isError, pending: false }
              : m,
          );
          commitTail();
          const call = tail.find((m) => m.role === "tool" && m.toolCallId === event.toolCallId);
          if (call && call.role === "tool") {
            toolCallsForTurn = [
              ...toolCallsForTurn,
              {
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                input: call.input,
                output: call.output,
                isError: call.isError,
                textOffset: toolCallOffsets.get(call.toolCallId) ?? assistantText.length,
              },
            ];
          }
        } else if (event.type === "error") {
          setError(t("error.responseFailed", { message: event.message }));
          appendCrashLog(`stream error: ${event.message}`).catch(() => {});
        } else if (event.type === "router") {
          const ev = event.event;
          if (ev.kind === "switched") {
            void refreshQuota();
            setNotice(
              t("notice.switchedProvider", {
                to: ev.toLabel,
                from: ev.fromLabel,
                reason: t(routerReasonKey(ev.reason)),
              }),
            );
            assistantText = "";
            tail = [{ role: "assistant", content: "" }];
            toolCallsForTurn = [];
            toolCallOffsets.clear();
            commitTail();
          } else if (ev.kind === "auth-error") {
            setNotice(t("notice.invalidKey", { provider: ev.providerLabel }));
            await refreshProviders();
          } else if (ev.kind === "exhausted") {
            setError(
              ev.routerFailure
                ? t("error.omniFailed", { message: ev.routerFailure })
                : ev.toolsUnsupported
                  ? t("error.toolsUnsupported")
                  : ev.retryInSeconds > 0
                  ? t("error.allProvidersRateLimited", { seconds: ev.retryInSeconds })
                  : t("error.allProvidersFailed"),
            );
          }
        } else if (event.type === "done") {
          finalProviderId = event.providerId;
          finalProviderLabel = event.providerLabel;
          finalModel = event.model;
          finalTokens = event.estimatedTokens;
        }
      }

      if (!assistantText && !finalProviderId && toolCallsForTurn.length === 0) {
        setMessages([...baseMessages, userDisplay]);
      } else {
        const assistantMessageId = newId();
        await insertMessage({
          id: assistantMessageId,
          conversation_id: conversationId,
          role: "assistant",
          content: assistantText,
          provider_used: finalProviderId,
          model_used: finalModel,
          created_at: Date.now(),
        });
        for (const [i, call] of toolCallsForTurn.entries()) {
          await insertToolCall({
            id: newId(),
            message_id: assistantMessageId,
            tool_call_id: call.toolCallId,
            tool_key: call.toolName,
            input_json: JSON.stringify(call.input ?? {}),
            output_text: call.output,
            is_error: call.isError ? 1 : 0,
            seq: i,
            text_offset: call.textOffset,
            created_at: Date.now(),
          });
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 && m.role === "assistant"
              ? { ...m, id: assistantMessageId, providerLabel: finalProviderLabel ?? undefined, model: finalModel ?? undefined }
              : m,
          ),
        );
        await touchConversation(conversationId);
        if (finalProviderId) {
          await recordProviderUsage(finalProviderId, localDateKey(), finalTokens);
        }
        await refreshQuota();
        await refreshConversations();
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err.message : t("error.somethingWentWrong"));
        setMessages([...baseMessages, userDisplay]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleStopStreaming() {
    abortControllerRef.current?.abort();
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    await submitComposer();
  }

  /** Parse dropped/picked files into text attachments that ride along with the next message. */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(t("error.maxAttachments", { max: MAX_ATTACHMENTS }));
      return;
    }
    setAttachBusy(true);
    try {
      for (const file of files.slice(0, room)) {
        if (!isSupportedAttachment(file.name)) {
          setError(t("error.unreadableFile", { name: file.name, formats: SUPPORTED_ATTACHMENT_HINT }));
          continue;
        }
        try {
          const parsed = await parseAttachment(file);
          setAttachments((prev) => [...prev, parsed]);
        } catch (e) {
          setError(errorText(t, e, t("error.readFileFailed", { name: file.name })));
        }
      }
      if (files.length > room) {
        setError(t("error.roomForFiles", { room, max: MAX_ATTACHMENTS }));
      }
    } finally {
      setAttachBusy(false);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  /** Build the outgoing message (typed text + any attachment text) and send it. */
  async function submitComposer() {
    if (isStreaming || attachBusy) return;
    const combined = buildOutgoingContent(input, attachments);
    if (!combined.trim()) return;
    setAttachments([]);
    await runSend(combined);
  }

  /** Copy the whole conversation to the clipboard as Markdown. */
  async function handleCopyTranscript() {
    setExportMenuOpen(false);
    const md = buildTranscriptMarkdown(
      activeTitle || t("chat.conversation"),
      messages.filter((m) => m.role !== "sources"),
    );
    try {
      await navigator.clipboard.writeText(md);
      setError(null);
      setNotice(t("notice.transcriptCopied"));
    } catch {
      setError(t("error.clipboardFailed"));
    }
  }

  /** Save the conversation as a .md / .docx / PDF file chosen through the native save dialog. */
  async function handleSaveToFile(format: ExportFormat) {
    setExportMenuOpen(false);
    const title = activeTitle || t("chat.conversation");
    try {
      const path = await saveDialog({
        defaultPath: suggestFileName(title, format),
        filters: [{ name: format.toUpperCase(), extensions: [EXPORT_EXTENSIONS[format]] }],
      });
      if (!path) return; // cancelled — nothing to do, no toast
      setExporting(true);
      setError(null);
      setNotice(null);
      const models = [
        ...new Set(messages.flatMap((m) => (m.role === "assistant" && m.model ? [m.model] : []))),
      ];
      const doc = buildExportDoc({
        title,
        messages: messages.filter((m) => m.role !== "tool"),
        labels: {
          you: t("chat.you"),
          assistant: t("chat.assistant"),
          exportedOn: t("export.exportedOn"),
          model: t("export.model"),
          attachments: t("export.attachments"),
          sources: t("export.sources"),
        },
        model: models.join(", ") || undefined,
        answersOnly: exportAnswersOnly,
      });
      const bytes = await renderExport(doc, format);
      await invoke("save_export_file", bytes, {
        headers: { "x-export-path": encodeURIComponent(path) },
      });
      setNotice(t("notice.savedToFile", { path }));
    } catch (e) {
      setError(t("error.exportFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExporting(false);
    }
  }

  /** Create a Google Doc from the conversation via the connected Google account's Docs tools. */
  async function handleExportToGoogleDoc() {
    setExportMenuOpen(false);
    const docsServerId = findDocsServerId(mcpToolsByServer);
    if (!docsServerId) {
      setNotice(null);
      setError(t("error.connectGoogleFirst"));
      return;
    }
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const title = activeTitle || t("chat.defaultDocTitle");
      const created = await callMcpTool(docsServerId, "docs_create_document", { title });
      if (created.isError) {
        setError(t("error.createGoogleDoc", { message: created.text }));
        return;
      }
      const docId = extractDocId(created.text);
      if (!docId) {
        setError(t("error.googleDocNoId"));
        return;
      }
      const text = buildTranscriptPlainText(title, messages.filter((m) => m.role !== "sources"));
      const appended = await callMcpTool(docsServerId, "docs_append_text", {
        document_id: docId,
        text,
      });
      if (appended.isError) {
        setError(t("error.googleDocAppend", { message: appended.text }));
        return;
      }
      const url = extractDocUrl(created.text);
      setNotice(
        url ? t("notice.savedToGoogleDocsUrl", { url }) : t("notice.savedToGoogleDocs"),
      );
    } catch (e) {
      setError(t("error.exportFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExporting(false);
    }
  }

  /** Drops this message and everything after it from both UI state and SQLite. Returns the
   * truncated list so callers can chain further action (e.g. resending) off it. */
  async function truncateFrom(id: string): Promise<DisplayMessage[]> {
    const idx = messages.findIndex(
      (m) => (m.role === "user" || m.role === "assistant") && m.id === id,
    );
    if (idx === -1) return messages;
    const truncated = messages.slice(0, idx);
    setMessages(truncated);
    if (conversationIdRef.current) {
      await deleteMessagesFrom(conversationIdRef.current, id);
    }
    return truncated;
  }

  async function handleEditMessage(id: string, content: string) {
    if (isStreaming) return;
    await truncateFrom(id);
    setInput(content);
  }

  async function handleRetryMessage(assistantId: string) {
    if (isStreaming) return;
    const idx = messages.findIndex(
      (m) => (m.role === "user" || m.role === "assistant") && m.id === assistantId,
    );
    if (idx <= 0) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
    const userMsg = messages[userIdx];
    if (!userMsg || userMsg.role !== "user" || !userMsg.id) return;
    const content = userMsg.content;
    await truncateFrom(userMsg.id);
    await runSend(content);
  }

  const activeTitle = conversations.find((c) => c.id === activeConversationId)?.title;

  return (
    <div className="app-frame">
      <AppTopBar
        mode={showCourse ? "course" : "chat"}
        onChange={(mode: AppMode) => setShowCourse(mode === "course")}
        courseProgressPercent={courseProgress(COURSE_MODULES, courseDone).percent}
      />
      <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        disabled={isStreaming}
        mcpRunningCount={mcpServers.filter((s) => !s.oauth_provider && s.id in mcpToolsByServer).length}
        pluginsRunningCount={mcpServers.filter((s) => s.oauth_provider && s.id in mcpToolsByServer).length}
        activeProviderCount={activeProviders.filter((p) => p.enabled).length}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenProviders={() => setShowProviders(true)}
        onOpenMcp={() => setShowMcp(true)}
        onOpenLibrary={() => setShowLibrary(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenAppSettings={() => setShowAppSettings(true)}
        libraryDocCount={ragDocuments.length}
        hidden={showCourse}
      />

      {showCourse && (
        <>
          <CoursePanel
            providers={providers}
            documents={ragDocuments}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebar}
            appState={courseAppState}
            done={courseDone}
            notes={courseNotes}
            onMark={handleCourseMark}
            onUnmark={handleCourseUnmark}
            onReset={handleCourseReset}
            onOpen={handleCourseOpen}
            onUsePrompt={handleCourseUsePrompt}
            onRunLab={runCourseLab}
            onAddProvider={handleAddProvider}
            providerMode={providerMode}
            onProviderMode={(m) => void handleProviderMode(m)}
            providerModeBusy={providerModeBusy}
            onAddFilesystem={handleAddFilesystemServer}
            onAddLibraryFiles={handleAddLibraryFiles}
            libraryBusy={libraryBusy}
            libraryError={libraryError}
            hasProviders={activeProviders.some((p) => p.enabled)}
            hasResearchTools={hasResearchTools()}
            installingResearchTools={installingResearchTools}
            onInstallResearchTools={handleInstallResearchTools}
            toolServers={Object.entries(mcpToolsByServer)
              .filter(([, tools]) => tools.length > 0)
              .map(([id, tools]) => ({
                id,
                name: mcpServers.find((s) => s.id === id)?.name ?? t("mcp.defaultServerName"),
                tools,
              }))}
            onRunToolProbe={runToolProbe}
            onRunAnswer={runExploreAnswer}
            onRunResearch={runResearchTrace}
          />
        </>
      )}

      {/* The chat stays mounted while the Course is open so an in-flight reply isn't lost. */}
      <main className="main-panel" hidden={showCourse}>
        <header className="app-header">
          <h1>{activeTitle || t("chat.newChat")}</h1>
          {messages.length > 0 && (
            <div className="export-wrap">
              <button
                type="button"
                className="btn btn-secondary btn-sm export-btn"
                onClick={() => setExportMenuOpen((v) => !v)}
                disabled={exporting || isStreaming}
                title={t("chat.exportConversation")}
              >
                {exporting ? <IconLoader size={14} /> : <IconDownload size={14} />}
                <span>{t("chat.export")}</span>
              </button>
              {exportMenuOpen && (
                <>
                  <div className="export-backdrop" onClick={() => setExportMenuOpen(false)} />
                  <div className="export-menu" role="menu">
                    <button type="button" className="export-menu-item" onClick={handleCopyTranscript}>
                      <IconCopy size={14} />
                      <span>{t("chat.copyAsMarkdown")}</span>
                    </button>
                    {(["md", "docx", "pdf"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className="export-menu-item"
                        onClick={() => handleSaveToFile(f)}
                      >
                        <IconDownload size={14} />
                        <span>{t(`chat.saveAs.${f}`)}</span>
                      </button>
                    ))}
                    <label className="export-menu-item export-menu-check">
                      <input
                        type="checkbox"
                        checked={exportAnswersOnly}
                        onChange={(e) => setExportAnswersOnly(e.target.checked)}
                      />
                      <span>{t("chat.exportAnswersOnly")}</span>
                    </label>
                    <button
                      type="button"
                      className="export-menu-item"
                      onClick={handleExportToGoogleDoc}
                    >
                      <IconDownload size={14} />
                      <span>{t("chat.saveToGoogleDocs")}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <h2 className="empty-state-title">{t("chat.emptyTitle")}</h2>
              <p className="empty-state-sub">{t("chat.emptySubtitle")}</p>
            </div>
          )}
          {messages.map((m, i) => {
            const isTrailingEmptyAssistant =
              m.role === "assistant" && !m.content && !(isStreaming && i === messages.length - 1);
            if (isTrailingEmptyAssistant) return null;
            if (m.role === "sources") {
              return <RetrievedSources key={i} sources={m.sources} />;
            }
            return m.role === "tool" ? (
              <ToolCallBlock
                key={i}
                toolName={m.toolName}
                input={m.input}
                output={m.output}
                isError={m.isError}
                pending={m.pending}
                mcpServers={mcpServers}
              />
            ) : (
              <div key={i} className={`message message-${m.role}`}>
                <div className="message-head">
                  <span className="message-role">{m.role === "user" ? t("chat.you") : t("chat.assistant")}</span>
                  {m.role === "assistant" && (m.providerLabel || m.model) && (
                    <span className="message-provenance">
                      {t("chat.via", { provider: m.providerLabel ?? t("chat.provider") })}
                      {m.model ? ` · ${m.model}` : ""}
                    </span>
                  )}
                  {m.role === "assistant" && m.content && !isStreaming && <CopyButton text={m.content} />}
                  {m.role === "user" && !isStreaming && m.id && (
                    <button
                      type="button"
                      className="message-copy"
                      title={t("chat.editAndResend")}
                      onClick={() => handleEditMessage(m.id!, m.content)}
                    >
                      <IconEdit size={13} />
                    </button>
                  )}
                  {m.role === "assistant" && m.id && !isStreaming && (
                    <button
                      type="button"
                      className="message-copy"
                      title={t("chat.retryReply")}
                      onClick={() => handleRetryMessage(m.id!)}
                    >
                      <IconRefresh size={13} />
                    </button>
                  )}
                </div>
                {m.role === "assistant" ? (
                  m.content ? (
                    <Markdown text={m.content} />
                  ) : (
                    <p>{isStreaming && i === messages.length - 1 ? "…" : ""}</p>
                  )
                ) : (
                  <UserMessageContent content={m.content} />
                )}
              </div>
            );
          })}
        </div>

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <div
          className={`composer-wrap${isDragging ? " composer-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isStreaming) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (isStreaming) return;
            void addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {attachments.length > 0 && (
            <div className="attachment-chips">
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="attachment-chip"
                  title={a.truncated ? t("composer.trimmedTitle", { name: a.name }) : a.name}
                >
                  <IconPaperclip size={12} />
                  <span className="attachment-chip-name">{a.name}</span>
                  {a.truncated && <span className="attachment-chip-trim">{t("composer.trimmed")}</span>}
                  <button
                    type="button"
                    className="attachment-chip-remove"
                    onClick={() => removeAttachment(i)}
                    title={t("composer.remove")}
                    aria-label={t("composer.removeNamed", { name: a.name })}
                  >
                    <IconX size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form className="composer" onSubmit={sendMessage}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.log,.rtf"
              className="composer-file-input"
              onChange={(e) => {
                void addFiles(Array.from(e.currentTarget.files ?? []));
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon composer-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || attachBusy}
              title={t("composer.attach", { formats: SUPPORTED_ATTACHMENT_HINT })}
            >
              {attachBusy ? <IconLoader size={16} /> : <IconPaperclip size={16} />}
            </button>
            <textarea
              ref={composerInputRef}
              className="composer-input"
              placeholder={t("composer.placeholder")}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitComposer();
                }
              }}
              disabled={isStreaming}
              rows={1}
            />
            {isStreaming ? (
              <button
                type="button"
                className="btn btn-danger btn-icon composer-send"
                onClick={handleStopStreaming}
                title={t("composer.stop")}
              >
                <IconStop size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary btn-icon composer-send"
                disabled={(!input.trim() && attachments.length === 0) || attachBusy}
                title={t("composer.send")}
              >
                <IconSend size={16} />
              </button>
            )}
          </form>
        </div>
      </main>

      {!showCourse && (
        <PlaygroundPanel
          providers={activeProviders}
          quota={quota}
          target={labTarget}
          onTarget={setLabTarget}
          loadModels={loadProviderModels}
          expanded={labExpanded}
          onToggle={() => setLabExpanded(!labExpanded)}
          settings={chatSettings}
          onChange={handleChatSettingsChange}
          researchMode={researchMode}
          onResearchMode={setResearchMode}
          hasResearchTools={hasResearchTools()}
          installingResearchTools={installingResearchTools}
          onInstallResearchTools={() => void handleInstallResearchTools()}
          useLibrary={useLibrary}
          onUseLibrary={setUseLibrary}
          documentCount={ragDocuments.length}
          onOpenLibrary={() => setShowLibrary(true)}
          busy={isStreaming}
        />
      )}

      {showProviders && (
        <ProvidersPanel
          providers={providers}
          quota={quota}
          onAdd={handleAddProvider}
          onRemove={handleRemoveProvider}
          onToggle={handleToggleProvider}
          onReorder={handleReorderProvider}
          onEdit={handleEditProvider}
          onOpenOnboarding={() => setShowOnboarding(true)}
          onClose={() => setShowProviders(false)}
          mode={providerMode}
          onMode={(m) => void handleProviderMode(m)}
          modeBusy={providerModeBusy}
        />
      )}

      {showAppSettings && <AppSettingsPanel onClose={() => setShowAppSettings(false)} />}

      {showLibrary && (
        <LibraryPanel
          documents={ragDocuments}
          providers={providers}
          embeddingConfig={embeddingConfig}
          onSaveEmbeddingConfig={handleSaveEmbeddingConfig}
          onAddFiles={handleAddLibraryFiles}
          onDeleteDocument={handleDeleteRagDocument}
          onAsk={askModel}
          busy={libraryBusy}
          error={libraryError}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {showOnboarding && (
        <OnboardingWizard
          onAddProvider={handleAddProvider}
          onAddFilesystem={handleAddFilesystemServer}
          onClose={() => {
            localStorage.setItem("onboardingDismissed", "1");
            setShowOnboarding(false);
          }}
          onOpenCourse={() => {
            localStorage.setItem("onboardingDismissed", "1");
            setShowOnboarding(false);
            setShowCourse(true);
          }}
        />
      )}

      {showMcp && (
        <McpPanel
          servers={mcpServers.filter((s) => !s.oauth_provider)}
          toolsByServer={mcpToolsByServer}
          onAddFilesystem={handleAddFilesystemServer}
          onStart={handleStartMcpServer}
          onRemove={handleRemoveMcpServer}
          onUpdateServer={handleUpdateMcpServer}
          onUpdateEnv={handleUpdateMcpServerEnv}
          onEditFilesystemPath={handleEditFilesystemPath}
          onInstall={handleInstallFromCatalog}
          onClose={() => setShowMcp(false)}
        />
      )}

      {showPlugins && (
        <PluginsPanel
          connectors={CONNECTORS}
          servers={mcpServers.filter((s) => s.oauth_provider)}
          toolsByServer={mcpToolsByServer}
          onUpdateServer={handleUpdateMcpServer}
          onConnect={handleConnectPlugin}
          onDisconnect={handleDisconnectPlugin}
          onClose={() => setShowPlugins(false)}
        />
      )}

      {pendingApproval && (
        <div className="settings-overlay">
          <div className="settings-panel approval-panel">
            <div className="settings-header">
              <h2>{t("approval.title")}</h2>
            </div>
            <p className="settings-hint">
              {t("approval.body", {
                server: pendingApproval.serverName,
                tool: pendingApproval.toolName,
              })}
            </p>
            <pre className="tool-block-pre">{formatApprovalInput(pendingApproval.input)}</pre>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => resolveApproval(false)}>
                {t("approval.deny")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveApproval(true)}>
                {t("approval.allow")}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
