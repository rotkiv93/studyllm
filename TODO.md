# TODO

Derived from `PROJECT_STATUS.md`. Ordered roughly by "blocks a real user" → "nice to have".
Update both docs together when a task lands.

## Phase 5 — remaining plan items

- [x] **Auto-updater**. `tauri-plugin-updater` + `tauri-plugin-process` wired in, `src/lib/updater.ts`
      checks on launch and shows an in-app "Restart to update" banner, `tauri.conf.json` has
      `bundle.createUpdaterArtifacts: true` and a `plugins.updater` config pointing at
      `github.com/rotkiv93/studyllm/releases/latest/download/latest.json`, and `release.yml` now
      forwards `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. A keypair was
      generated locally (`src-tauri/updater-signing-key.pem` + password, both gitignored, never
      committed) — the public key is already in `tauri.conf.json`. **Still needs a maintainer** to
      add the two secrets to the GitHub repo (see README "Auto-updater (maintainers)") before
      updates actually take effect; until then the check silently finds nothing, same as today.
- [x] **First-run onboarding wizard**. `src/components/OnboardingWizard.tsx` — pick a provider →
      link to its free-key page → paste + live-verify via `providerModels.ts` → optional
      filesystem MCP install. Auto-shows on first launch when no providers exist (and not
      previously dismissed, tracked in `localStorage`); re-openable via a "Run setup guide" button
      in Settings.
- [x] **Local-only crash log**. `src-tauri/src/crashlog.rs` — ring-buffered (1000 lines), flushed
      to `<app-local-data>/studyllm.log`, fed by MCP stderr, MCP start failures, Rust panics (via
      `std::panic::set_hook`), and frontend `window.onerror`/`unhandledrejection`. "Show log" /
      "Reveal in folder" / "Clear" buttons in Settings.
- [ ] **Generate + add the code-signing secrets**. Wiring exists in `release.yml`; the secrets
      don't. Maintainer-only (buy a Windows cert, enroll in the Apple Developer Program). Until
      then every published build trips SmartScreen/Gatekeeper — a real adoption tax for the exact
      non-technical audience this app targets.
- [X] **Turn on GitHub Pages** for `docs/` (Settings → Pages → Deploy from branch → `main` /
      `/docs`). README already links to `https://rotkiv93.github.io/studyllm/`, so that link is
      currently dead. Repo-admin action — ask before doing this via `gh api`, since it changes
      live repo settings.
- [ ] **Test the macOS/Linux release jobs end-to-end**. Never run on real hardware — only
      eyeballed against the `tauri-action` quickstart. Same for `runtime.rs`'s portable-Node
      download/extract (tar.gz path unexercised outside Windows) and the new portable-uv bootstrap
      (same tar.gz-vs-zip split). A `workflow_dispatch` run is enough to find out — ask before
      triggering, since it burns CI minutes and is visible to anyone watching the repo's Actions tab.

## MCP host gaps

- [x] **Auto-start MCP servers on launch**. `mcp_servers` gained an `autostart` column (migration
      v5) + a checkbox per server card in `McpPanel.tsx`; flagged servers start automatically after
      DB init in `App.tsx`'s mount effect (best-effort — a failed autostart just leaves the server
      stopped for the user to retry manually).
- [x] **Surface MCP server stderr in the UI**. `host.rs` now spawns servers with `Stdio::piped()`
      stderr (`TokioChildProcess::builder(...).stderr(...)`) and forwards it line-by-line as
      `mcp://server-log` events; `McpPanel.tsx` has a per-server "Logs" button/drawer (last 300
      lines, in-memory). Also feeds the new crash log file.
- [x] **Show/configure tools for a stopped server**. `mcp_servers` gained a `cached_tools_json`
      column, refreshed every time a server reports `running`; `McpPanel.tsx` falls back to it when
      a server is stopped, so the tool-permission UI works cold (with a note that it may be stale).
- [x] **Add/remove env var keys when editing a server**. `EditServerForm` can now mark existing
      keys for removal (with an "Undo" toggle) and add brand-new name/value/secret rows; wired
      through `handleUpdateMcpServerEnv`'s new `removedKeys` param, which also cleans up the
      keychain entry for any removed secret.
- [x] **`uvx` / Python MCP servers**. `registry.rs` now recognizes `registryType: "pypi"` packages
      and produces an `InstallSpec::Uvx` (same `pkg@version` argv convention as npx); `runtime.rs`
      got a parallel portable-`uv` bootstrap (`ensure_uvx`/`download_and_extract_uv`, mirroring the
      Node one) for machines without `uvx` on PATH. Docker/OCI packages are still `unsupported` —
      genuinely out of scope (no container runtime story here).
- [x] **Multi-header remote auth**. Turned out fixable without a newer rmcp: `reqwest::Client`
      (which rmcp's Streamable HTTP transport already uses) supports arbitrary `default_headers`,
      and rmcp exposes `StreamableHttpClientTransport::with_client(...)` to supply one. `host.rs`'s
      `start_remote` now takes the full resolved header map — `Authorization` still goes through
      rmcp's bearer-token config (unchanged behavior for existing installs), every other header
      name is sent verbatim via a custom client. The marketplace's old "only the first secret is
      used" warning is gone because it's no longer true.
- [x] **TTL/eviction + "clear cache" for `mcp_catalog_cache`**. `evictStaleCatalogEntries()` drops
      entries older than 14 days after every successful *live* search (never on the cache-fallback
      path, so a long offline stretch can't wipe the only fallback data); a "Clear cache" button
      shows up in the marketplace whenever cached results are being displayed.

## Chat / UX

- [x] **Exact tool-call replay order**. `tool_calls` gained a `text_offset` column — a snapshot of
      how much assistant text had streamed in when each call was made. Replay
      (`handleSelectConversation`) slices the persisted `content` at those offsets and interleaves
      text segments with tool blocks in their original order, instead of always rendering "all
      tool calls, then the text."
- [x] **Persist sidebar collapsed state**. Read/written to `localStorage` (`sidebarCollapsed`).
- [x] **Conversation rename in the UI**. Double-click a conversation title (or its new pencil
      icon) in the sidebar to rename inline; wired to the existing `renameConversation` in `db.ts`.
- [x] **Cancel/stop a streaming response**. Composer's send button becomes a stop button while
      streaming; wired via an `AbortController` threaded through `ProviderRouter.streamReply`.
      Whatever text/tool calls happened before the abort are still persisted, same as a natural finish.
- [x] **Surface provider failover to the user**. Assistant bubbles now show a small "via {provider}
      · {model}" caption (live from the router's `done` event; replayed from `provider_used`/
      `model_used` on history reload). `SettingsPanel` also gained a "Crash log" section, and
      per-provider today's usage was *not* separately surfaced in Settings this round — usage
      recording itself was already in place; the caption was the missing "which provider answered"
      half of this item.
- [x] **Retry / edit-and-resend a message.** Hover actions: an edit icon on user messages (loads
      the text back into the composer and truncates the conversation from that point, in both UI
      state and SQLite) and a retry icon on assistant messages (re-sends the preceding user message
      after the same truncation). New `deleteMessagesFrom` in `db.ts`.

## Codebase health

- [x] **No test suite at all**. Added Vitest (`src/**/*.test.ts`, 19 tests) covering
      `mcpCatalog.ts` trust tiers, `providerRouter.ts` failover/cooldown/auth-disable (via a mocked
      `streamText`), and `providerModels.ts` parsing/filtering. Added `#[cfg(test)]` Rust tests (10
      tests) for `registry.rs`'s `normalize()`/`is_latest_version()`. Both wired into `ci.yml`.
- [x] **No lint script**. ESLint (flat config, `eslint.config.js`) + `npm run lint` + a CI step.
      One newer recommended rule (`react-hooks/set-state-in-effect`) was downgraded to a warning
      rather than refactoring several pre-existing, deliberate effects as a side effect of adding
      lint tooling — see the comment in `eslint.config.js`.
- [x] **CSP is disabled**. `tauri.conf.json`'s `security.csp` now has a real policy:
      `script-src`/`style-src` limited to `'self'` (no inline scripts/styles anywhere in the app,
      so no `unsafe-inline` needed), `connect-src` allows `https:` broadly (required — the whole
      point of the app is letting students point at arbitrary provider base URLs) plus `ipc:`/
      `http://ipc.localhost` for Tauri's own bridge, `object-src 'none'`, `frame-ancestors 'none'`.
      Verified the app still loads and functions under `npm run tauri dev` with this policy active.
- [x] **`.provider-list li` specificity trap**. Documented in place with a comment on the rule
      itself in `App.css`, per the ask — not otherwise changed (no new nested component hit it
      this round).
- [x] **Bump `NODE_VERSION`** in `runtime.rs` — 22.11.0 → 22.23.1 (current Node 22 LTS as of
      2026-07).

## Bigger bets

- [ ] **Google OAuth ("Connect Google Account")**. Still not started — needs a maintainer to
      register a public PKCE OAuth client in Google Cloud Console first (an account action outside
      what an agent can do), then a loopback-listener token flow + refresh-token-in-keychain +
      threading periodic refresh into `start_remote`. See PROJECT_STATUS "Google Workspace" for the
      full finding; nothing about that finding changed even though `start_remote` itself gained
      multi-header support this round (that was a prerequisite, not the OAuth flow itself).
- [ ] **Real MCP sandboxing**. Trust tiers are still a naming/repo-URL heuristic; installing a
      community server still runs arbitrary code as the OS user. Any real mitigation (container,
      subprocess sandbox, syscall filter) remains a large, dedicated piece of work — deliberately
      not attempted piecemeal here, per the existing note that the current state is a UI warning,
      not a boundary.
