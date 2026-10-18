# CLAUDE.md

- Always search for available skills before doing anything. 
- Always execute the npm run tauri dev command to run the full desktop app  so i can see the changes in the app.
- After successfully completing a task, update the `PROJECT_STATUS.md` file to reflect the current state of the project.

- Always try to apply css variables to css styles instead of hardcoding values.

- When making a commit, use a [Conventional Commits](https://www.conventionalcommits.org/) message
  (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `style:`, `test:`, `build:`, `ci:`, `chore:`,
  `revert:`, optionally with a `(scope)`). Release notes and version bumps are generated from these prefixes by release-please
  (`release-please-config.json`, `.github/workflows/release-please.yml`) — see README "Commit
  messages → changelog".

## Commands

```
cd studyllm
npm install          # install JS dependencies
npm run dev           # start Vite dev server only (web preview, no Tauri shell)
npm run tauri dev     # run the full desktop app (spawns Vite dev server itself)
npm run build          # tsc typecheck + vite production build of the frontend
npm run tauri build   # produce a native installer/binary via Cargo + the built frontend
npm run preview       # preview the built frontend
npm run lint          # ESLint (flat config, eslint.config.js)
npm test              # Vitest (src/**/*.test.ts)
```

`npm run build`'s `tsc` step is strict mode with `noUnusedLocals`/`noUnusedParameters` enabled —
unused vars/params are build errors, not just warnings.

Rust side (`src-tauri/`) can be checked directly with `cargo check` / `cargo build` from within `src-tauri/` if iterating on Rust without wanting a full `tauri build`. `cargo test` runs the `#[cfg(test)]` suite (currently `mcp/registry.rs`).

## PR checks — verify before and after opening a PR

CI (`.github/workflows/`) gates every PR to `main`. Don't leave a red check for the user to
discover — run the same commands locally first, and after pushing, watch the PR's checks and fix
whatever fails.

**Before pushing / opening a PR**, run what CI runs (skip the Rust ones if nothing under
`src-tauri/` changed):

```
npm run lint && npm test && npm run build          # from the repo root
cd src-tauri
cargo fmt --all --check                            # run `cargo fmt --all` to fix
cargo clippy --all-targets -- -D warnings          # warnings are errors
cargo test
```

(`cargo` may not be on PATH in this shell — use `~/.cargo/bin/cargo`.) Also run
`npm audit --omit=dev --audit-level=high` if you touched `package.json`/the lockfile, and
`cargo audit` if you touched `Cargo.toml`/`Cargo.lock` and it's installed.

Other things CI enforces that you must satisfy up front:
- The **PR title and every non-merge commit subject** must be a Conventional Commit
  (`type(scope): subject`) — `pr-checks.yml` fails otherwise. Fix a bad commit before pushing
  rather than after (once it's on the PR branch it needs a rebase/force-push, which needs the
  user's OK).
- `PROJECT_STATUS.md` should be updated when a feature changes (CI only warns, but see below).
- Fill in `.github/pull_request_template.md` when creating the PR body.

**After opening / pushing to a PR**, check the results with `gh pr checks <pr> --watch` (or
`gh run list` / `gh run view <id> --log-failed`). If a check fails, read the failing log, reproduce it
locally, fix the cause, and push a new commit (Conventional Commit format) — repeat until green.
Don't disable a check, add `#[allow(...)]`/`eslint-disable`, or loosen a threshold just to get green
unless the finding is a verified false positive; say so explicitly if you do. If a failure is
unrelated to your change (flaky runner, pre-existing advisory), tell the user instead of papering
over it. The `tauri-build` job compiles on Windows and macOS, so avoid OS-specific assumptions
(e.g. hard-coded `/tmp` paths in tests) even though you can only run one OS locally.

## Project status doc — read this first

**Before starting work, read `PROJECT_STATUS.md`.** It's the living source of truth for
what's actually implemented vs. not (phase-by-phase), current architecture, known limitations, and
a file map. This CLAUDE.md file covers commands/conventions; PROJECT_STATUS.md covers what exists.

**After making a change that adds, removes, or changes a feature, update
`PROJECT_STATUS.md`** — keep its "Done" / "Not done" / "Known limitations" sections
accurate. Treat a change as incomplete until that doc reflects it.

## Architecture

This is a Tauri v2 app: a React/TypeScript frontend (Vite) rendered inside a native webview, paired
with a Rust backend that handles anything needing OS privileges (keychain, SQLite, spawning local
MCP server processes).

- **Frontend** (`src/`): `App.tsx` is the top-level chat UI and wires providers + MCP tools
  together. LLM calls go straight from the frontend to provider HTTPS APIs via the Vercel AI SDK
  (`src/lib/providerRouter.ts`'s `ProviderRouter`, which does client-side multi-provider rate-limit
  failover) — no Rust hop needed for chat. `src/lib/db.ts` holds all SQLite CRUD;
  `src/lib/credentials.ts` and `src/lib/mcp.ts` wrap the Rust `invoke` commands below.
- **Rust backend** (`src-tauri/src/`): `credentials.rs` (OS keychain via the `keyring` crate),
  `db.rs` (SQLite migrations via `tauri-plugin-sql`), and `mcp/` (local MCP host built on the
  official `rmcp` SDK — spawns/talks to MCP server child processes over stdio, exposed via Tauri
  commands + `mcp://*` events). Register new Tauri commands in `invoke_handler![...]` in `lib.rs`.
- **Storage**: SQLite for everything structured (conversations, messages, providers, provider
  usage, installed MCP servers). API keys and MCP server secrets never touch SQLite — only an
  opaque `secret_ref`/keychain entry does.
- **Tauri config** (`src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`) wires the
  dev server on port 1420 (fixed/strict, required by Tauri) to the native shell, and declares the
  webview's permission set. `security.csp` is a real policy (script/style locked to `'self'`,
  `connect-src` allows `https:` broadly since users point at arbitrary provider base URLs, plus
  `ipc:`/`http://ipc.localhost` for Tauri's own bridge) — if you add an inline script/style or a
  new external host dependency, update it. **Any new
  Tauri/plugin command needs its permission added to `capabilities/default.json` or it silently
  fails at runtime** — e.g. `sql:default` alone does NOT include `sql:allow-execute`; check the
  plugin's own `permissions/default.toml` rather than assuming a `*:default` set is comprehensive.
- Frontend/backend communicate only through Tauri's `invoke` bridge (`@tauri-apps/api`) and
  `listen`/`emit` events (`@tauri-apps/api/event`).

Full details, phase status, and known limitations: `PROJECT_STATUS.md`.
