# CLAUDE.md

- Always search for available skills before doing anything. 
- Always execute the npm run tauri dev command to run the full desktop app  so i can see the changes in the app.
- After successfully completing a task, update the `PROJECT_STATUS.md` file to reflect the current state of the project.

- Always try to apply css variables to css styles instead of hardcoding values.

## Commands

```
cd studyllm
npm install          # install JS dependencies
npm run dev           # start Vite dev server only (web preview, no Tauri shell)
npm run tauri dev     # run the full desktop app (spawns Vite dev server itself)
npm run build          # tsc typecheck + vite production build of the frontend
npm run tauri build   # produce a native installer/binary via Cargo + the built frontend
npm run preview       # preview the built frontend
```

There is no test suite and no lint script configured in `package.json`. `npm run build`'s `tsc` step is the only automated correctness check (strict mode, `noUnusedLocals`/`noUnusedParameters` enabled — unused vars/params are build errors, not just warnings).

Rust side (`src-tauri/`) can be checked directly with `cargo check` / `cargo build` from within `src-tauri/` if iterating on Rust without wanting a full `tauri build`.

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
  webview's permission set. CSP is currently disabled (`security.csp: null`). **Any new
  Tauri/plugin command needs its permission added to `capabilities/default.json` or it silently
  fails at runtime** — e.g. `sql:default` alone does NOT include `sql:allow-execute`; check the
  plugin's own `permissions/default.toml` rather than assuming a `*:default` set is comprehensive.
- Frontend/backend communicate only through Tauri's `invoke` bridge (`@tauri-apps/api`) and
  `listen`/`emit` events (`@tauri-apps/api/event`).

Full details, phase status, and known limitations: `PROJECT_STATUS.md`.
