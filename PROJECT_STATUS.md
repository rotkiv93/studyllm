# StudyLLM — Project Status

Living document. Read this before starting work, and **update it as part of any change** that adds,
removes, or changes a feature. Describe the *current state*, not the history of getting there — git
log covers that. Prune entries that have become "how it has always worked."

## What this app is

A free, cross-platform (Windows/Linux/macOS) Tauri desktop chat client for students who can't afford
a paid LLM subscription. Students paste in their own free-tier API keys (Groq, Cerebras, Gemini,
etc.); the app rotates between them client-side on rate limits. It also gives the LLM local tools via
MCP servers, plus document RAG and a Deep Research mode. Target users are **non-technical** students
(International Relations, documentary/archival) — UI copy uses plain labels first with the real term
in parentheses.

Original architecture/phase plan: `C:\Users\47852\.claude\plans\i-want-to-create-compressed-hartmanis.md`.
Student feature roadmap: `C:\Users\47852\.claude\plans\lets-think-what-are-effervescent-whistle.md`.

## Architecture

- **Frontend** (`src/`): React + TypeScript + Vite. Owns all UI and talks to LLM providers and
  embedding APIs directly over HTTPS via the Vercel AI SDK — no Rust hop for chat.
- **Rust backend** (`src-tauri/src/`): anything needing OS privileges — OS keychain, SQLite, spawning
  MCP child processes, OAuth loopback listener.
- **Storage**: SQLite via `tauri-plugin-sql` (`src-tauri/src/db.rs` = schema source of truth) for
  conversations, messages, tool calls, providers, usage, MCP servers, catalog cache, RAG docs/chunks.
  Secrets never touch SQLite — only an opaque `secret_ref` into the OS keychain (`credentials.rs`).
- **MCP host** (`src-tauri/src/mcp/`): built on the official `rmcp` SDK. Three server shapes — local
  **stdio** children, **remote Streamable HTTP**, and in-process **native** providers (Google
  Workspace REST). `host.rs` (`RunningServer::{Remote,Native}`), `runtime.rs` (npx/uvx bootstrap),
  `registry.rs` (registry search, shared `OnceLock<reqwest::Client>`), `commands.rs` (Tauri surface +
  `mcp://server-status-changed` / `mcp://runtime-log` / `mcp://server-log` events).
- **OAuth "Plugins"** (`src-tauri/src/oauth/`): PKCE + loopback-redirect Google sign-in, feeding
  `McpHost::start_native` with an auto-refreshed access token.

## Feature status

All five original phases are ✅ **done**. Current capabilities:

| Area | State |
| --- | --- |
| Chat, SQLite, keychain, multi-provider failover | Done |
| MCP host: stdio + remote HTTP + native, registry browsing, trust tiers | Done (MVP) |
| Per-tool permissions (`allow`/`ask`/`deny`), editable server configs, logs | Done |
| Live provider model lists + tool-capability badges/filter | Done |
| Google Workspace (Gmail/Calendar/Tasks/Drive/Docs/Sheets, ~30 tools) | Done |
| Study modes, chat export, file attachments (text/PDF/docx) | Done |
| RAG "chat with your documents" | Done |
| Deep Research (system-prompt + step-budget layer over the tool loop) | Done |
| "Explore how it works" visualization playground | Done |
| CI + release pipeline (unsigned installers, draft release) | Done by design |
| Onboarding wizard, crash log, marketing site (ES/EN) | Done |

**Not started**: attachment phases 4–5 (images for vision models; OCR for scanned docs) — see
"Deferred work" below.

## Subsystem notes

### Provider routing (`src/lib/providerRouter.ts`)

`ProviderRouter.streamReply(messages, tools, signal, options?)` does client-side failover across
configured providers. Options: `system` (passed as `streamText`'s **top-level `system` param** —
AI SDK v7 rejects `role:"system"` entries inside `messages`) and `maxSteps` (drives
`stopWhen: isStepCount(...)`, default 8).

Failure handling, all session-scoped (nothing persisted):
- `unwrapError()` unwraps `RetryError.lastError` before classification — the SDK's internal retries
  wrap the real `APICallError`, so status codes are otherwise lost.
- In-stream `part.type === "error"` is re-`throw`n so it runs the same classify/cooldown/failover
  path as a thrown error.
- **Tools-unsupported**: a 400/422 whose text matches tool/function-call phrasing (but *not*
  schema/parameter-validation phrasing) marks that `providerId:model` tool-incompatible for the
  session and fails over with reason "model can't use tools" — no cooldown. When every candidate is
  incompatible, the `exhausted` event carries `toolsUnsupported: true`.
- **Malformed tool call** (`isMalformedToolCallError` — Groq's `tool_use_failed`, delivered as a
  plain object, not an `Error`): retries the *same* candidate up to `MAX_MALFORMED_TOOL_CALL_RETRIES`
  (2) before normal failover. It's transient model garbling, not a capability gap.

### Model capability (`src/lib/providerModels.ts`, `modelCatalog.ts`)

`fetchProviderModels` returns `ModelInfo[]` (`{ id, supportsTools? }`). Tool support resolves in
order: provider's own metadata (OpenRouter `supported_parameters`, Mistral `capabilities`) → the
external **models.dev catalog** (`https://models.dev/api.json`, keyless, memoized + `localStorage`
~24h) → `undefined`. Public catalogs fetch immediately; key-gated providers fetch debounced 500ms
once a key is typed. Any failure falls back to the static `suggestedModels` seed — the model field is
always free-text. `ModelField` badges capability and defaults to a "Tool-compatible only" filter that
hides only *known*-incompatible models. `pickBestModel()` auto-selects a tool-capable free model.

Provider set (`src/lib/providers.ts`) is curated for free-tier tool calling, ordered best-first with
`recommended` flags and `freeTierNote` strings. SambaNova is `deprecated` — hidden from new selection
via `SELECTABLE_PROVIDER_TYPES` but still routes for saved rows.

### MCP tool wiring (`App.tsx`)

`buildMcpTools()` keys each `dynamicTool` as `t${serverId}_${toolName}` via `sanitizeToolKey` — the
`t` prefix is **required**: Gemini's function-calling API rejects names not starting with a
letter/underscore, and ~5/8 of UUIDs start with a digit. `ToolCallBlock.resolveToolLabel` strips it,
falling back to the un-prefixed split for pre-existing persisted rows.

Every tool schema goes through `sanitizeToolSchema()` (`src/lib/toolSchema.ts`), which recursively
drops non-array `required` keys — some servers ship draft-4 `"required": true` inside a property,
which strict providers 400 on.

`McpHost::call_tool` always forwards `arguments` as an object (`{}` minimum) — some servers' zod
validation rejects a missing/null `arguments` for zero-parameter tools.

Tools marked `deny` are filtered out of the `ToolSet` entirely; `ask` tools block on
`requestToolApproval` (a promise resolved by the modal at the bottom of `App.tsx`).

### Deep Research (`src/lib/researchModes.ts`)

Static `ResearchMode[]` (Auto / Compare / How-to / Fact-check / Literature review), each a
`systemPrompt` (decompose → search → read → cross-check → synthesize → cite, ending in `## Sources`)
plus a `maxSteps` budget (14–18). No new engine — it rides the existing agentic tool loop.

Gating uses `isResearchServer(serverName, toolNames)`, keyed on **server identity**: a
`NON_WEB_SERVER_NAME_RE` exclusion (gmail/google/drive/notion/github/…) beats a
`RESEARCH_SERVER_NAME_RE` allow-list (brave/web-reader/wikipedia/openalex/…), with a strict
web-tool-name fallback. A name-only tool regex is wrong — it matches `drive_search_files` and
`gmail_search_messages`. "Set up research tools" both installs missing keyless servers *and* starts
installed-but-stopped ones (curated installs don't autostart).

### RAG (`src/lib/rag.ts`, `chunking.ts`, `embeddings.ts`)

Migration **v7** adds `rag_documents` + `rag_chunks` (embeddings as JSON `TEXT` — SQLite has no
vector type). Pipeline: `parseAttachment` → `chunkText` (~1000 chars, ~150 overlap) → `embedTexts` →
store; `retrieve()` embeds the query, ranks by cosine **in TypeScript** over every chunk, takes
top-k; `buildRagSystemBlock` injects the grounding directive (answer only from passages, cite
`[DocName #seq]`, admit gaps) via the router's `system` param.

`retrieveExplained()` is the explorer's variant — keeps the full scored list + query/chunk vectors
that `retrieve()` discards. `retrieve()` itself is untouched by it.

Embeddings require a **Gemini or Mistral** key (`EMBEDDING_CAPABLE`); config lives in `localStorage`,
the key is resolved from the keychain at call time.

### UI shell

Claude-desktop-style: persistent left `Sidebar.tsx` (conversation history, "Conversations" label,
prominent Library button, and a collapsible **Settings** disclosure holding Providers / Tools &
Connections / Accounts (Plugins) / Explore / Diagnostics) + a right-hand main chat panel. The
collapsed icon rail keeps every destination flat via the shared `configItems` array.

Empty chat screen is deliberately **minimal**: a greeting plus one compact row of `featured` starter
prompts, with "Browse all ▾" expanding the full topic-grouped library. Explainer cards were
removed on purpose — the Explore panel demonstrates the same concepts live. Don't re-add them.

`McpPanel` has `Installed`/`Discover` tabs; `McpMarketplace` is inline tab content, not its own
overlay. Its install-confirmation step is the one remaining true nested modal.

**Interface language (`src/lib/i18n.tsx`, `src/lib/locales/`)** — ES/EN toggle, Spanish default,
persisted in `localStorage` under `studyllm.lang`. Components read strings via `useT()`.
**Coverage is complete: every user-facing surface is localized** — 557 keys, `es`/`en` at exact
parity (same key set, same `{placeholder}` names in both). This includes the panels that were
missed in the first pass: `McpPanel` (tabs, server cards, status words, tool-permission dropdown,
edit form, error strings), `McpMarketplace`, and all seven Explore tab *bodies* — `LessonsPanel`,
`TokenExplorer`, `PromptPlayground`, `RetrievalExplorer`, `GroundingContrast`, `McpToolExplorer`,
`ResearchTrace` — plus `viz/SimilarityRanking.tsx` and `viz/EmbeddingMap.tsx`.
`ResearchTrace` now renders research-mode names through `researchModeKeys()` (the keys existed but
went unused). `mcpCatalog.ts` exposes `trustTierLabelKey()` / `trustTierTooltipKey()` returning
`MessageKey`s instead of the old `trustTierLabel()` that returned an English literal.

> **i18n is interface-level only. It must never reach the model.** No UI-language directive is
> injected into any system prompt, and no model-facing string is localized. Things that stay
> hardcoded English *in code*, deliberately: research-mode `systemPrompt`s (`researchModes.ts`), the
> RAG grounding block (`buildRagSystemBlock`), Chat Lab preset `text` (`ChatLab.tsx`), Prompt
> Playground preset `text` + `DEFAULT_USER` (`PromptPlayground.tsx`), study-template `promptSeed`s
> (`studyTemplates.ts`), and the tool-probe system prompt (`App.tsx`). Chip labels,
> tooltips, and descriptions around them *are* localized — the split is label vs. prompt. The one
> deliberate exception: `TokenExplorer`'s sample texts *are* localized, because they're UI demo
> content that never reaches a model and what tokenizes interestingly is language-specific.
> Nothing about retrieval, embedding, or document storage varies by UI language. The student writes
> in whatever language they like and the model answers in kind; switching the UI to English does not
> change a Spanish conversation.

`ExplorePanel.tsx` is a seven-tab playground (Lessons, Tokens, System prompt, Retrieval, Grounding,
Tools, Research process). The two most visualization-heavy: **Retrieval** (`RetrievalExplorer.tsx` + `viz/
SimilarityRanking.tsx`, `viz/EmbeddingMap.tsx` — hand-rolled inline SVG, no charting lib; hover
cross-highlights, click opens a full-passage dialog with Prev/Next and Escape-to-close) and
**Research process** (`ResearchTrace.tsx` — 6-stage stepper, step-budget bar, sources list, live
cited report). `src/lib/projection.ts` does dependency-free PCA-to-2D via power iteration.

### Design system (`src/App.css`)

Token-driven: every color, spacing, radius, shadow, font size/weight, and transition is a CSS custom
property in `:root`, with a `@media (prefers-color-scheme: dark)` block redefining the same names.
Component rules reference `var(--…)` **exclusively** — never hard-code a value. Button variants:
`.btn-primary/-secondary/-ghost/-danger/-icon` + `.btn-sm`.

⚠️ **CSS specificity trap**: the generic `.provider-list li` rule is `(0,1,1)` and beats any bare
class selector `(0,1,0)` regardless of source order. Any new component nested inside `.provider-list`
must use an `li.`-prefixed selector (`li.mcp-server-card`, `li.tool-perm-row`, `li.provider-edit-row`)
or it silently loses its `align-items`/`padding`/`flex-wrap`. The marketplace's `.marketplace-*`
family sidesteps this by not living under `.provider-list` at all.

⚠️ Flex items in `.messages` need `flex-shrink: 0`, and any child with `overflow: hidden` loses its
automatic min-size floor — that's how tool blocks got squashed to nothing instead of scrolling.

## Google Workspace ("Plugins")

One-click "Connect Google Account" calls the plain **Google Workspace REST APIs** directly (Gmail v1,
Calendar v3, Tasks v1, Docs v1, Sheets v4, Drive v3) as native in-process tools
(`src-tauri/src/mcp/google.rs`).

⚠️ **Do not re-attempt Google's managed MCP servers** (`gmailmcp.googleapis.com` /
`drivemcp.googleapis.com`). This was tried twice and definitively fails: a correctly-scoped token
returns `PERMISSION_DENIED` even with both APIs enabled in Cloud Console, because the Developer
Preview Program requires a **paid Google Workspace account** (its FAQ: "We cannot add service
accounts to the program"). The maintainer's account is a personal `@gmail.com`. No code fix exists.

One consent screen fans out to six `GoogleKind` providers (~30 tools), all one-shot `reqwest` calls
through a shared `google_api_call` helper. Contract: transport failure → hard `Err`; Google 4xx/5xx →
soft `McpCallOutcome{is_error:true}` so the model can reason about it.

**Destructive tools default to "ask"** — `DESTRUCTIVE_GOOGLE_TOOLS` (`googleConnectors.ts`) covers
the send/delete tools; `handleConnectGoogle` seeds `tool_permissions_json` accordingly.

Migration **v6** added `mcp_servers.oauth_provider`/`oauth_expires_at`; Google rows store
`transport: "native"`, `url: null`. `spawn_oauth_refresh` sleeps until ~5 min before expiry then
swaps the token under the provider's `RwLock` — no reconnect, no status flicker.
`handleStartMcpServer` branches to `oauthReconnect` for any row with `oauth_provider` set, since the
previous process's refresh timer died with it.

⚠️ rmcp's `auth_header()` prepends `"Bearer "` itself — pass a **bare** token. (Still relevant for
any future OAuth remote-HTTP server, even though Google no longer uses that path.)

### Cloud Console setup (manual — done for the maintainer)

1. Enable the classic REST APIs: Gmail, Calendar, Tasks, Docs, Sheets, Drive. (**Not** the
   "Gmail MCP API"/"Drive MCP API" managed services.)
2. OAuth consent screen (External) with scopes `gmail.modify`, `gmail.send`, `calendar`, `tasks`,
   `documents`, `spreadsheets`, `drive.readonly`. Add your own account as a test user while in
   Testing mode — personal `@gmail.com` works fine on this consumer OAuth path.
3. OAuth 2.0 Client ID of type **"Desktop app"** — the engine's arbitrary loopback port (bind to
   `127.0.0.1:0`) needs no pre-registered redirect URI.
4. Paste id/secret into `src-tauri/src/oauth/config.rs`. ⚠️ A find-and-replace of the placeholder
   also breaks `is_configured()`, which compares the constant against the *literal* placeholder
   string — keep that comparison as `"REPLACE_ME.apps.googleusercontent.com"`.
5. `npm run tauri dev` → Plugins → Connect.

**Broadening scopes invalidates consent** — every connected user must Disconnect → Connect once.

## CI / release

- `.github/workflows/ci.yml` (push/PR to `main`): lint, Vitest, `npm run build`, `cargo check
  --all-targets`, `cargo test` (Ubuntu, with the webkit2gtk/appindicator deps Tauri needs to typecheck).
- `.github/workflows/release.yml` (on a `v*` tag or manual dispatch): matrix-builds installers via
  `tauri-apps/tauri-action` across macOS aarch64 + x86_64, Ubuntu 22.04 (older glibc = broader
  AppImage/deb compatibility), and Windows → publishes to a **draft** GitHub Release.
- **Code signing and the auto-updater were deliberately removed**, not left unfinished — no paid
  certs, no Apple Developer Program, no signing keypair to maintain. ⚠️ If ever revisited: forwarding
  `${{ secrets.X }}` for a nonexistent secret sets the env var to an *empty string*, not "unset".
  Windows cert handling skips gracefully; macOS `security import` and Tauri's updater-artifact
  signing both choke and fail the build. Git history has the full removed implementation.
- macOS/Linux release jobs are untested on real hardware.

## Known limitations

**MCP**
- npm (`npx`) and PyPI (`uvx`) packages plus remote Streamable HTTP are installable. Docker/OCI
  entries appear in search but are marked `unsupported` — out of scope.
- Trust tiers are a **heuristic, not an audit**: `official` = reverse-DNS under
  `io.modelcontextprotocol*` or a repo under `github.com/modelcontextprotocol/servers`; `verified` =
  any other entry with a github/gitlab repo URL; else `community`. Installing a community server
  still runs arbitrary code as the OS user.
- `npx`-launched servers get a minimal env allowlist (`PATH` + OS/Node essentials + declared
  `required_env`), not the full parent environment. Best-effort — a fully cleared env breaks in
  obscure ways on Windows.
- The Node/uv portable-runtime bootstraps (`runtime.rs`, `NODE_VERSION`/`UV_VERSION` consts — bump
  periodically) are written cross-platform but only exercised on **Windows**. Note the archive-shape
  split: Node is flat on Windows / subfoldered on Unix, uv is the opposite.
- Catalog cache evicts entries older than `CATALOG_CACHE_TTL_DAYS` (14) only after a successful
  *live* search, never on the cache-fallback path — so a long offline stretch can't wipe the fallback.
- Only servers with `autostart` set start on launch; a failed autostart just leaves it stopped.

**RAG / Research**
- Retrieval is **O(n)** cosine in TypeScript over every stored chunk — fine at tens of docs, not
  thousands. Requires a Gemini or Mistral key.
- The retrieved-sources card is **session-ephemeral** (absent after reload). Persisting citation
  records is a noted follow-up.
- Explore visualizations are live-only, not persisted; the 2D map is a PCA approximation (a teaching
  lens, not a precise metric).
- Scanned-image PDFs need OCR (not implemented).

**Provider-side, not app bugs** (the router degrades around all of these)
- Gemini's free tier is ~20 req/day — trivially exhausted by a testing session.
- Mistral `ministral-14b` returns `content:[{type:"reference"}]`, tripping the AI SDK's
  `AI_TypeValidationError` → handled by failover.
- The maintainer's Cerebras account returns `402 payment_required` on every model (account/billing
  state, confirmed outside the app). Resolve at https://cloud.cerebras.ai billing tab.

## Deferred work

- **Attachments phase 4 (vision)**: changes the message *pipeline*, not just parsing.
  `ChatMessage.content` is a plain `string` end-to-end (built in `runSend`, mapped in `priorHistory`,
  passed to `streamReply`, persisted as SQLite TEXT). Vision needs multimodal content parts, a
  per-model vision-capability gate (mirroring the tools one), and an image persistence/replay story.
  Most free-tier target models are text/tool-only — needs its own design pass.
- **Attachments phase 5 (OCR)**: needs a native engine (Tesseract) with a cross-platform bootstrap
  mirroring `runtime.rs`. Its own project.
- **Zotero MCP** (`zotero-mcp`, verified real): needs an API key + library ID, higher friction than
  the current all-keyless curated batch. Add once the env-var install flow is click-verified in-app.
- **Export**: Notion page and local `.md` file targets.
- See `TODO.md` for remaining verification gaps (live Google tool call, forced-fast-refresh test,
  revoke-then-use test, in-app embed→index→retrieve with a real key).

## Key files

**Frontend**
- `src/App.tsx` — top-level state and the chat send/receive loop (`runSend`); wires providers + MCP
  tools; owns catalog-install → SQLite row → keychain secret → server-start orchestration
  (`handleInstallFromCatalog`/`handleStartMcpServer`/`resolveServerEnv`), the Plugins OAuth flow
  (`handleConnectGoogle`/`handleDisconnectGoogle`), conversation navigation (with persisted tool
  calls replayed interleaved with text via `text_offset`), message edit/retry, stream cancellation,
  per-tool "ask" approval, MCP config editing, and `runResearchTrace()`.
- `src/lib/providerRouter.ts` — multi-provider failover, streaming, tool-call events (see above).
- `src/lib/providerModels.ts` / `modelCatalog.ts` / `providers.ts` — model lists, capability, curated
  provider set.
- `src/lib/db.ts` — all SQLite CRUD. `src/lib/mcp.ts` / `mcpCatalog.ts` — MCP wrappers, types, trust
  tiers, cache-aware search. `src/lib/credentials.ts`, `oauth.ts`, `crashlog.ts` — Rust wrappers.
- `src/lib/rag.ts`, `chunking.ts`, `embeddings.ts`, `projection.ts`, `researchModes.ts`,
  `toolSchema.ts`, `attachments.ts`, `exportChat.ts`, `studyTemplates.ts`, `curatedMcp.ts`,
  `googleConnectors.ts` — the pure/near-pure logic modules, most unit-tested.
- `src/components/` — `Sidebar.tsx`, `icons.tsx` (inline SVG set, no icon library), `McpPanel.tsx`,
  `McpMarketplace.tsx`, `ProvidersPanel.tsx`, `AppSettingsPanel.tsx` (Diagnostics/crash log),
  `PluginsPanel.tsx`, `LibraryPanel.tsx`, `ExplorePanel.tsx` + `RetrievalExplorer.tsx` /
  `ResearchTrace.tsx` / `viz/*`, `ToolCallBlock.tsx`, `Markdown.tsx`, `MessageAttachments.tsx`,
  `RetrievedSources.tsx`, `StudyModes.tsx`, `OnboardingWizard.tsx`.

**Rust**
- `src-tauri/src/mcp/` — `host.rs` (running-server registry, `start`/`start_remote`/`start_native` →
  `finish_start`, OAuth refresh lifecycle), `google.rs` (native Workspace tools), `registry.rs`,
  `runtime.rs`, `commands.rs`.
- `src-tauri/src/oauth/` — `flow.rs` (PKCE, from-scratch loopback listener, token exchange/refresh —
  Tauri-free and `cargo test`-covered), `config.rs`, `commands.rs`.
- `src-tauri/src/db.rs` (migrations = schema source of truth), `credentials.rs`, `crashlog.rs`.
- Register new Tauri commands in `invoke_handler![...]` in `lib.rs` **and** add the permission to
  `capabilities/default.json` — otherwise it silently fails at runtime.

**Other**
- `docs/index.html` — self-contained static landing page (no build step, no external assets),
  ES/EN toggle via an inline `I18N` dict + `data-i18n` attributes, **Spanish default** written
  directly into the markup so it renders without JS. Served via GitHub Pages from `/docs` (needs
  turning on in repo Settings → Pages). Screenshots in `docs/screenshots/`.
- `eslint.config.js` — flat config. `src/**/*.test.ts` — Vitest suite.

## Verification conventions

- Standard gate before calling work done: `npx tsc --noEmit` (or `npm run build`), `npm run lint`
  (expect 0 errors; ~5 pre-existing unrelated warnings), `npm test`, and `cargo check` / `cargo test`
  for Rust changes.
- Frontend-only changes hot-reload into an already-running `npm run tauri dev` via Vite HMR — a
  second launch just errors with "Port 1420 already in use" (expected, port is fixed/strict).
- For live in-app verification, drive the real app over **WebView2 CDP**: launch with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and attach Playwright's
  `connectOverCDP`. Reading code for correctness has repeatedly missed real bugs that this catches.
- Playwright against plain `npm run dev` validates CSS/layout only — Tauri `invoke` no-ops outside
  the native shell, so nothing data-dependent is exercised.
