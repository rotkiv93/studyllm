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
| Chat export (clipboard Markdown, Google Doc, **Save as `.md` / `.docx` / PDF** via the native save dialog, with an "answers only" toggle), file attachments (text/PDF/docx) | Done |
| RAG "chat with your documents" | Done |
| Deep Research (system-prompt + step-budget layer over the tool loop) | Done |
| **Practice quiz** — Library "Quiz" tab (also a button per document): N multiple-choice / short-answer questions from a document's passages, immediate feedback, score, review of missed ones, attempt history | Done (not yet run in the app) |
| **Course** — 11 interactive modules: each lesson is one flow of visual blocks, annotated screenshots of the app and task cards that *are* the exercise (embedded chats, setup forms, calculators, quizzes); progress persists; replaced the old Explore panel | Done |
| **Lab bar** — always-visible right-hand bar (minimized rail ⇄ expanded) laid out like Google AI Studio's run settings: provider + model pickers, system instructions, temperature slider, tools, advanced; replaced the in-composer Chat Lab and mode chips | Done |
| **OmniRoute mode** — the app downloads, starts, stops and manages OmniRoute (and the provider keys inside it); an either/or switch against your own provider keys | Done |
| **Free-quota meter** — "N requests today" per provider in the Providers list and the Lab bar's model section, from `provider_usage`; soft bar against an optional manifest `dailyRequestLimit` (rough estimate, labelled as such), warning at ≥80%, cooldown countdown from `ProviderRouter.getCooldowns()`; refreshed after each send; day boundary is local midnight (`localDateKey`) | Done |
| **Ollama provider** (issue #7) — `type: "ollama"` (`local`, `keyless`), `http://localhost:11434/v1`, no key; Providers panel shows whether Ollama is running + install link; installed models from `/api/tags`, tool badge from `/api/show` capabilities; sits in the normal failover order; Course module 8 task is now an auto-checked `ollamaConnected` | Done |
| **In-app auto-update** — Settings → "App updates" (check, notes, signed download, install + relaunch) plus a launch-time notice; release-please opens version-bump release PRs and builds draft releases with a signed `latest.json` | Code done — **needs signing-key secret + first release to verify end to end** (see CI / release) |
| **In-app auto-update** — Settings → "App updates" (check, notes, signed download, install + relaunch) plus a launch-time notice; release-please opens version-bump release PRs and builds draft releases with a signed `latest.json` | Code done — **needs signing-key secret + first release to verify end to end** (see CI / release) |
| CI + release pipeline (unsigned installers, draft release); PR checks: fmt/clippy, 3-OS build, Conventional Commit enforcement, security scans, Dependabot, auto-labels | Done by design — new checks not yet verified on GitHub or marked required |
| Onboarding wizard, crash log, marketing site (ES/EN; covers Course, Lab bar, OmniRoute, Deep Research, Drive write tools, ranked Discover; screenshots retaken 2026-10-18 except `attachments.png`; library/RAG shots use demo documents) | Done |

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

**OmniRoute (`type: "omniroute"`, `local: true`)** is still just an OpenAI-compatible provider row as far as the
router is concerned (third-party, MIT, `v3.8.x`, needs Node ≥22.22 or ≥24 — the app's portable Node satisfies
it). Integration surface: default `baseURL` `http://localhost:20128/v1`, key stored as
`LOCAL_ROUTER_PLACEHOLDER_KEY` (the keychain can't hold an empty secret), live model list from `<baseURL>/models`,
kept out of the first-run wizard; the CSP's `connect-src` allows `http://localhost:*` / `http://127.0.0.1:*`. How
it is *run and used* is the "OmniRoute mode" section below. The models.dev capability catalog has no entry for
it, so its models are unbadged.

**Ollama (`type: "ollama"`, `local: true`, `keyless: true`)** is a normal own-provider row (listed, reorderable and failed over like the hosted ones, unlike OmniRoute) with default `baseURL` `http://localhost:11434/v1` and the placeholder key. `fetchProviderModels` lists installed models from the native `<baseURL minus /v1>/api/tags` (embedding models filtered) and asks `/api/show` for each one's `capabilities` to badge tool support. `pickBestModel` prefers suggested families (tagged ids like `llama3.2:latest`), then anything installed. Left out of the first-run wizard and KeyGuide. `/api/show` results are cached per host+model and capped at 50 models per listing; no `Authorization` header is ever sent to a keyless provider. Known: on webviews whose origin Ollama does not allow by default (Windows `http://tauri.localhost`), Ollama may need `OLLAMA_ORIGINS=tauri://localhost,http://tauri.localhost` (never `*`, which would open it to any website) — shown as a hint only after "Check again" still fails. Not verified against a live Ollama in this environment (unit tests mock fetch); the `tauri dev` run was not done here. Do not auto-enable its subscription/`tos: avoid` routes.

### OmniRoute mode (`omniroute.rs`, `lib/omniroute.ts`, `components/OmniRouteView.tsx`)

Providers is **either/or**: a switch at the top of the Providers panel (and in Course module 1) chooses
**My providers** (your own keys, with automatic failover) or **OmniRoute**. Persisted in `localStorage`
`studyllm.provider.mode`; the router (`refreshProviders`) is configured only with the rows of the active mode
(`activeProviders` in `App.tsx`), so the other mode's providers stay saved but paused.

- **Managed process.** Choosing OmniRoute makes the Rust side run `npx omniroute@3.8.48 serve --no-open
  --no-tray --port 20128` (reusing `ensure_npx`, so no manual Node install), bound to **127.0.0.1 only**
  (`OMNIROUTE_SERVER_HOST`). It keeps the last log lines for the UI and kills the whole process tree (OmniRoute's
  CLI supervises a separate server process) on switching away, via `omniroute_stop`, and when the app quits
  (`RunEvent::Exit`). The version is pinned on purpose. It auto-starts with the app while in OmniRoute mode.
- **Slow first run.** The first start downloads ~hundreds of MB through npm and took ~10 minutes in testing;
  later starts take a couple of minutes (the first request is slow while it warms up). The UI says so and shows
  the live log line.
- **Keys live inside OmniRoute.** OmniRoute answers `/v1/models` without a key, but **chat only works once it
  holds at least one upstream key** — with none, a request spends minutes failing across ~50 upstreams and
  returns "Maximum combo retry limit reached". `OmniRouteView` therefore manages them: list / add / test /
  switch off / remove, through the Rust command `omniroute_api` (signs in to the dashboard API with the default
  password `CHANGEME`, keeps the session cookie, only allows `/api/providers…` paths; if the student changed
  the password the panel asks for it, `omniroute_set_password`). Our provider types map to OmniRoute ids in
  `OMNI_PROVIDER_IDS` (`github-models` → `github`; the ids for the other hosted types were not all verified
  against OmniRoute's catalog — only `groq` was exercised end to end).
- **Chat guard.** In OmniRoute mode `runSend` first checks the router answers and has an active key, and says
  what to fix instead of hanging. A router failure is also surfaced with its own message (`routerFailure` on the
  `exhausted` event) and is never cooled down / auth-disabled, since the student is about to add a key.
- **Default model** is OmniRoute's own `auto/best-chat` combo (the old plain `auto` is not a valid id).
- **Not verified:** a successful chat answer through OmniRoute — that needs a valid upstream key, and none was
  added during development. Everything up to the request reaching OmniRoute and being routed was exercised.
- The old manual "connect to a local router" form and the standalone OmniRoute provider entry in the add grid
  are gone; a router the student launched themselves on port 20128 is still detected ("running — you started
  it yourself").

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

On startup the app re-adopts MCP servers the Rust host is still running (`isMcpServerRunning` → `listMcpTools`),
so a webview reload doesn't leave the chat with no tools while the panel says "running".

Deep Research refuses to send when no research tool is running (`error.researchNeedsTools`) — otherwise the
model is told to cite sources it has no way to fetch and invents them.

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

**Curated MCP cards** (`CURATED_ENTRIES` / `CURATED_ICONS` in `curatedMcp.ts`): each has an emoji icon on its card
(registry results keep the letter avatar); installed servers get one via `mcpServerIcon`; providers have `providerIcon` (`providers.ts`) in the Providers list/picker, onboarding and Course setup; Filesystem is listed first; **Memory** (`server-memory`, keyless) was added.

**Discover tab order is a teaching order** (`CURATED_META` + `curatedInDisplayOrder` in `curatedMcp.ts`; `McpMarketplace.tsx`): "Start here" (no account: Filesystem, Web Reader, **DuckDuckGo Search**, Wikipedia, OpenAlex, **arXiv**, Memory, **Time**) then "Connect your accounts" (Notion, GitHub, Brave — need a key), then the registry results under "More tools from the directory". A curated card shows plain-language copy (`market.c.<slug>.does`), a sample question to ask (`.try`) and a badge for what it needs (no account / pick a folder / needs a key), instead of the English registry description; a test enforces that "start here" never needs a key. The three new servers are `uvx duckduckgo-mcp-server`, `uvx arxiv-mcp-server`, `uvx mcp-server-time` (each handshake-tested, SDK-pinned upstream). **DuckDuckGo is also in `RESEARCH_TOOL_CATALOG_IDS`**, so "Set up research tools" now gives Deep Research real web *search* (before: only fetch-a-known-URL, Wikipedia, OpenAlex). Not yet looked at in the running app.

### RAG (`src/lib/rag.ts`, `chunking.ts`, `embeddings.ts`)

Migration **v7** adds `rag_documents` + `rag_chunks` (embeddings as JSON `TEXT` — SQLite has no
vector type). Pipeline: `parseAttachment` → `chunkText` (~1000 chars, ~150 overlap) → `embedTexts` →
store; `retrieve()` embeds the query, ranks by cosine **in TypeScript** over every chunk, takes
top-k; `buildRagSystemBlock` injects the grounding directive (answer only from passages, cite
`[DocName p.12]` / `p.12–13` when a page is known, else `[DocName #seq]`; admit gaps) via the router's
`system` param.

**Page-aware PDFs (migration v10, nullable `page_start`/`page_end` on `rag_chunks`).** `parseAttachment`
returns per-page `PageSpan`s for PDFs; `chunkText({ pages })` tags each chunk with the pages it touches
(overlap tails inherit the previous chunk's last page; hard-split windows are exact). docx/txt and chunks
indexed before v10 stay null and cite `#seq`. `chunkTag`/`formatPages` (rag.ts) feed the system block, the
Retrieved-sources card, the retrieval passage dialog and the Library passage list; a PDF with no page data
shows a "remove and add again (re-index)" hint — there is no in-place re-index since the original file isn't stored.

`retrieveExplained()` is the explorer's variant — keeps the full scored list + query/chunk vectors
that `retrieve()` discards. `retrieve()` itself is untouched by it.

**Library as a window into the index** (`LibraryPanel.tsx`): three tabs — Documents, **Map**, Embedding model.
Documents shows stat tiles (documents / passages / numbers per passage), and each document opens to its
passages (`loadLibraryChunks()` in `rag.ts` decodes the stored vectors; read only while a non-settings tab is
open). Every passage carries a **fingerprint** (`viz/Fingerprint.tsx`, math in `lib/ragInsights.ts`): the
embedding squeezed into ~48 coloured cells. The passage dialog of the Retrieval explorer shows the question's
fingerprint next to the passage's. The Map tab (`viz/LibraryMap.tsx`) is a PCA scatter of *all* passages coloured
per document (`--viz-1…6` tokens). A notice appears when documents were indexed with **different embedding models**
(their vectors aren't comparable). `fitToView` is shared by `EmbeddingMap` and `LibraryMap`.

Embeddings require a **Gemini or Mistral** key (`EMBEDDING_CAPABLE`); config lives in `localStorage`,
the key is resolved from the keychain at call time.

Gemini's default embedding model is `gemini-embedding-001`; Google retired `text-embedding-004` (the API
answers 404), so `loadEmbeddingConfig` maps that old id to the new one for configs saved earlier. Library
documents are capped at `LIBRARY_MAX_CHARS` (300 000 chars) each — much higher than the 20 000 of a chat
attachment, with a notice when a file is cut. Lib code reports student-facing failures through
`LocalizedError` (`lib/localizedError.ts`, `errorText(t, err, fallback)`) and `resolveEmbedder` returns an
`errorKey`, so none of those messages is hardcoded English any more.

### Practice quiz (`lib/quiz.ts`, `components/QuizPanel.tsx`)

Tab inside the Library. `selectPassages` spreads up to 8 passages evenly over the chosen document (or, with an
optional topic, ranks them with `retrieve()` and keeps that document's hits); the model gets them numbered and an
"ONLY from these passages" directive and returns a tiny JSON schema (`{questions:[{type,question,options,answer,
explanation,passage}]}`). `parseQuiz` tolerates code fences / chatter / a bare array and drops invalid questions;
every question keeps its `passage` number, shown as a collapsible source after answering. Short answers are graded
by the model against that passage (`buildGradePrompt`/`parseGrade`, labelled "Graded by the AI"). The model call is
`askModel` in `App.tsx` (failover router, no persistence). Attempts persist in `quiz_attempts` (**migration v11**,
`insertQuizAttempt`/`listQuizAttempts`). Prompts stay English. **No flashcards feature exists**, so "send missed to
flashcards" is not done. Verified by typecheck, lint, build and `quiz.test.ts`; `cargo check` and the running app
were not available in the environment that wrote it.

### UI shell

One top bar (`AppTopBar` in `components/AppTopBar.tsx`) spans the app: on the left the **sidebar
toggle and the app name together**, in the centre the **Chat | Course mode switch** (with a Course
progress badge), and an empty balancing cell on the right so the switch stays truly centred. The toggle
collapses whichever left bar is showing, using one shared `sidebarCollapsed` state (persisted in
`localStorage` `sidebarCollapsed`).

- **Chat mode** — Claude-desktop-style: left `Sidebar.tsx` (conversation history, prominent Library
  button, a collapsible **Settings** disclosure holding Providers / Tools & Connections / Accounts
  (Plugins) / Diagnostics) + the chat panel. The collapsed icon rail keeps every config destination flat
  via the shared `configItems` array.
- **Course mode** — the chat sidebar is hidden and the left bar becomes the lesson list
  (`CoursePanel` renders its own `<aside className="sidebar course-sidebar">` + `<main>`); collapsed, it
  shrinks to a rail of lesson numbers. The last mode is remembered in `localStorage` `studyllm.mode`.
- Switching modes **never unmounts the chat**: the Sidebar and the chat `<main>` get `hidden`, so a reply
  that is still streaming keeps going and half-typed state survives. `.sidebar[hidden]` /
  `.main-panel[hidden]` need their own `display: none` rules (the base rules set `display: flex`).

Empty chat screen is deliberately **minimal**: a greeting plus one compact row of `featured` starter
prompts, with "Browse all ▾" expanding the full topic-grouped library. Explainer cards were
removed on purpose — the Course teaches the same concepts live. Don't re-add them.

Every `settings-overlay` panel (Providers, Library, Tools, Accounts, Diagnostics) closes on Escape via
`useEscapeClose` (`lib/useEscapeClose.ts`); with two overlays stacked, the top one owns Escape. Sending is
guarded by `sendLockRef` in `App.tsx` (state-based `isStreaming` lags a render, so a double Enter used to
send twice). A user-pressed Stop (`AbortError`) is not written to the crash log.

`McpPanel` has `Installed`/`Discover` tabs; `McpMarketplace` is inline tab content, not its own
overlay. Its install-confirmation step is the one remaining true nested modal.

**Interface language (`src/lib/i18n.tsx`, `src/lib/locales/`)** — ES/EN toggle, Spanish default,
persisted in `localStorage` under `studyllm.lang`. Components read strings via `useT()`.
**Coverage is complete: every user-facing surface is localized** — `es`/`en` at exact
parity (same key set, same `{placeholder}` names in both; enforced by the `en: Messages` type and by a
parity test in `lib/course/checks.test.ts`). The Course copy lives in its own files,
`locales/course.es.ts` / `course.en.ts`, spread into `es`/`en`. This includes the panels that were
missed in the first pass: `McpPanel` (tabs, server cards, status words, tool-permission dropdown,
edit form, error strings), `McpMarketplace`, and all the playground bodies — `TokenExplorer`,
`PromptPlayground`, `RetrievalExplorer`, `GroundingContrast`, `McpToolExplorer`,
`ResearchTrace` — plus `viz/SimilarityRanking.tsx` and `viz/EmbeddingMap.tsx`.
`ResearchTrace` now renders research-mode names through `researchModeKeys()` (the keys existed but
went unused). `mcpCatalog.ts` exposes `trustTierLabelKey()` / `trustTierTooltipKey()` returning
`MessageKey`s instead of the old `trustTierLabel()` that returned an English literal.

> **i18n is interface-level only. It must never reach the model.** No UI-language directive is
> injected into any system prompt, and no model-facing string is localized. Things that stay
> hardcoded English *in code*, deliberately: research-mode `systemPrompt`s (`researchModes.ts`), the
> RAG grounding block (`buildRagSystemBlock`), Lab preset `text` (`PlaygroundPanel.tsx`), Prompt
> Playground preset `text` + `DEFAULT_USER` (`PromptPlayground.tsx`), and the tool-probe system prompt
> (`App.tsx`). Chip labels,
> tooltips, and descriptions around them *are* localized — the split is label vs. prompt. The one
> deliberate exception: `TokenExplorer`'s sample texts *are* localized, because they're UI demo
> content that never reaches a model and what tokenizes interestingly is language-specific.
> Nothing about retrieval, embedding, or document storage varies by UI language. The student writes
> in whatever language they like and the model answers in kind; switching the UI to English does not
> change a Spanish conversation.

### Course (`CoursePanel.tsx`, `src/lib/course/`)

A full-page learning path (it replaced the old seven-tab Explore modal) built from the class slides
(`IA_Advanced_completo.pdf`, `01-IA_MCP_simpl.pdf`). **n8n is deliberately out of scope.** Eleven modules in four
groups (`COURSE_GROUPS` in `modules.ts`; headings in the lesson list, group name in each lesson banner):
**First steps** — 1 free access (API keys, failover, optional OmniRoute), 2 what a chat AI really is, 3 who makes
what; **Talk to the AI** — 4 prompting, 5 steering (system prompt, temperature), 6 tokens/cost/context; **How it
works inside** — 7 how the app talks to the model (REST), 8 cloud vs local (GPU/Ollama); **Give it superpowers** —
9 RAG, 10 MCP, 11 agents & responsible automation. Access comes *first* because every later lesson has a chat
that needs a provider. (The modules were renumbered once; `migrateCourseModuleOrder` in `db.ts` moves saved
progress from the old ids, once, behind `localStorage` `studyllm.course.order`.)

- **Structure vs copy.** `lib/course/modules.ts` holds each module's tasks (kind, auto-check, embedded tool,
  lab spec, quiz answer index); `lib/course/lessons.ts` holds each lesson's **layout**
  as an ordered list of blocks, *including where each task appears* (a test proves every task is placed
  exactly once and the quiz comes last). Every string is a locale key — lesson text in
  `locales/course.lessons.*.ts`, module headers/tasks/quizzes/suggested prompts in `course.modules.*.ts`,
  shell/labs/setup/demos in `course.es.ts` / `course.en.ts`. A test proves every key exists in both languages.
- **A lesson is one flow, not a page plus a task list.** `components/course/LessonBlocks.tsx` renders a hero
  banner, then typed blocks — concept `cards`, numbered `steps`, `timeline`, `compare`, weak/strong prompt
  `example`s, `callout`s, **`explore`** (tiles you click for a longer explanation, a copyable example prompt
  and a link to the real thing — used for model families, image/audio/video models, study tools, the parts of
  a prompt, MCP), **`shots`** (annotated screenshots, click to enlarge), **`embed`** (an interactive tool in the
  flow) and **`task`** (an interactive task card). Every section title is a button that folds the section. A "Your mission" checklist under the banner
  scrolls to each card. Key scheme for each block kind: header of `lessons.ts`.
- **Task kinds** (`TaskCard.tsx`): `check` (auto-verified from real state by `evaluateCheck`), `do` (an
  embedded tool that reports back when really used — `onRan` on the reused playgrounds), `lab` (a chat in
  the lesson; optional "what did you notice?" confirmation), `manual`, `quiz`, `reflect`. `check`
  works on any kind and a pass is persisted the first time. Optional tasks (router, Ollama, Gmail) never
  hold a module back. After "Reset progress" still-detected checks re-complete by design.
- **Embedded chats** (`course/ChatLab.tsx`, not to be confused with the Lab panel) run through the app's real
  router via `runCourseLab` in `App.tsx` and persist nothing. Four modes: `chat` (history re-sent each turn,
  optional context meter), `samples` (same prompt N times, optional temperature), `compare` (one prompt, two
  providers — a throwaway `ProviderRouter` pinned to one provider), `ab` (two prompts side by side).
  Side-by-side labs add a short English system hint so answers stay comparable.
- **Setup inside the lesson:** `course/ProviderSetup.tsx` (`ProviderSetup`: pick a free provider, paste a key,
  verified like the first-run wizard; `RouterSetup` for OmniRoute), `FilesystemSetup.tsx` (native folder
  picker → `handleAddFilesystemServer`), `LibrarySetup.tsx` (own file or a built-in sample document so there
  is always something to ask about), `RequestInspector` (live request + a real send), `PromptBuilder` ("Try
  it here").
- **Screenshots** live in `public/course/<lang>/<theme>/<name>.png` — Spanish and English, **light and dark** (⚠ the panel/tour/sidebar shots predate the Lab and sidebar redesign and are re-captured on request):
  the lesson picks the set that matches the OS colour scheme (`useColorScheme` in `LessonBlocks.tsx`, live)
  and a missing image simply isn't drawn. They are captured from the real app over CDP (dark via
  `page.emulateMedia({ colorScheme: "dark" })`) with numbered orange markers drawn into the DOM before each
  shot; personal data (folder paths, conversation titles) is masked first. The capture script was throwaway
  and is not in the repo: after UI changes, re-capture the same names (listed in `lessons.ts`,
  `kind: "shots"`) in all four sets. The lessons teach the chat interface itself: module 2 tours the chat
  screen and the Lab bar, module 8 shows Personality/Answer, module 9 the documents switch, module 11 the
  Deep Research switch.
- **Folding.** Task cards and lesson sections both fold (chevron / click the title); a "Hide finished / Show
  all" button in the mission bar folds all done tasks of the module. Fold state is remembered
  (`localStorage` `studyllm.course.folded`); a folded task card's body stays mounted (`hidden`, with an explicit
  `display:none` because the flex rules would otherwise win), so a chat or form keeps its state.
- **Progress persists in SQLite**, so it survives closing the app (verified against the real app: marked
  tasks, full close, cold relaunch). "Continue where you left off" jumps to the first module with a
  required task open; finished modules and the whole course show completion states.
- **State the checks read:** `App.tsx` supplies providers / running MCP servers / Gmail connection / RAG
  document count (`CourseAppState`); `CoursePanel` queries assistant-message and tool-call counts
  (`countAssistantMessages`, `countToolCalls`) and whether a configured OmniRoute answers `/models`.
  "Ask permission" only counts hand-set permissions on non-OAuth servers (Google tools default to `ask`).
- **Progress** lives in SQLite table `course_progress(task_id, status, note, updated_at)` — **migration
  v9**. "Copy report" builds a Markdown report (`lib/course/report.ts`) for the students' written memoria.
- **Module 9 (RAG)** is the longest lesson: why RAG exists → 5-step pipeline → with/without → **`ChunkingPlayground`**
  (`course/ChunkingPlayground.tsx`, no key needed, runs the real `chunkText`, highlights the overlap; task
  `m9.chunking`) → an `explore` block on what an embedding is → Library upload task → a tour of the Library's
  new views → Retrieval explorer → grounding comparison → an `explore` block on why RAG fails → quiz.
- **Other demos:** `KeyGuide` (key links straight from the provider manifest), `PromptBuilder` (model-facing
  scaffolding is English by the i18n rule; see `lib/course/promptBuilder.ts`), `VramEstimator` and
  `CostEstimator` (`lib/course/estimates.ts`; the cost demo shows the history being
  re-sent every turn). The reused playgrounds are unchanged: `TokenExplorer`, `PromptPlayground`,
  `RetrievalExplorer`, `GroundingContrast`, `McpToolExplorer`, `ResearchTrace`.
- **The chat stays mounted** (`<main hidden>`) while the Course is open, so an in-flight reply isn't lost.
- Callbacks the playgrounds need (`runExploreAnswer`, `runToolProbe`, `runResearchTrace`, `runCourseLab`) are
  in `App.tsx`.

### Lab bar (`PlaygroundPanel.tsx`)

A bar on the right of the chat that is **always there**: a narrow rail by default (four icons — System
instructions, Creativity, Tools, Advanced — each with a dot when something in it is on) and expanded with the
chevron at the very top (state in `localStorage` `studyllm.lab.open`; floats over the chat below 70rem when
expanded). The expanded layout follows Google AI Studio's "Run settings": the **model** on top (the provider
that answers first — read-only, failover is automatic), then collapsible sections — **System instructions**
(preset chips + textarea + token count), **Creativity (temperature)** (a real 0–1 slider with a numeric box),
**Tools** (Deep Research switch + depth, Your documents (RAG) switch) and **Advanced settings** (top-p slider,
max-length slider). Every setting is opt-in: untouched shows "Auto" (stored as `null`, so the provider keeps
its own default); the small arrow next to a value returns to Auto, the arrow in the header resets everything.
No explanatory prose — the Course teaches what each setting does. Settings apply to the real chat and are
saved per conversation. Hidden in Course mode with the rest of the chat. It replaced the in-composer "Chat
lab" *and* the mode chips, "How does this work?" link and mode captions that used to sit above the composer.

Also removed from the chat as redundant with the Course: the study-mode starter chips
(`studyTemplates.ts`/`StudyModes.tsx`) and the onboarding "features" step. The empty chat just says "Write
your first message".

### Settings panels (Providers, Tools, Accounts)

Simplified so each fits on screen without scrolling. **Providers** (own mode): the mode switch, then a compact
"add a provider" row (provider dropdown — only providers *not* on the list yet — key field, button; the key is
verified by asking the provider for its models and the best tool-capable free one is picked; use "Edit" to change
the model) **above** a one-line-per-provider list (the free-tier note is a tooltip). **Tools and connections
(MCP)**: one list (no pinned/all split, no trust legend — the legend text is each badge's tooltip, no intro
paragraph, search only past 6 servers), one row per server with Start and Tools, everything else (logs,
auto-start, edit, remove) under a "⋯" menu. **Accounts (Plugins)**: one row per account — description clamped to
two lines, a chip per connected service, one Connect/Disconnect button; the Google setup guide stays collapsed.

### Chat layout

Header, messages and composer share one column width (`--chat-column`). Assistant replies are plain text on the
page (no card); yours is a soft accent bubble on the right with its edit/copy buttons under it; the composer is
one rounded card holding the paperclip, the text and send. Each side bar collapses with its **own** chevron at
its top (`.sidebar-head` in the chat bar and in the Course bar), exactly like the Lab on the right — the top bar
now holds only the app name and the Chat | Course switch (centred on the window).

The two most visualization-heavy playgrounds: **Retrieval** (`RetrievalExplorer.tsx` + `viz/
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

### Drive write + Plugins panel redesign

- **Drive write**: scope `drive.file` added next to `drive.readonly`; new tools `drive_create_folder`,
  `drive_create_file` (multipart upload), `drive_update_file` (only files the app created — Google's
  `drive.file` rule). `drive_update_file` defaults to "ask". Verified live (create → update → read).
  Existing users must Disconnect → Connect once to grant the scope.
- **Plugins panel** (`PluginsPanel.tsx`): plugin tools live here, not in the MCP panel (which lists only
  non-OAuth servers). Card per connector with a status pill (Connected / Needs reconnecting / Not
  connected), Connect / Reconnect / Disconnect actions, a tile per service with a master on/off switch
  (all tools → "deny", back on restores destructive tools to "ask"), and a per-service tool list with a
  read/write/danger badge and an Allow / Ask / Off segmented control per tool. A service is "live" only
  if its tools are in `toolsByServer` (cached tools alone don't count).
- **Sidebar badges**: "Herramientas y conexiones" counts running non-OAuth servers; "Cuentas (Plugins)" counts
  running plugin services (so Google shows 6 there, not under MCP).
- **Curated MCP additions**: YouTube Transcripts (`@kimtaeyoon83/mcp-server-youtube-transcript`, no key),
  Obsidian (`@mauricio.wolff/mcp-obsidian <vault>`, folder picker; includes `delete_note`) and Zotero
  (`uvx --from zotero-mcp-server zotero-mcp`, needs `ZOTERO_API_KEY` + `ZOTERO_LIBRARY_ID`). All three verified
  to start and list tools (1 / 14 / 38); Zotero was started with dummy credentials only.
- **Discover ordering** (`mcpCatalog.ts`): the registry is alphabetical with no popularity data, so
  `rankCatalog` scores entries (trust tier, a curated `POPULAR_TOKENS` list, `FEATURED_SERVERS` pinned,
  installable/keyless nudges) instead of the old trust-only sort. The landing view also looks up each featured
  server directly (parallel, failures ignored) and de-dupes by name. Curated "Start here" order: filesystem,
  fetch, DuckDuckGo, YouTube, Wikipedia, OpenAlex, arXiv, Obsidian, memory, time; accounts: Notion, Zotero,
  GitHub, Brave.
- ⚠️ Google OAuth app is in **Testing** mode → refresh tokens expire after 7 days (`invalid_grant`);
  publishing needs Google verification (restricted Gmail/Drive scopes). Reconnect weekly.
- **Microsoft 365 was tried and dropped**: a personal Outlook account has no Entra directory, so apps
  can't be registered without an Azure sign-up (phone + card). The code was removed.

## CI / release

- `.github/workflows/ci.yml` (push/PR to `main`, stale runs auto-cancelled): lint, Vitest, `npm run
  build`; Rust `cargo fmt --all --check`, `cargo check --all-targets`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test` (Ubuntu, with the webkit2gtk/appindicator deps Tauri needs to typecheck); a
  `tauri-build` matrix (Ubuntu/Windows/macOS, `tauri build --debug --no-bundle`) so OS-specific
  breakage shows on the PR, not at tag time; `actionlint` over the workflow files.
- `.github/workflows/pr-checks.yml`: PR title must be a Conventional Commit, every non-merge commit
  subject must be one too (the changelog depends on it), and a non-failing warning when `src/` or
  `src-tauri/src/` changed without `PROJECT_STATUS.md`.
- `.github/workflows/security.yml` (PR, push to `main`, weekly): `npm audit --omit=dev
  --audit-level=high`, `cargo audit`, dependency-review on PRs, CodeQL (JS/TS, Rust, Actions).
  Known-accepted RustSec advisories go in `src-tauri/.cargo/audit.toml`, each with a reason: currently
  `rmcp` RUSTSEC-2026-0189 (server-transport DNS rebinding; we only use the client; needs a 0.9→1.x
  upgrade) and lockfile-only `rsa`/`rkyv` (sqlx's unused DB drivers). `zip` was bumped 2→9 (critical
  `extract()` symlink/SUID advisories; used to unpack downloaded runtimes) and h2/quinn-proto/rustls
  were patched. Unmaintained-crate warnings (GTK3/zbus via Tauri) don't fail the job.
- `dependency-review` needs the repo's **Dependency graph** enabled (Settings → Security) — until it is,
  that job fails with "not supported on this repository".
- `.github/workflows/labeler.yml` + `.github/labeler.yml`: auto-labels PRs by path
  (`frontend`/`rust`/`ci`/`docs`/`deps`). `.github/dependabot.yml`: weekly grouped npm/cargo/Actions
  updates with `build`/`ci` Conventional Commit prefixes. `.github/pull_request_template.md` holds the
  pre-merge checklist.
- None of these are **required status checks** yet — that's a branch-protection setting on GitHub,
  not something in the repo. Until it's set, a red check doesn't block a merge.
- Remaining `npm audit` findings are moderate-only (`sprintf-js` via `mammoth`→`argparse`); the
  only fix is a breaking downgrade of `mammoth`, so they're below the `high` gate.
- **Release flow (release-please):** `release-please.yml` runs on push to `main`, keeps a
  `chore(release): vX.Y.Z` PR open (bumps `package.json`, `package-lock.json`, `tauri.conf.json`,
  `Cargo.toml`/`Cargo.lock`; writes `CHANGELOG.md`; config in `release-please-config.json` +
  `.release-please-manifest.json`). Merging it creates a **draft** release and calls `release.yml`
  (now `workflow_call`/manual dispatch only — **no `v*` tag trigger**, since publishing the draft creates
  the tag and would build twice) which matrix-builds installers via `tauri-apps/tauri-action` (macOS
  aarch64 + x86_64, Ubuntu 22.04, Windows) and uploads the signed `latest.json`. Publishing the draft is
  the manual step that ships the update. `cliff.toml`/git-cliff were removed (release-please writes the
  notes). **Not yet exercised end to end** — needs the one-time setup below, then a first release PR.
- **Auto-update (Tauri updater):** `tauri-plugin-updater` + `tauri-plugin-process` (desktop-only,
  registered in `lib.rs`; `updater:default` + `process:allow-restart` in `capabilities/default.json`;
  `bundle.createUpdaterArtifacts` + `plugins.updater` {pubkey, endpoint
  `releases/latest/download/latest.json`, Windows `passive` install} in `tauri.conf.json`). Frontend:
  `src/lib/updater.ts`; `AppSettingsPanel` has an "App updates" section (version, check, notes, install
  with progress, relaunch); `App.tsx` does a silent check on launch and shows a notice. Skipped in dev
  (`import.meta.env.DEV`). Installers stay OS-unsigned/un-notarized; *updates* are minisign-verified.
- ⚠️ **One-time setup still required (maintainer):** add repo secrets `TAURI_SIGNING_PRIVATE_KEY`
  (contents of `~/.tauri/studyllm.key`, generated on the maintainer's machine; the committed pubkey
  matches it) and optionally `..._PASSWORD`; enable "Allow GitHub Actions to create and approve pull
  requests". `release.yml` fails early with a clear message if the key secret is empty (an unset secret
  is forwarded as an empty string, which otherwise breaks the bundler late). Losing the private key =
  installed apps can never update again.
- Release-PR caveat: PRs opened by `GITHUB_TOKEN` don't trigger other workflows, so CI doesn't run on the
  release PR until it is closed/reopened or pushed to.
- macOS/Linux release jobs are untested on real hardware.

## Last QA pass (multi-persona, real app over CDP)

Fresh install → providers (Gemini only, failover with a dead/invalid-key/missing-secret provider, all
disabled, none), Lab presets/temperature/top-p/max-length, Deep Research (all five modes + the gate),
MCP (curated research servers, filesystem incl. path-escape attempt, Notion start, allow/ask/deny
approval), library RAG (txt/PDF/empty/oversized, grounded and out-of-document questions), Course
(tour, quiz/lab tasks), EN/ES parity, double-Enter, Stop, reload mid-stream, rename/delete.
**Not exercised:** the wizard's success path with a real key, Google OAuth consent, OmniRoute start
(hundreds of MB download), native folder picker, scanned-PDF OCR.

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
- The curated **Web Reader** (`mcp-server-fetch`) is launched with an explicit `--with "mcp<2"` pin
  (`FETCH_SDK_PIN` in `src\lib\curatedMcp.ts`): upstream declares an unbounded `mcp>=1.1.3`, so uvx
  otherwise resolves the 2.x Python SDK, which renamed `McpError` → `MCPError` and makes the server
  die on import. Because an install freezes its argv into `args_json`, `repairStoredMcpArgs` in
  `App.tsx` rewrites already-installed rows at startup. Drop both once upstream ships a 2.x-compatible
  build.

**RAG / Research**
- Retrieval is **O(n)** cosine in TypeScript over every stored chunk — fine at tens of docs, not
  thousands. Requires a Gemini or Mistral key.
- The retrieved-sources card is **session-ephemeral** (absent after reload). Persisting citation
  records is a noted follow-up.
- Playground visualizations are live-only, not persisted; the 2D maps (retrieval and Library) are a PCA
  approximation (a teaching lens, not a precise metric). The Library map projects every stored chunk in the
  webview, so it will get slow in the thousands.
- ⚠️ The new Library/Map/fingerprint UI and module 9 were verified by typecheck, lint and unit tests
  (`ragInsights.test.ts`) only — **not yet clicked through in the running app with real documents**. The module-9
  screenshots in `public/course/` predate the Library redesign.
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
- **Export**: Notion page target. (Local `.md`/`.docx`/PDF saving is done: `src/lib/exportFile.ts` builds an `ExportDoc` (title, date, model, attachment names, library sources) and renders Markdown / `docx` / `pdf-lib`; bytes are sent as a raw IPC body to the `save_export_file` Rust command (absolute path with `.md`/`.docx`/`.pdf` extension only) after the dialog plugin's `save`. PDF uses standard Helvetica/Courier, so characters outside WinAnsi (e.g. CJK) print as `?`; use `.docx` for those. Library sources are only included when still in the live session — they aren't persisted.)
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
  `toolSchema.ts`, `attachments.ts`, `exportChat.ts`, `curatedMcp.ts`,
  `googleConnectors.ts` — the pure/near-pure logic modules, most unit-tested.
- `src/components/` — `Sidebar.tsx`, `icons.tsx` (inline SVG set, no icon library), `McpPanel.tsx`,
  `McpMarketplace.tsx`, `ProvidersPanel.tsx`, `AppSettingsPanel.tsx` (Diagnostics/crash log),
  `PluginsPanel.tsx`, `LibraryPanel.tsx`, `PlaygroundPanel.tsx`, `CoursePanel.tsx` + `course/*` + `RetrievalExplorer.tsx` /
  `ResearchTrace.tsx` / `viz/*`, `ToolCallBlock.tsx`, `Markdown.tsx`, `MessageAttachments.tsx`,
  `RetrievedSources.tsx`, `OnboardingWizard.tsx`.

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
  To exercise data-dependent UI in a plain browser anyway, inject a tiny in-memory
  `window.__TAURI_INTERNALS__.invoke` mock via Playwright `addInitScript` (answer `plugin:sql|load` /
  `select` / `execute`); it is enough to drive the Course end to end. Real persistence still needs the
  native app.
- The native build needs the **Rust toolchain** (`winget install Rustlang.Rustup`) plus the MSVC Build
  Tools; the first `tauri dev` compile takes ~6 minutes, later ones under a minute. If `cargo` is "not
  found" in a shell, refresh `PATH` from the Machine/User environment first.
- Driving the real app over CDP overwrites the maintainer's real `studyllm.db` — undo test data (e.g.
  Course "Reset progress") when done.
