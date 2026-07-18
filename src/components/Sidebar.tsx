import { useState } from "react";
import type { ConversationRow } from "../lib/db";
import { IconBook, IconChevronDown, IconCompass, IconEdit, IconKey, IconMenu, IconMessage, IconPlug, IconPlus, IconSettings, IconTool, IconTrash } from "./icons";

interface Props {
  conversations: ConversationRow[];
  activeConversationId: string | null;
  collapsed: boolean;
  disabled: boolean;
  mcpRunningCount: number;
  activeProviderCount: number;
  onToggleCollapsed: () => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onOpenProviders: () => void;
  onOpenMcp: () => void;
  onOpenLibrary: () => void;
  onOpenExplore: () => void;
  onOpenPlugins: () => void;
  onOpenAppSettings: () => void;
  /** Number of documents in the RAG library — shown as a badge on the Library button. */
  libraryDocCount: number;
}

export function Sidebar({
  conversations,
  activeConversationId,
  collapsed,
  disabled,
  mcpRunningCount,
  activeProviderCount,
  onToggleCollapsed,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onOpenProviders,
  onOpenMcp,
  onOpenLibrary,
  onOpenExplore,
  onOpenPlugins,
  onOpenAppSettings,
  libraryDocCount,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Config destinations tucked under the "Settings" group (expanded sidebar) or laid out flat on the
  // collapsed icon rail. Providers carries a warning dot when none are active; MCP a running-count badge.
  const configItems = [
    { key: "providers", icon: IconKey, label: "Providers", onClick: onOpenProviders, dot: activeProviderCount === 0, badge: 0 },
    { key: "mcp", icon: IconTool, label: "MCP servers", onClick: onOpenMcp, dot: false, badge: mcpRunningCount },
    { key: "plugins", icon: IconPlug, label: "Plugins", onClick: onOpenPlugins, dot: false, badge: 0 },
    { key: "explore", icon: IconCompass, label: "Explore", onClick: onOpenExplore, dot: false, badge: 0 },
    { key: "diagnostics", icon: IconSettings, label: "Diagnostics", onClick: onOpenAppSettings, dot: false, badge: 0 },
  ];
  // Surface the most important config status on the collapsed group gear so nothing hides.
  const settingsNeedsAttention = activeProviderCount === 0;

  function startRename(c: ConversationRow) {
    setRenamingId(c.id);
    setRenameDraft(c.title);
  }

  function commitRename() {
    if (renamingId) {
      const title = renameDraft.trim();
      if (title) onRenameConversation(renamingId, title);
    }
    setRenamingId(null);
  }
  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
      <div className="sidebar-top">
        <button
          type="button"
          className="btn btn-icon btn-ghost sidebar-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconMenu size={18} />
        </button>
        {!collapsed && <span className="sidebar-brand">StudyLLM</span>}
      </div>

      <button
        type="button"
        className="sidebar-new-chat"
        onClick={onNewChat}
        disabled={disabled}
        title="New chat"
      >
        <IconPlus size={16} />
        {!collapsed && <span>New chat</span>}
      </button>

      {!collapsed && (
        <nav className="conversation-list" aria-label="Conversation history">
          <span className="sidebar-section-label">Conversations</span>
          {conversations.length === 0 && (
            <p className="conversation-empty">Your conversations will show up here.</p>
          )}
          {conversations.map((c) =>
            renamingId === c.id ? (
              <div key={c.id} className="conversation-item conversation-item-renaming">
                <input
                  autoFocus
                  className="conversation-rename-input"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.currentTarget.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              </div>
            ) : (
              <div
                key={c.id}
                className={`conversation-item${c.id === activeConversationId ? " conversation-item-active" : ""}`}
              >
                <button
                  type="button"
                  className="conversation-item-main"
                  onClick={() => onSelectConversation(c.id)}
                  onDoubleClick={() => startRename(c)}
                  disabled={disabled}
                  title={c.title}
                >
                  <IconMessage size={14} />
                  <span className="conversation-item-title">{c.title || "Untitled chat"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost conversation-item-rename"
                  onClick={() => startRename(c)}
                  disabled={disabled}
                  title="Rename conversation"
                >
                  <IconEdit size={13} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost conversation-item-delete"
                  onClick={() => onDeleteConversation(c.id)}
                  disabled={disabled}
                  title="Delete conversation"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ),
          )}
        </nav>
      )}

      <div className="sidebar-footer">
        {/* Library is a workspace surface (your documents), kept prominent above the config group. */}
        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={onOpenLibrary}
          title="Document library"
        >
          <IconBook size={17} />
          {!collapsed && <span>Library</span>}
          {libraryDocCount > 0 && <span className="sidebar-footer-badge">{libraryDocCount}</span>}
        </button>

        {collapsed ? (
          // Collapsed icon rail: lay the config destinations out flat — a disclosure is hard to
          // hit on a narrow rail, so every panel stays one click away.
          configItems.map(({ key, icon: Icon, label, onClick, dot, badge }) => (
            <button key={key} type="button" className="sidebar-footer-btn" onClick={onClick} title={label}>
              <Icon size={17} />
              {dot && <span className="sidebar-footer-dot" title="Needs attention" />}
              {badge > 0 && <span className="sidebar-footer-badge">{badge}</span>}
            </button>
          ))
        ) : (
          <div className="sidebar-settings-group">
            <button
              type="button"
              className="sidebar-footer-btn sidebar-settings-toggle"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              title="Settings & setup"
            >
              <IconSettings size={17} />
              <span>Settings</span>
              {!settingsOpen && settingsNeedsAttention && (
                <span className="sidebar-footer-dot" title="No active providers" />
              )}
              <IconChevronDown
                size={14}
                className={`sidebar-settings-chevron${settingsOpen ? " sidebar-settings-chevron-open" : ""}`}
              />
            </button>
            {settingsOpen && (
              <div className="sidebar-settings-items">
                {configItems.map(({ key, icon: Icon, label, onClick, dot, badge }) => (
                  <button
                    key={key}
                    type="button"
                    className="sidebar-footer-btn sidebar-settings-item"
                    onClick={onClick}
                    title={label}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {dot && <span className="sidebar-footer-dot" title="No active providers" />}
                    {badge > 0 && <span className="sidebar-footer-badge">{badge}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
