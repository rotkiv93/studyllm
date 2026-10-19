# Changelog

Each release's section is what users see in the GitHub Release and in the in-app update notice.
A pull request that changes the app adds a `## X.Y.Z` section here and bumps the version
(`sh .github/version.sh set X.Y.Z`); merging it tags and publishes the release. Versions before 0.11.0
are described on the [Releases page](https://github.com/rotkiv93/studyllm/releases).

## 0.12.0

- Math in answers now renders properly (KaTeX): `$E = mc^2$`, `$$\sum_i x_i$$`, `\(...\)` and `\[...\]`
  show as formulas, offline, in light and dark. Prices like "$5 and $10" stay plain text. Copy and
  export still give the original LaTeX.

## 0.11.0

- Search across all your chats: type in the box above the conversation list, click a result and the chat
  opens scrolled to that message.
- The app can now update itself: Settings → App updates checks GitHub, verifies the download's signature
  and restarts into the new version.
