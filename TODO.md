# TODO

Derived from `PROJECT_STATUS.md`. Ordered roughly by "blocks a real user" → "nice to have".
Update both docs together when a task lands.

## Phase 5 — remaining plan items

- [ ] **Auto-updater**. The last big missing piece: no `tauri-plugin-updater`, no
      `TAURI_SIGNING_PRIVATE_KEY`, no `latest.json` publishing step in `release.yml`. Students who
      install once currently never get fixes. Needs: generate an updater keypair, add the private
      key + password as repo secrets, add the plugin + `updater` config in `tauri.conf.json`, add
      the endpoint, and make `release.yml` emit/publish `latest.json` alongside the installers.
- [ ] **First-run onboarding wizard**. A brand-new user opens the app to an empty chat with no key
      and no idea that free-tier keys are the whole point. Walk them through: pick a provider →
      link to where the free key lives → paste it → verify it with a live model-list fetch
      (`providerModels.ts` already does exactly this) → optionally install the filesystem MCP
      server. Should be skippable and re-openable from Settings.
- [ ] **Local-only crash log**. Ring-buffered file in the app data dir, plus a "reveal log" button
      in Settings. Nothing leaves the machine (that's the point). Also the natural home for the MCP
      stderr currently only visible in the dev terminal (see below).
- [ ] **Generate + add the code-signing secrets**. Wiring exists in `release.yml`; the secrets
      don't. Maintainer-only (buy a Windows cert, enroll in the Apple Developer Program). Until
      then every published build trips SmartScreen/Gatekeeper — a real adoption tax for the exact
      non-technical audience this app targets.
- [ ] **Turn on GitHub Pages** for `docs/` (Settings → Pages → Deploy from branch → `main` /
      `/docs`). README already links to `https://rotkiv93.github.io/studyllm/`, so that link is
      currently dead.
- [ ] **Test the macOS/Linux release jobs end-to-end**. Never run on real hardware — only
      eyeballed against the `tauri-action` quickstart. Same for `runtime.rs`'s portable-Node
      download/extract (tar.gz path unexercised outside Windows). A `workflow_dispatch` run is
      enough to find out.

## MCP host gaps

- [ ] **Auto-start MCP servers on launch**. Right now every server must be manually started each
      session, which makes tools feel broken by default. Add an `autostart` column to
      `mcp_servers` + a toggle in `McpPanel.tsx`, and start flagged servers after DB init.
- [ ] **Surface MCP server stderr in the UI**. Currently inherited into the terminal, so a packaged
      build gives the user zero diagnostics when a server dies. Pipe it, emit as `mcp://server-log`
      events, show in a per-server log drawer.
- [ ] **Show/configure tools for a stopped server**. Tool names come from `listMcpTools` at start
      time, so per-tool permissions can only be edited while running. Cache the last-known tool
      list per server in SQLite so the permission UI works cold.
- [ ] **Add/remove env var keys when editing a server**. `EditServerForm` can only change values of
      keys that existed at install time — if an install was done without an optional var, the only
      fix is uninstall + reinstall.
- [ ] **`uvx` / Python and Docker MCP servers**. Registry entries with only those packages show as
      `unsupported`. `uvx` is the bigger win (lots of servers, and a portable-uv bootstrap mirrors
      the Node one in `runtime.rs`).
- [ ] **Multi-header remote auth**. rmcp 0.9's `StreamableHttpClientTransportConfig` exposes one
      `auth_header`, so a remote server needing several headers only gets the first. Check whether
      a newer rmcp exposes custom headers; otherwise consider a custom transport.
- [ ] **TTL/eviction + "clear cache" for `mcp_catalog_cache`**. Grows unboundedly and never
      expires; only read on registry failure, so a stale entry can be served indefinitely.

## Chat / UX

- [ ] **Exact tool-call replay order**. Persisted history renders all of a turn's tool calls, then
      its text; live streaming can interleave. Give `tool_calls` an ordering key relative to the
      text segments, or store the turn as ordered parts.
- [ ] **Persist sidebar collapsed state**. In-memory only — resets every restart.
- [ ] **Conversation rename in the UI**. `renameConversation` exists in `db.ts` with no caller;
      titles are auto-derived and unfixable.
- [ ] **Cancel/stop a streaming response**. No way to interrupt a bad generation; `stopWhen:
      isStepCount(8)` is the only brake.
- [ ] **Surface provider failover to the user**. `ProviderRouter` rotates on rate limits silently —
      the user can't tell which provider answered, or that they've burned through a free tier.
      Provider usage is already recorded in SQLite; nothing reads it back.
- [ ] **Retry / edit-and-resend a message.** Standard chat affordance, currently absent.

## Codebase health

- [ ] **No test suite at all**. `tsc` is the only automated check. Highest-value first targets are
      the pure logic that's easy to break silently: `mcpCatalog.ts` trust tiers, `registry.rs`
      `normalize()`/`is_latest_version()` dedupe, `providerRouter.ts` failover, `providerModels.ts`
      parsing. Vitest for the TS side, `#[cfg(test)]` for Rust.
- [ ] **No lint script**. Add ESLint (or Biome) + a CI step; `npm run build`'s
      `noUnusedLocals`/`noUnusedParameters` is doing lint's job by accident.
- [ ] **CSP is disabled** (`security.csp: null`). The app renders model output as markdown and runs
      arbitrary MCP servers — worth a real policy before 1.0.
- [ ] **`.provider-list li` specificity trap**. Any new component nested in `.provider-list` silently
      loses layout properties unless its selector is `li.`-prefixed (bit us once already, see
      PROJECT_STATUS). Either scope that rule down to direct plain rows or add a comment in
      `App.css` at the rule itself.
- [ ] **Bump `NODE_VERSION`** in `runtime.rs` periodically — hardcoded, drifts silently.

## Bigger bets

- [ ] **Google OAuth ("Connect Google Account")**. Researched, deliberately not started: needs a
      maintainer to register a public PKCE OAuth client in Google Cloud Console first, then a
      loopback-listener token flow + refresh-token-in-keychain + threading periodic refresh into
      `start_remote` (which captures its bearer once at connect time). Google's sensitive-scope
      review adds lead time. See PROJECT_STATUS "Google Workspace" for the full finding.
- [ ] **Real MCP sandboxing**. Trust tiers are a naming/repo-URL heuristic; installing a community
      server runs arbitrary code as the OS user. Any real mitigation (container, subprocess
      sandbox, syscall filter) is a large piece of work — worth at least being explicit that the
      current state is a UI warning, not a boundary.
