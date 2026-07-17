import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { McpServerRow } from "../lib/db";
import {
  getToolPermission,
  isMcpServerRunning,
  onMcpRuntimeLog,
  onMcpServerStatusChanged,
  parseToolPermissions,
  stopMcpServer,
  type McpServerStatusEvent,
  type McpToolInfo,
  type ToolPermissionMode,
} from "../lib/mcp";
import { trustTierLabel, type TrustTier } from "../lib/mcpCatalog";

interface Props {
  servers: McpServerRow[];
  toolsByServer: Record<string, McpToolInfo[]>;
  onAddFilesystem: (scopedPath: string) => Promise<void>;
  onStart: (server: McpServerRow) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onUpdateServer: (
    id: string,
    patch: Partial<Pick<McpServerRow, "name" | "args_json" | "scoped_path" | "url" | "env_refs_json" | "tool_permissions_json">>,
  ) => Promise<void>;
  onUpdateEnv: (server: McpServerRow, updates: Record<string, { isSecret: boolean; value: string }>) => Promise<void>;
  onEditFilesystemPath: (server: McpServerRow, newPath: string) => Promise<void>;
  onOpenMarketplace: () => void;
  onClose: () => void;
  /** Rendered as a DOM descendant of this panel's own overlay (not a sibling) so a nested modal
   * like the marketplace gets the `.settings-overlay .settings-overlay` nested backdrop/z-index
   * instead of competing as an equal-z-index sibling overlay. */
  children?: ReactNode;
}

type Status = "stopped" | "starting" | "running" | "error";

function isPinned(server: McpServerRow): boolean {
  if (server.kind === "filesystem") return true;
  return /gmail|google[- ]?drive|google/i.test(server.name);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ToolPermissionRow({
  tool,
  permission,
  onChange,
}: {
  tool: McpToolInfo;
  permission: ToolPermissionMode;
  onChange: (mode: ToolPermissionMode) => void;
}) {
  return (
    <li className="tool-perm-row">
      <div className="tool-perm-info">
        <span className="tool-perm-name">{tool.name}</span>
        {tool.description && <span className="tool-perm-desc">{tool.description}</span>}
      </div>
      <select value={permission} onChange={(e) => onChange(e.currentTarget.value as ToolPermissionMode)}>
        <option value="allow">Allow</option>
        <option value="ask">Ask every time</option>
        <option value="deny">Deny (hidden)</option>
      </select>
    </li>
  );
}

function EditServerForm({
  server,
  onSave,
  onSaveEnv,
  onEditFilesystemPath,
  onCancel,
}: {
  server: McpServerRow;
  onSave: (patch: Partial<Pick<McpServerRow, "name" | "url">>) => Promise<void>;
  onSaveEnv: (updates: Record<string, { isSecret: boolean; value: string }>) => Promise<void>;
  onEditFilesystemPath: (newPath: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [url, setUrl] = useState(server.url ?? "");
  const envRefs = JSON.parse(server.env_refs_json || "{}") as Record<string, { secret: boolean; value: string }>;
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (name.trim() && name.trim() !== server.name) await onSave({ name: name.trim() });
      if (server.transport === "remote-http" && url.trim() && url.trim() !== server.url) {
        await onSave({ url: url.trim() });
      }
      const envUpdates: Record<string, { isSecret: boolean; value: string }> = {};
      for (const [key, value] of Object.entries(envDrafts)) {
        if (!value.trim()) continue;
        envUpdates[key] = { isSecret: envRefs[key]?.secret ?? false, value: value.trim() };
      }
      if (Object.keys(envUpdates).length > 0) await onSaveEnv(envUpdates);
      onCancel();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (!picked) return;
    setBusy(true);
    setFormError(null);
    try {
      await onEditFilesystemPath(picked);
      onCancel();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="provider-edit-row">
      <form onSubmit={handleSave}>
        {formError && <p className="error">{formError}</p>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>

        {server.kind === "filesystem" && (
          <label>
            Folder
            <div className="mcp-path-edit">
              <span className="provider-model">{server.scoped_path}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handlePickFolder} disabled={busy}>
                Change folder…
              </button>
            </div>
          </label>
        )}

        {server.transport === "remote-http" && (
          <label>
            URL
            <input value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="https://…" />
          </label>
        )}

        {Object.keys(envRefs).length > 0 && (
          <div className="mcp-env-edit">
            <span className="tool-block-section-label">Environment variables</span>
            {Object.entries(envRefs).map(([key, ref]) => (
              <label key={key}>
                {key}
                {ref.secret && <span className="trust-badge trust-community"> secret</span>}
                <input
                  type={ref.secret ? "password" : "text"}
                  value={envDrafts[key] ?? ""}
                  onChange={(e) => setEnvDrafts((prev) => ({ ...prev, [key]: e.currentTarget.value }))}
                  placeholder={ref.secret ? "Leave blank to keep current value" : ref.value}
                />
              </label>
            ))}
          </div>
        )}

        <div className="provider-edit-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

export function McpPanel({
  servers,
  toolsByServer,
  onAddFilesystem,
  onStart,
  onRemove,
  onUpdateServer,
  onUpdateEnv,
  onEditFilesystemPath,
  onOpenMarketplace,
  onClose,
  children,
}: Props) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [statusMessages, setStatusMessages] = useState<Record<string, string>>({});
  const [runtimeLog, setRuntimeLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingToolsId, setManagingToolsId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        servers.map(async (s) => [s.id, (await isMcpServerRunning(s.id)) ? "running" : "stopped"] as const),
      );
      if (!cancelled) {
        setStatuses((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [servers]);

  useEffect(() => {
    const unlistenStatus = onMcpServerStatusChanged((event: McpServerStatusEvent) => {
      setStatuses((prev) => ({ ...prev, [event.id]: event.status }));
      setStatusMessages((prev) => ({ ...prev, [event.id]: event.message ?? "" }));
    });
    const unlistenLog = onMcpRuntimeLog((message) => setRuntimeLog(message));
    return () => {
      unlistenStatus.then((f) => f());
      unlistenLog.then((f) => f());
    };
  }, []);

  async function handleAddFilesystem() {
    setFormError(null);
    const picked = await open({ directory: true, multiple: false });
    if (!picked) return;
    setBusy(true);
    try {
      await onAddFilesystem(picked);
    } catch (err) {
      setFormError(`Couldn't add filesystem access: ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleStart(server: McpServerRow) {
    setFormError(null);
    try {
      await onStart(server);
    } catch (err) {
      setFormError(`Couldn't start ${server.name}: ${describeError(err)}`);
    }
  }

  async function handleStop(server: McpServerRow) {
    setFormError(null);
    try {
      await stopMcpServer(server.id);
    } catch (err) {
      setFormError(`Couldn't stop ${server.name}: ${describeError(err)}`);
    }
  }

  async function handleRemove(server: McpServerRow) {
    setFormError(null);
    try {
      if (statuses[server.id] === "running") {
        await stopMcpServer(server.id);
      }
      await onRemove(server.id);
    } catch (err) {
      setFormError(`Couldn't remove ${server.name}: ${describeError(err)}`);
    }
  }

  async function handleToolPermissionChange(server: McpServerRow, toolName: string, mode: ToolPermissionMode) {
    const current = parseToolPermissions(server.tool_permissions_json);
    const next = { ...current, [toolName]: mode };
    await onUpdateServer(server.id, { tool_permissions_json: JSON.stringify(next) });
  }

  const hasFilesystem = servers.some((s) => s.kind === "filesystem");
  const pinned = servers.filter(isPinned);
  const query = search.trim().toLowerCase();
  const rest = servers
    .filter((s) => !isPinned(s))
    .filter((s) => !query || s.name.toLowerCase().includes(query));

  function renderServerCard(s: McpServerRow) {
    const status = statuses[s.id] ?? "stopped";
    const tools = toolsByServer[s.id];
    const permissions = parseToolPermissions(s.tool_permissions_json);

    if (editingId === s.id) {
      return (
        <EditServerForm
          key={s.id}
          server={s}
          onSave={(patch) => onUpdateServer(s.id, patch)}
          onSaveEnv={(updates) => onUpdateEnv(s, updates)}
          onEditFilesystemPath={(newPath) => onEditFilesystemPath(s, newPath)}
          onCancel={() => setEditingId(null)}
        />
      );
    }

    return (
      <li key={s.id} className="mcp-server-card">
        <div className="provider-row-main">
          <strong>
            {s.name}{" "}
            <span className={`trust-badge trust-${s.trust_tier}`}>{trustTierLabel(s.trust_tier as TrustTier)}</span>
          </strong>
          <span className="provider-model">
            {s.scoped_path ?? s.url ?? s.command}
            {" · "}
            <span className={`mcp-status mcp-status-${status}`}>{status}</span>
            {status === "error" && statusMessages[s.id] ? `: ${statusMessages[s.id]}` : ""}
          </span>
        </div>
        <div className="provider-row-actions">
          {status === "running" ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleStop(s)}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleStart(s)}
              disabled={status === "starting"}
            >
              {status === "starting" ? "Starting…" : "Start"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setManagingToolsId(managingToolsId === s.id ? null : s.id)}
            disabled={!tools || tools.length === 0}
            title={!tools || tools.length === 0 ? "Start the server to see its tools" : undefined}
          >
            Tools{tools ? ` (${tools.length})` : ""}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(s.id)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemove(s)}>
            Remove
          </button>
        </div>

        {managingToolsId === s.id && tools && tools.length > 0 && (
          <ul className="tool-perm-list">
            {tools.map((t) => (
              <ToolPermissionRow
                key={t.name}
                tool={t}
                permission={getToolPermission(permissions, t.name)}
                onChange={(mode) => handleToolPermissionChange(s, t.name, mode)}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>MCP Servers</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-hint">
          MCP servers give the assistant extra tools, like reading and writing files on this
          computer. Only add servers you trust. Set a tool to "Ask every time" to approve each
          call, or "Deny" to hide it from the assistant entirely. Every allowed tool call is shown
          in the chat.
        </p>

        {formError && <p className="error">{formError}</p>}
        {runtimeLog && <p className="notice">{runtimeLog}</p>}

        <h3 className="mcp-section-title">Pinned</h3>
        <ul className="provider-list mcp-card-list">
          {pinned.map(renderServerCard)}
          {!hasFilesystem && (
            <li className="mcp-server-card mcp-server-card-empty">
              <div className="provider-row-main">
                <strong>Filesystem</strong>
                <span className="provider-model">Let the assistant read/write files in a folder you choose.</span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddFilesystem} disabled={busy}>
                {busy ? "Adding…" : "Add…"}
              </button>
            </li>
          )}
        </ul>

        <h3 className="mcp-section-title">All servers</h3>
        <input
          className="mcp-search"
          placeholder="Search installed servers…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <ul className="provider-list mcp-card-list">
          {rest.map(renderServerCard)}
          {rest.length === 0 && (
            <li className="empty-state">{query ? "No servers match your search." : "No other servers installed."}</li>
          )}
        </ul>

        <div className="add-provider-form">
          <button type="button" className="btn btn-secondary" onClick={onOpenMarketplace}>
            Browse marketplace…
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
