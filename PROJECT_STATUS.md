# StudyLLM — Project Status

Living document. Read this before starting work, and **update it as part of any change** that
adds, removes, or changes a feature — keep the "Done" / "Not done" lists accurate, don't let them drift.

## What this app is

A free, cross-platform (Windows/Linux/macOS) Tauri desktop chat client for students who can't
afford a paid LLM subscription. Students paste in their own free-tier API keys (Groq, Cerebras,
Gemini, etc.); the app rotates between them client-side on rate limits. It also gives the LLM
local tools via MCP (Model Context Protocol) servers — e.g. reading/writing files in a
student-chosen folder — similar to Claude Code's tool use, but for free-tier models.

Full original architecture/phase plan: `C:\Users\47852\.claude\plans\i-want-to-create-compressed-hartmanis.md`.

## Architecture summary

- **Frontend** (`src/`): React + TypeScript, Vite. Owns the chat UI, Settings UI, MCP UI, and talks
  to LLM providers directly over HTTPS via the Vercel AI SDK (no Rust hop needed for chat).
- **Rust backend** (`src-tauri/src/`): everything needing OS privileges — OS keychain access,
  SQLite, and now spawning/talking to local MCP server child processes.
- **Storage**: SQLite via `tauri-plugin-sql` (`src-tauri/src/db.rs` migrations) for conversations,
  messages, tool calls, providers, provider usage, and installed MCP servers (including per-tool
  permissions). API keys never touch SQLite — only an opaque `secret_ref` pointing into the OS
  keychain (via the `keyring` crate, `src-tauri/src/credentials.rs`).
- **MCP host** (`src-tauri/src/mcp/`): built on the official `rmcp` Rust SDK, stdio transport only.
  `host.rs` manages running server processes, `runtime.rs` resolves/bootstraps a `npx` binary,
  `commands.rs` exposes it to the frontend as Tauri commands + `mcp://server-status-changed` /
  `mcp://runtime-log` events.

## Phase status (see the plan doc above for full phase definitions)

- **Phase 1 — basic chat, one hardcoded provider**: ✅ Done.
- **Phase 2 — SQLite + OS keychain + multi-provider client-side failover**: ✅ Done.
  `src/lib/providerRouter.ts` (`ProviderRouter`), `src/components/SettingsPanel.tsx`.
- **Phase 3 — local MCP host + filesystem reference server**: ✅ Done (MVP scope, see limitations
  below). `src-tauri/src/mcp/`, `src/lib/mcp.ts`, `src/components/McpPanel.tsx`. Tool calls are
  wired into `streamText` (multi-step, `stopWhen: isStepCount(8)`) via `dynamicTool` +
  `jsonSchema`, and shown live in the chat transcript as their own message blocks.
- **Phase 4 — MCP marketplace / registry browsing + trust tiers + remote transport**: ✅ Done (MVP
  scope, see limitations below). `src-tauri/src/mcp/registry.rs` fetches/normalizes
  `registry.modelcontextprotocol.io/v0/servers`; `src/lib/mcpCatalog.ts` computes trust tiers
  (official/verified/community) and caches results into the new `mcp_catalog_cache` SQLite table
  (offline/registry-outage fallback); `src/components/McpMarketplace.tsx` is the search/browse/install
  UI with a required-env-var form and an install-time warning + explicit ack for anything below
  `official`. `McpHost::start_remote` (host.rs) adds Streamable HTTP transport alongside the
  existing stdio one. `mcp_servers` gained `transport`/`url`/`env_refs_json`/`trust_tier` columns
  (migration v3); `env_refs_json` maps var name → either a keychain `secret_ref` or a plain value.
- **Live provider model lists** (`src/lib/providerModels.ts`): the Settings "Add a provider" form no
  longer relies solely on the hardcoded `suggestedModels` seed list in `src/lib/providers.ts`. For
  providers with a public model catalog (OpenRouter, SambaNova, GitHub Models) it fetches the live
  list immediately; for providers that require a key (Groq, Cerebras, Mistral, Gemini) it fetches
  (debounced 500ms) once the user has typed one, using the same direct-to-provider `fetch()` +
  Bearer-auth path the chat requests already use (no Rust hop). OpenRouter's list is filtered to
  `:free`-suffixed ids; a few provider-specific keyword filters drop obviously non-chat entries
  (Whisper/TTS/embedding/image/video models). On any failure (bad key, offline, unsupported
  provider) it silently falls back to the static `suggestedModels` datalist — the model field is
  and remains a plain free-text `<input>`, so a model id can always be typed manually regardless.
  `SettingsPanel.tsx` shows a small status line (loading/loaded-N/unavailable) below the field.
- **Phase 5 — polish, code signing, CI/release, auto-updater, onboarding**: 🚧 In progress.
  CI/release pipeline done (see below). Code-signing wiring done this session (opt-in via repo
  secrets, see README "Release signing"), but no secrets have actually been added yet, so
  published builds are still unsigned until a maintainer generates and adds them. **Still not
  done**: auto-updater plugin (no `TAURI_SIGNING_PRIVATE_KEY`/`latest.json` publishing step
  exists), first-run onboarding wizard, local-only crash log. These three are the remaining
  Phase 5 items from the original plan doc.
  UI shell redesigned (Claude-desktop-style): a persistent left sidebar (`src/components/Sidebar.tsx`)
  lists conversation history (click to reopen, hover-to-delete, collapsible to an icon rail) and
  hosts Settings/MCP servers as icon buttons at its bottom, replacing the old header text buttons;
  the chat itself now lives in a right-hand main panel. Inline SVG icon set lives in
  `src/components/icons.tsx` (no icon library dependency). Reopening a past conversation loads its
  persisted user/assistant messages via `listMessages`, plus any persisted tool calls (see below);
  deleting one uses `deleteConversation` (`src/lib/db.ts`, cascades to its messages and their tool calls).

## Known simplifications / limitations in the current Phase 3/4 implementation

- Only **npm-published packages (launched via npx)** and **remote Streamable HTTP** servers are
  installable. Registry entries whose only packages are `uvx`/Python or Docker are still shown in
  marketplace search (for visibility/awareness) but marked `unsupported` and can't be installed —
  no `uvx`/Docker runtime support exists yet.
- **Remote (Streamable HTTP) auth is limited to a single bearer token.** rmcp 0.9's client
  transport (`StreamableHttpClientTransportConfig`) only exposes one `auth_header`, not arbitrary
  custom headers — so a registry entry declaring multiple required secrets/headers for a remote
  server can only get one of them wired in (`McpMarketplace.tsx` picks the first resolved value
  and warns in the install form when this applies).
- **Trust tiers are a heuristic, not a real audit**: `official` = reverse-DNS name under
  `io.modelcontextprotocol*` or a repo under `github.com/modelcontextprotocol/servers`; `verified`
  = any other entry with a `github.com`/`gitlab.com` repository URL; everything else is
  `community`. This is exactly the "best-effort, not a real sandbox" mitigation described in the
  original plan — installing a community server still lets it run arbitrary code as the OS user.
- The MCP catalog cache (`mcp_catalog_cache` table) has no TTL-based eviction — every successful
  live search upserts into it and it's only ever read as a fallback when the live registry request
  throws (offline, DNS blocked, registry outage), matching the "must degrade gracefully" plan
  requirement. There's no manual "clear cache" UI.
- `npx`-launched servers get a minimal, explicit env allowlist (`PATH`, a few OS/Node
  essentials) plus the server's own declared `required_env` — **not** the full inherited parent
  environment — per the plan's "minimal env inheritance" safety layer. This is best-effort:
  spawning `npx` with a fully cleared environment is known to break in obscure ways on Windows,
  so a small fixed allowlist is kept rather than clearing everything.
- The Node/npx portable-runtime bootstrap (`src-tauri/src/mcp/runtime.rs`) downloads a hardcoded
  Node version (`NODE_VERSION` const — bump periodically) from nodejs.org if `npx` isn't already
  on PATH. The download+extract code path is written to be cross-platform (zip on Windows,
  tar.gz elsewhere) but was only exercised end-to-end on Windows this session — Linux/macOS
  extraction paths are unverified in practice.
- MCP servers are **not auto-started** on app launch; the user must click "Start" in the MCP panel
  each session. Installed server rows (including catalog installs, with their resolved
  transport/url/env refs) do persist in SQLite across restarts.
- **Fixed this session**: tool calls/results are now persisted to a new `tool_calls` table
  (migration v4, `src-tauri/src/db.rs`) — one row per resolved call, linked to the assistant
  `messages` row it belongs to (`message_id`) with a `seq` for ordering. `sendMessage` in
  `App.tsx` accumulates resolved calls during streaming and writes them right after the assistant
  message row is inserted; `handleSelectConversation` now also fetches
  `listToolCallsForConversation` and re-renders each assistant turn's tool blocks *before* that
  turn's text bubble. This is a simplification of the original interleaving — live streaming can
  interleave text/tool-call/text/tool-call within one turn, but persisted history always shows
  "all this turn's tool calls, then the text" — acceptable since the point was making past tool
  calls visible at all, not exact replay fidelity. `deleteConversation` cascades tool_calls too
  (no real FK cascade — SQLite FKs aren't enforced here, deletes are explicit, same pattern the
  existing messages/conversations delete already used).
  **Verified against the live SQLite DB after the user reported doubt that this worked**: queried
  `studyllm.db` directly (Python's `sqlite3`) and confirmed real `tool_calls` rows correctly linked
  to their `message_id` for recent turns — persistence is working. The actual UX confusion: a
  multi-step turn where the model calls tools but never emits final text (hits `isStepCount(8)` or
  just stops) still gets an assistant `messages` row with `content: ''` so its tool calls have
  something to attach to — but the chat rendered that as a visible, header-only, empty "Assistant"
  bubble trailing the tool cards, which reads as "the reply disappeared." Fixed in `App.tsx`'s
  message-list render: an assistant entry with empty content is now skipped entirely unless it's
  the actively-streaming last message (where it's the in-progress "…" placeholder).
- **Added this session — per-tool permissions**: `mcp_servers` gained a `tool_permissions_json`
  column (same migration v4) — `Record<toolName, 'allow' | 'ask' | 'deny'>`, missing entries
  default to `allow` so existing installs are unaffected. `deny` hides the tool from the model
  entirely (`App.tsx`'s `buildMcpTools` filters it out of the `ToolSet` sent to `streamText`) —
  there's no separate "selected/deselected" flag, `deny` doubles as that. `ask` still exposes the
  tool but its `execute` first calls `requestToolApproval`, which resolves a promise from a modal
  rendered at the bottom of `App.tsx` (Allow/Deny buttons); the tool call blocks until the user
  responds. Managed from `McpPanel.tsx`'s per-server "Tools (N)" expandable list — only available
  while a server is *running* (tool names/descriptions come from `toolsByServer`, populated by
  `listMcpTools` on server start; there's no way to see/configure a stopped server's tools yet).
- **Added this session — editable MCP configs**: `McpPanel.tsx` has an inline "Edit" form per
  server (`updateMcpServer` in `db.ts`, a plain `UPDATE ... WHERE id`). Supports: renaming
  (`name`), changing a filesystem server's scoped folder (re-picks via the native folder dialog,
  rewrites `args_json`, and if the server is currently running, stops + restarts it with the new
  path), changing a remote server's `url`, and rotating/editing values for any env vars already in
  `env_refs_json` (secret ones get a "leave blank to keep current value" password field routed
  through `setCredential` against the *existing* keychain ref rather than minting a new one; if
  running, the server is restarted with the freshly resolved env). Editing does **not** support
  adding/removing env var *keys*, only changing the value of ones already there from install time.
- **Added this session — MCP panel redesign**: replaced the flat server list with a "Pinned"
  section (always shows Filesystem — with an inline "Add…" card if not yet installed — plus any
  installed server whose name matches `/gmail|google[- ]?drive|google/i`, per the "put Google
  ones near the top" ask) above an "All servers" section with a client-side name search filter.
  Same `mcp-server-card` component renders both sections; `isPinned()` in `McpPanel.tsx` is the
  only place the pinning heuristic lives. **Bug caught live by the user while this was being
  built and fixed same session**: the new `<li>`-based classes (`.mcp-server-card`,
  `.tool-perm-row`, `.provider-edit-row`) were silently losing `align-items`/`justify-content`/
  `padding`/`flex-wrap` to the pre-existing generic `.provider-list li` rule, which has *higher*
  CSS specificity (type+class, `(0,1,1)`) than a bare class selector (`(0,1,0)`) regardless of
  source order — so the cards/tool-rows/edit-forms nested inside `.provider-list` rendered
  centered/wrapped/padded like plain list rows instead of filling the dialog. Fixed by bumping
  those selectors to `li.mcp-server-card` / `li.tool-perm-row` / `li.provider-edit-row` (same
  specificity, later in the cascade → wins the tie) and giving `.tool-perm-list` its own
  `max-height: 220px; overflow-y: auto` so a server with many tools scrolls internally instead of
  stretching the dialog. Worth remembering for any *future* nested component added inside
  `.provider-list`: it will inherit this same trap unless given an `li.` prefix.
- **Fixed, reported live by the user**: editing an MCP server while the marketplace modal was also
  open made marketplace content visibly overflow on top of the tools/edit section. Root cause:
  `App.tsx` rendered `<McpPanel>` and `<McpMarketplace>` as *sibling* top-level `.settings-overlay`
  divs (`position: fixed; inset: 0`) with equal `z-index: 10` — so the existing
  `.settings-overlay .settings-overlay { z-index: 11; background: var(--color-overlay-nested) }`
  rule, clearly written for a nested-modal case, never actually matched (Marketplace was never a
  DOM descendant of the panel). With equal z-index, stacking fell back to DOM order, and since
  `--color-overlay`'s backdrop is translucent (`rgba(..., 0.45–0.6)`, not opaque), McpPanel's
  now-often-taller dialog (edit form / expanded tool list) showed through around Marketplace's
  smaller centered dialog. Fixed by giving `McpPanel` a `children` prop and rendering
  `<McpMarketplace>` as its child from `App.tsx` instead of a sibling — it's now a true DOM
  descendant, so the nested-overlay rule applies for real (correct z-index + darker nested
  backdrop), matching what the CSS was already designed for.
- Providers (LLM API keys, not MCP servers) also gained inline editing this session —
  `SettingsPanel.tsx`'s `EditProviderRow`: change label/model freely (existing `updateProvider`
  already supported this at the DB layer, just had no UI), and optionally paste a new API key
  (blank = keep the current one) which overwrites the existing keychain entry via `setCredential`
  rather than creating a new `secret_ref`.
- MCP child process `stderr` is inherited (visible in the terminal running `npm run tauri dev`),
  not piped into the UI as a live log. Only coarse status (`starting`/`running`/`stopped`/`error`)
  and Node-download progress are surfaced via events.
- `McpHost::call_tool` always forwards `arguments` as an object (`{}` at minimum), never
  omitting the field — some MCP servers' schemas (e.g. the official filesystem server's zod
  validation) reject a JSON-RPC call with a missing/null `arguments` for zero-parameter tools,
  which models frequently produce when calling no-arg tools.
- **Fixed this session**: marketplace search results were dominated by duplicate rows — the
  registry lists every published *version* of a server as its own entry, and `registry.rs`'s
  `normalize()` wasn't deduping them, so a server with many releases could fill most of a 30-item
  page with repeats of itself (same React key too), making search look like "the same MCPs always
  show" regardless of the query. Fixed by reading the `isLatest` flag out of each entry's `_meta`
  (`is_latest_version()` in `registry.rs`) and dropping non-latest versions, plus a defensive
  dedupe-by-name pass for entries where `_meta` is missing/malformed.

## Visual design system (Phase 5 slice)

- `src/App.css` is now a token-driven design system: every color, spacing value, radius,
  shadow, font size/weight, and transition used anywhere in the app is a CSS custom property
  declared once in `:root` (plus a `@media (prefers-color-scheme: dark)` override block that
  redefines the same variable names). Re-theming the whole app — light or dark — means editing
  values in those two blocks only; component rules below them reference `var(--...)` exclusively
  and should never hard-code a color/spacing/radius value directly.
- Introduced a small `.btn` variant system (`.btn-primary` / `.btn-secondary` / `.btn-ghost` /
  `.btn-danger` / `.btn-icon`, plus `.btn-sm`) applied via `className` in `App.tsx`,
  `SettingsPanel.tsx`, `McpPanel.tsx`, and `McpMarketplace.tsx` — replaces the old approach of
  every `<button>` looking identical. Unclassed buttons still fall back to a sane default via the
  base `button` selector.
- Modals (`.settings-overlay`/`.settings-panel`, reused by Settings/MCP/Marketplace/install-dialog)
  got a blurred backdrop, fade/scale-in animation, and elevated shadow; message bubbles, badges,
  and list rows were restyled to use the token palette (accent = indigo `--color-accent`).
- Verified visually via a throwaway Playwright script driving `npm run dev` (plain Vite, no Tauri
  shell) in both `light` and `dark` emulated color schemes — screenshotted the main chat view,
  Settings, MCP panel, and the nested Marketplace modal. No console errors. (Script was not kept —
  Tauri `invoke` calls no-op/fail outside the native shell, so this only validates CSS/layout, not
  data-dependent behavior; that still needs `npm run tauri dev`.)
- App shell restructured around a persistent left sidebar + right chat panel (Claude-desktop-style),
  replacing the old single-column layout with a header full of text buttons:
  - `src/components/Sidebar.tsx` — conversation history list (click row to reopen via
    `listMessages`, hover-reveals a delete icon wired to the new `deleteConversation` in
    `src/lib/db.ts`), a "New chat" button, and a bottom icon rail (`IconTool`/`IconSettings` from
    the new `src/components/icons.tsx`) that opens the MCP panel / Settings panel — replacing the
    old header's `MCP (N running)` / `Settings (N active)` text buttons. A menu-icon toggle
    collapses the sidebar to an icon-only rail (`--sidebar-width-collapsed` in `App.css`); state is
    in-memory only (not persisted across restarts).
  - `src/App.tsx` gained `conversations`/`activeConversationId` state and
    `handleNewChat`/`handleSelectConversation`/`handleDeleteConversation`, and now refreshes the
    conversation list after every send so titles/ordering stay current.
  - `src/App.css`: new `.app-shell`/`.sidebar`/`.main-panel` layout rules; `.messages`/`.composer`/
    `.error`/`.notice` now self-center at `--layout-max-width` within the main panel instead of the
    whole window being clamped to that width. Composer's Send button is now a circular icon button
    (`IconSend`).
  - Re-verified with the same throwaway-Playwright-on-`npm run dev` approach: sidebar renders and
    collapses correctly in both light and dark emulated schemes, no new console errors beyond the
    expected Tauri-`invoke`-missing ones outside the native shell.
  - **Chat view overhaul (tool calls + markdown), this session**: tool calls are now their own
    collapsible component (`src/components/ToolCallBlock.tsx`) instead of a flat `<pre>` dump — a
    status pill (spinner/check/X for pending/success/error), the real tool name plus its owning MCP
    server name (decoded from the internal `${serverId}_${toolName}` key — server ids are UUIDs and
    never contain `_`, so the first `_` is always the split point), collapsed by default and
    auto-expanding on error; expanded view pretty-prints input/output JSON in a `<pre>` capped at
    `max-height: 260px` with its own scrollbar for long output. Assistant replies now render as real
    markdown (`src/components/Markdown.tsx`, new deps `react-markdown` + `remark-gfm`) — headings,
    lists, tables, code blocks, links — instead of plain pre-wrapped text; assistant messages also
    got a hover-reveal copy-to-clipboard button. New icons in `icons.tsx`: chevron, check, X, copy,
    spinner. **Bug fixed same session**: `.message`/`.tool-block` were missing `flex-shrink: 0`, so
    as the `.messages` flex column filled up, flexbox silently shrank earlier message/tool bubbles
    instead of letting the container scroll (worse on tool blocks, which also have `overflow:
    hidden` — that drops a flex item's automatic min-size floor from content-size to 0, so it can be
    squashed all the way down and clip its content instead of showing it). Bubbles now hold their
    natural height via `flex-shrink: 0` and the tool-output `<pre>` scrolls internally instead.

## CI / release pipeline (Phase 5, first slice)

- `.github/workflows/ci.yml` — runs on every push/PR to `main`: frontend typecheck+build
  (`npm run build`) and `cargo check --all-targets` (Ubuntu, with the webkit2gtk/appindicator
  system deps Tauri needs to even typecheck on Linux). Fast sanity check, no installers built.
- `.github/workflows/release.yml` — runs on pushing a `v*` tag (or manual `workflow_dispatch`).
  Matrix-builds installers via `tauri-apps/tauri-action` across macOS (aarch64 + x86_64 targets,
  separate jobs since `tauri-action` doesn't produce a universal binary that way), Ubuntu 22.04
  (older glibc for broader AppImage/deb compatibility than `ubuntu-latest`), and Windows —
  producing `.dmg`, `.deb`/`.AppImage`, and `.msi`/NSIS `.exe` respectively (per `tauri.conf.json`'s
  `bundle.targets: "all"`). Publishes all artifacts to a **draft** GitHub Release named after the
  tag (`releaseDraft: true` — a human still reviews/publishes it, nothing goes live automatically).
- Verified locally this session: `npm run build`, `cargo check --all-targets`, and a full
  `npm run tauri build` all succeed on Windows, producing working `.msi`/NSIS installers whose
  built `.exe` actually launches.
- **Code signing wired this session**: `release.yml`'s `tauri-action` step now forwards
  `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` and
  `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD`/`APPLE_SIGNING_IDENTITY`/`APPLE_ID`/
  `APPLE_PASSWORD`/`APPLE_TEAM_ID` from repo secrets (names verified against Tauri's own
  Windows/macOS signing docs). None of these secrets have actually been generated/added to the
  repo yet — that's a manual, maintainer-only step (buying a cert, enrolling in the Apple
  Developer Program) documented in README "Release signing (maintainers)". Until they're added,
  `tauri-action`/the bundler just skip signing for that platform and the build stays unsigned, so
  this doesn't block releases either way. No auto-updater plugin yet, so no
  `TAURI_SIGNING_PRIVATE_KEY`/`latest.json` publishing step exists — separate Phase 5 slice, still
  not started. No first-run onboarding wizard, no local-only crash log — also not started.
  macOS/Linux release jobs remain untested end-to-end (no Mac/Linux machine available) — only
  inspected for correctness against the standard `tauri-action` quickstart pattern.

## Marketing website (Phase 5 slice, this session)

- `docs/index.html` — self-contained static landing page (no build step/deps): hero section with
  light/dark screenshot swap via `prefers-color-scheme`, feature grid, two screenshot showcases
  (Settings, MCP panel), per-OS download buttons linking to `releases/latest`, GitHub link,
  footer. Reuses the screenshots already in `docs/screenshots/` (added in an earlier session) and
  a copy of the app icon as `docs/favicon.png`. Not yet live — needs GitHub Pages turned on
  (Settings → Pages → Deploy from branch → `main` / `/docs`), documented in README "Marketing
  website (maintainers)". README's hero section links to it pre-emptively
  (`https://rotkiv93.github.io/studyllm/`).

## Google Workspace (Gmail/Drive) MCP access — researched, not integrated

Investigated whether students could get one-click Gmail/Drive tool access the same way they
install any other marketplace MCP server. Finding: **no easy path exists today**, for either
option researched:
- **Google's own official remote Gmail MCP server** (`https://gmailmcp.googleapis.com/mcp/v1`)
  requires a full OAuth 2.0 authorization-code-with-browser-redirect flow against a *pre-registered*
  OAuth client ID + secret + redirect URI in Google Cloud Console — there's no static/long-lived
  token shortcut. This app's remote-server install flow only supports pasting a single static
  bearer token (see the existing "Remote auth is limited to a single bearer token" limitation
  above), so it can't drive this without new engineering.
- **Community npx-installable servers** (e.g. `@gongrzhe/server-gmail-autoauth-mcp`) still require
  *the end user* to create their own Google Cloud project, enable the Gmail API, generate OAuth
  credentials, and run a one-time `npx ... auth` terminal command before the server will start —
  arguably more technical than the free-tier LLM API key flow this app already asks students to do.
- A genuinely easy version would mean StudyLLM registering its own public (PKCE, no-client-secret)
  OAuth client with Google, shipping that client id in the app, and building a native
  "Connect Google Account" flow: system-browser consent → local-loopback Tauri HTTP listener to
  catch the redirect → token exchange → refresh-token in the OS keychain → periodic access-token
  refresh threaded into `McpHost::start_remote`'s single-bearer-token model (which currently
  captures the token once at connect time, not per-call). That's real, scoped, buildable work —
  but it needs a maintainer to actually create the Google Cloud OAuth client first (an account
  action outside what an agent can do), and Google's sensitive-scope verification review for a
  public app adds more lead time. Deliberately not started blind without that groundwork.

## Key files (orientation)

- `src/App.tsx` — top-level UI state, chat send/receive loop, wires providers + MCP tools together;
  also owns catalog-install → SQLite-row → keychain-secret → server-start orchestration
  (`handleInstallFromCatalog`/`handleStartMcpServer`/`resolveServerEnv`), conversation
  history navigation (`handleNewChat`/`handleSelectConversation`/`handleDeleteConversation`, now
  also replaying persisted tool calls), per-tool "ask" approval (`requestToolApproval`/
  `resolveApproval` + the approval modal), and MCP server config editing
  (`handleUpdateMcpServer`/`handleUpdateMcpServerEnv`/`handleEditFilesystemPath`).
- `src/components/Sidebar.tsx` — left-hand conversation history list + collapsible icon rail that
  opens Settings/MCP panel (Claude-desktop-style shell); `src/components/icons.tsx` — the inline
  SVG icon set it (and the composer's send button) use.
- `src/lib/providerRouter.ts` — client-side multi-provider failover + streaming + tool-call events.
- `src/lib/mcp.ts` — typed frontend wrappers for the Rust MCP commands/events, including the
  catalog/registry types (`CatalogEntry`, `InstallSpec`) mirroring `mcp/registry.rs`, and the
  per-tool permission types/helpers (`ToolPermissionMode`, `parseToolPermissions`,
  `getToolPermission`).
- `src/lib/mcpCatalog.ts` — trust-tier computation (official/verified/community) + cache-aware
  `searchCatalog()` (live registry with SQLite-cache fallback on error).
- `src/lib/db.ts` — all SQLite CRUD (providers, conversations, messages, tool_calls, MCP servers,
  MCP catalog cache, usage), including `deleteConversation` (cascades to messages + their tool
  calls), `renameConversation`, `updateMcpServer`, and `insertToolCall`/
  `listToolCallsForConversation`.
- `src/components/SettingsPanel.tsx` — provider (LLM API key) management UI, including inline
  edit (`EditProviderRow`: label/model/API-key rotation).
- `src/lib/providerModels.ts` — per-provider live model-list fetching (public catalogs immediately,
  key-gated ones once an API key is entered), with parsing/filtering per provider and graceful
  fallback to `null` on any failure.
- `src/components/McpPanel.tsx` — installed MCP server management UI: pinned cards (Filesystem +
  any Google-named server) above a searchable "All servers" list, start/stop/remove, inline config
  editing (`EditServerForm`: name/folder/url/env vars), and an expandable per-tool permission list
  (`ToolPermissionRow`) driving `tool_permissions_json`. Delegates actual start logic to
  `App.tsx`'s `onStart`.
- `src/components/McpMarketplace.tsx` — registry search/browse UI, required-env-var install form,
  non-official install warning + ack checkbox.
- `docs/index.html` — static marketing landing page (see "Marketing website" above); not wired
  into the Vite app build, served as-is via GitHub Pages.
- `src-tauri/src/mcp/host.rs` — in-memory registry of running MCP child/remote connections + rmcp
  client calls; `start` (stdio, scoped env) and `start_remote` (Streamable HTTP, single bearer
  token) both funnel into `finish_start`.
- `src-tauri/src/mcp/registry.rs` — fetches + tolerantly normalizes the official MCP registry's
  `/v0/servers` response into installable `CatalogEntry`s.
- `src-tauri/src/mcp/runtime.rs` — `npx` resolution + portable Node download/extract fallback.
- `src-tauri/src/mcp/commands.rs` — Tauri command surface for the above.
- `src-tauri/src/db.rs` — SQLite migrations (source of truth for the schema).
- `src-tauri/src/credentials.rs` — OS keychain read/write/delete for API keys.
