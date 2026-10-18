## Summary

<!-- What changed and why. -->

Closes #

## Checklist

- [ ] PR title is a Conventional Commit (`feat:`, `fix:`, `docs:`, … optionally `(scope)`)
- [ ] `npm run lint && npm test && npm run build` pass
- [ ] If Rust changed: `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (in `src-tauri/`)
- [ ] `PROJECT_STATUS.md` updated if a feature was added, removed or changed
- [ ] New Tauri/plugin commands have their permission in `src-tauri/capabilities/default.json`
- [ ] Screenshots attached for UI changes
