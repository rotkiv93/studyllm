import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { McpServerRow } from "../lib/db";
import {
  isMcpServerRunning,
  onMcpRuntimeLog,
  onMcpServerStatusChanged,
  stopMcpServer,
  type McpServerStatusEvent,
} from "../lib/mcp";
import { trustTierLabel, type TrustTier } from "../lib/mcpCatalog";

interface Props {
  servers: McpServerRow[];
  onAddFilesystem: (scopedPath: string) => Promise<void>;
  onStart: (server: McpServerRow) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onOpenMarketplace: () => void;
  onClose: () => void;
}

type Status = "stopped" | "starting" | "running" | "error";

export function McpPanel({
  servers,
  onAddFilesystem,
  onStart,
  onRemove,
  onOpenMarketplace,
  onClose,
}: Props) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [statusMessages, setStatusMessages] = useState<Record<string, string>>({});
  const [runtimeLog, setRuntimeLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

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

  const hasFilesystem = servers.some((s) => s.kind === "filesystem");

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>MCP Servers</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-hint">
          MCP servers give the assistant extra tools, like reading and writing files on this
          computer. Only add servers you trust — the assistant can use any tool a running server
          exposes. Every tool call is shown in the chat.
        </p>

        {formError && <p className="error">{formError}</p>}
        {runtimeLog && <p className="notice">{runtimeLog}</p>}

        <ul className="provider-list">
          {servers.map((s) => {
            const status = statuses[s.id] ?? "stopped";
            return (
              <li key={s.id}>
                <div className="provider-row-main">
                  <strong>
                    {s.name}{" "}
                    <span className={`trust-badge trust-${s.trust_tier}`}>
                      {trustTierLabel(s.trust_tier as TrustTier)}
                    </span>
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
                    <button type="button" onClick={() => handleStop(s)}>
                      Stop
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleStart(s)} disabled={status === "starting"}>
                      {status === "starting" ? "Starting…" : "Start"}
                    </button>
                  )}
                  <button type="button" onClick={() => handleRemove(s)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
          {servers.length === 0 && <li className="empty-state">No MCP servers added yet.</li>}
        </ul>

        <div className="add-provider-form">
          <h3>Quick add</h3>
          {hasFilesystem ? (
            <p className="settings-hint">Filesystem access is already added.</p>
          ) : (
            <button type="button" onClick={handleAddFilesystem} disabled={busy}>
              {busy ? "Adding…" : "Add filesystem access to a folder…"}
            </button>
          )}
          <button type="button" onClick={onOpenMarketplace}>
            Browse marketplace…
          </button>
        </div>
      </div>
    </div>
  );
}
