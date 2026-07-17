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
  provider: "gmail" | "drive";
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
  displayName: "Google (Gmail & Drive)",
  description: "Connect your Google account to let the assistant read your email and Drive files.",
  scopes: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
  targets: [
    {
      serverId: "google-gmail",
      name: "Gmail",
      provider: "gmail",
    },
    {
      serverId: "google-drive",
      name: "Google Drive",
      provider: "drive",
    },
  ],
  trustTier: "official",
};

export const CONNECTORS: OAuthConnector[] = [GOOGLE_CONNECTOR];
