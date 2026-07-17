# TODO

Derived from `PROJECT_STATUS.md`. Ordered roughly by "blocks a real user" → "nice to have".
Update both docs together when a task lands.

## Phase 5 — remaining plan items

- [ ] **Test the macOS/Linux release jobs end-to-end**. Never run on real hardware — only
      eyeballed against the `tauri-action` quickstart. Same for `runtime.rs`'s portable-Node
      download/extract (tar.gz path unexercised outside Windows) and the new portable-uv bootstrap
      (same tar.gz-vs-zip split). A `workflow_dispatch` run is enough to find out — ask before
      triggering, since it burns CI minutes and is visible to anyone watching the repo's Actions tab.

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
