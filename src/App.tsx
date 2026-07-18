import { useEffect, useRef, useState } from "react";
import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import { ProviderRouter, type ChatMessage, type ConfiguredProvider } from "./lib/providerRouter";
import { PROVIDER_MANIFEST } from "./lib/providers";
import { setCredential, getCredential, deleteCredential } from "./lib/credentials";
import {
  listProviders,
  insertProvider,
  updateProvider,
  deleteProvider,
  recordProviderUsage,
  createConversation,
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
  type ConversationRow,
  type ProviderRow,
  type McpServerRow,
  type ToolCallRow,
} from "./lib/db";
import { ProvidersPanel, type ProviderDraft, type ProviderEditDraft } from "./components/ProvidersPanel";
import { AppSettingsPanel } from "./components/AppSettingsPanel";
import { McpPanel } from "./components/McpPanel";
import { type ResolvedInstall } from "./components/McpMarketplace";
import { PluginsPanel } from "./components/PluginsPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { Sidebar } from "./components/Sidebar";
import { ToolCallBlock } from "./components/ToolCallBlock";
import { Markdown } from "./components/Markdown";
import { IconCheck, IconCopy, IconEdit, IconRefresh, IconSend, IconStop } from "./components/icons";
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
import "./App.css";

function newId(): string {
  return crypto.randomUUID();
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
    };

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
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="message-copy"
      title="Copy message"
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

export default function App() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [showProviders, setShowProviders] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const routerRef = useRef<ProviderRouter>(new ProviderRouter([]));
  const abortControllerRef = useRef<AbortController | null>(null);
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
    (async () => {
      const rows = await listMcpServers();
      setMcpServers(rows);
      for (const server of rows.filter((s) => s.autostart)) {
        try {
          await handleStartMcpServer(server);
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function refreshMcpServers() {
    const rows = await listMcpServers();
    setMcpServers(rows);
  }

  async function refreshConversations() {
    const rows = await listConversations();
    setConversations(rows);
  }

  function handleNewChat() {
    if (isStreaming) return;
    conversationIdRef.current = null;
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setNotice(null);
  }

  async function handleSelectConversation(id: string) {
    if (isStreaming || id === activeConversationId) return;
    const [rows, toolRows] = await Promise.all([listMessages(id), listToolCallsForConversation(id)]);
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

  async function handleConnectGoogle(connector: OAuthConnector) {
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

  async function handleDisconnectGoogle(serverIds: string[]) {
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

  function buildMcpTools(): ToolSet | undefined {
    const entries = Object.entries(mcpToolsByServer).flatMap(([serverId, tools]) => {
      const server = mcpServers.find((s) => s.id === serverId);
      const permissions = parseToolPermissions(server?.tool_permissions_json ?? "{}");
      return tools.flatMap((t) => {
        const permission = getToolPermission(permissions, t.name);
        if (permission === "deny") return [];
        const key = sanitizeToolKey(`${serverId}_${t.name}`);
        return [
          [
            key,
            dynamicTool({
              description: t.description ?? undefined,
              inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
              execute: async (input) => {
                if (permission === "ask") {
                  const approved = await requestToolApproval(server?.name ?? "MCP server", t.name, input);
                  if (!approved) throw new Error("Tool call denied by user.");
                }
                const outcome = await callMcpTool(serverId, t.name, input);
                if (outcome.isError) throw new Error(outcome.text || "Tool call failed");
                return outcome.text;
              },
            }),
          ] as const,
        ];
      });
    });
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  async function refreshProviders() {
    const rows = await listProviders();
    setProviders(rows);
    const configured: ConfiguredProvider[] = await Promise.all(
      rows
        .filter((r) => r.enabled)
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
    routerRef.current.updateProviders(configured);
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
      base_url_override: null,
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
    await updateProvider(id, { label: draft.label, model: draft.model });
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

  async function runSend(text: string) {
    if (!text.trim() || isStreaming) return;
    if (providers.filter((p) => p.enabled).length === 0) {
      setError("Add at least one provider in Settings first.");
      return;
    }

    setError(null);
    setNotice(null);

    if (!conversationIdRef.current) {
      conversationIdRef.current = newId();
      await createConversation(conversationIdRef.current, text.trim().slice(0, 60));
      setActiveConversationId(conversationIdRef.current);
      await refreshConversations();
    }
    const conversationId = conversationIdRef.current;

    const userMessage: ChatMessage = { role: "user", content: text.trim() };
    const userMessageId = newId();
    const userCreatedAt = Date.now();
    const userDisplay: DisplayMessage = { role: "user", content: userMessage.content, id: userMessageId };
    const priorHistory: ChatMessage[] = messages
      .filter((m): m is Extract<DisplayMessage, { role: "user" | "assistant" }> => m.role !== "tool")
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

    let tail: DisplayMessage[] = [{ role: "assistant", content: "" }];
    const commitTail = () => setMessages([...baseMessages, userDisplay, ...tail]);
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
      for await (const event of routerRef.current.streamReply(nextHistory, tools, abortController.signal)) {
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
          setError(`The model's response failed: ${event.message}`);
          appendCrashLog(`stream error: ${event.message}`).catch(() => {});
        } else if (event.type === "router") {
          const ev = event.event;
          if (ev.kind === "switched") {
            setNotice(`Switched to ${ev.toLabel} (${ev.fromLabel} ${ev.reason})`);
            assistantText = "";
            tail = [{ role: "assistant", content: "" }];
            toolCallsForTurn = [];
            toolCallOffsets.clear();
            commitTail();
          } else if (ev.kind === "auth-error") {
            setNotice(`${ev.providerLabel} key looks invalid — disabled it. Check Settings.`);
            await refreshProviders();
          } else if (ev.kind === "exhausted") {
            setError(
              ev.toolsUnsupported
                ? "None of your models support the connected tools. Pick a tool-capable model in Providers, or disable the MCP tools."
                : ev.retryInSeconds > 0
                  ? `All your providers are rate-limited. Try again in ~${ev.retryInSeconds}s.`
                  : "All your providers failed. Check your keys in Settings.",
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
          const today = new Date().toISOString().slice(0, 10);
          await recordProviderUsage(finalProviderId, today, finalTokens);
        }
        await refreshConversations();
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
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
    await runSend(input);
  }

  /** Drops this message and everything after it from both UI state and SQLite. Returns the
   * truncated list so callers can chain further action (e.g. resending) off it. */
  async function truncateFrom(id: string): Promise<DisplayMessage[]> {
    const idx = messages.findIndex((m) => m.role !== "tool" && m.id === id);
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
    const idx = messages.findIndex((m) => m.role !== "tool" && m.id === assistantId);
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
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        collapsed={sidebarCollapsed}
        disabled={isStreaming}
        mcpRunningCount={Object.keys(mcpToolsByServer).length}
        activeProviderCount={providers.filter((p) => p.enabled).length}
        onToggleCollapsed={() =>
          setSidebarCollapsed((v) => {
            const next = !v;
            localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
            return next;
          })
        }
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenProviders={() => setShowProviders(true)}
        onOpenMcp={() => setShowMcp(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenAppSettings={() => setShowAppSettings(true)}
      />

      <main className="main-panel">
        <header className="app-header">
          <h1>{activeTitle || "New chat"}</h1>
        </header>

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && <p className="empty-state">Ask anything to get started.</p>}
          {messages.map((m, i) => {
            const isTrailingEmptyAssistant =
              m.role === "assistant" && !m.content && !(isStreaming && i === messages.length - 1);
            if (isTrailingEmptyAssistant) return null;
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
                  <span className="message-role">{m.role === "user" ? "You" : "Assistant"}</span>
                  {m.role === "assistant" && (m.providerLabel || m.model) && (
                    <span className="message-provenance">
                      via {m.providerLabel ?? "provider"}
                      {m.model ? ` · ${m.model}` : ""}
                    </span>
                  )}
                  {m.role === "assistant" && m.content && !isStreaming && <CopyButton text={m.content} />}
                  {m.role === "user" && !isStreaming && m.id && (
                    <button
                      type="button"
                      className="message-copy"
                      title="Edit and resend"
                      onClick={() => handleEditMessage(m.id!, m.content)}
                    >
                      <IconEdit size={13} />
                    </button>
                  )}
                  {m.role === "assistant" && m.id && !isStreaming && (
                    <button
                      type="button"
                      className="message-copy"
                      title="Retry this reply"
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
                  <p>{m.content}</p>
                )}
              </div>
            );
          })}
        </div>

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <form className="composer" onSubmit={sendMessage}>
          <input
            className="composer-input"
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              className="btn btn-danger btn-icon composer-send"
              onClick={handleStopStreaming}
              title="Stop generating"
            >
              <IconStop size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary btn-icon composer-send"
              disabled={!input.trim()}
              title="Send"
            >
              <IconSend size={16} />
            </button>
          )}
        </form>
      </main>

      {showProviders && (
        <ProvidersPanel
          providers={providers}
          onAdd={handleAddProvider}
          onRemove={handleRemoveProvider}
          onToggle={handleToggleProvider}
          onReorder={handleReorderProvider}
          onEdit={handleEditProvider}
          onOpenOnboarding={() => setShowOnboarding(true)}
          onClose={() => setShowProviders(false)}
        />
      )}

      {showAppSettings && <AppSettingsPanel onClose={() => setShowAppSettings(false)} />}

      {showOnboarding && (
        <OnboardingWizard
          onAddProvider={handleAddProvider}
          onAddFilesystem={handleAddFilesystemServer}
          onClose={() => {
            localStorage.setItem("onboardingDismissed", "1");
            setShowOnboarding(false);
          }}
        />
      )}

      {showMcp && (
        <McpPanel
          servers={mcpServers}
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
          servers={mcpServers}
          onConnect={handleConnectGoogle}
          onDisconnect={handleDisconnectGoogle}
          onClose={() => setShowPlugins(false)}
        />
      )}

      {pendingApproval && (
        <div className="settings-overlay">
          <div className="settings-panel approval-panel">
            <div className="settings-header">
              <h2>Tool call needs approval</h2>
            </div>
            <p className="settings-hint">
              <strong>{pendingApproval.serverName}</strong> wants to run <strong>{pendingApproval.toolName}</strong>.
            </p>
            <pre className="tool-block-pre">{formatApprovalInput(pendingApproval.input)}</pre>
            <div className="provider-edit-actions">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => resolveApproval(false)}>
                Deny
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveApproval(true)}>
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
