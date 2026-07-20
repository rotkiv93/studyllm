import { useEffect, useState } from "react";
import type { McpServerRow } from "../lib/db";
import type { OAuthConnector } from "../lib/googleConnectors";
import { onOAuthProgress, type OAuthProgressPhase } from "../lib/oauth";
import { IconCheck, IconPlug } from "./icons";
import { useT, type MessageKey } from "../lib/i18n";

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

/** i18n key for a connector's blurb (the `description` on the connector is the English source). */
function connectorDescriptionKey(connectorId: string): MessageKey {
  return `connector.${connectorId}.description` as MessageKey;
}

const PHASE_LABEL_KEY: Record<OAuthProgressPhase, MessageKey> = {
  "opening-browser": "plugins.phase.openingBrowser",
  waiting: "plugins.phase.waiting",
  exchanging: "plugins.phase.exchanging",
  connected: "plugins.phase.connected",
  error: "plugins.phase.error",
};

/**
 * One-time Cloud Console setup the user (as the app's OAuth-client owner) must do before the
 * broadened Workspace scopes will work, plus the reconnect note for anyone upgrading from the old
 * read-only scopes. Collapsed by default so it doesn't crowd the card.
 */
function GoogleSetupInstructions() {
  const t = useT();
  // The intro sentence embeds a link, so it's split around the `{link}` placeholder.
  const [introBefore, introAfter] = t("plugins.setup.intro").split("{link}");
  return (
    <details className="plugin-setup">
      <summary>{t("plugins.setup.summary")}</summary>
      <div className="plugin-setup-body">
        <p>
          {introBefore}
          <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
            {t("plugins.setup.consoleLink")}
          </a>
          {introAfter}
        </p>
        <ol>
          <li>{t("plugins.setup.step1")}</li>
          <li>{t("plugins.setup.step2")}</li>
          <li>{t("plugins.setup.step3")}</li>
          <li>{t("plugins.setup.step4")}</li>
        </ol>
        <p className="plugin-setup-note">{t("plugins.setup.note")}</p>
      </div>
    </details>
  );
}

export function PluginsPanel({ connectors, servers, onConnect, onDisconnect, onClose }: Props) {
  const t = useT();
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
          <h2>
            {t("plugins.title")}{" "}
            <span className="settings-header-term">{t("plugins.titleTerm")}</span>
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <p className="settings-hint">{t("plugins.hint")}</p>

        <ul className="marketplace-grid">
          {connectors.map((connector) => {
            const connectedTargets = connector.targets.filter((target) =>
              servers.some((s) => s.id === target.serverId),
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
                    <span className="trust-badge trust-official">{t("plugins.official")}</span>
                  </div>
                </div>
                <p className="marketplace-card-desc">{t(connectorDescriptionKey(connector.id))}</p>

                {connector.id === "google" && <GoogleSetupInstructions />}

                {isConnected && (
                  <div className="plugin-connected-list">
                    {connectedTargets.map((target) => (
                      <span
                        key={target.serverId}
                        className={`mcp-status mcp-status-${hasError ? "error" : "running"}`}
                      >
                        {target.name}:{" "}
                        {hasError ? t("plugins.errorLower") : t("plugins.connectedLower")}
                      </span>
                    ))}
                  </div>
                )}

                {isBusy && phase && <p className="settings-hint">{t(PHASE_LABEL_KEY[phase])}</p>}
                {hasError && <p className="error">{errorMessage || t("plugins.connectFailed")}</p>}

                <div className="marketplace-card-footer">
                  {isConnected ? (
                    <>
                      <span className="marketplace-added">
                        <IconCheck size={14} /> {t("plugins.connected")}
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={isBusy}
                        onClick={() =>
                          handleDisconnect(
                            connector,
                            connectedTargets.map((target) => target.serverId),
                          )
                        }
                      >
                        {t("plugins.disconnect")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isBusy}
                      onClick={() => handleConnect(connector)}
                    >
                      {isBusy
                        ? t("plugins.connecting")
                        : hasError
                          ? t("plugins.tryAgain")
                          : t("plugins.connectGoogle")}
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
