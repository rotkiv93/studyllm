import { useEffect, useState } from "react";
import type { McpServerRow } from "../lib/db";
import type { OAuthConnector } from "../lib/googleConnectors";
import { onOAuthProgress, type OAuthProgressPhase } from "../lib/oauth";
import { IconCheck, IconPlug } from "./icons";

interface Props {
  connectors: OAuthConnector[];
  servers: McpServerRow[];
  onConnect: (connector: OAuthConnector) => Promise<void>;
  onDisconnect: (serverIds: string[]) => Promise<void>;
  onClose: () => void;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PHASE_LABEL: Record<OAuthProgressPhase, string> = {
  "opening-browser": "Opening your browser…",
  waiting: "Waiting for you to finish signing in with Google…",
  exchanging: "Connecting…",
  connected: "Connected!",
  error: "Something went wrong.",
};

export function PluginsPanel({ connectors, servers, onConnect, onDisconnect, onClose }: Props) {
  const [busyConnectorId, setBusyConnectorId] = useState<string | null>(null);
  const [phaseByConnector, setPhaseByConnector] = useState<Record<string, OAuthProgressPhase>>({});
  const [errorByConnector, setErrorByConnector] = useState<Record<string, string>>({});

  useEffect(() => {
    const unlisten = onOAuthProgress((event) => {
      setPhaseByConnector((prev) => ({ ...prev, [event.connectorId]: event.phase }));
      if (event.phase === "error" && event.message) {
        setErrorByConnector((prev) => ({ ...prev, [event.connectorId]: event.message! }));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function handleConnect(connector: OAuthConnector) {
    setErrorByConnector((prev) => ({ ...prev, [connector.id]: "" }));
    setBusyConnectorId(connector.id);
    try {
      await onConnect(connector);
    } catch (err) {
      setErrorByConnector((prev) => ({ ...prev, [connector.id]: describeError(err) }));
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function handleDisconnect(connector: OAuthConnector, serverIds: string[]) {
    setBusyConnectorId(connector.id);
    try {
      await onDisconnect(serverIds);
    } catch (err) {
      setErrorByConnector((prev) => ({ ...prev, [connector.id]: describeError(err) }));
    } finally {
      setBusyConnectorId(null);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide">
        <div className="settings-header">
          <h2>Plugins</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-hint">
          Connect accounts so the assistant can use them, like a Google account for email and
          files. StudyLLM never sees your Google password — you sign in directly with Google.
        </p>

        <ul className="marketplace-grid">
          {connectors.map((connector) => {
            const connectedTargets = connector.targets.filter((t) =>
              servers.some((s) => s.id === t.serverId),
            );
            const isConnected = connectedTargets.length > 0;
            const isBusy = busyConnectorId === connector.id;
            const phase = phaseByConnector[connector.id];
            const errorMessage = errorByConnector[connector.id];
            const hasError = !isBusy && (phase === "error" || !!errorMessage);

            return (
              <li key={connector.id} className="marketplace-card">
                <div className="marketplace-card-head">
                  <span className="marketplace-card-avatar avatar-c0">
                    <IconPlug size={16} />
                  </span>
                  <div className="marketplace-card-title">
                    <strong>{connector.displayName}</strong>
                    <span className="trust-badge trust-official">Official</span>
                  </div>
                </div>
                <p className="marketplace-card-desc">{connector.description}</p>

                {isConnected && (
                  <div className="plugin-connected-list">
                    {connectedTargets.map((t) => (
                      <span
                        key={t.serverId}
                        className={`mcp-status mcp-status-${hasError ? "error" : "running"}`}
                      >
                        {t.name}: {hasError ? "error" : "connected"}
                      </span>
                    ))}
                  </div>
                )}

                {isBusy && phase && (
                  <p className="settings-hint">{PHASE_LABEL[phase]}</p>
                )}
                {hasError && (
                  <p className="error">{errorMessage || "Couldn't connect — please try again."}</p>
                )}

                <div className="marketplace-card-footer">
                  {isConnected ? (
                    <>
                      <span className="marketplace-added">
                        <IconCheck size={14} /> Connected
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={isBusy}
                        onClick={() =>
                          handleDisconnect(
                            connector,
                            connectedTargets.map((t) => t.serverId),
                          )
                        }
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isBusy}
                      onClick={() => handleConnect(connector)}
                    >
                      {isBusy ? "Connecting…" : hasError ? "Try again" : "Connect Google Account"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
