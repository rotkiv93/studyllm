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
- **MCP host** (`src-tauri/src/mcp/`): built on the official `rmcp` Rust SDK. Supports three server
  shapes: local **stdio** child processes, **remote-HTTP** rmcp connections, and in-process
  **native** providers (the Google Workspace REST tools). `host.rs` manages running servers
  (`RunningServer` enum: `Remote`/`Native`), `runtime.rs` resolves/bootstraps a `npx` binary,
  `commands.rs` exposes it to the frontend as Tauri commands + `mcp://server-status-changed` /
  `mcp://runtime-log` events. `registry.rs` uses a process-wide shared `reqwest::Client`
  (`OnceLock`) so Discover searches reuse pooled connections.
- **OAuth ("Plugins")** (`src-tauri/src/oauth/`): PKCE + loopback-redirect Google sign-in engine,
  feeding `McpHost::start_native` with a live, auto-refreshed access token against the native Google
  Workspace REST tools (`mcp/google.rs`) — not Google's managed MCP servers. See "Google Workspace"
  below.

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
  providers with a public model catalog (OpenRouter, GitHub Models) it fetches the live
  list immediately; for providers that require a key (Gemini, Mistral, Groq, NVIDIA NIM, Cohere,
  Cerebras) it fetches
  (debounced 500ms) once the user has typed one, using the same direct-to-provider `fetch()` +
  Bearer-auth path the chat requests already use (no Rust hop). OpenRouter's list is filtered to
  `:free`-suffixed ids; a few provider-specific keyword filters drop obviously non-chat entries
  (Whisper/TTS/embedding/image/video models). On any failure (bad key, offline, unsupported
  provider) it silently falls back to the static `suggestedModels` datalist — the model field is
  and remains a plain free-text `<input>`, so a model id can always be typed manually regardless.
  `ProvidersPanel.tsx` shows a small status line (loading/loaded-N/unavailable) below the field.
- **Tool-calling compatibility (capability-aware model selection + graceful fail-over)**: many
  free-tier models don't support tool/function calling, which previously failed opaquely once any
  MCP tool was attached. Two coordinated pieces now address this:
  - **Model picker badges + filter** (`src/lib/modelCatalog.ts`, `src/lib/providerModels.ts`,
    `ProvidersPanel.tsx`'s new shared `ModelField`): `fetchProviderModels` now returns
    `ModelInfo[]` (`{ id, supportsTools? }`). Tool support is resolved in order — the provider's
    own metadata (OpenRouter's `supported_parameters` includes `"tools"`; Mistral's
    `capabilities.function_calling`) → the external **models.dev catalog**
    (`https://models.dev/api.json`, keyless, keyed provider→model→`tool_call`; fetched once,
    memoized + `localStorage`-cached ~24h, covers the providers whose own endpoints expose no
    capability) → `undefined` (unknown). `ModelField` badges tool-capable models (`✓ tools` /
    subtle `no tools`) and offers a **"Tool-compatible only"** filter (default on) that hides only
    models known to reject tools; unknowns are always shown and the field stays free-text.
    `OnboardingWizard.tsx` seeds the first tool-capable model when it can tell.
  - **Curated free-tier providers + auto model selection** (`src/lib/providers.ts`,
    `src/lib/providerModels.ts`, `ProvidersPanel.tsx`, `OnboardingWizard.tsx`): the provider set is
    curated for free-tier tool calling — ordered best-first (Gemini, Mistral flagged `recommended`),
    each carrying a `freeTierNote` (e.g. "~1,500 req/day · native tool calling") shown in the add
    form, onboarding grid, and provider rows, plus a "Recommended" badge. **NVIDIA NIM** and
    **Cohere** were added (both OpenAI-compatible, tool-capable free tiers); **SambaNova** is
    `deprecated` — hidden from new selection via `SELECTABLE_PROVIDER_TYPES` but still renders/routes
    for already-saved rows (no DB migration). The shared `pickBestModel(type, models)` picks a
    tool-capable free model — highest-priority curated `suggestedModel` in the live list, else the
    first live tool-capable model, else the manifest `defaultModel`. The add form's `ModelField`
    auto-selects it once the live list loads (until the user manually picks/types one), so users can
    add a provider by pasting only a key; onboarding uses the same helper.
  - **Router fail-over** (`src/lib/providerRouter.ts`): `streamReply` derives `toolsAttached`, and
    on a tools-not-supported failure (a 400/422 `APICallError` — or an in-stream `error` part —
    whose text matches `/tool|function.?call/i`) it records the `providerId:model` as tool-
    incompatible **for the session** and fails over to the next provider with the distinct reason
    "model can't use tools" (no cooldown — the model, not the provider, is the problem). The
    incompatible model is skipped on later tool-requiring turns but stays fully usable for tool-free
    turns. When every candidate is tool-incompatible the `exhausted` event carries
    `toolsUnsupported: true`, and `App.tsx` shows "None of your models support the connected tools —
    pick a tool-capable model … or disable the MCP tools." Learning is session-only (no DB column).
- **Fixed this session — three real bugs that made tool calls fail against the maintainer's own
  live setup**, found by actually driving the built app end-to-end (Tauri's WebDriver support via
  `tauri-driver` + `msedgedriver`, real provider keys pulled from the OS keychain, the real
  Filesystem/Gmail/Drive MCP servers) rather than reading the code for correctness:
  - **Tool names starting with a digit hard-crashed every tool-enabled request on Gemini-family
    models.** `buildMcpTools()` in `App.tsx` keys each `dynamicTool` as `${serverId}_${toolName}`
    (`serverId` is a UUID). Gemini's function-calling API (reached here via OpenRouter's Google AI
    Studio backend) rejects any function name that doesn't start with a letter or underscore —
    roughly 5/8 of UUIDs start with a digit, so this failed unpredictably depending on which MCP
    server the id happened to belong to, with a fairly opaque `AI_APICallError: Provider returned
    error` (400). Fixed: `sanitizeToolKey` (`App.tsx`) now prefixes every key with a fixed `t`,
    guaranteeing a valid first character regardless of the id. `ToolCallBlock.tsx`'s
    `resolveToolLabel` (decodes the key back to server/tool name for display) strips that prefix
    before splitting; it falls back to the un-prefixed split for any pre-existing persisted
    `tool_calls` rows that don't start with `t` (backward compatible for chat history).
  - **A rate-limit that survived the AI SDK's own internal retries surfaced as an unrecoverable
    dead end instead of failing over.** Two related gaps in `providerRouter.ts`: (1) once
    `streamText`'s built-in retry-with-backoff exhausts its attempts against a 429/5xx, it throws
    an `AI_RetryError` wrapping the underlying `APICallError`s — not an `APICallError` itself — so
    the existing `APICallError.isInstance()`/`statusCode` checks silently fell through to the
    generic "request failed" branch and lost the real status/retry-after; (2) a step-level error
    delivered as an in-stream `part.type === "error"` (as opposed to a thrown exception) only ever
    checked for a tool-support message match and otherwise `yield`ed a fatal `error` event and
    `return`ed immediately — no cooldown, no failover to other configured providers, turn just
    dies. Fixed: a new `unwrapError()` helper unwraps `RetryError.lastError` before classification
    (used in both the tools-unsupported check and the statusCode branch), and the in-stream error
    branch now `throw`s `part.error` so it runs through the exact same classify/cooldown/failover
    logic as a thrown pre-stream error instead of duplicating (and under-handling) it.
  - **Groq's Llama 3.3 occasionally garbles its own tool-call output badly enough that Groq's
    parser 400s (`code: "tool_use_failed"`), and the identical request reliably succeeds on an
    immediate retry** (confirmed empirically — same request, 2 of 3 raw attempts failed this way,
    1 succeeded; a 6-run loop through the real `ProviderRouter` showed the same pattern). This
    isn't a capability gap (the model *can* call tools, and does most of the time) so treating it
    like the tools-unsupported case would wrongly blacklist a perfectly good model for the rest of
    the session. Fixed: `isMalformedToolCallError()` duck-types this specific error shape (Groq
    delivers it as a plain `{message, type, code}` object, not an `Error`/`APICallError`
    instance) and `streamReply` retries the *same* candidate in place, up to
    `MAX_MALFORMED_TOOL_CALL_RETRIES` (2) times, before falling through to normal failover — no
    cooldown, no "switched" event, since it's neither the provider's nor really the model's fault.
  - Also corrected a stale entry in the maintainer's own provider config found while reproducing
    this against their real setup: the Cerebras provider was pointed at `llama-3.3-70b`, which
    Cerebras has since removed from its catalog entirely (every request to it would 400) —
    repointed to `gpt-oss-120b` (tool-capable per models.dev, currently on Cerebras's catalog). Groq
    and Cerebras were also both individually re-enabled (only OpenRouter was on, a single point of
    failure that made every free-tier rate limit user-facing instead of triggering fail-over).
  - **Known limitation surfaced, not a code bug**: the maintainer's Cerebras account currently
    returns `402 payment_required` ("Payment required to access this resource. Visit your billing
    tab.") on *every* Cerebras model, confirmed via direct API calls outside the app — this is
    Cerebras-side account/billing state, not something fixable here. The router already degrades
    gracefully around it (classified as a generic request failure → short cooldown → fails over to
    the next configured provider, no crash) but Cerebras itself won't serve real replies until the
    maintainer resolves it at https://cloud.cerebras.ai's billing tab.
  - Verified: `npx tsc --noEmit` clean, `npm test` (21/21) clean, plus live verification against
    real provider APIs and the real built app (Tauri's WebDriver support via `tauri-driver` +
    `msedgedriver`, driving `src-tauri/target/debug/studyllm.exe` end-to-end) — a standalone repro
    against the raw `ai`/`@ai-sdk/openai-compatible` packages reproduced the Gemini 400 before the
    fix and confirmed it gone after; a `ProviderRouter`-level repro against real Groq credentials
    showed a full successful tool-call → tool-result → final-answer round trip; a live run through
    the actual app UI showed clean graceful fail-over across all three configured providers
    (Groq → Cerebras → OpenRouter) ending in an accurate "All your providers are rate-limited, try
    again in ~Ns" instead of a crash, once this session's own repeated testing had incidentally
    exhausted Groq's free daily token cap and hit OpenRouter's upstream congestion on the free Gemma
    model — both temporary, external, and unrelated to the code fixes above. A one-shot check is
    scheduled for once Groq's quota resets to do one further live confirmation.
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
    "Add"/"Added" wording instead of "Install"/"Installed". The "Popular" row above the full results
    grid (empty-search only) now renders the **curated catalog** `CURATED_ENTRIES`
    (`src/lib/curatedMcp.ts` — Notion featured first, plus Filesystem/GitHub/Brave Search) directly,
    de-duped against installed servers by name. It's a static import, so it paints **instantly** with
    no network wait (replacing the old regex-over-live-results heuristic). See "Discover
    performance" below.
  - Sidebar: new `IconKey` (`icons.tsx`) for the Providers button; the "no active providers" dot
    moved from the old Settings button to the new Providers button; `onOpenSettings`/
    `onOpenMcp` props became `onOpenProviders`/`onOpenMcp`/`onOpenAppSettings`.
  - Verified via `npm run build` (tsc strict + vite) and `npm run lint` (clean, pre-existing
    unrelated warnings only). Not yet visually click-tested in the running app — the user already
    had `npm run tauri dev` open, which should hot-reload these changes via Vite HMR.
- **Providers/MCP panel polish + window sizing, this session** (user-requested UI pass):
  - `ProvidersPanel` now uses the `.settings-panel-wide` chrome (720px, was the default 560px) and
    is split into two clearly-separated sections: an **"Your providers"** list (the installed/added
    providers) on top, and an **"Add a provider"** section below whose provider picker is now a
    selectable **card grid** (`.provider-type-grid`/`.provider-type-card`) instead of a `<select>`.
    Each card shows the label, Recommended badge, free-tier note, and a "✓ Configured" marker when a
    provider of that type is already added (`installedTypes` set over `providers`). Selecting a card
    drives the same `type` state the old dropdown did, so the model + API-key fields below are
    unchanged. This gives the "installed in one part, not-installed in another part" separation the
    user asked for while keeping multi-key failover (you can still re-select an already-configured
    type to add another key).
  - `McpPanel`: the installed-servers search box moved to the **top** of the Installed tab (above
    the Pinned / All servers sections) and now filters *both* sections (`matchesQuery` applied to
    `pinned` and `rest`); the filesystem "Add…" empty card hides while a query is active. Layout is
    now consistent with the Providers view (section titles + card lists in a wide panel).
  - `McpPanel` also gained `.settings-panel-tall` (`min-height: min(78vh, 660px)`) so switching
    Installed → Discover no longer collapses/re-centers the panel while the marketplace search
    loads (the previous "it shrinks until the search completes" jump). No separate loading screen —
    the reserved height just keeps the frame stable.
  - `tauri.conf.json` window: `height` 720 → 680 and added `"center": true` so the window stops
    landing partially under the Windows taskbar.
  - Verified: `npx tsc --noEmit` clean; relaunched `npm run tauri dev` (incremental Rust build,
    app window opens with the new size).
- **Discover performance (curated catalog + stale-while-revalidate)**: the Discover tab no longer
  blocks the whole grid on a live registry round-trip.
  - The "Popular" section is the static `CURATED_ENTRIES` import, so it paints on first render with
    zero network. Notion is featured first — it installs through the *existing* marketplace flow
    (`handleInstallFromCatalog`) via its npx server + a secret `NOTION_TOKEN` env var (keychain-backed
    `env_refs_json`), no new Rust or OAuth-engine work.
  - `McpMarketplace.runSearch` now does **cached-first, then revalidate**: it shows
    `getCachedCatalog(q)` immediately (cache-only, no network), then awaits `searchCatalog(q)` and
    swaps in the live results when they arrive. The "couldn't reach the directory" notice only shows
    if the *final* live fetch fails (`source === "cache"`), so the instant-paint placeholder doesn't
    flash it.
  - `mcpCatalog.searchCatalog` fire-and-forgets the cache write + stale eviction (`void … .catch()`)
    instead of awaiting them before returning results.
  - `registry.rs` uses a process-wide `OnceLock<reqwest::Client>` so searches reuse pooled/keep-alive
    connections instead of a fresh TLS handshake per keystroke.
- **Main-chat + sidebar simplification, this session** (user-requested "the main chat options are
  chaotic" pass): trimmed the three surfaces that competed for attention.
  - **Empty new-chat screen** (`App.tsx`): was a tagline + two large `FeatureExplainer` cards (Deep
    Research + RAG, each with an expandable "how it works" pipeline and CTA) + a standalone Explore
    button + four labelled groups of study-mode chips. Now just a greeting ("What can I help you
    study?") and a compact single row of *featured* starter prompts. `FeatureExplainer.tsx` was
    **deleted** (the Explore panel already *demonstrates* retrieval/research live, so the static
    cards were redundant — nothing educational lost); its `.feature-*` CSS and the
    `.empty-state-explore` rule were removed too.
  - **Starter prompts** (`StudyModes.tsx` + `studyTemplates.ts`): `StudyTemplate` gained an optional
    `featured?` flag (set on `summarize`/`policy-brief`/`lit-review-outline`/`flashcards`). The
    component shows only those as a centered row by default, with a **"Browse all ▾ / Show fewer ▴"**
    disclosure that expands the full topic-grouped library inline. Chip click still seeds the composer
    via `onPick` — no data removed.
  - **Deep Research + Library** stay exactly as the two composer toggle chips (they're per-message
    modes) — no logic touched; the duplicate big cards are what went away.
  - **Sidebar** (`Sidebar.tsx`): added a "Conversations" section label; **Library** kept as its own
    prominent workspace button (doc-count badge); the other five destinations (Providers, MCP
    servers, Plugins, Explore, Diagnostics) now live under one collapsible **"Settings"** disclosure
    (`settingsOpen` local state) instead of a flat six-button footer. Status bubbles up to the closed
    gear (the no-active-providers dot). The **collapsed icon rail** keeps every destination as a flat
    icon (a disclosure is hard to hit on a narrow rail) via a shared `configItems` array. New CSS:
    `.sidebar-section-label`, `.sidebar-settings-group/-toggle/-chevron/-items/-item`.
  - **`AppSettingsPanel`** header relabeled "Settings" → **"Diagnostics"** (it's just the crash-log
    viewer) to avoid a name clash with the new sidebar Settings group.
  - Verified: `npx tsc --noEmit` clean, `npm run build` (tsc strict + vite) clean, `npm run lint`
    (0 errors; 5 pre-existing unrelated warnings), `npm test` (56/56). All changes are frontend, so
    the maintainer's already-running `npm run tauri dev` hot-reloads them via Vite HMR (a fresh
    launch just errors with "Port 1420 already in use", expected).

- **Student-facing UI/UX overhaul — RAG / MCP / Deep Research made legible, this session**
  (user-requested "the final users are non-technical students; simplify RAG, MCP, and Deep Research").
  Four coordinated changes; **frontend-only, no Rust/schema change.** User-confirmed scope: full
  student overhaul, click-to-open passage dialog, "plain label first, real term in parentheses"
  terminology, and **keep the empty chat screen minimal** (no explainer cards re-added there).
  - **RAG explorer passage detail is now click-to-open in a big dialog** (`RetrievalExplorer.tsx`,
    `viz/SimilarityRanking.tsx`, `viz/EmbeddingMap.tsx`) — the specific complaint was that the
    hovered passage showed in a cramped strip pinned at the bottom that vanished on mouse-out and
    "cannot be seen easily." Hover still cross-highlights the bar↔dot; **clicking** a bar or a dot
    now sets a new `selectedIndex` and opens a large centered modal (reuses the shared
    `.settings-overlay`/`.settings-panel settings-panel-wide` chrome + the `.settings-overlay
    .settings-overlay` nested-backdrop rule) showing the full passage at `--font-size-md` in a
    scrollable body, the document/#seq, a big % match with a "retrieved / not retrieved" note, and
    **Prev/Next** to step through the ranked list. Backdrop-click, a Close button, and **Escape** all
    dismiss it. The old bottom `.explore-detail*` strip rules were replaced by a single persistent
    `.explore-detail-hint` ("Hover to compare — click any one to read the full passage") plus new
    `.passage-dialog*` rules (all on `--*` tokens). Both viz components gained an `onSelect(index)`
    prop and an `onClick`; the `<circle>` dots carry an SVG `<title>` cue.
  - **Plain-language labels (plain first, real term in parentheses)**: composer library toggle
    "Use my library" → **"Chat with your documents (RAG)"**; the composer now shows an
    **always-visible caption** describing the active Deep-Research sub-mode (`researchMode.description`,
    previously only in a `title=`) and the library mode, plus a **"How does this work?"** text link
    that opens the Explore playground (`.composer-mode-help/-term/-caption*` CSS). Panel headings:
    `McpPanel` "MCP Servers" → **"Tools & Connections (MCP)"** with a new **always-visible trust
    legend** (`.mcp-trust-legend`, Official/Verified/Community one-liners) instead of badge-only
    tooltips; `PluginsPanel` "Plugins" → **"Accounts (Plugins)"**; `LibraryPanel` "Document library"
    → **"Your documents (library)"**. Sidebar `configItems` labels: "MCP servers" → **"Tools &
    Connections"**, "Plugins" → **"Accounts (Plugins)"**, "Explore" → **"Explore how it works"**.
    The parenthetical term uses a shared `.settings-header-term` style. Explorer/`STAGES` copy
    softened ("Turn your question into numbers … a list of N numbers (a 'vector')"; "Rank by
    closeness in meaning ('cosine similarity'), not keyword overlap").
  - **Onboarding now teaches Research + documents** (`OnboardingWizard.tsx`): a new **`features`**
    step sits between `mcp` and `done` (both the folder-add success and the mcp-step "Skip" route to
    it) with a one-sentence plain-language intro to **Deep Research** and **Chat with your documents**
    (`.onboarding-features` cards) and a **"See how it works"** button that closes onboarding and opens
    the Explore playground via a new `onOpenExplore` prop (wired in `App.tsx`).
  - **Explicitly out of scope**: the empty chat screen stays minimal (no `FeatureExplainer`-style
    cards re-added), and the MCP install/edit power-user forms (env vars, npx args, secrets, logs)
    were left untouched.
  - Verified: `npx tsc --noEmit` clean, `npm run lint` (0 errors; same 5 pre-existing warnings),
    `npm test` (56/56). Frontend-only → Vite HMR hot-reloads into an already-running `npm run tauri
    dev`. Live in-app click-test of the passage dialog / composer captions / onboarding features step
    still to be confirmed by the maintainer.

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
- **Reframed + bilingual (this session)**: copy was rewritten from a product-pitch tone to a plain
  "student tool" tone — dropped lines like "Everything a paid AI subscription gives you, minus the
  bill" and "Ready to try it?"; headings are now task-focused ("What you can do with it", "Made for
  how you actually study", "How to get started", "Download it and get studying"). Added a
  **dependency-free inline i18n layer**: every visible string carries a `data-i18n` key (image alts
  use `data-i18n-alt`), an `I18N = { es, en }` dict holds both languages, and a small vanilla-JS
  `applyLang()` swaps `textContent`/`innerHTML`, the `<title>`, the meta description, `<html lang>`,
  and the active state of the **ES/EN toggle** in the nav. **Spanish is the default** (and is the
  static fallback content written directly into the markup, so it renders correctly even with JS
  disabled); the choice persists in `localStorage["studyllm-lang"]`. No build step, no external
  fonts/scripts — still a single self-contained file suitable for GitHub Pages.
- **Hero screenshots refreshed for the simplified UI (this session)**: `docs/screenshots/hero.png`
  (dark) and `hero-light.png` (light) were regenerated to show the new clean empty screen ("What can
  I help you study?" + the compact featured-prompt row + "Browse all", composer Deep Research / Use
  my library toggles) and the restructured sidebar (Conversations label, prominent Library, grouped
  Settings). Only the two images changed — the landing-page copy and alt text still hold. Captured
  with a throwaway Playwright script against the running `npm run dev` server (viewport 1280×820,
  `deviceScaleFactor: 2`, `colorScheme` dark/light); the other screenshots (Providers, MCP, Explore,
  attachments, plugins) show unchanged surfaces and were left as-is.

## Google Workspace access — "Plugins" OAuth flow, native REST tools (not managed MCP)

The one-click "Connect Google Account" flow is implemented end-to-end. It calls the plain **Google
Workspace REST APIs directly** (Gmail v1, Calendar v3, Tasks v1, Docs v1, Sheets v4, Drive v3),
exposed as native, in-process tools (`src-tauri/src/mcp/google.rs`) — **not** Google's managed
remote MCP servers (`gmailmcp.googleapis.com` / `drivemcp.googleapis.com`).

**Full read+write toolset (as of the Workspace-toolset expansion):** the connector fans one consent
screen out to six native providers (`GoogleKind::{Gmail, Calendar, Tasks, Drive, Docs, Sheets}`),
~30 tools total, all one-shot `reqwest` calls sharing a `google_api_call` helper (transport failure
→ hard `Err`; Google 4xx/5xx → soft `McpCallOutcome{is_error:true}`, unchanged contract):
- **Gmail**: `gmail_search_messages`, `gmail_get_message`, `gmail_search_threads`,
  `gmail_get_thread`, `gmail_list_labels`, `gmail_create_label`, `gmail_modify_message_labels`,
  `gmail_list_drafts`, `gmail_create_draft`, `gmail_send_message` *(destructive)*,
  `gmail_trash_message` *(destructive)*.
- **Calendar**: `calendar_list_calendars`, `calendar_list_events`, `calendar_search_events`,
  `calendar_get_event`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`
  *(destructive)*, `calendar_respond_to_event`.
- **Tasks**: `tasks_list_tasklists`, `tasks_list_tasks`, `tasks_create_task`, `tasks_update_task`
  (also completes/reopens), `tasks_delete_task` *(destructive)*.
- **Docs/Sheets**: `docs_create_document`, `docs_append_text`, `sheets_create_spreadsheet`,
  `sheets_append_row`. (Drive read stays: `drive_search_files`, `drive_read_file`.)

**Destructive tools default to "ask".** `DESTRUCTIVE_GOOGLE_TOOLS` in `googleConnectors.ts` lists the
send/delete tools; `App.tsx`'s `handleConnectGoogle` seeds each fresh connection's
`tool_permissions_json` with `"ask"` for any destructive tool it exposes, so those calls block on the
approval modal until the user relaxes them in the Tools panel. Existing installs are unaffected.

**Reconnect + Cloud Console required:** broadening the scopes invalidates existing consent — every
connected user must Disconnect → Connect once. The maintainer must also enable the Calendar/Tasks/
Docs/Sheets APIs and add the new scopes to the OAuth consent screen (see Setup below); the in-app
"How to set up Google access" section on the Plugins Google card surfaces these steps to the user.

This went back and forth across the session and is now settled with real evidence, not just docs:
1. First pass: pointed at Google's managed MCP servers, reasoning they might be gated behind a
   Developer Preview Program with unclear personal-account eligibility.
2. Reverted to the native-REST approach after the maintainer registered a real OAuth client and
   the consent screen appeared to let a personal account grant the Gmail-MCP/Drive-MCP scopes
   directly — seemed to disprove the gating concern.
3. **Reverted again, this time for good**: connecting with a real, correctly-scoped token against
   `gmailmcp.googleapis.com` returned `PERMISSION_DENIED: The caller does not have permission`
   even with both "Gmail MCP API" and "Google Drive MCP API" enabled in Cloud Console. Re-checking
   Google's Developer Preview Program enrollment page directly confirmed why: enrollment is a
   **form-based application requiring an actual paid Google Workspace account** — its FAQ states
   "We cannot add service accounts to the program," and the maintainer's account is a personal
   `@gmail.com` account. No code-side fix is possible; the managed MCP servers are categorically
   unreachable from a personal account. Native REST calls need none of that — same OAuth consent
   screen, just talking to `gmail.googleapis.com` / `www.googleapis.com` (Drive v3) instead.

Along the way, a real bug was also found and fixed in the remote-MCP transport code before this
final revert: rmcp's `StreamableHttpClientTransportConfig::auth_header()` expects a *bare* bearer
token and prepends `"Bearer "` itself internally, but the header value being passed in already had
`"Bearer "` prepended — every remote OAuth-backed request went out as `Authorization: Bearer Bearer
<token>`, silently rejected as unauthenticated. That's fixed in `mcp/host.rs::start_remote` (strip
the prefix before calling `auth_header()`) and stays fixed/relevant for any future non-Google
remote-HTTP server that uses OAuth-style bearer headers, even though Google itself no longer goes
through that path.

- **OAuth engine** (`src-tauri/src/oauth/{mod.rs,config.rs,flow.rs}`) — unchanged by the native-vs-
  managed-MCP question, since both need the same PKCE/loopback consent flow: PKCE (S256)
  code_verifier/code_challenge generation, a from-scratch loopback redirect catcher
  (`tokio::net::TcpListener` on `127.0.0.1:0`, hand-rolled HTTP request-line parsing — no new HTTP
  server dependency), authorize-URL building (`access_type=offline&prompt=consent`, required to
  reliably get a refresh token back), and Google token-exchange/refresh calls via `reqwest`. Google's
  current docs confirm "Desktop app" OAuth clients accept an arbitrary, OS-assigned loopback port
  with no pre-registered redirect URI, so `bind_loopback_listener()`'s port-0 approach needs no
  fixed-port fallback — confirmed by the maintainer's own registered client working. `cargo
  test`-covered: an RFC 7636 Appendix B PKCE vector, the query parser against canned request lines,
  and two real-socket integration tests (`await_redirect_catches_a_real_loopback_connection`,
  `...ignores_stray_requests_then_catches_the_real_one`) that drive an actual `TcpStream` client
  against the listener. New direct deps: `base64`, `rand`, `sha2`; `tokio` gained the `time` feature.
  `credentials.rs`'s keyring logic was split into non-command `store`/`load`/`remove` helpers shared
  by the existing `credentials_*` commands and the OAuth code.
- **Native Google Workspace tools** (`src-tauri/src/mcp/google.rs`): `NativeProvider` (one of six
  `GoogleKind` variants, holding the current access token behind a `tokio::sync::RwLock`) exposes
  that service's tool set — each a one-shot `reqwest` call against the real REST API. A shared
  `google_api_call(method, url, query, body, token)` + an `api_call!` macro cut the send/status/parse
  boilerplate; `build_raw_email` (RFC822 + base64url) backs drafts/send; `build_event_body` /
  `build_task_body` assemble partial-PATCH bodies (only present keys emitted). A Google API error
  (4xx/5xx) becomes a soft `McpCallOutcome{is_error:true}` (so the model sees and can reason about it)
  rather than a hard `Err`; only network/transport failures are hard errors. Pure helpers
  (`build_raw_email`, `build_event_body`, `build_task_body`, arg parsing, Gmail MIME-multipart body
  extraction, the Drive native-doc-vs-binary `mimeType` branch, `event_time`) are covered by `cargo
  test` against canned JSON fixtures — no network needed.
- **`McpHost` (`mcp/host.rs`) — `RunningServer` is now an enum**: `Remote { service, tools }` (a
  real rmcp connection, used by ordinary marketplace remote-HTTP installs) or `Native { provider }`
  (no live connection to hold open). `start_native`/`update_native_token` are the native
  counterparts to `start_remote`; a native token refresh is just swapping the string under the
  provider's lock — no cancel/reconnect, no status flicker, unlike a remote connection's refresh
  cycle. `RefreshContext` (used by the OAuth refresh loop) no longer carries a target/URL at all,
  since the only thing that currently gets OAuth treatment (Google) is always native now.
- **Commands + DB + refresh lifecycle**: `src-tauri/src/oauth/commands.rs` exposes `oauth_connect`
  (drives one full consent flow, then fans the resulting token pair out to every requested target —
  Gmail *and* Drive from one consent screen — starting each as a `host.start_native` provider) and
  `oauth_reconnect` (silent reconnect for an already-connected row, used on app-launch autostart
  since the previous process's refresh timer died with it). `McpHost` has a `refresh_tasks` map
  alongside `running`; `stop()` aborts any refresh task before tearing down the connection.
  `spawn_oauth_refresh` starts a background loop that sleeps until ~5 minutes before the access
  token's expiry, refreshes it, and calls `update_native_token` with the fresh value. DB migration 6
  added `mcp_servers.oauth_provider`/`oauth_expires_at` (both null for pre-existing/non-OAuth rows);
  Google rows now store `transport: "native"`, `url: null`.
- **Plugins UI**: sidebar view (`Sidebar.tsx`'s 4th icon-rail button, `IconPlug` in `icons.tsx`)
  opens `PluginsPanel.tsx` — a card grid (reusing the marketplace's `.marketplace-grid`/
  `li.marketplace-card` chrome) with one card per connector from `src/lib/googleConnectors.ts`'s
  config-driven registry (now `{serverId, name, provider}` targets, no URL). "Connect Google
  Account" shows live progress (opening browser / waiting for sign-in / connecting) via a new
  `oauth://progress` event; once connected, shows a status row per target with a "Disconnect" button
  (`stopMcpServer` + delete both keychain refs + `deleteMcpServer`). OAuth-backed rows still appear
  in `McpPanel`'s "Installed" list (pinned via `server.oauth_provider != null` instead of a
  name-regex) so per-tool permissions keep working, but `EditServerForm` hides the raw URL/env-var
  fields for them and points to the Plugins panel instead. `App.tsx`'s `handleStartMcpServer` has an
  OAuth branch (calls `oauthReconnect` instead of the static-header `resolveServerEnv` path) so a
  stale/expired token is never treated as permanent.
- **Verified (Workspace-toolset expansion)**: `cargo test` (35/35, incl. 17 `mcp::google` unit tests
  — 7 new for the shared helpers), `npm run build` (tsc strict + vite), `npm run lint` (0 errors),
  `npm test` (27/27). **Not yet verified**: a real end-to-end tool call from chat against the new
  Gmail/Calendar/Tasks/Docs/Sheets tools and the destructive-tool "ask" gate — needs a reconnect
  with the broadened scopes (which in turn needs the maintainer's Cloud Console updated per Setup).

### Setup (manual, human maintainer) — done for the maintainer's own account

1. Google Cloud Console → create/select a project → enable the classic REST APIs the native tools
   call: **Gmail API**, **Google Calendar API**, **Google Tasks API**, **Google Docs API**, **Google
   Sheets API**, and **Google Drive API**. (The "Gmail MCP API"/"Google Drive MCP API" managed
   services are *not* needed for this native-REST approach.)
2. Configure the OAuth consent screen (External user type) with the broadened scopes:
   `gmail.modify`, `gmail.send`, `calendar`, `tasks`, `documents`, `spreadsheets`, and
   `drive.readonly`. While in Testing mode, add your own Google account as a test user — personal
   `@gmail.com` accounts work fine here (this is the plain consumer OAuth path every third-party
   integration uses; it's specifically Google's *managed MCP servers* that are Workspace-only).
   **If upgrading from the old read-only scopes, every connected user must Disconnect → Connect once
   to re-consent.**
3. Create an OAuth 2.0 Client ID of type **"Desktop app"** — confirmed working with the engine's
   arbitrary-loopback-port redirect, no fixed port needed.
4. Paste the Client ID/Secret into `src-tauri/src/oauth/config.rs`'s
   `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` — **done** for the maintainer's own client.
   Watch out: a naive find-and-replace of the placeholder client ID string will also silently break
   `is_configured()`'s comparison (it checks the constant against the *literal placeholder*, not
   against itself) — hit this once already this session, fixed by keeping that comparison string as
   `"REPLACE_ME.apps.googleusercontent.com"` regardless of what the constant above it holds.
5. `npm run tauri dev` → Plugins → "Connect Google Account" opens a real Google consent screen.

Remaining verification gaps: a real tool call from chat against the rebuilt native Gmail/Drive
tools, a forced-fast-refresh test (shrink a stored `oauth_expires_at` to observe a live
`update_native_token`), and a revoke-then-use test (confirm a clean `PERMISSION_DENIED`-style error
surfaces as a tool `isError`, not a hang) — see `TODO.md`.

## Student feature roadmap (in progress)

A prioritized roadmap of student-facing features (targeting non-technical International Relations and
documentary/archival students) lives at
`C:\Users\47852\.claude\plans\lets-think-what-are-effervescent-whistle.md`: (1) in-app study
modes ✅, (2) curate more field-relevant MCPs ✅ (first batch), (3) export a chat → document ✅
(first slice), (4) chat file attachments ✅ (phases 1–3: text + PDF + Word/docx). Remaining P4
phases 4–5 (images for vision models; OCR for scanned docs) are **not started** — see the note at
the end of this section for why they're a separate, larger effort. (5) **Deep Research + RAG** ✅
(this session) — see immediately below.

### Deep Research + RAG ✅ (student-facing, this session)

Two capabilities, framed around **teaching students what they do** (per
`C:\Users\47852\.claude\plans\i-want-for-the-cozy-wozniak.md`). The empty chat screen leads with an
**explainer card grid** (`src/components/FeatureExplainer.tsx`): each card gives a plain-language
what/why, an expandable "How it works" step pipeline, and a **Try it** CTA. The card language
mirrors the steps the student then sees happen live, so the card teaches the transcript.

**Deep Research** — a system-prompt + step-budget layer over the *existing* agentic tool loop, no
new Rust and no new execution engine:
- `src/lib/researchModes.ts` — static `ResearchMode[]` (`Auto`/`Compare`/`How-to`/`Fact-check`/
  `Literature review`), each = a `systemPrompt` (decompose → search → read → cross-check →
  synthesize → cite, ending with a `## Sources` list) + a `maxSteps` budget (14–18).
- `src/lib/providerRouter.ts` — `streamReply` gained an optional 4th arg `options: { system?,
  maxSteps? }`. `system` is prepended as a `role:"system"` message (never persisted to the
  conversation, so titles/history stay clean); `maxSteps` drives `stopWhen: isStepCount(...)`
  (default still 8). Fully backward-compatible.
- The searches/reads ride the connected MCP tools (Web Reader / Wikipedia / OpenAlex / Brave) and
  render live as `ToolCallBlock`s — that transparency *is* the learning surface. A composer
  **Deep Research toggle + sub-mode `<select>`** turns it on; if no research-capable tool is
  running (`isResearchTool` heuristic over running tools), a **"Set up research tools"** action
  one-click-installs the keyless curated set (`curated:fetch`/`wikipedia`/`openalex`) via the
  unchanged `handleInstallFromCatalog`.

**RAG ("chat with your documents")** — greenfield data path, frontend-only embedding calls (same
architecture as chat; CSP `connect-src https:` already permits it):
- **Storage**: migration **v7** (`src-tauri/src/db.rs`) adds `rag_documents` + `rag_chunks`
  (embedding stored as JSON `TEXT` — SQLite has no vector type). CRUD in `src/lib/db.ts`
  (`insertRagDocument`/`insertRagChunks`/`listRagDocuments`/`listAllRagChunks`/`deleteRagDocument`).
- `src/lib/chunking.ts` — `chunkText` (paragraph/sentence-aware, ~1000 chars, ~150 overlap), pure +
  unit-tested.
- `src/lib/embeddings.ts` — `embedTexts`/`embedQuery` via `createOpenAICompatible().textEmbeddingModel`
  + the AI SDK's `embedMany`/`embed`; `cosineSimilarity` (pure + tested); `EMBEDDING_CAPABLE`
  (`gemini → text-embedding-004`, `mistral → mistral-embed`); config persisted in `localStorage`
  (the keychain key is resolved at call time, never stored).
- `src/lib/rag.ts` — `resolveEmbedder` (config + providers + keychain → callable),
  `ingestDocument` (reuses `parseAttachment` → chunk → embed → store), `retrieve` (embed query →
  in-TS cosine rank → top-k), `buildRagSystemBlock` (grounding directive: answer only from the
  passages, cite `[DocName #seq]`, admit gaps).
- **UI**: `src/components/LibraryPanel.tsx` — a new **Library** overlay (sidebar footer button, doc
  count badge) with Documents / Embedding-model tabs. Composer **"Use my library" toggle**;
  `runSend` retrieves for the turn, injects the grounding block via the router's `system` param, and
  renders a `src/components/RetrievedSources.tsx` **"Sources from your library"** card above the
  answer showing each passage + % match.
- **Known limitations**: retrieval ranks in TypeScript (cosine over every stored chunk) — fine at
  student scale (tens of docs), not thousands. Embeddings **require a Gemini or Mistral key**. The
  retrieved-sources card is **session-ephemeral** (not persisted, so it's absent after reload) —
  persisting citation records is a noted follow-up. Scanned-image PDFs still need OCR (unchanged).
- Verified: `npx tsc --noEmit` clean, `npm run lint` 0 errors, `npm test` 49/49 (new suites
  `chunking.test.ts`, `embeddings.test.ts`, `rag.test.ts`), `cargo check` clean (v7 migration).

### "Explore how it works" — retrieval + research playground ✅ (student-facing, this session)

A hands-on **visualization playground** so students can *see* the RAG and Deep Research machinery
instead of only its output — turning two black boxes into something they can poke at. Opened from a
new **Explore** sidebar footer button (`IconCompass`) and an empty-state CTA; a **two-tab overlay**
(`src/components/ExplorePanel.tsx`, reusing the shared `.settings-overlay`/`.settings-panel-wide`/
`.mcp-tabs` chrome). **Frontend-only — no Rust, no schema change.**
- **Tab 1 — Retrieval (RAG)**: `src/components/RetrievalExplorer.tsx`. The student types a query,
  hits Run, and watches the *real* pipeline run against their own library: a **live pipeline
  stepper** (embed → score every passage → rank → keep top-k, with real counts, staged-revealed for
  legibility) plus two cross-highlighting visuals — a **similarity ranking** (`viz/SimilarityRanking.tsx`:
  every chunk as a bar, sorted, with a dashed top-k cutoff line) and a **2D embedding map**
  (`viz/EmbeddingMap.tsx`: query ★ + all chunk dots, retrieved ones highlighted). Hovering a bar
  lights its dot and vice-versa; a detail strip shows the hovered passage's text + exact score.
  - **Data/support**: `src/lib/rag.ts` gained `retrieveExplained()` (keeps the full scored list +
    query vector + per-chunk vectors that the chat path's `retrieve()` discards — `retrieve()` is
    untouched). New pure, unit-tested `src/lib/projection.ts` — `projectTo2D()` PCA-to-2D via
    dependency-free power iteration (never materializes the d×d covariance, hardened against ragged
    vectors). No charting lib added; visuals are hand-rolled inline SVG/CSS on the `--color-*` tokens.
- **Tab 2 — Research process (Deep Research trace)**: `src/components/ResearchTrace.tsx`. The student
  asks a big question + picks a `ResearchMode` and watches a **live** run: a **6-stage pipeline
  stepper** (question → sub-questions → search → read → synthesize → cited report, advancing
  heuristically off the streamed events), a **step-budget progress bar** (tool-steps vs. the mode's
  `maxSteps`), a **"sources consulted" list** (built from each `tool-call` input — the query/URL — and
  its result status + size), and the **cited report** rendered live via `Markdown`. Gated on
  `hasResearchTools()` with the existing one-click keyless installer; Stop button aborts.
  - **No new engine**: `App.tsx`'s `runResearchTrace()` reuses `routerRef.streamReply(...)` +
    `buildMcpTools()` + the mode's `systemPrompt`/`maxSteps`, forwarding raw `StreamEvent`s to the
    trace instead of the transcript. Persists nothing. Handles the provider-failover reset (wipes +
    shows "switched, restarting") and exhausted/auth errors.
- **Known limitations**: the visualizations are **live-only / not persisted** (a run isn't saved). The
  2D map is a **PCA approximation** of high-dimensional space (a teaching lens, not a precise metric).
  Retrieval is still **O(n)** cosine over every chunk and still **requires a Gemini/Mistral key**; the
  research trace needs a running research tool + a tool-capable provider.
- Verified: `npx tsc --noEmit` clean, `npm run lint` 0 errors (5 pre-existing warnings only),
  `npm test` 56/56 (new `projection.test.ts` incl. a ragged-input case + a `retrieveExplained` test
  with mocked db/embeddings), `npm run build` (strict tsc + vite) clean. **Driven end-to-end in a real
  browser via Playwright** against the running dev server: the real app shell (sidebar Explore button,
  empty-state CTA, both Explore tabs with correct empty/guard states) plus a synthetic-data harness
  that exercised the **real** `SimilarityRanking`/`EmbeddingMap` (verified 5-of-9 retrieved
  highlighting, one cutoff line, one query marker) and the **real** `ResearchTrace` (a scripted run
  drove all 6 stages to done, 3 sources, a rendered cited report) — screenshotted in light + dark, no
  console errors. Real topical PDFs (EU AI Act / US AI policy / treaty law) were generated and
  confirmed extractable by the app's own `pdfjs-dist` + chunking (the ingest parse step); the one path
  needing the maintainer's live embedding key — an actual in-app embed→index→retrieve — is left for a
  live click-test with the generated PDFs.

### Chat file attachments ✅ (Priority 4 — phases 1–3: text + PDF + Word)

Students can now **drop or pick a file in the composer** and its extracted text rides along with the
message so the model can read it (a treaty PDF, a reading, notes). All parsing is **frontend-only**.
- `src/lib/attachments.ts` — `parseAttachment(file)` extracts text: plain text (`.txt/.md/.csv/…`)
  via `File.text()`, PDFs via **`pdfjs-dist`**, and Word **`.docx`** via **`mammoth`** (its `browser`
  package field makes Vite swap mammoth's node-only unzip/fs internals for browser ones, so the
  frontend `{arrayBuffer}` path works; legacy `.doc` is rejected with a "re-save as .docx/PDF"
  message). Both `pdfjs-dist` and `mammoth` are **dynamically imported** (they need browser globals
  and the Vitest suite runs in node); pdf.js's worker is a same-origin `?url` asset, allowed by the
  app's `default-src 'self'` CSP with no policy change. Per-file cap `MAX_ATTACHMENT_CHARS` (20k,
  with a "trimmed" flag) and `MAX_ATTACHMENTS` (5) guard the model's context.
  `buildOutgoingContent(typed, attachments)` composes the outgoing message: typed text first (so it
  still drives the conversation title), then one `--- Attached file: NAME ---` block per file.
- `src/App.tsx` — attachment state + `addFiles`/`removeAttachment`/`submitComposer`; the composer is
  now wrapped in a drag-and-drop zone (`.composer-wrap`, highlights while dragging), with a
  paperclip **attach button** (hidden `<input type="file">`), attachment **chips** (removable, show
  a "trimmed" marker), and Enter-to-send routed through `submitComposer`. Send is enabled when
  there's typed text **or** an attachment.
- `src/components/MessageAttachments.tsx` (`UserMessageContent`) — renders a user message by peeling
  the `--- Attached file: ---` blocks back out: the student's own text shows normally, each file
  becomes a collapsed, expandable `<details>` card (so a PDF dump doesn't flood the transcript). The
  full text still lives in the message content, so multi-turn follow-ups keep the file context.
- New deps: `pdfjs-dist` (^4) and `mammoth` (^1) — both code-split into their own chunks (loaded
  only when a PDF/docx is actually parsed, so the main bundle is essentially unchanged). New icons
  `IconPaperclip`/`IconX` usage in the composer.
- Attachments are session-only in the composer (cleared on send); the extracted text persists as
  part of the sent message.
- Verified: `npm run build` (strict tsc + vite) clean, `npm run lint` 0 errors, `npm test` 33/33
  (`attachments.test.ts` covers the pure logic). PDF **and** docx extraction each validated against
  a real generated file via a Node harness (pdf.js pulled the expected text; mammoth pulled the
  expected docx text). Live drag-drop in the running app still to be click-confirmed.
- **Phases 4–5 deliberately deferred as a separate, larger effort — not a quick add-on:**
  - **Phase 4 (images for vision models)** changes the message *pipeline*, not just parsing:
    `ChatMessage.content` is a plain `string` today (built in `runSend`, mapped in `priorHistory`,
    passed to `providerRouter.streamReply`, persisted as SQLite TEXT). Vision means multimodal
    content parts (`[{type:"text"}, {type:"image"}]`), a per-model vision-capability gate (mirroring
    the existing tools-capability handling), and a persistence/replay story for image data. Most of
    this app's free-tier target models are text/tool-only, so it needs its own design pass.
  - **Phase 5 (OCR for scanned docs)** needs a native OCR engine (e.g. Tesseract) with a
    cross-platform binary bootstrap mirroring the Node/uv one in `runtime.rs` — a heavy, mostly
    Rust-side effort. Its own project.

### Export a chat → document ✅ (Priority 3 — first slice)

An **"Export"** button in the chat header (`.app-header`, shown only once a conversation has
messages) opens a small dropdown with two options:
- **Copy as Markdown** — always available; copies the whole conversation (a `# title` + `## You` /
  `## Assistant` sections) to the clipboard via `navigator.clipboard`.
- **Save to Google Docs** — reuses the existing native Google Docs tools: finds the connected
  Google server that exposes `docs_create_document` + `docs_append_text`, creates a doc titled
  after the conversation, parses the returned doc id/URL, and appends a plain-text transcript. If no
  Google account is connected it shows "Connect your Google account in Plugins first."
- `src/lib/exportChat.ts` — transcript builders (`buildTranscriptMarkdown` /
  `buildTranscriptPlainText`, both skip tool-call blocks and empty turns), `findDocsServerId`, and
  `extractDocId`/`extractDocUrl` (parse `docs_create_document`'s text result, which embeds the doc
  URL — the tool returns text, not structured fields).
- `src/App.tsx` — `handleCopyTranscript` / `handleExportToGoogleDoc`, `exportMenuOpen`/`exporting`
  state, and the header dropdown (a `.export-backdrop` click-catcher closes it). New `IconDownload`
  in `icons.tsx`; `.export-*` styles in `App.css` (token-driven).
- Deferred to a follow-up: export to a Notion page and to a local `.md` file.
- Verified: `npm run build` (strict tsc) clean, lint 0 errors, `npm test` 27/27. Copy-as-Markdown
  is provider-independent; the Google Docs path needs a live connected account to click-test in-app.

### Curated MCP additions ✅ (Priority 2 — first batch)

Three **keyless, zero-setup** servers appended to `CURATED_ENTRIES` (`src/lib/curatedMcp.ts`) — they
install through the unchanged `handleInstallFromCatalog` flow (no Rust, no new deps), chosen for the
target students and for requiring no account/API key at all (lowest friction):
- **Web Reader** — official `mcp-server-fetch` (uvx). Reads a web link the student gives (news
  article, treaty text, UN report).
- **Wikipedia** — `wikipedia-mcp` (uvx). Article lookups for quick background.
- **OpenAlex — academic search** — `openalex-mcp` (npx). Cross-disciplinary scholarly search
  (works/authors/journals) for literature reviews — a better fit than arXiv (STEM-only) for these
  audiences.
- Each verified to exist on its registry with the exact run command + a real console/bin entry
  point, and confirmed to launch over stdio and speak MCP via a direct `initialize` + `tools/list`
  handshake: Web Reader → 1 tool (`fetch`); Wikipedia → 22 tools (`search_wikipedia`, `get_article`,
  `get_summary`, `extract_key_facts`, …); OpenAlex → 11 tools (`search_works`, `search_authors`,
  `search_sources`, `autocomplete`, …).
- **Deferred:** Zotero (`zotero-mcp`, verified real) — needs a Zotero API key + library ID (or a
  running local Zotero), so it's higher-friction than this all-keyless batch; add once its env-var
  install flow is verified in-app.

### Study modes ✅ (Priority 1 — done)

One-click prompt templates that seed the composer so students don't face a blank box.
- `src/lib/studyTemplates.ts` — static, typed `StudyTemplate[]` (`{ id, label, topic, description,
  promptSeed }`), grouped by `topic` (`reading`/`writing`/`research`/`study`). Same shape-first
  pattern as `curatedMcp.ts`. Add a mode by appending an entry — no backend, no network.
- `src/components/StudyModes.tsx` — the chip palette shown on the empty chat screen, grouped by
  topic (Reading & analysis / Writing & drafting / Research & citations / Study & revision).
  Clicking a chip calls `onPick(seed)`.
- `src/App.tsx` — `handlePickStudyMode(seed)` sets the composer input and focuses it
  (`composerInputRef`); rendered inside the `messages.length === 0` empty state.
- **Composer is now a `<textarea>`** (was a single-line `<input>`), since seeds are multiline:
  Enter sends, Shift+Enter inserts a newline, and a small effect auto-grows it to fit content
  (capped at `max-height: 40vh` in CSS). `.study-modes`/`.study-chip`/`.empty-state*` styles added
  to `App.css`, all token-driven.
- Verified: `npm run build` (strict tsc + vite) clean, `npm run lint` (0 errors, pre-existing
  warnings only), `npm test` (27/27). Live-in-app confirmation via `npm run tauri dev` pending.

## Key files (orientation)

- `src/App.tsx` — top-level UI state, chat send/receive loop (`runSend`, with `sendMessage` as its
  form-submit wrapper), wires providers + MCP tools together; also owns catalog-install → SQLite-row
  → keychain-secret → server-start orchestration (`handleInstallFromCatalog`/
  `handleStartMcpServer`/`resolveServerEnv`), the Plugins OAuth flow
  (`handleConnectGoogle`/`handleDisconnectGoogle` — mirrors the catalog-install shape but is driven
  by `oauth_connect`/`oauth_reconnect` instead of a marketplace form; `handleStartMcpServer` branches
  to `oauthReconnect` for any row with `oauth_provider` set), conversation history navigation
  (`handleNewChat`/`handleSelectConversation`/`handleDeleteConversation`/`handleRenameConversation`,
  replaying persisted tool calls interleaved with text via `text_offset`), message
  edit/retry (`handleEditMessage`/`handleRetryMessage`/`truncateFrom`), stream cancellation
  (`handleStopStreaming` via `AbortController`), per-tool "ask" approval (`requestToolApproval`/
  `resolveApproval` + the approval modal), MCP server config editing
  (`handleUpdateMcpServer`/`handleUpdateMcpServerEnv`/`handleEditFilesystemPath`).
- `src/components/Sidebar.tsx` — left-hand conversation history list + collapsible icon rail that
  opens the Providers/MCP Servers/Plugins/Settings panels (Claude-desktop-style shell);
  `src/components/icons.tsx` — the inline SVG icon set it (and the composer's send button) use.
- `src/components/PluginsPanel.tsx` — the "Connect Google Account" card grid (one card per
  `src/lib/googleConnectors.ts` entry), showing live `oauth://progress` status while connecting and
  a per-target "Disconnect" once connected; also renders the collapsible "How to set up Google
  access" Cloud Console instructions (`GoogleSetupInstructions`, `.plugin-setup` styles). `src/lib/
  oauth.ts` — typed frontend wrappers for the `oauth_connect`/`oauth_reconnect` Tauri commands + the
  progress event listener. `src/lib/googleConnectors.ts` — the one place Google's OAuth scopes and
  the six target native providers (`gmail`/`calendar`/`tasks`/`drive`/`docs`/`sheets`) live, plus
  `DESTRUCTIVE_GOOGLE_TOOLS` (seeded to "ask" at connect time); see "Google Workspace" below.
- `src/lib/curatedMcp.ts` — the hand-curated `CatalogEntry[]` (Notion + Filesystem/GitHub/Brave
  Search) that backs the Discover "Popular" section for instant paint; installs through the existing
  marketplace flow. See "Discover performance" above.
- `src/lib/studyTemplates.ts` / `src/components/StudyModes.tsx` — the "study modes" prompt-template
  palette on the empty chat screen (see "Study modes" above).
- `src/lib/exportChat.ts` — transcript builders + Google-Docs helpers for the header "Export" menu
  (see "Export a chat → document" above).
- `src/lib/attachments.ts` / `src/components/MessageAttachments.tsx` — composer file attachments:
  text/PDF parsing (`pdfjs-dist`) and the collapsed per-file display in user messages (see "Chat
  file attachments" above).
- `src/lib/providerRouter.ts` — client-side multi-provider failover + streaming + tool-call events,
  including session-scoped tools-unsupported detection (skip a tool-incapable model on tool turns,
  fail over with reason "model can't use tools").
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
  key-gated ones once an API key is entered), returning `ModelInfo[]` (`{ id, supportsTools? }`)
  with per-provider parsing/filtering, tool-capability from first-party metadata merged with the
  models.dev catalog, and graceful fallback to `null` on any failure.
- `src/lib/modelCatalog.ts` — fetches/caches the external models.dev capability catalog
  (`fetchModelCatalog`, memoized + `localStorage` ~24h TTL) and `lookupToolSupport(catalog, type,
  id)` mapping our `ProviderType`/model id onto the catalog's `tool_call` flag; degrades to
  "unknown" (never throws) so the UI is never blocked.
- `src/components/McpPanel.tsx` — installed/discoverable MCP server management UI behind an
  `Installed`/`Discover` tab switcher (`.mcp-tabs`). Installed tab: pinned cards (Filesystem + any
  OAuth-connected server, via `server.oauth_provider != null` — no longer a name regex) above a
  searchable "All servers" list, start/stop/remove, inline config editing (`EditServerForm`:
  name/folder/url/env vars — hidden for OAuth-backed rows, which point to the Plugins panel
  instead), and an expandable per-tool permission list
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
  both funnel into `finish_start`. Also owns the OAuth background refresh lifecycle: a
  `refresh_tasks` map alongside `running`, `stop()` aborting any refresh task before tearing down
  the connection, and `spawn_oauth_refresh`/`run_oauth_refresh_loop` (opt-in, called only by
  `oauth::commands` — ordinary marketplace remote-HTTP servers are untouched).
- `src-tauri/src/oauth/` — the Google OAuth engine: `flow.rs` (PKCE, the from-scratch loopback
  redirect listener, authorize-URL building, token exchange/refresh — Tauri-free and `cargo
  test`-covered), `config.rs` (client id/secret placeholders + `is_configured()`), `commands.rs`
  (`oauth_connect`/`oauth_reconnect` Tauri commands, fan out one consent screen to N MCP server
  targets). See "Google Workspace" below for status/prerequisites.
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
