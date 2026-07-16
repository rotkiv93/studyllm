import type { ConversationRow } from "../lib/db";
import { IconMenu, IconMessage, IconPlus, IconSettings, IconTool, IconTrash } from "./icons";

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
  onOpenSettings: () => void;
  onOpenMcp: () => void;
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
  onOpenSettings,
  onOpenMcp,
}: Props) {
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
          {conversations.length === 0 && (
            <p className="conversation-empty">Your conversations will show up here.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`conversation-item${c.id === activeConversationId ? " conversation-item-active" : ""}`}
            >
              <button
                type="button"
                className="conversation-item-main"
                onClick={() => onSelectConversation(c.id)}
                disabled={disabled}
                title={c.title}
              >
                <IconMessage size={14} />
                <span className="conversation-item-title">{c.title || "Untitled chat"}</span>
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
          ))}
        </nav>
      )}

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={onOpenMcp}
          title="MCP servers"
        >
          <IconTool size={17} />
          {!collapsed && <span>MCP servers</span>}
          {mcpRunningCount > 0 && <span className="sidebar-footer-badge">{mcpRunningCount}</span>}
        </button>
        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={onOpenSettings}
          title="Settings"
        >
          <IconSettings size={17} />
          {!collapsed && <span>Settings</span>}
          {activeProviderCount === 0 && <span className="sidebar-footer-dot" title="No active providers" />}
        </button>
      </div>
    </aside>
  );
}
