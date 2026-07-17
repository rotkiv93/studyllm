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
- **Phase 5 — polish, CI/release, onboarding**: ✅ Done, by deliberate design choice rather than
  left incomplete. Code signing (Windows Authenticode, Apple Developer ID + notarization) and the
  Tauri auto-updater were both fully wired at one point this project's history, but **removed on
  request** — see "Releasing (maintainers)" in the README for why: no paid certs, no Apple
  Developer Program enrollment, no signing keypair to maintain, just plain unsigned installers
  attached to a draft GitHub Release. (One real bug surfaced and got fixed along the way: forwarding
  `${{ secrets.X }}` for a secret that doesn't exist sets the env var to an *empty string*, not
  "unset" — `tauri-action`'s macOS codesign and Tauri's updater-artifact signing both treat that as
  "please sign with this" and fail hard instead of skipping gracefully, unlike the Windows cert
  path. Removing the wiring entirely — rather than trying to leave it opt-in — sidesteps that
  footgun.) **First-run onboarding wizard**: `src/components/OnboardingWizard.tsx` — pick provider →
  free-key link →
  paste + live-verify (reuses `providerModels.ts`) → optional filesystem MCP install; auto-shows
  when no providers exist (tracked via `localStorage`, re-openable from Settings). **Local-only
  crash log**: `src-tauri/src/crashlog.rs`, ring-buffered to `<app-local-data>/studyllm.log`, fed by
  MCP stderr/start-failures, Rust panics, and frontend JS errors; "Show log"/"Reveal in
  folder"/"Clear" in Settings.
  UI shell redesigned (Claude-desktop-style): a persistent left sidebar (`src/components/Sidebar.tsx`)
  lists conversation history (click to reopen, hover-to-delete, collapsible to an icon rail) and
  hosts Settings/MCP servers as icon buttons at its bottom, replacing the old header text buttons;
  the chat itself now lives in a right-hand main panel. Inline SVG icon set lives in
  `src/components/icons.tsx` (no icon library dependency). Reopening a past conversation loads its
  persisted user/assistant messages via `listMessages`, plus any persisted tool calls (see below);
  deleting one uses `deleteConversation` (`src/lib/db.ts`, cascades to its messages and their tool calls).

## Known simplifications / limitations in the current Phase 3/4 implementation

- **npm-published (npx) and PyPI-published (uvx) packages**, plus **remote Streamable HTTP**
  servers, are installable. `registry.rs`'s `normalize()` recognizes `registryType: "npm"` and
  `"pypi"` packages and builds the matching `InstallSpec::Npx`/`::Uvx` (both use the same
  `pkg@version` argv convention); `runtime.rs` has a portable-`uv` bootstrap
  (`ensure_uvx`/`download_and_extract_uv`) mirroring the existing Node one for machines without
  `uvx` on PATH. Docker/OCI packages are still shown in search (for visibility) but marked
  `unsupported` — no container runtime story exists here, and that's out of scope.
- **Remote (Streamable HTTP) auth supports multiple headers.** `host.rs`'s `start_remote` takes
  the full resolved header map for a server; a header literally named `Authorization`
  (case-insensitive) still goes through rmcp's `auth_header` bearer-token config (unchanged
  behavior for existing installs), and every other header name is sent verbatim via a custom
  `reqwest::Client` built with `.default_headers(...)` and passed to rmcp through
  `StreamableHttpClientTransport::with_client(...)` — `reqwest::Client` already implements rmcp's
  `StreamableHttpClient` trait, so this needed no rmcp version bump, just constructing our own
  client instead of the default one. The marketplace no longer warns about only-the-first-secret
  being used, because that's no longer true.
- **Trust tiers are a heuristic, not a real audit**: `official` = reverse-DNS name under
  `io.modelcontextprotocol*` or a repo under `github.com/modelcontextprotocol/servers`; `verified`
  = any other entry with a `github.com`/`gitlab.com` repository URL; everything else is
  `community`. This is exactly the "best-effort, not a real sandbox" mitigation described in the
  original plan — installing a community server still lets it run arbitrary code as the OS user.
- The MCP catalog cache (`mcp_catalog_cache` table) now evicts entries older than
  `CATALOG_CACHE_TTL_DAYS` (14 days, `db.ts`) after every successful *live* search — never on the
  cache-fallback path itself, so a long offline stretch can't wipe the only fallback data. A
  "Clear cache" button appears in the marketplace whenever cached results are being shown.
- `npx`-launched servers get a minimal, explicit env allowlist (`PATH`, a few OS/Node
  essentials) plus the server's own declared `required_env` — **not** the full inherited parent
  environment — per the plan's "minimal env inheritance" safety layer. This is best-effort:
  spawning `npx` with a fully cleared environment is known to break in obscure ways on Windows,
  so a small fixed allowlist is kept rather than clearing everything.
- The Node/npx and uv/uvx portable-runtime bootstraps (`src-tauri/src/mcp/runtime.rs`) download a
  hardcoded version (`NODE_VERSION`/`UV_VERSION` consts — bump periodically) if the binary isn't
  already on PATH. Both are written to be cross-platform (flat zip on Windows, subfoldered tar.gz
  on macOS/Linux — uv's Windows archive is flat while its Unix archives extract into a subfolder,
  the opposite split from Node's, both handled explicitly) but were only exercised end-to-end on
  Windows — Linux/macOS extraction paths are unverified in practice.
- MCP servers with their `autostart` flag set (a per-server checkbox in `McpPanel.tsx`, off by
  default for new installs) are started automatically after DB init on launch
  (`App.tsx`'s mount effect); a failed autostart just leaves that server stopped for the user to
  retry manually. Servers without the flag still require a manual "Start" click each session, same
  as before.
- **Fixed this session**: tool calls/results are now persisted to a new `tool_calls` table
  (migration v4, `src-tauri/src/db.rs`) — one row per resolved call, linked to the assistant
  `messages` row it belongs to (`message_id`) with a `seq` for ordering. `sendMessage` in
  `App.tsx` accumulates resolved calls during streaming and writes them right after the assistant
  message row is inserted; `handleSelectConversation` now also fetches
  `listToolCallsForConversation`. **Interleaving fixed in a later session**: `tool_calls` gained a
  `text_offset` column (migration v5) — a snapshot of `assistantText.length` at the moment each
  call was made — so replay now slices the persisted `content` at those offsets and interleaves
  text segments with tool blocks in their original order, instead of always rendering "all this
  turn's tool calls, then the text." `deleteConversation` cascades tool_calls too
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
  responds. Managed from `McpPanel.tsx`'s per-server "Tools (N)" expandable list. **Now also works
  cold**: `mcp_servers` gained a `cached_tools_json` column, refreshed every time a server reports
  `running`; the panel falls back to it (with a "showing the last-known list" note) when the
  server is stopped, so tool permissions can be edited without starting it first.
- **Added this session — editable MCP configs**: `McpPanel.tsx` has an inline "Edit" form per
  server (`updateMcpServer` in `db.ts`, a plain `UPDATE ... WHERE id`). Supports: renaming
  (`name`), changing a filesystem server's scoped folder (re-picks via the native folder dialog,
  rewrites `args_json`, and if the server is currently running, stops + restarts it with the new
  path), changing a remote server's `url`, and rotating/editing values for any env vars already in
  `env_refs_json` (secret ones get a "leave blank to keep current value" password field routed
  through `setCredential` against the *existing* keychain ref rather than minting a new one; if
  running, the server is restarted with the freshly resolved env). **Now also supports
  adding/removing env var *keys***, not just changing existing values: the edit form has a
  per-key "Remove"/"Undo" toggle plus a "+ Add variable" row for brand-new name/value/secret
  entries; `handleUpdateMcpServerEnv` takes a `removedKeys` list and cleans up the keychain entry
  for any removed secret.
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
  backdrop), matching what the CSS was already designed for. **Superseded in a later session**
  (see "Settings restructure" below): the `children`/`onOpenMarketplace` prop pair described here
  is gone — the marketplace is no longer opened as its own modal at all, it's inline tab content
  inside `McpPanel`. The `.settings-overlay .settings-overlay` nested rule this paragraph describes
  is still real and still in use, just for one narrower case now: the marketplace's own
  install-confirmation step, which still nests one level inside the (now-tabbed) MCP panel.
- Providers (LLM API keys, not MCP servers) also gained inline editing this session —
  `ProvidersPanel.tsx`'s (then `SettingsPanel.tsx`) `EditProviderRow`: change label/model freely (existing `updateProvider`
  already supported this at the DB layer, just had no UI), and optionally paste a new API key
  (blank = keep the current one) which overwrites the existing keychain entry via `setCredential`
  rather than creating a new `secret_ref`.
- MCP child process `stderr` is now piped (`Stdio::piped()` via
  `TokioChildProcess::builder(...).stderr(...)`) and forwarded line-by-line as `mcp://server-log`
  events; `McpPanel.tsx` has a per-server "Logs" button/drawer (last 300 lines, in-memory) instead
  of it only being visible in the terminal running `npm run tauri dev`. Also feeds the local-only
  crash log file (`crashlog.rs`).
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
- **Settings restructure, this session**: the old two-button sidebar footer (MCP servers /
  Settings-with-crash-log) is now three: **Providers**, **MCP Servers**, **Settings**.
  - `SettingsPanel.tsx` renamed to `ProvidersPanel.tsx` (`ProvidersPanel` component) and now holds
    only LLM provider (API key) management — the crash-log section moved out.
  - New `AppSettingsPanel.tsx`: just the crash-log viewer (show/reveal/clear), moved verbatim out
    of the old `SettingsPanel`. Nothing else lives here yet.
  - `McpPanel.tsx` gained an `Installed`/`Discover` tab switcher (`.mcp-tabs`) instead of a
    "Browse marketplace…" button that opened `McpMarketplace` as a separate modal. `McpMarketplace`
    is no longer a standalone overlay component — it lost its own outer
    `.settings-overlay`/`.settings-panel`/header/`onClose` and is now rendered as plain tab content
    inside `McpPanel`'s existing panel chrome when `tab === "discover"`. The one modal it still owns
    is the install-confirmation step, which nests correctly under `McpPanel`'s overlay via the
    existing `.settings-overlay .settings-overlay` rule (see the note above the now-superseded
    "Fixed, reported live by the user" entry). `McpPanel`'s panel also gained a `.settings-panel-wide`
    modifier (`width: min(720px, 94vw)` vs. the default 560px) since both tabs want more room.
  - Marketplace redesigned for non-technical users: entries render as a card grid
    (`.marketplace-grid`/`li.marketplace-card`, not the old `.provider-list` row layout — a fresh
    class family was used specifically to sidestep the `.provider-list li` specificity trap
    documented above) with a colored initial-avatar per server (`avatarClass()`, a 3-way hash over
    `--color-accent-soft`/`--color-success-soft`/`--color-warning-soft`), a plain-language `title`
    tooltip on each trust badge explaining what Official/Verified/Community actually mean, and
    "Add"/"Added" wording instead of "Install"/"Installed". A client-side "Popular" row (filesystem
    + any Google-named entry, same regex heuristic as `McpPanel`'s existing `isPinned`, duplicated
    locally since it's over a different data shape) surfaces above the full results grid, but only
    when the search box is empty.
  - Sidebar: new `IconKey` (`icons.tsx`) for the Providers button; the "no active providers" dot
    moved from the old Settings button to the new Providers button; `onOpenSettings`/
    `onOpenMcp` props became `onOpenProviders`/`onOpenMcp`/`onOpenAppSettings`.
  - Verified via `npm run build` (tsc strict + vite) and `npm run lint` (clean, pre-existing
    unrelated warnings only). Not yet visually click-tested in the running app — the user already
    had `npm run tauri dev` open, which should hot-reload these changes via Vite HMR.

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

- `.github/workflows/ci.yml` — runs on every push/PR to `main`: `npm run lint`, `npm test`
  (Vitest), frontend typecheck+build (`npm run build`), `cargo check --all-targets`, and
  `cargo test` (Ubuntu, with the webkit2gtk/appindicator system deps Tauri needs to even typecheck
  on Linux). Fast sanity check, no installers built.
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
- **Code signing and the auto-updater were tried, then deliberately removed.** Both were fully
  wired at one point (Windows/Apple cert forwarding, `TAURI_SIGNING_PRIVATE_KEY`,
  `tauri-plugin-updater`, an in-app update banner) but ripped back out on request — this project
  intentionally ships plain unsigned installers with no auto-update, to avoid needing paid certs,
  an Apple Developer Program membership, or a signing keypair to maintain. **A real bug was found
  in the process, worth remembering if this is ever revisited**: `release.yml` forwarded
  `${{ secrets.X }}` for several secrets unconditionally; when a secret doesn't exist, GitHub
  Actions sets the env var to an *empty string*, not "absent." The Windows cert path tolerates
  that fine (empty → skip signing), but macOS's `security import` and the Tauri CLI's
  updater-artifact signing (forced on by `bundle.createUpdaterArtifacts: true`) both choke on an
  empty value instead of skipping — every platform failed a real tagged-release build this way
  before the wiring was removed. See git history for the full implementation if it's ever wanted
  back; README "Releasing (maintainers)" now just documents the plain unsigned flow.
  macOS/Linux release jobs remain otherwise untested on real hardware — only inspected for
  correctness against the standard `tauri-action` quickstart pattern (aside from the failure above).

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

- `src/App.tsx` — top-level UI state, chat send/receive loop (`runSend`, with `sendMessage` as its
  form-submit wrapper), wires providers + MCP tools together; also owns catalog-install → SQLite-row
  → keychain-secret → server-start orchestration (`handleInstallFromCatalog`/
  `handleStartMcpServer`/`resolveServerEnv`), conversation history navigation
  (`handleNewChat`/`handleSelectConversation`/`handleDeleteConversation`/`handleRenameConversation`,
  replaying persisted tool calls interleaved with text via `text_offset`), message
  edit/retry (`handleEditMessage`/`handleRetryMessage`/`truncateFrom`), stream cancellation
  (`handleStopStreaming` via `AbortController`), per-tool "ask" approval (`requestToolApproval`/
  `resolveApproval` + the approval modal), MCP server config editing
  (`handleUpdateMcpServer`/`handleUpdateMcpServerEnv`/`handleEditFilesystemPath`).
- `src/components/Sidebar.tsx` — left-hand conversation history list + collapsible icon rail that
  opens the Providers/MCP Servers/Settings panels (Claude-desktop-style shell);
  `src/components/icons.tsx` — the inline SVG icon set it (and the composer's send button) use.
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
- `src/components/ProvidersPanel.tsx` — provider (LLM API key) management UI, including inline
  edit (`EditProviderRow`: label/model/API-key rotation). Renamed from `SettingsPanel.tsx`; no
  longer has the crash-log section (see `AppSettingsPanel.tsx`).
- `src/components/AppSettingsPanel.tsx` — general app settings: currently just the local crash-log
  viewer (show/reveal/clear), split out of the old `SettingsPanel.tsx`.
- `src/lib/providerModels.ts` — per-provider live model-list fetching (public catalogs immediately,
  key-gated ones once an API key is entered), with parsing/filtering per provider and graceful
  fallback to `null` on any failure.
- `src/components/McpPanel.tsx` — installed/discoverable MCP server management UI behind an
  `Installed`/`Discover` tab switcher (`.mcp-tabs`). Installed tab: pinned cards (Filesystem + any
  Google-named server) above a searchable "All servers" list, start/stop/remove, inline config
  editing (`EditServerForm`: name/folder/url/env vars), and an expandable per-tool permission list
  (`ToolPermissionRow`) driving `tool_permissions_json`. Delegates actual start logic to
  `App.tsx`'s `onStart`. Discover tab renders `McpMarketplace` inline (see below) via an `onInstall`
  prop instead of opening it as a separate modal.
- `src/components/McpMarketplace.tsx` — registry search/browse UI, rendered as `McpPanel`'s
  Discover-tab content (not its own overlay/modal). Card-grid layout (`.marketplace-grid`), a
  client-side curated "Popular" row when the search box is empty, plain-language trust-badge
  tooltips, "Add"/"Added" wording, required-env-var install form, non-official install warning +
  ack checkbox (still its own nested modal), "Clear saved results" when showing stale cache.
- `src/components/OnboardingWizard.tsx` — first-run setup flow (provider → key → verify → optional
  filesystem MCP); re-openable from the Providers panel.
- `src/lib/crashlog.ts` — frontend wrapper for the Rust crash-log commands.
- `docs/index.html` — static marketing landing page (see "Marketing website" above); not wired
  into the Vite app build, served as-is via GitHub Pages.
- `src-tauri/src/mcp/host.rs` — in-memory registry of running MCP child/remote connections + rmcp
  client calls; `start` (stdio, scoped env, piped stderr forwarded as `mcp://server-log` events)
  and `start_remote` (Streamable HTTP, full resolved header map — see multi-header note above)
  both funnel into `finish_start`.
- `src-tauri/src/mcp/registry.rs` — fetches + tolerantly normalizes the official MCP registry's
  `/v0/servers` response into installable `CatalogEntry`s (`Npx`/`Uvx`/`RemoteHttp`/`Unsupported`);
  has `#[cfg(test)]` unit tests for `normalize()`/`is_latest_version()`.
- `src-tauri/src/mcp/runtime.rs` — `npx`/`uvx` resolution + portable Node/uv download/extract
  fallback (`ensure_npx`/`ensure_uvx`).
- `src-tauri/src/mcp/commands.rs` — Tauri command surface for the above.
- `src-tauri/src/crashlog.rs` — ring-buffered local-only crash log (MCP stderr/failures, Rust
  panics, frontend errors), flushed to `<app-local-data>/studyllm.log`.
- `src-tauri/src/db.rs` — SQLite migrations (source of truth for the schema).
- `src-tauri/src/credentials.rs` — OS keychain read/write/delete for API keys.
- `eslint.config.js` — flat ESLint config (`npm run lint`); `src/**/*.test.ts` — Vitest suite
  (`npm test`), covering `mcpCatalog.ts`, `providerRouter.ts` (mocked `streamText`), and
  `providerModels.ts`.
