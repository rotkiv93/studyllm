/**
 * Config-driven registry of what "Connect Google Account" offers — deliberately the one place
 * scopes/target providers live, so they can be corrected without touching the OAuth engine (Rust)
 * or the Plugins UI.
 *
 * These call plain Gmail API v1 / Drive API v3 REST endpoints as native, in-process tools
 * (`src-tauri/src/mcp/google.rs`), not Google's managed remote MCP servers
 * (`gmailmcp.googleapis.com` / `drivemcp.googleapis.com`). Those managed servers are gated behind
 * the Google Workspace Developer Preview Program, which requires an actual paid Workspace account
 * — confirmed by hitting them with a valid, correctly-scoped token from a personal @gmail.com
 * account and getting back `PERMISSION_DENIED: The caller does not have permission` regardless.
 * See PROJECT_STATUS.md "Google Workspace" for the full writeup.
 */

export interface OAuthConnectorTarget {
  /** Becomes the `mcp_servers.id` primary key for this connection. */
  serverId: string;
  /** Display name for this specific connection, e.g. "Gmail". */
  name: string;
  /** Which native tool provider to start — see `mcp::google::GoogleKind` on the Rust side. */
  provider: "gmail" | "drive" | "calendar" | "tasks" | "docs" | "sheets";
}

export interface OAuthConnector {
  id: string;
  displayName: string;
  description: string;
  scopes: string[];
  targets: OAuthConnectorTarget[];
  trustTier: "official";
}

export const GOOGLE_CONNECTOR: OAuthConnector = {
  id: "google",
  displayName: "Google Workspace",
  description:
    "Connect your Google account so the assistant can work with your Gmail, Calendar, Tasks, " +
    "Drive, Docs, and Sheets — reading and (with your approval) sending, creating, and editing.",
  // Full read+write across the connected services. `gmail.modify` covers read + label edits +
  // drafts + trash; `gmail.send` is the separate scope Gmail requires to actually deliver mail.
  // Drive stays read-only (we only read Drive files; Docs/Sheets creation uses their own APIs).
  // NOTE: broadening these scopes invalidates existing consent — users must Disconnect → Connect
  // once to re-consent, and the maintainer must add these scopes + enable the Calendar/Tasks/Docs/
  // Sheets APIs on the OAuth client in Cloud Console. See PluginsPanel's setup instructions.
  scopes: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
  targets: [
    { serverId: "google-gmail", name: "Gmail", provider: "gmail" },
    { serverId: "google-calendar", name: "Google Calendar", provider: "calendar" },
    { serverId: "google-tasks", name: "Google Tasks", provider: "tasks" },
    { serverId: "google-drive", name: "Google Drive", provider: "drive" },
    { serverId: "google-docs", name: "Google Docs", provider: "docs" },
    { serverId: "google-sheets", name: "Google Sheets", provider: "sheets" },
  ],
  trustTier: "official",
};

export const CONNECTORS: OAuthConnector[] = [GOOGLE_CONNECTOR];

/**
 * Tools that create or destroy user data, or send mail on the user's behalf. At connect time these
 * are seeded into the connection's `tool_permissions_json` as "ask" so each call blocks on the
 * approval modal (see `App.tsx` `handleConnectGoogle` / `requestToolApproval`). The user can later
 * relax any of them to "allow" in the MCP panel's per-tool list. Non-destructive tools (search,
 * read, list, create-draft) are omitted here and default to "allow".
 */
export const DESTRUCTIVE_GOOGLE_TOOLS: readonly string[] = [
  "gmail_send_message",
  "gmail_trash_message",
  "calendar_delete_event",
  "tasks_delete_task",
];
