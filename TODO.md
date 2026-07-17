# TODO

Derived from `PROJECT_STATUS.md`. Ordered roughly by "blocks a real user" → "nice to have".
Update both docs together when a task lands.

## Phase 5 — remaining plan items

- [ ] **Test the macOS/Linux release jobs end-to-end**. Never run on real hardware — only
      eyeballed against the `tauri-action` quickstart. Same for `runtime.rs`'s portable-Node
      download/extract (tar.gz path unexercised outside Windows) and the new portable-uv bootstrap
      (same tar.gz-vs-zip split). A `workflow_dispatch` run is enough to find out — ask before
      triggering, since it burns CI minutes and is visible to anyone watching the repo's Actions tab.

## Bigger bets

- [x] **Google OAuth ("Connect Google Account") engine + Plugins UI**. Implemented: PKCE +
      loopback-listener flow, refresh-token-in-keychain, periodic refresh threaded into
      `McpHost` via a background task, and a new sidebar "Plugins" panel with a one-click "Connect
      Google Account" card.
- [x] **Register the real Google Cloud OAuth client** — maintainer registered a "Desktop app"
      client and confirmed the arbitrary-loopback-port redirect works; `config.rs` has real
      credentials.
- [x] **Switch Gmail/Drive access to native REST tools, not Google's managed MCP servers** —
      confirmed live that `gmailmcp.googleapis.com`/`drivemcp.googleapis.com` return
      `PERMISSION_DENIED` for a personal `@gmail.com` account regardless of scopes/token validity,
      because Google's Developer Preview Program requires an actual paid Workspace account.
      Rebuilt as native, in-process Gmail API v1/Drive API v3 REST tools
      (`src-tauri/src/mcp/google.rs`, `McpHost::start_native`/`update_native_token`) using the same
      OAuth consent flow. Also fixed a real bug found along the way: rmcp's `auth_header()` wants a
      bare token and double-prepended `"Bearer "` on remote OAuth connections.
- [ ] **Live-test the native tools end-to-end**: Connect completes and lists tools (verified); still
      needed — an actual `gmail_search_messages`/`drive_search_files`-style tool call from chat, a
      forced-fast-refresh test (shrink `oauth_expires_at` and observe `update_native_token` fire),
      and a revoke-then-use test to confirm a clean `isError` tool result instead of a hang.
- [ ] **Real MCP sandboxing**. Trust tiers are still a naming/repo-URL heuristic; installing a
      community server still runs arbitrary code as the OS user. Any real mitigation (container,
      subprocess sandbox, syscall filter) remains a large, dedicated piece of work — deliberately
      not attempted piecemeal here, per the existing note that the current state is a UI warning,
      not a boundary.
