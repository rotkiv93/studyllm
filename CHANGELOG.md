# Changelog

Each release's section is what users see in the GitHub Release and in the in-app update notice.
A pull request that changes the app adds a `## X.Y.Z` section here and bumps the version
(`sh .github/version.sh set X.Y.Z`); merging it tags and publishes the release. Versions before 0.11.0
are described on the [Releases page](https://github.com/rotkiv93/studyllm/releases).

## 0.11.1

- The chat search box now sits on the same row as **New chat** in the sidebar, saving vertical space.
- On large and ultrawide screens (≥1920px) the chat column and wide panels grow with the window
  instead of staying a narrow strip.

## 0.11.0

- Search across all your chats: type in the box above the conversation list, click a result and the chat
  opens scrolled to that message.
- The app can now update itself: Settings → App updates checks GitHub, verifies the download's signature
  and restarts into the new version.
