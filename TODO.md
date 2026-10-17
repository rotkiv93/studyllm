# TODO

Derived from `PROJECT_STATUS.md`. Ordered roughly by "blocks a real user" → "nice to have".
Update both docs together when a task lands.

- [] ** Create notebooks for the students to continue, lets add lessons on the basics of llm usage, mcps, and create lessons to teach the students, the system promt, the token usage, the usage of tools via filesystem, via google mcps, and the rag. All these lessons should be in a nabvar part, and with clear steps that they have to follow to complete the lessons. **

## Test

- [ ] **Test the macOS/Linux release jobs end-to-end**. Never run on real hardware — only
      eyeballed against the `tauri-action` quickstart. Same for `runtime.rs`'s portable-Node
      download/extract (tar.gz path unexercised outside Windows) and the new portable-uv bootstrap
      (same tar.gz-vs-zip split). A `workflow_dispatch` run is enough to find out — ask before
      triggering, since it burns CI minutes and is visible to anyone watching the repo's Actions tab.

## Bigger bets

- [ ] **Live-test the native tools end-to-end**: Connect completes and lists tools (verified); still
      needed — an actual `gmail_search_messages`/`drive_search_files`-style tool call from chat, a
      forced-fast-refresh test (shrink `oauth_expires_at` and observe `update_native_token` fire),
      and a revoke-then-use test to confirm a clean `isError` tool result instead of a hang.
- [ ] **Real MCP sandboxing**. Trust tiers are still a naming/repo-URL heuristic; installing a
      community server still runs arbitrary code as the OS user. Any real mitigation (container,
      subprocess sandbox, syscall filter) remains a large, dedicated piece of work — deliberately
      not attempted piecemeal here, per the existing note that the current state is a UI warning,
      not a boundary.
