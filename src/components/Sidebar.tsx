import { useState } from "react";
import type { ConversationRow } from "../lib/db";
import { IconEdit, IconKey, IconMenu, IconMessage, IconPlus, IconSettings, IconTool, IconTrash } from "./icons";

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
  onOpenAppSettings: () => void;
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
  onOpenAppSettings,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

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
        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={onOpenProviders}
          title="Providers"
        >
          <IconKey size={17} />
          {!collapsed && <span>Providers</span>}
          {activeProviderCount === 0 && <span className="sidebar-footer-dot" title="No active providers" />}
        </button>
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
          onClick={onOpenAppSettings}
          title="Settings"
        >
          <IconSettings size={17} />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
