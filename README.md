<div align="center">

# StudyLLM

**A free AI chat app for students — bring your own free API keys, no subscription needed.**

![StudyLLM main chat view](docs/screenshots/hero.png)

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?style=for-the-badge&logo=windows11&logoColor=white)](https://github.com/rotkiv93/studyllm/releases/latest)
[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/rotkiv93/studyllm/releases/latest)

**[Visit the project website →](https://rotkiv93.github.io/studyllm/)** *(live once GitHub Pages is enabled — see "Marketing website" below)*

*Installers are published automatically to the [Releases page](https://github.com/rotkiv93/studyllm/releases) whenever a new version ships. No release has been cut yet — check back soon, or build it yourself using the instructions further down.*

</div>

---

## What is StudyLLM?

Paid AI subscriptions add up fast when you're a student. Most AI providers give away a generous
free tier though — you just have to sign up and grab an API key. **StudyLLM is a chat app that
lets you use those free keys directly**, so you get a full AI chat experience without paying
anyone a monthly fee.

It runs as a normal desktop app on Windows and macOS — no browser tab, no account, nothing stored
on someone else's server. Your conversations stay on your own computer.

## Why you'll like it

- 🆓 **Actually free** — use free API keys from providers like Groq or Cerebras instead of paying
  for ChatGPT Plus or Claude Pro.
- 🔄 **Never gets stuck on "rate limit exceeded"** — add more than one provider and StudyLLM
  automatically switches to the next one the moment one runs dry.
- 🔒 **Private by default** — your keys live in your operating system's secure keychain, and your
  chats go straight from your computer to the AI provider. Nothing passes through a StudyLLM
  server, because there isn't one.
- 🛠️ **Give the AI real tools** — let it read and write files in a folder you choose, so it can
  actually help with your notes, essays, and projects instead of just talking about them.
- 🛍️ **A built-in store for AI tools** — browse and install more capabilities for the AI with a
  couple of clicks.
- 🌗 **Looks good day or night** — automatically follows your system's light or dark theme.
- 💻 **Cross-platform** — Windows, macOS, and Linux.

---

## A closer look

<table>
<tr>
<td width="50%">

### Add your own keys, for free
Open Settings, paste in a free API key from a provider like Groq, and you're chatting — no card,
no account with StudyLLM itself.

</td>
<td width="50%">

![Adding a provider in Settings](docs/screenshots/settings.png)

</td>
</tr>
<tr>
<td width="50%">

### Give the AI tools to work with
Turn on filesystem access to a folder, or browse the marketplace for more tools — the AI can then
read and write real files while you chat, with every action shown transparently in the
conversation.

</td>
<td width="50%">

![The MCP tools panel](docs/screenshots/mcp.png)

</td>
</tr>
</table>

<div align="center">

**Light mode**

![StudyLLM in light mode](docs/screenshots/hero-light.png)

</div>

---

## Getting started (as a user)

1. **Download** the installer for your OS from the badges above.
2. **Install and open** StudyLLM like any other app.
3. Click **Settings**, pick a provider (Groq and Cerebras both have free tiers that work great
   here), and paste in your API key. Don't have one yet? Each provider link in Settings takes you
   straight to their free key page.
4. Start typing — that's it.
5. *(Optional)* Click **MCP servers** to give the AI access to a folder on your computer, or browse
   the marketplace for more tools.

---

## Status

StudyLLM is under active development. Core chat, provider failover, and MCP tools already work day
to day; polish items like code-signed installers, auto-updates, and a first-run setup wizard are
still in progress. If something looks unfinished, it probably is — check
[`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for the exact state of every feature.

---

## Building it yourself

Prefer to run it from source, or your platform isn't published yet? StudyLLM is built with
[Tauri](https://tauri.app/), React, and Rust.

```bash
git clone https://github.com/rotkiv93/studyllm.git
cd studyllm
npm install
npm run tauri dev    # runs the full desktop app
```

Full command reference, architecture notes, and contributor guidelines live in
[`PROJECT_STATUS.md`](./PROJECT_STATUS.md) and [`CLAUDE.md`](./CLAUDE.md).

---

## Marketing website (maintainers)

[`docs/index.html`](./docs/index.html) is a self-contained landing page (screenshots, feature
list, per-OS download buttons linking to the latest GitHub Release, link back to this repo) —
no build step, no dependencies. To publish it at `https://rotkiv93.github.io/studyllm/`, enable
**Settings → Pages → Build and deployment → Source: Deploy from a branch**, then pick
**Branch: `main`, folder: `/docs`**, and save. GitHub publishes it within a minute or two; re-runs
automatically on every push to `main` that touches `docs/`.

---

## Release signing (maintainers)

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml), which
builds installers for Windows, macOS (Intel + Apple Silicon), and Linux via
[`tauri-action`](https://github.com/tauri-apps/tauri-action) and attaches them to a **draft**
GitHub Release for you to review before publishing. The workflow already reads code-signing
secrets if present and silently builds unsigned if they're missing — so signing is opt-in, add
secrets whenever you're ready.

Add these under **Settings → Secrets and variables → Actions** on the GitHub repo.

### Windows (Authenticode)

Unsigned `.msi`/`.exe` builds trigger a Microsoft Defender SmartScreen warning on first run.
Fixing this needs a code-signing certificate:

1. Buy an Authenticode certificate from a CA (e.g. DigiCert, SSL.com, Sectigo). Standard
   certs run ~$100–400/yr; an EV cert costs more but builds SmartScreen reputation faster.
   A self-signed cert removes nothing — Windows only trusts CA-issued certs here.
2. Export it as a password-protected `.pfx` file.
3. Base64-encode it and add two repo secrets:
   ```bash
   # macOS/Linux
   base64 -i your-cert.pfx | tr -d '\n'
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("your-cert.pfx"))
   ```
   - `WINDOWS_CERTIFICATE` — the base64 output
   - `WINDOWS_CERTIFICATE_PASSWORD` — the `.pfx` password

### macOS (Developer ID + notarization)

Unsigned/un-notarized builds are blocked outright by Gatekeeper ("app is damaged" / can't
verify developer) unless the user manually right-click-opens or runs a `xattr` command. Fixing
this needs an active [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/yr):

1. In Xcode or the Apple Developer portal, create a **Developer ID Application** certificate and
   export it (with its private key) as a password-protected `.p12`.
2. Base64-encode it the same way as the Windows cert above and add:
   - `APPLE_CERTIFICATE` — the base64 `.p12`
   - `APPLE_CERTIFICATE_PASSWORD` — the `.p12` password
   - `APPLE_SIGNING_IDENTITY` — the certificate's common name, e.g.
     `Developer ID Application: Your Name (TEAMID1234)`
3. For notarization (required — macOS won't run a signed-but-unnotarized app either), generate
   an app-specific password at [appleid.apple.com](https://appleid.apple.com/) → Sign-In and
   Security → App-Specific Passwords, and add:
   - `APPLE_ID` — your Apple ID email
   - `APPLE_PASSWORD` — the app-specific password (not your normal Apple ID password)
   - `APPLE_TEAM_ID` — your Team ID from the Developer Portal's Membership page

Codesigning alone works with just the certificate secrets; notarization needs all three of
`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` in addition.

### Linux

No signing step exists in the Linux ecosystem the way Windows/macOS have one — AppImage/`.deb`
artifacts build and publish unsigned with no warning to fix.

<div align="center">

*Built for students who'd rather spend money on textbooks than API subscriptions.*

</div>
