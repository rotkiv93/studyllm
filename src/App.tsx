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
  insertMessage,
  touchConversation,
  listMcpServers,
  insertMcpServer,
  deleteMcpServer,
  type ProviderRow,
  type McpServerRow,
} from "./lib/db";
import { SettingsPanel, type ProviderDraft } from "./components/SettingsPanel";
import { McpPanel } from "./components/McpPanel";
import { McpMarketplace, type ResolvedInstall } from "./components/McpMarketplace";
import {
  callMcpTool,
  filesystemServerArgs,
  listMcpTools,
  onMcpServerStatusChanged,
  startMcpServer,
  startRemoteMcpServer,
  type McpToolInfo,
} from "./lib/mcp";
import "./App.css";

function newId(): string {
  return crypto.randomUUID();
}

type DisplayMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: string;
      isError: boolean;
      pending: boolean;
    };

function sanitizeToolKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export default function App() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerRow[]>([]);
  const [mcpToolsByServer, setMcpToolsByServer] = useState<Record<string, McpToolInfo[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const routerRef = useRef<ProviderRouter>(new ProviderRouter([]));
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    refreshProviders();
    refreshMcpServers();
    const unlisten = onMcpServerStatusChanged(async (event) => {
      if (event.status === "running") {
        try {
          const tools = await listMcpTools(event.id);
          setMcpToolsByServer((prev) => ({ ...prev, [event.id]: tools }));
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
    const env = await resolveServerEnv(server);
    if (server.transport === "remote-http" && server.url) {
      const token = Object.values(env)[0];
      await startRemoteMcpServer(server.id, server.url, token || undefined);
    } else {
      const args: string[] =
        server.kind === "filesystem" && server.scoped_path
          ? filesystemServerArgs(server.scoped_path)
          : JSON.parse(server.args_json);
      await startMcpServer(server.id, args, env);
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
      command: isRemote ? "" : "npx",
      args_json: JSON.stringify(resolved.finalArgs),
      scoped_path: null,
      enabled: 1,
      created_at: Date.now(),
      transport: isRemote ? "remote-http" : "stdio",
      url: resolved.entry.install.kind === "remoteHttp" ? resolved.entry.install.url : null,
      env_refs_json: JSON.stringify(envRefs),
      trust_tier: resolved.trustTier,
    };
    await insertMcpServer(row);
    await refreshMcpServers();
    await handleStartMcpServer(row);
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

  function buildMcpTools(): ToolSet | undefined {
    const entries = Object.entries(mcpToolsByServer).flatMap(([serverId, tools]) =>
      tools.map((t) => {
        const key = sanitizeToolKey(`${serverId}_${t.name}`);
        return [
          key,
          dynamicTool({
            description: t.description ?? undefined,
            inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
            execute: async (input) => {
              const outcome = await callMcpTool(serverId, t.name, input);
              if (outcome.isError) throw new Error(outcome.text || "Tool call failed");
              return outcome.text;
            },
          }),
        ] as const;
      }),
    );
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    if (providers.filter((p) => p.enabled).length === 0) {
      setError("Add at least one provider in Settings first.");
      return;
    }

    setError(null);
    setNotice(null);

    if (!conversationIdRef.current) {
      conversationIdRef.current = newId();
      await createConversation(conversationIdRef.current, input.trim().slice(0, 60));
    }
    const conversationId = conversationIdRef.current;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const priorHistory: ChatMessage[] = messages
      .filter((m): m is Extract<DisplayMessage, { role: "user" | "assistant" }> => m.role !== "tool")
      .map((m) => ({ role: m.role, content: m.content }));
    const nextHistory = [...priorHistory, userMessage];
    const baseMessages = messages;
    setMessages([...baseMessages, userMessage]);
    setInput("");
    setIsStreaming(true);
    await insertMessage({
      id: newId(),
      conversation_id: conversationId,
      role: "user",
      content: userMessage.content,
      provider_used: null,
      model_used: null,
      created_at: Date.now(),
    });

    let tail: DisplayMessage[] = [{ role: "assistant", content: "" }];
    const commitTail = () => setMessages([...baseMessages, userMessage, ...tail]);
    commitTail();

    let finalProviderId: string | null = null;
    let finalModel: string | null = null;
    let finalTokens = 0;
    let assistantText = "";
    const tools = buildMcpTools();

    try {
      for await (const event of routerRef.current.streamReply(nextHistory, tools)) {
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
        } else if (event.type === "router") {
          const ev = event.event;
          if (ev.kind === "switched") {
            setNotice(`Switched to ${ev.toLabel} (${ev.fromLabel} ${ev.reason})`);
            assistantText = "";
            tail = [{ role: "assistant", content: "" }];
            commitTail();
          } else if (ev.kind === "auth-error") {
            setNotice(`${ev.providerLabel} key looks invalid — disabled it. Check Settings.`);
            await refreshProviders();
          } else if (ev.kind === "exhausted") {
            setError(
              ev.retryInSeconds > 0
                ? `All your providers are rate-limited. Try again in ~${ev.retryInSeconds}s.`
                : "All your providers failed. Check your keys in Settings.",
            );
          }
        } else if (event.type === "done") {
          finalProviderId = event.providerId;
          finalModel = event.model;
          finalTokens = event.estimatedTokens;
        }
      }

      if (!assistantText && !finalProviderId) {
        setMessages([...baseMessages, userMessage]);
      } else {
        await insertMessage({
          id: newId(),
          conversation_id: conversationId,
          role: "assistant",
          content: assistantText,
          provider_used: finalProviderId,
          model_used: finalModel,
          created_at: Date.now(),
        });
        await touchConversation(conversationId);
        if (finalProviderId) {
          const today = new Date().toISOString().slice(0, 10);
          await recordProviderUsage(finalProviderId, today, finalTokens);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages([...baseMessages, userMessage]);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>StudyLLM</h1>
        <button type="button" onClick={() => setShowMcp(true)}>
          MCP ({Object.keys(mcpToolsByServer).length} running)
        </button>
        <button type="button" onClick={() => setShowSettings(true)}>
          Settings ({providers.filter((p) => p.enabled).length} active)
        </button>
      </header>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && <p className="empty-state">Ask anything to get started.</p>}
        {messages.map((m, i) =>
          m.role === "tool" ? (
            <div key={i} className={`message message-tool${m.isError ? " message-tool-error" : ""}`}>
              <span className="message-role">🔧 {m.toolName}</span>
              <pre className="tool-call-input">{JSON.stringify(m.input, null, 2)}</pre>
              <p>{m.pending ? "Running…" : m.output}</p>
            </div>
          ) : (
            <div key={i} className={`message message-${m.role}`}>
              <span className="message-role">{m.role === "user" ? "You" : "Assistant"}</span>
              <p>{m.content || (isStreaming && i === messages.length - 1 ? "…" : "")}</p>
            </div>
          ),
        )}
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
        <button type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? "Sending…" : "Send"}
        </button>
      </form>

      {showSettings && (
        <SettingsPanel
          providers={providers}
          onAdd={handleAddProvider}
          onRemove={handleRemoveProvider}
          onToggle={handleToggleProvider}
          onReorder={handleReorderProvider}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showMcp && (
        <McpPanel
          servers={mcpServers}
          onAddFilesystem={handleAddFilesystemServer}
          onStart={handleStartMcpServer}
          onRemove={handleRemoveMcpServer}
          onOpenMarketplace={() => setShowMarketplace(true)}
          onClose={() => setShowMcp(false)}
        />
      )}

      {showMarketplace && (
        <McpMarketplace
          servers={mcpServers}
          onInstall={handleInstallFromCatalog}
          onClose={() => setShowMarketplace(false)}
        />
      )}
    </main>
  );
}
