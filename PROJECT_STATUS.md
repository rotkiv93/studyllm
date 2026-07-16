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
  messages, providers, provider usage, and installed MCP servers. API keys never touch SQLite —
  only an opaque `secret_ref` pointing into the OS keychain (via the `keyring` crate,
  `src-tauri/src/credentials.rs`).
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
  CI/release pipeline done (see below). App is still unsigned; no updater; no first-run wizard.
  UI shell redesigned (Claude-desktop-style): a persistent left sidebar (`src/components/Sidebar.tsx`)
  lists conversation history (click to reopen, hover-to-delete, collapsible to an icon rail) and
  hosts Settings/MCP servers as icon buttons at its bottom, replacing the old header text buttons;
  the chat itself now lives in a right-hand main panel. Inline SVG icon set lives in
  `src/components/icons.tsx` (no icon library dependency). Reopening a past conversation loads its
  persisted user/assistant messages via `listMessages`; deleting one uses the new
  `deleteConversation` (`src/lib/db.ts`, cascades to its messages).
  Visual redesign done this session (see below); still no first-run wizard/onboarding.

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
- Tool calls/results are shown live in the chat transcript but are **not persisted** to SQLite —
  only user/assistant text messages are saved to the `messages` table. Reopening a conversation
  will not replay past tool calls.
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
- **Not done yet**: no code-signing secrets are wired into `release.yml` — builds are unsigned, so
  SmartScreen/Gatekeeper will warn (flagged in the release body). No auto-updater plugin, so no
  `TAURI_SIGNING_PRIVATE_KEY`/`latest.json` publishing step exists yet either — that's a separate
  Phase 5 slice (see plan doc). No first-run onboarding wizard. macOS/Linux release jobs are
  untested end-to-end (no Mac/Linux machine available this session) — only inspected for
  correctness against the standard `tauri-action` quickstart pattern.

## Key files (orientation)

- `src/App.tsx` — top-level UI state, chat send/receive loop, wires providers + MCP tools together;
  also owns catalog-install → SQLite-row → keychain-secret → server-start orchestration
  (`handleInstallFromCatalog`/`handleStartMcpServer`/`resolveServerEnv`) and conversation
  history navigation (`handleNewChat`/`handleSelectConversation`/`handleDeleteConversation`).
- `src/components/Sidebar.tsx` — left-hand conversation history list + collapsible icon rail that
  opens Settings/MCP panel (Claude-desktop-style shell); `src/components/icons.tsx` — the inline
  SVG icon set it (and the composer's send button) use.
- `src/lib/providerRouter.ts` — client-side multi-provider failover + streaming + tool-call events.
- `src/lib/mcp.ts` — typed frontend wrappers for the Rust MCP commands/events, including the
  catalog/registry types (`CatalogEntry`, `InstallSpec`) mirroring `mcp/registry.rs`.
- `src/lib/mcpCatalog.ts` — trust-tier computation (official/verified/community) + cache-aware
  `searchCatalog()` (live registry with SQLite-cache fallback on error).
- `src/lib/db.ts` — all SQLite CRUD (providers, conversations, messages, MCP servers, MCP catalog
  cache, usage), including `deleteConversation` (cascades to its messages) and `renameConversation`.
- `src/components/SettingsPanel.tsx` — provider (LLM API key) management UI.
- `src/lib/providerModels.ts` — per-provider live model-list fetching (public catalogs immediately,
  key-gated ones once an API key is entered), with parsing/filtering per provider and graceful
  fallback to `null` on any failure.
- `src/components/McpPanel.tsx` — installed MCP server management UI (start/stop/remove, trust
  badges); delegates actual start logic to `App.tsx`'s `onStart`.
- `src/components/McpMarketplace.tsx` — registry search/browse UI, required-env-var install form,
  non-official install warning + ack checkbox.
- `src-tauri/src/mcp/host.rs` — in-memory registry of running MCP child/remote connections + rmcp
  client calls; `start` (stdio, scoped env) and `start_remote` (Streamable HTTP, single bearer
  token) both funnel into `finish_start`.
- `src-tauri/src/mcp/registry.rs` — fetches + tolerantly normalizes the official MCP registry's
  `/v0/servers` response into installable `CatalogEntry`s.
- `src-tauri/src/mcp/runtime.rs` — `npx` resolution + portable Node download/extract fallback.
- `src-tauri/src/mcp/commands.rs` — Tauri command surface for the above.
- `src-tauri/src/db.rs` — SQLite migrations (source of truth for the schema).
- `src-tauri/src/credentials.rs` — OS keychain read/write/delete for API keys.
