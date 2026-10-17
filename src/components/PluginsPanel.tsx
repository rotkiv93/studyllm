import { useEffect, useState } from "react";
import type { McpServerRow } from "../lib/db";
import {
  DESTRUCTIVE_GOOGLE_TOOLS,
  type OAuthConnector,
  type OAuthConnectorTarget,
} from "../lib/googleConnectors";
import { getToolPermission, parseToolPermissions, type McpToolInfo, type ToolPermissionMode } from "../lib/mcp";
import { onOAuthProgress, type OAuthProgressPhase } from "../lib/oauth";
import { IconPlug } from "./icons";
import { useT, type MessageKey } from "../lib/i18n";
import { useEscapeClose } from "../lib/useEscapeClose";

interface Props {
  connectors: OAuthConnector[];
  servers: McpServerRow[];
  toolsByServer: Record<string, McpToolInfo[]>;
  onUpdateServer: (id: string, patch: { tool_permissions_json: string }) => Promise<void>;
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

/** One emoji per service so the tiles can be told apart at a glance. */
const SERVICE_ICONS: Record<OAuthConnectorTarget["provider"], string> = {
  gmail: "✉️",
  calendar: "📅",
  tasks: "✅",
  drive: "🗂️",
  docs: "📄",
  sheets: "📊",
};

type ToolKind = "read" | "write" | "danger";

/** What a tool does to the user's data, guessed from its name — drives the badge colour. */
function toolKind(name: string): ToolKind {
  if (DESTRUCTIVE_GOOGLE_TOOLS.includes(name) || /(send|delete|trash|remove)/.test(name)) return "danger";
  if (/(create|update|append|modify|label|respond|add)/.test(name)) return "write";
  return "read";
}

const TOOL_KIND_ICON: Record<ToolKind, string> = { read: "👁", write: "✏️", danger: "⚠️" };

/** `gmail_search_messages` → "Search messages". */
function humanizeToolName(name: string): string {
  const parts = name.split("_");
  const words = parts.length > 1 ? parts.slice(1) : parts;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Parse a server row's cached tool list (used while the connection isn't live yet). */
function cachedTools(server: McpServerRow): McpToolInfo[] {
  try {
    const parsed = JSON.parse(server.cached_tools_json || "[]");
    return Array.isArray(parsed) ? (parsed as McpToolInfo[]) : [];
  } catch {
    return [];
  }
}

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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className={`pl-switch${checked ? " pl-switch-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <span className="pl-switch-knob" />
    </button>
  );
}

const MODES: { mode: ToolPermissionMode; icon: string; key: MessageKey }[] = [
  { mode: "allow", icon: "✓", key: "mcp.perm.allow" },
  { mode: "ask", icon: "✋", key: "mcp.perm.ask" },
  { mode: "deny", icon: "⛔", key: "plugins.perm.off" },
];

/** One tool: what it does, and an Allow / Ask / Off segmented control. */
function PluginToolRow({
  tool,
  permission,
  onChange,
}: {
  tool: McpToolInfo;
  permission: ToolPermissionMode;
  onChange: (mode: ToolPermissionMode) => void;
}) {
  const t = useT();
  const kind = toolKind(tool.name);
  return (
    <li className={`pl-tool${permission === "deny" ? " pl-tool-off" : ""}`}>
      <span className={`pl-tool-kind pl-tool-kind-${kind}`} title={t(`plugins.kind.${kind}` as MessageKey)}>
        {TOOL_KIND_ICON[kind]}
      </span>
      <div className="pl-tool-info">
        <span className="pl-tool-name">{humanizeToolName(tool.name)}</span>
        {tool.description && <span className="pl-tool-desc">{tool.description}</span>}
      </div>
      <div className="pl-seg" role="group" aria-label={tool.name}>
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            className={`pl-seg-btn pl-seg-${m.mode}${permission === m.mode ? " pl-seg-active" : ""}`}
            aria-pressed={permission === m.mode}
            title={t(m.key)}
            onClick={() => onChange(m.mode)}
          >
            <span aria-hidden="true">{m.icon}</span>
            <span className="pl-seg-label">{t(m.key)}</span>
          </button>
        ))}
      </div>
    </li>
  );
}

/** The expanded tool list under the tiles: counters up top, then one row per tool. */
function ToolsPanel({
  target,
  server,
  tools,
  onSetMode,
}: {
  target: OAuthConnectorTarget;
  server: McpServerRow;
  tools: McpToolInfo[];
  onSetMode: (toolName: string, mode: ToolPermissionMode) => void;
}) {
  const t = useT();
  const permissions = parseToolPermissions(server.tool_permissions_json);
  const counts = { allow: 0, ask: 0, deny: 0 };
  for (const tool of tools) counts[getToolPermission(permissions, tool.name)]++;

  return (
    <section className="pl-tools" aria-label={target.name}>
      <header className="pl-tools-head">
        <span className="pl-tile-icon" aria-hidden="true">
          {SERVICE_ICONS[target.provider]}
        </span>
        <strong>{target.name}</strong>
        <span className="pl-tools-counts">
          <span className="pl-count pl-count-allow">✓ {counts.allow}</span>
          <span className="pl-count pl-count-ask">✋ {counts.ask}</span>
          <span className="pl-count pl-count-deny">⛔ {counts.deny}</span>
        </span>
      </header>
      {tools.length === 0 ? (
        <p className="settings-hint">{t("plugins.noTools")}</p>
      ) : (
        <ul className="pl-tool-list">
          {tools.map((tool) => (
            <PluginToolRow
              key={tool.name}
              tool={tool}
              permission={getToolPermission(permissions, tool.name)}
              onChange={(mode) => onSetMode(tool.name, mode)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function PluginsPanel({
  connectors,
  servers,
  toolsByServer,
  onUpdateServer,
  onConnect,
  onDisconnect,
  onClose,
}: Props) {
  const t = useT();
  useEscapeClose(onClose);
  const [busyConnectorId, setBusyConnectorId] = useState<string | null>(null);
  const [phaseByConnector, setPhaseByConnector] = useState<Record<string, OAuthProgressPhase>>({});
  const [errorByConnector, setErrorByConnector] = useState<Record<string, string>>({});
  const [openService, setOpenService] = useState<string | null>(null);

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
      setOpenService(null);
    } catch (err) {
      setErrorByConnector((prev) => ({ ...prev, [connector.id]: describeError(err) }));
    } finally {
      setBusyConnectorId(null);
    }
  }

  /** Master switch for a service: every tool off, or back to its default (destructive ones → ask). */
  async function toggleService(server: McpServerRow, tools: McpToolInfo[]) {
    const permissions = parseToolPermissions(server.tool_permissions_json);
    const allOff = tools.length > 0 && tools.every((tool) => getToolPermission(permissions, tool.name) === "deny");
    const next = { ...permissions };
    for (const tool of tools) {
      if (allOff) {
        if (DESTRUCTIVE_GOOGLE_TOOLS.includes(tool.name)) next[tool.name] = "ask";
        else delete next[tool.name];
      } else {
        next[tool.name] = "deny";
      }
    }
    await onUpdateServer(server.id, { tool_permissions_json: JSON.stringify(next) });
  }

  async function setToolMode(server: McpServerRow, toolName: string, mode: ToolPermissionMode) {
    const permissions = parseToolPermissions(server.tool_permissions_json);
    await onUpdateServer(server.id, { tool_permissions_json: JSON.stringify({ ...permissions, [toolName]: mode }) });
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide settings-panel-tall">
        <div className="settings-header">
          <h2>
            {t("plugins.title")} <span className="settings-header-term">{t("plugins.titleTerm")}</span>
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <ul className="plugin-list">
          {connectors.map((connector) => {
            const connectedTargets = connector.targets.filter((target) =>
              servers.some((s) => s.id === target.serverId),
            );
            const isConnected = connectedTargets.length > 0;
            const isBusy = busyConnectorId === connector.id;
            const phase = phaseByConnector[connector.id];
            const errorMessage = errorByConnector[connector.id];
            const hasError = !isBusy && (phase === "error" || !!errorMessage);
            const liveCount = connectedTargets.filter((target) => target.serverId in toolsByServer).length;
            const needsReconnect = isConnected && liveCount < connectedTargets.length;
            const status: "connected" | "reconnect" | "off" = !isConnected
              ? "off"
              : needsReconnect || hasError
                ? "reconnect"
                : "connected";

            const selectedTarget = connector.targets.find((target) => target.serverId === openService);
            const selectedServer = selectedTarget && servers.find((s) => s.id === selectedTarget.serverId);

            return (
              <li key={connector.id} className={`pl-card pl-card-${status}`}>
                <div className="pl-card-head">
                  <span className="pl-card-avatar" aria-hidden="true">
                    <IconPlug size={20} />
                  </span>
                  <div className="pl-card-title">
                    <div className="pl-card-name">
                      <strong>{connector.displayName}</strong>
                      <span className={`pl-status pl-status-${status}`}>
                        <span className="pl-status-dot" aria-hidden="true" />
                        {t(`plugins.status.${status}` as MessageKey)}
                      </span>
                    </div>
                    <p className="plugin-row-desc" title={t(connectorDescriptionKey(connector.id))}>
                      {t(connectorDescriptionKey(connector.id))}
                    </p>
                  </div>
                  <div className="pl-card-actions">
                    {isConnected && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm pl-disconnect"
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
                    )}
                    {(!isConnected || status === "reconnect") && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={isBusy}
                        onClick={() => handleConnect(connector)}
                      >
                        {isBusy
                          ? t("plugins.connecting")
                          : isConnected
                            ? t("plugins.reconnect")
                            : t(`plugins.connect.${connector.id}` as MessageKey)}
                      </button>
                    )}
                  </div>
                </div>

                {isBusy && phase && <p className="settings-hint">{t(PHASE_LABEL_KEY[phase])}</p>}
                {hasError && <p className="error">{errorMessage || t("plugins.connectFailed")}</p>}
                {status === "reconnect" && !isBusy && !hasError && <p className="pl-banner">{t("plugins.notLive")}</p>}

                <div className="pl-tiles">
                  {connector.targets.map((target) => {
                    const server = servers.find((s) => s.id === target.serverId);
                    const tools = server ? (toolsByServer[server.id] ?? cachedTools(server)) : [];
                    const permissions = server ? parseToolPermissions(server.tool_permissions_json) : {};
                    const offCount = tools.filter((tool) => getToolPermission(permissions, tool.name) === "deny").length;
                    const allOff = tools.length > 0 && offCount === tools.length;
                    const live = !!server && server.id in toolsByServer;
                    const selected = openService === target.serverId;
                    const toggleOpen = () => server && setOpenService(selected ? null : target.serverId);
                    return (
                      <div
                        key={target.serverId}
                        role="button"
                        tabIndex={server ? 0 : -1}
                        aria-expanded={selected}
                        className={`pl-tile${server ? "" : " pl-tile-locked"}${selected ? " pl-tile-selected" : ""}${allOff ? " pl-tile-off" : ""}`}
                        onClick={toggleOpen}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleOpen();
                          }
                        }}
                      >
                        <span className="pl-tile-icon" aria-hidden="true">
                          {SERVICE_ICONS[target.provider]}
                        </span>
                        <div className="pl-tile-text">
                          <span className="pl-tile-name">{target.name}</span>
                          <span className="pl-tile-meta">
                            {server ? (
                              <>
                                <span className={`pl-dot ${live ? "pl-dot-live" : "pl-dot-down"}`} aria-hidden="true" />
                                {allOff
                                  ? t("plugins.serviceOff")
                                  : t("plugins.toolsCount", { count: tools.length - offCount })}
                              </>
                            ) : (
                              t("plugins.tileLocked")
                            )}
                          </span>
                        </div>
                        {server && (
                          <Switch
                            checked={!allOff}
                            label={allOff ? t("plugins.enableAll") : t("plugins.disableAll")}
                            onChange={() => toggleService(server, tools)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedTarget && selectedServer && (
                  <ToolsPanel
                    target={selectedTarget}
                    server={selectedServer}
                    tools={toolsByServer[selectedServer.id] ?? cachedTools(selectedServer)}
                    onSetMode={(toolName, mode) => setToolMode(selectedServer, toolName, mode)}
                  />
                )}

                <GoogleSetupInstructions />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
