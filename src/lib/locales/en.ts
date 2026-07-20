/**
 * English translations. Must mirror the keys in `es.ts` (the source of truth).
 */
import type { Messages } from "../i18n";

export const en: Messages = {
  // ── Common / shared ────────────────────────────────────────────────
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.delete": "Delete",
  "common.remove": "Remove",
  "common.undo": "Undo",
  "common.edit": "Edit",
  "common.add": "Add",
  "common.loading": "Loading…",
  "common.retry": "Retry",
  "common.back": "Back",
  "common.next": "Next",
  "common.previous": "Previous",
  "common.skip": "Skip",
  "common.done": "Done",
  "common.start": "Start",
  "common.stop": "Stop",
  "common.yes": "Yes",
  "common.no": "No",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.enabled": "Enabled",
  "common.disabled": "Disabled",

  // ── Language switcher ──────────────────────────────────────────────
  "language.title": "Language",
  "language.label": "App language",
  "language.hint": "Choose the interface language. Your preference is remembered next time you open the app.",

  // ── Diagnostics (AppSettingsPanel) ─────────────────────────────────
  "diagnostics.title": "Diagnostics",
  "diagnostics.crashLog": "Crash log",
  "diagnostics.crashLogHint":
    "A local-only log of MCP server errors and app crashes — nothing here ever leaves this computer. Useful if something breaks and you want to see what happened.",
  "diagnostics.showLog": "Show log",
  "diagnostics.revealInFolder": "Reveal in folder",
  "diagnostics.clear": "Clear",
  "diagnostics.nothingLogged": "Nothing logged yet.",

  // ── Sidebar ────────────────────────────────────────────────────────
  "sidebar.expand": "Expand sidebar",
  "sidebar.collapse": "Collapse sidebar",
  "sidebar.newChat": "New chat",
  "sidebar.conversations": "Conversations",
  "sidebar.conversationHistory": "Conversation history",
  "sidebar.empty": "Your conversations will show up here.",
  "sidebar.untitled": "Untitled chat",
  "sidebar.renameConversation": "Rename conversation",
  "sidebar.deleteConversation": "Delete conversation",
  "sidebar.library": "Library",
  "sidebar.documentLibrary": "Document library",
  "sidebar.settings": "Settings",
  "sidebar.settingsSetup": "Settings & setup",
  "sidebar.needsAttention": "Needs attention",
  "sidebar.noActiveProviders": "No active providers",

  // ── Navigation destinations ────────────────────────────────────────
  "nav.providers": "Providers",
  "nav.mcp": "Tools & Connections",
  "nav.plugins": "Accounts (Plugins)",
  "nav.explore": "Explore how it works",
  "nav.diagnostics": "Diagnostics",

  // ── Tool call block ────────────────────────────────────────────────
  "toolCall.running": "Running…",
  "toolCall.failed": "Failed",
  "toolCall.done": "Done",
  "toolCall.input": "Input",
  "toolCall.output": "Output",
  "toolCall.error": "Error",

  // ── Retrieved sources (RAG) ────────────────────────────────────────
  "sources.headOne": "Sources from your library ({count} passage)",
  "sources.headOther": "Sources from your library ({count} passages)",
  "sources.match": "{percent}% match",

  // ── Study modes / starter prompts ──────────────────────────────────
  "study.browseAll": "Browse all",
  "study.showFewer": "Show fewer",
  "study.topic.reading": "Reading & analysis",
  "study.topic.writing": "Writing & drafting",
  "study.topic.research": "Research & citations",
  "study.topic.study": "Study & revision",

  "study.tpl.summarize.label": "Summarize a document",
  "study.tpl.summarize.description": "Condense a long report, treaty, or reading into structured key points.",

  "study.tpl.explain-treaty.label": "Explain a treaty / agreement",
  "study.tpl.explain-treaty.description": "Break down what a treaty or agreement actually commits its parties to.",

  "study.tpl.extract-entities.label": "Extract key facts & entities",
  "study.tpl.extract-entities.description": "Pull out people, places, dates, and organizations from a source.",

  "study.tpl.translate-summarize.label": "Translate & summarize a source",
  "study.tpl.translate-summarize.description": "Translate a foreign-language source into English and summarize it.",

  "study.tpl.policy-brief.label": "Draft a policy brief",
  "study.tpl.policy-brief.description": "Turn your notes into a structured policy brief / position paper.",

  "study.tpl.compare-positions.label": "Compare two actors' positions",
  "study.tpl.compare-positions.description": "Side-by-side comparison of two countries' or actors' stances on an issue.",

  "study.tpl.lit-review-outline.label": "Literature-review outline",
  "study.tpl.lit-review-outline.description": "Turn a topic and a few sources into a structured literature-review outline.",

  "study.tpl.bibliography.label": "Format a bibliography",
  "study.tpl.bibliography.description": "Format references in APA, MLA, or Chicago style.",

  "study.tpl.catalog-metadata.label": "Catalog a document (metadata)",
  "study.tpl.catalog-metadata.description": "Produce descriptive archival metadata for a document.",

  "study.tpl.flashcards.label": "Make flashcards / quiz",
  "study.tpl.flashcards.description": "Generate study flashcards or a short quiz from a document or topic.",

  // ── Onboarding wizard ──────────────────────────────────────────────
  "onboarding.title": "Welcome to StudyLLM",
  "onboarding.skipSetup": "Skip setup",
  "onboarding.providerHint":
    "StudyLLM works with your own free-tier API keys — no subscription needed. Pick a provider to get started; you can add more later in Settings.",
  "onboarding.recommended": "Recommended",
  "onboarding.continueWith": "Continue with {provider}",
  "onboarding.keyHint": "Get a free API key from {provider}, paste it below, and we'll verify it works.",
  "onboarding.getKeyLink": "Get a free {provider} API key",
  "onboarding.apiKey": "API key",
  "onboarding.pasteKey": "Paste key…",
  "onboarding.verifying": "Verifying key…",
  "onboarding.verified": "Key verified — found live models.",
  "onboarding.verifyFailed":
    "Couldn't verify this key against the live model list — double-check it, or continue anyway if you're sure it's correct.",
  "onboarding.saveFailed": "Couldn't save this provider: {error}",
  "onboarding.addAnyway": "Add anyway",
  "onboarding.verifyAndContinue": "Verify & continue",
  "onboarding.verifyingShort": "Verifying…",
  "onboarding.mcpHint":
    "Want the assistant to read and write files in a folder on this computer? You can scope it to any folder you choose, and change or remove it later.",
  "onboarding.mcpFailed": "Couldn't add filesystem access: {error}",
  "onboarding.chooseFolder": "Choose folder…",
  "onboarding.adding": "Adding…",
  "onboarding.featuresHint":
    "Two things StudyLLM can do beyond a normal chat — you can turn each on from the boxes just above the message field, whenever you need them:",
  "onboarding.featureResearch": "Deep Research",
  "onboarding.featureResearchDesc":
    "ask a big question and the assistant searches the web across several steps, reads sources, and writes an answer with citations.",
  "onboarding.featureDocs": "Chat with your documents",
  "onboarding.featureDocsDesc":
    "add your own notes, PDFs, or papers, and the assistant answers using only those, pointing to the exact passages it used.",
  "onboarding.seeHowItWorks": "See how it works",
  "onboarding.continue": "Continue",
  "onboarding.doneHint": "You're all set! Start chatting whenever you're ready.",
  "onboarding.startChatting": "Start chatting",

  // ── Explore panel ──────────────────────────────────────────────────
  "explore.title": "Explore how it works",
  "explore.tab.lessons": "Lessons",
  "explore.tab.tokens": "Tokens",
  "explore.tab.system": "System prompt",
  "explore.tab.retrieval": "Your documents (RAG)",
  "explore.tab.grounding": "Guessing vs. grounded",
  "explore.tab.tools": "Tools (MCP)",
  "explore.tab.research": "Research process",

  // ── Provider free-tier notes ───────────────────────────────────────
  "provider.freeTier.gemini": "~1,500 req/day · native tool calling",
  "provider.freeTier.mistral": "~1B tokens/month · reliable tools",
  "provider.freeTier.groq": "very fast · low daily quota",
  "provider.freeTier.nvidia": "1,000 credits · fresh keys may 429 until activated",
  "provider.freeTier.openrouter": "many models · tool support varies",
  "provider.freeTier.cohere": "~1,000 calls/month · native tools",
  "provider.freeTier.cerebras": "fast · some models need a paid tier",
  "provider.freeTier.github-models": "low daily quota",
  "provider.freeTier.sambanova": "trial credits only",

  // ── Chat / main panel ──────────────────────────────────────────────
  "chat.newChat": "New chat",
  "chat.emptyTitle": "What can I help you study?",
  "chat.you": "You",
  "chat.assistant": "Assistant",
  "chat.via": "via {provider}",
  "chat.provider": "provider",
  "chat.copyMessage": "Copy message",
  "chat.editAndResend": "Edit and resend",
  "chat.retryReply": "Retry this reply",
  "chat.export": "Export",
  "chat.exportConversation": "Export this conversation",
  "chat.copyAsMarkdown": "Copy as Markdown",
  "chat.saveToGoogleDocs": "Save to Google Docs",
  "chat.conversation": "Conversation",
  "chat.defaultDocTitle": "StudyLLM conversation",

  // Composer
  "composer.placeholder": "Type a message…  (Enter to send, Shift+Enter for a new line)",
  "composer.send": "Send",
  "composer.stop": "Stop generating",
  "composer.attach": "Attach a file ({formats})",
  "composer.remove": "Remove",
  "composer.removeNamed": "Remove {name}",
  "composer.trimmed": "trimmed",
  "composer.trimmedTitle": "{name} (trimmed to fit)",
  "composer.deepResearch": "Deep Research",
  "composer.deepResearchTitle": "Deep Research: multi-step web research with a cited report",
  "composer.setUpResearchTools": "Set up research tools",
  "composer.chatWithDocs": "Chat with your documents",
  "composer.chatWithDocsOn": "Answer using only your own documents (RAG)",
  "composer.chatWithDocsOff": "Add documents first, then answer from them",
  "composer.chatLab": "Chat lab",
  "composer.chatLabTitle":
    "Set a system prompt and the model's dials (temperature, top-p, max tokens) for this chat",
  "composer.howDoesThisWork": "How does this work?",
  "composer.yourDocuments": "Your documents",
  "composer.yourDocumentsCaption":
    "the assistant answers only from the files in your library and cites the passages it used.",

  // Tool approval
  "approval.title": "Tool call needs approval",
  "approval.body": "{server} wants to run {tool}.",
  "approval.deny": "Deny",
  "approval.allow": "Allow",

  // Errors / notices
  "error.addProviderFirst": "Add at least one provider in Settings first.",
  "error.responseFailed": "The model's response failed: {message}",
  "error.somethingWentWrong": "Something went wrong.",
  "error.toolsUnsupported":
    "None of your models support the connected tools. Pick a tool-capable model in Providers, or disable the MCP tools.",
  "error.allProvidersFailed": "All your providers failed. Check your keys in Settings.",
  "error.researchToolsSetup": "Couldn't set up research tools.",
  "error.indexDocument": "Couldn't index that document.",
  "error.toolDenied": "Tool call denied by user.",
  "error.toolFailed": "Tool call failed",
  "error.maxAttachments": "You can attach up to {max} files per message.",
  "error.unreadableFile": "Can't read \"{name}\" — supported: {formats}.",
  "error.readFileFailed": "Couldn't read \"{name}\".",
  "error.roomForFiles": "Only {room} more file(s) fit — max {max} per message.",
  "error.clipboardFailed": "Couldn't copy to the clipboard.",
  "error.connectGoogleFirst": "Connect your Google account in Plugins first to save to Google Docs.",
  "error.createGoogleDoc": "Couldn't create the Google Doc: {message}",
  "error.googleDocNoId": "Created a Google Doc but couldn't read its id back.",
  "error.googleDocAppend": "Created the doc, but couldn't add the text: {message}",
  "error.exportFailed": "Export failed: {message}",
  "notice.researchToolsStarting":
    "Research tools are starting up — give them a few seconds on first run.",
  "notice.embeddingModelSaved": "Embedding model saved.",
  "notice.librarySearchSkipped": "Library search skipped: {error}",
  "notice.switchedProvider": "Switched to {to} ({from} {reason})",
  "notice.invalidKey": "{provider} key looks invalid — disabled it. Check Settings.",
  "notice.transcriptCopied": "Conversation copied as Markdown.",
  "notice.savedToGoogleDocs": "Saved to Google Docs.",
  "notice.savedToGoogleDocsUrl": "Saved to Google Docs — {url}",
  "mcp.defaultServerName": "MCP server",

  // ── Research modes ─────────────────────────────────────────────────
  "research.mode.auto.label": "Auto",
  "research.mode.auto.description": "General multi-step research: plan, search, read, and write a cited answer.",
  "research.mode.compare.label": "Compare",
  "research.mode.compare.description": "Weigh two or more options, positions, or actors side by side.",
  "research.mode.howto.label": "How-to",
  "research.mode.howto.description": "Build a reliable, step-by-step guide grounded in current sources.",
  "research.mode.factcheck.label": "Fact-check",
  "research.mode.factcheck.description": "Verify a specific claim against multiple independent sources.",
  "research.mode.litreview.label": "Literature review",
  "research.mode.litreview.description": "Survey the scholarship on a topic, organized by theme.",

  "notice.librarySearchFailed": "Library search failed: {error}",
  "error.embeddingError": "embedding error",
  "error.allProvidersRateLimited": "All your providers are rate-limited. Try again in ~{seconds}s.",

  // Router fail-over reasons (shown inside "notice.switchedProvider")
  "router.reason.toolsUnsupported": "model can't use tools",
  "router.reason.invalidKey": "invalid key",
  "router.reason.rateLimited": "rate-limited",
  "router.reason.requestFailed": "request failed",

  // ── Library panel ──────────────────────────────────────────────────
  "library.title": "Your documents",
  "library.titleTerm": "(library)",
  "library.tab.documents": "Documents",
  "library.tab.embedding": "Embedding model",
  "library.documentsHint":
    "Add your notes, PDFs, or papers. Each document is split into passages and turned into searchable “meaning” data so the assistant can pull the most relevant parts when you turn on “Chat with your documents” in the composer. Answers cite the passages they used.",
  "library.pickEmbeddingFirst":
    "Pick an embedding model in the “Embedding model” tab first — that’s how documents get indexed.",
  "library.addFileTitle": "Add a file ({formats})",
  "library.chooseEmbeddingFirst": "Choose an embedding model first",
  "library.indexing": "Indexing…",
  "library.addDocuments": "Add documents",
  "library.empty": "No documents yet.",
  "library.passageOne": "{count} passage",
  "library.passageOther": "{count} passages",
  "library.chars": "{count} chars",
  "library.removeDocument": "Remove document",
  "library.noEmbeddingProvider":
    "No embedding-capable provider is set up. Add a Google Gemini or Mistral provider in Providers — both offer free embedding models — then come back here to select it.",
  "library.embeddingHint":
    "Embeddings turn your documents into searchable vectors. Choose a provider you’ve set up and the embedding model to use. This runs on the provider’s free tier, same as chat.",
  "library.provider": "Provider",
  "library.embeddingModel": "Embedding model",
  "library.current": "Current: {provider} · {model}",

  // ── Plugins / accounts panel ───────────────────────────────────────
  "plugins.title": "Accounts",
  "plugins.titleTerm": "(Plugins)",
  "plugins.hint":
    "Connect accounts so the assistant can use them, like a Google account for email and files. StudyLLM never sees your Google password — you sign in directly with Google.",
  "plugins.official": "Official",
  "plugins.connected": "Connected",
  "plugins.connectedLower": "connected",
  "plugins.errorLower": "error",
  "plugins.disconnect": "Disconnect",
  "plugins.connecting": "Connecting…",
  "plugins.tryAgain": "Try again",
  "plugins.connectGoogle": "Connect Google Account",
  "plugins.connectFailed": "Couldn't connect — please try again.",
  "plugins.phase.openingBrowser": "Opening your browser…",
  "plugins.phase.waiting": "Waiting for you to finish signing in with Google…",
  "plugins.phase.exchanging": "Connecting…",
  "plugins.phase.connected": "Connected!",
  "plugins.phase.error": "Something went wrong.",
  "connector.google.description":
    "Connect your Google account so the assistant can work with your Gmail, Calendar, Tasks, Drive, Docs, and Sheets — reading and (with your approval) sending, creating, and editing.",
  "plugins.setup.summary": "How to set up Google access",
  "plugins.setup.intro": "One-time setup in your {link}, then click Connect:",
  "plugins.setup.consoleLink": "Google Cloud Console",
  "plugins.setup.step1":
    "Under APIs & Services → Library, enable the Gmail, Google Calendar, Google Tasks, Google Docs, Google Sheets, and Google Drive APIs.",
  "plugins.setup.step2":
    "Open APIs & Services → OAuth consent screen and add these scopes: gmail.modify, gmail.send, calendar, tasks, documents, spreadsheets, and drive.readonly.",
  "plugins.setup.step3":
    "While the consent screen is in \"Testing\", add your Google address under Test users so Google will let you through.",
  "plugins.setup.step4": "Come back here and click Connect, then approve the permissions in the browser.",
  // ── Providers panel ────────────────────────────────────────────────
  "providers.title": "Providers",
  "providers.hint":
    "Add your own free-tier API keys. When one runs out of free requests, StudyLLM automatically switches to the next one in the list.",
  "providers.runSetupGuide": "Run setup guide",
  "providers.yourProviders": "Your providers",
  "providers.addProvider": "Add a provider",
  "providers.addProviderButton": "Add provider",
  "providers.none": "No providers added yet.",
  "providers.recommended": "Recommended",
  "providers.configured": "✓ Configured",
  "providers.enabled": "enabled",
  "providers.apiKey": "API key",
  "providers.pasteKey": "Paste key…",
  "providers.getKeyLink": "Get a free {provider} API key",
  "providers.label": "Label",
  "providers.keepCurrentKey": "Leave blank to keep current key",
  "providers.moveUp": "Move up",
  "providers.moveDown": "Move down",
  "providers.addFailed": "Couldn't add provider: {error}",
  "providers.removeFailed": "Couldn't remove provider: {error}",
  "providers.updateFailed": "Couldn't update provider: {error}",
  "providers.reorderFailed": "Couldn't reorder providers: {error}",

  // Model field
  "model.label": "Model",
  "model.placeholder": "Type or pick a model id…",
  "model.toolCompatibleOnly": "Tool-compatible only",
  "model.badgeTools": "✓ tools",
  "model.badgeNoTools": "no tools",
  "model.loading": "Loading live model list…",
  "model.loaded": "Loaded {count} live models from {provider}.",
  "model.unavailableWithKey":
    "Couldn't load live models with this key — showing suggestions. You can still type any model id.",
  "model.unavailable":
    "Couldn't reach the live model list — showing suggestions. You can still type any model id.",
  "model.enterKey": "Enter an API key to load this provider's live model list.",

  // ── Chat lab ───────────────────────────────────────────────────────
  "chatLab.title": "Chat lab",
  "chatLab.subtitle":
    "Steer this conversation like an engineer would — a standing instruction and the model's dials. Applies to your real messages and is saved with this chat.",
  "chatLab.close": "Close chat lab",
  "chatLab.standingInstructions": "Standing instructions",
  "chatLab.systemPromptTerm": "(system prompt)",
  "chatLab.tokens": "{count} tokens",
  "chatLab.clear": "Clear",
  "chatLab.systemPlaceholder":
    "e.g. You are a patient tutor. Explain simply and check understanding.",
  "chatLab.systemExplain":
    "Hidden instructions the model follows before it sees your message — its persona and rules.",
  "chatLab.default": "default",
  "chatLab.preset.tutor": "Friendly tutor",
  "chatLab.preset.pirate": "Talk like a pirate",
  "chatLab.preset.oneWord": "One word only",
  "chatLab.preset.french": "Reply in French",
  "chatLab.preset.eli10": "Explain like I'm 10",
  "chatLab.knob.creativity": "Creativity",
  "chatLab.knob.creativityTerm": "temperature",
  "chatLab.knob.creativityExplain":
    "Low = focused and repeatable. High = more surprising and varied (and more likely to wander).",
  "chatLab.knob.variety": "Word variety",
  "chatLab.knob.varietyTerm": "top-p",
  "chatLab.knob.varietyExplain":
    "Limits word choice to the most likely options. Lower = safer, more predictable wording.",
  "chatLab.knob.length": "Response length limit",
  "chatLab.knob.lengthTerm": "max tokens",
  "chatLab.knob.lengthExplain":
    "A hard cap on how much the model may write. Set it low and long answers get cut off mid-sentence.",

  "plugins.setup.note":
    "Already connected before? These permissions were recently broadened — Disconnect then Connect once more to grant the new access. Actions that send or delete (send email, trash a message, delete an event or task) ask for your approval each time; you can change that per tool in the Tools panel.",

  // ── Trust tiers (shared: McpPanel + McpMarketplace) ─────────────────
  "trust.official": "Official",
  "trust.verified": "Verified",
  "trust.community": "Community",
  "trust.tooltip.official": "Built and maintained by the MCP project itself.",
  "trust.tooltip.verified":
    "Made by an outside developer whose source code is public, but not audited by StudyLLM.",
  "trust.tooltip.community":
    "An unverified tool from an independent developer — it can run code on this computer with your permissions.",

  // ── Tools & Connections panel (McpPanel) ───────────────────────────
  "mcp.title": "Tools & Connections",
  "mcp.titleTerm": "(MCP)",
  "mcp.tab.installed": "Installed",
  "mcp.tab.discover": "Discover",
  "mcp.intro":
    "These give the assistant extra tools — like reading and writing files on this computer, or searching the web. (The technical name for them is “MCP servers.”) Only add ones you trust. Set a tool to “Ask every time” to approve each call, or “Deny” to hide it from the assistant entirely. Every allowed tool call is shown in the chat.",
  "mcp.legend.official": "Published by the tool's own makers.",
  "mcp.legend.verified": "From a known public code repository.",
  "mcp.legend.community":
    "From an independent developer — runs with your permissions, so add with care.",
  "mcp.searchPlaceholder": "Search installed servers…",
  "mcp.section.pinned": "Pinned",
  "mcp.section.all": "All servers",
  "mcp.filesystem.name": "Filesystem",
  "mcp.filesystem.desc": "Let the assistant read/write files in a folder you choose.",
  "mcp.adding": "Adding…",
  "mcp.addEllipsis": "Add…",
  "mcp.noPinnedMatch": "No pinned servers match your search.",
  "mcp.noPinned": "No pinned servers.",
  "mcp.noServersMatch": "No servers match your search.",
  "mcp.noOtherServers": "No other servers installed.",
  "mcp.start": "Start",
  "mcp.starting": "Starting…",
  "mcp.stop": "Stop",
  "mcp.tools": "Tools",
  "mcp.toolsWithCount": "Tools ({count})",
  "mcp.toolsDisabledTitle": "Start the server to see its tools",
  "mcp.toolsTitle": "Configure this server's tools",
  "mcp.logs": "Logs",
  "mcp.logsWithCount": "Logs ({count})",
  "mcp.logsDisabledTitle": "Logs are only available for locally-spawned servers",
  "mcp.logsTitle": "View this server's stderr output",
  "mcp.autostart": "Autostart",
  "mcp.autostartTitle": "Start this server automatically when the app launches",
  "mcp.cachedToolsHint":
    "Showing the tool list from the last time this server ran — start it to refresh.",
  "mcp.noLogs": "No log output yet — logs appear once the server writes to stderr.",
  "mcp.status.stopped": "stopped",
  "mcp.status.starting": "starting",
  "mcp.status.running": "running",
  "mcp.status.error": "error",
  "mcp.perm.allow": "Allow",
  "mcp.perm.ask": "Ask every time",
  "mcp.perm.deny": "Deny (hidden)",
  "mcp.err.addFilesystem": "Couldn't add filesystem access: {error}",
  "mcp.err.start": "Couldn't start {name}: {error}",
  "mcp.err.stop": "Couldn't stop {name}: {error}",
  "mcp.err.remove": "Couldn't remove {name}: {error}",
  "mcp.edit.name": "Name",
  "mcp.edit.folder": "Folder",
  "mcp.edit.changeFolder": "Change folder…",
  "mcp.edit.oauthHint": "Manage this connection from the Plugins panel.",
  "mcp.edit.url": "URL",
  "mcp.edit.envVars": "Environment variables",
  "mcp.edit.secret": "secret",
  "mcp.edit.willRemove": "Will be removed on save",
  "mcp.edit.keepCurrent": "Leave blank to keep current value",
  "mcp.edit.value": "Value",
  "mcp.edit.addVariable": "+ Add variable",

  // ── Tool marketplace (McpMarketplace) ──────────────────────────────
  "market.intro":
    "Add extra tools the assistant can use, like reading files or checking your inbox. Only add tools from people or projects you trust — check the badge before adding.",
  "market.searchPlaceholder": "Search for a tool…",
  "market.searching": "Searching…",
  "market.search": "Search",
  "market.cacheNotice":
    "Couldn't reach the tool directory{error} — showing what was saved{age}.",
  "market.cacheError": " ({error})",
  "market.cacheAge": " from {minutes} min ago",
  "market.clearCache": "Clear saved results",
  "market.section.popular": "Popular",
  "market.section.all": "All tools",
  "market.empty": "No tools found.",
  "market.added": "Added",
  "market.add": "Add",
  "market.adding": "Adding…",
  "market.addTitle": "Add {name}",
  "market.warn.community":
    "This is an unverified community tool — it can run arbitrary code on this computer with your user account's permissions. Only add it if you trust the publisher.",
  "market.warn.verified":
    "This tool's publisher has a public repository but hasn't been audited by StudyLLM. Review it before adding.",
  "market.ack": "I understand the risk and want to add this tool anyway.",
  "market.argument": "Argument {n}",
  "market.chooseFolder": "Choose folder…",
  "market.optional": " (optional)",

  // ── Tool explorer (McpToolExplorer) ────────────────────────────────
  "toolExplorer.noServers":
    "No tools are connected yet. Open Tools & Connections (MCP) and start a server (the Filesystem tool is the easiest to try), then come back here to watch the model use it.",
  "toolExplorer.intro":
    "A tool is just a function the model is allowed to ask for — it has a name, a description, and some blanks (inputs) to fill in. Below are the real tools your connected server exposes. Ask a question and watch the model pick one, fill in the blanks, and read back the result.",
  "toolExplorer.server": "Server:",
  "toolExplorer.required": "required",
  "toolExplorer.noInputs": "Takes no inputs.",
  "toolExplorer.needProvider":
    "Add an AI provider in Providers to run the live “watch it decide” demo.",
  "toolExplorer.placeholder": "e.g. something that would need {name}",
  "toolExplorer.run": "Run",
  "toolExplorer.stop": "Stop",
  "toolExplorer.modelAsked": "The model asked for",
  "toolExplorer.itSent": "It sent (the blanks it filled in):",
  "toolExplorer.toolError": "The tool returned an error:",
  "toolExplorer.toolAnswered": "The tool answered:",
  "toolExplorer.switched": "Switched provider ({reason})",
  "toolExplorer.runFailed": "The run failed.",

  // ── Research trace (ResearchTrace) ─────────────────────────────────
  "researchTrace.stage.question": "Your question",
  "researchTrace.stage.subQuestions": "Sub-questions",
  "researchTrace.stage.search": "Search the web",
  "researchTrace.stage.read": "Read sources",
  "researchTrace.stage.synthesize": "Synthesize",
  "researchTrace.stage.report": "Cited report",
  "researchTrace.intro":
    "Ask a big question and watch Deep Research work — decompose it, search, read sources, and synthesize a cited answer, step by step. It runs the real research loop over your web tools.",
  "researchTrace.noTools": "No research tools are running yet.",
  "researchTrace.settingUp": "Setting up…",
  "researchTrace.setUpTools": "Set up the free research tools",
  "researchTrace.toolsSuffix": "(Web Reader, Wikipedia, OpenAlex) — no account needed.",
  "researchTrace.placeholder": "e.g. How do the EU and US approaches to regulating AI compare?",
  "researchTrace.run": "Run research",
  "researchTrace.stop": "Stop",
  "researchTrace.steps": "Research steps",
  "researchTrace.stepsOf": "{done} of up to {max}",
  "researchTrace.sources": "Sources consulted ({count})",
  "researchTrace.chars": "{count} chars",
  "researchTrace.report": "Cited report",
  "researchTrace.writing": "Writing…",
  "researchTrace.via": " · via {provider} · {model}",
  "researchTrace.switched": "Switched to {provider} — restarting the research",
  "researchTrace.authError": "{provider} key looks invalid — check Providers.",
  "researchTrace.noToolModels":
    "None of your models can use tools. Pick a tool-capable model in Providers.",
  "researchTrace.exhausted": "All providers are rate-limited or failing. Try again shortly.",
  "researchTrace.failed": "Research run failed.",

  // ── Retrieval explorer (RetrievalExplorer) ─────────────────────────
  "retrieval.stage1.label": "Turn your question into numbers",
  "retrieval.stage1.detail":
    "Turned into a list of {count} numbers (a “vector”) that captures its meaning",
  "retrieval.stage2.label": "Score every passage",
  "retrieval.stage2.detail": "Compared against {count} passages",
  "retrieval.stage3.label": "Rank by closeness in meaning",
  "retrieval.stage3.detail":
    "Sorted by how close in meaning they are (“cosine similarity”), not keyword overlap",
  "retrieval.stage4.label": "Keep the closest",
  "retrieval.stage4.detail": "The top {count} become the answer's cited sources",
  "retrieval.intro":
    "Type a question and watch how “chat with your documents” actually finds the right passages — no chatting needed. It runs the real search over your library.",
  "retrieval.emptyLibrary": "Your library is empty.",
  "retrieval.addDocs": "Add some documents",
  "retrieval.emptyLibrarySuffix":
    "first, then come back to explore how retrieval picks passages from them.",
  "retrieval.placeholder": "e.g. What obligations does the treaty place on member states?",
  "retrieval.run": "Run retrieval",
  "retrieval.running": "Running…",
  "retrieval.failed": "Retrieval failed. Check your embedding provider.",
  "retrieval.noPassages":
    "No passages were found in your library. If you just added documents, give indexing a moment and try again.",
  "retrieval.vizHint": "Hover a bar or dot to compare them —",
  "retrieval.vizHintStrong": "click any one to read the full passage",
  "retrieval.match": "{percent}% match",
  "retrieval.retrieved": "retrieved for the answer",
  "retrieval.notRetrieved": "not retrieved",
  "retrieval.passageAria": "Passage {name} #{seq}",
  "retrieval.passageCaption":
    "This is one of the passages from your library, ranked #{rank} of {total} by how close it is in meaning to your question.",
  "retrieval.previous": "← Previous",
  "retrieval.next": "Next →",

  // ── Grounding contrast (GroundingContrast) ─────────────────────────
  "grounding.intro":
    "Ask one question and see it answered twice: on the left, from the model’s own memory alone; on the right, grounded in your own documents. The left answer may sound confident but cites nothing — and can be made up. The right one is tied to real passages with citations. That contrast is the whole reason “chat with your documents” (RAG) exists.",
  "grounding.emptyLibrary": "Your library is empty.",
  "grounding.addDoc": "Add a document",
  "grounding.emptyLibrarySuffix":
    "first — pick something the model probably doesn’t already know (your lecture notes, a specific PDF) for the sharpest contrast.",
  "grounding.placeholder":
    "Ask something your document answers but a model likely wouldn't know…",
  "grounding.compare": "Compare answers",
  "grounding.stop": "Stop",
  "grounding.failed": "The run failed.",
  "grounding.memoryOnly": "Model’s memory only",
  "grounding.groundedIn": "Grounded in your documents",
  "grounding.noSources": "No sources — trust with caution.",
  "grounding.waiting": "waiting for the first answer…",
  "grounding.passagesGiven": "Passages it was given:",
  "grounding.matchPercent": "{percent}% match",
  "grounding.nothingMatched":
    "Nothing in your library matched — a grounded model should say it doesn’t know rather than guess.",

  // ── Prompt playground (PromptPlayground) ───────────────────────────
  "prompt.intro":
    "A chatbot never just gets your message. Behind every turn is a hidden system prompt — standing instructions the model follows. Edit it below, watch the exact thing the model receives, then run it and see how the same question gets a different answer.",
  "prompt.systemLabel": "System prompt",
  "prompt.systemHint": "the hidden instructions",
  "prompt.systemPlaceholder": "e.g. You are a helpful assistant.",
  "prompt.userLabel": "Your message",
  "prompt.userPlaceholder": "Ask anything…",
  "prompt.run": "Run",
  "prompt.stop": "Stop",
  "prompt.inspectorHead": "What the model actually receives",
  "prompt.totalTokens": "{count} tokens total",
  "prompt.msgTokens": "{count} tokens",
  "prompt.empty": "(empty)",
  "prompt.inspectorNote":
    "That’s the whole prompt — the model sees nothing else about you. In a real chat, the earlier back-and-forth would be stacked in here too, which is why long chats fill up the token budget and older turns eventually get dropped.",
  "prompt.needProvider": "Add an AI provider in Providers to run the prompt and see the answer.",
  "prompt.failed": "The run failed.",
  "prompt.runSystemLabel": "System:",
  "prompt.noSystem": "none",
  "prompt.noSystemTitle": "(no system prompt)",
  "prompt.preset.helpful": "Helpful assistant",
  "prompt.preset.pirate": "Talk like a pirate",
  "prompt.preset.oneWord": "One word only",
  "prompt.preset.socratic": "Socratic tutor",
  "prompt.preset.json": "JSON only",
  "prompt.preset.french": "Always in French",

  // ── Token explorer (TokenExplorer) ─────────────────────────────────
  "token.intro":
    "A model never sees your letters. First it chops the text into tokens — the chunks below. Type anything and watch how it splits. Notice the three counts rarely match: that mismatch is why a model struggles to “count the letters in a word,” and why every model has a token limit, not a word limit.",
  "token.placeholder": "Type or paste anything…",
  "token.tryLabel": "Try:",
  "token.characters": "characters",
  "token.words": "words",
  "token.tokens": "tokens (approx.)",
  "token.chipsAria": "The text split into tokens",
  "token.whitespace": "whitespace",
  "token.footnote":
    "Roughly 4 characters make one token in English. A model’s context window — everything it can “hold in mind” at once (your question, the chat history, any documents) — is measured in these tokens: small models fit a few thousand, big ones over 100,000. This is a teaching approximation of a real tokenizer, not an exact count.",
  "token.example.strawberry": "strawberry",
  "token.example.strawberryText": "How many r's are in strawberry?",
  "token.example.sentence": "A sentence",
  "token.example.sentenceText": "The quick brown fox jumps over the lazy dog.",
  "token.example.numbers": "Numbers & code",
  "token.example.numbersText": "Invoice #4021 total: $1,299.00 — pay by 2026-08-01.",
  "token.example.otherLang": "Another language",
  "token.example.otherLangText": "La inteligencia artificial aprende de muchísimos ejemplos.",

  // ── Lessons (LessonsPanel) ─────────────────────────────────────────
  "lessons.intro":
    "Six short, hands-on lessons on how modern AI actually works — each opens a live playground you can poke at. Great to walk through top to bottom, on your own or in front of a class. No coding, no jargon left unexplained.",
  "lessons.1.title": "What the AI actually reads",
  "lessons.1.term": "tokens",
  "lessons.1.body":
    "An AI model never sees your letters — it first chops text into chunks called tokens. Seeing this explains why it counts letters badly and why it has size limits.",
  "lessons.1.cta": "Split some text into tokens",
  "lessons.2.title": "How you steer it with instructions",
  "lessons.2.term": "system prompt",
  "lessons.2.body":
    "Behind every chatbot is a hidden instruction that shapes its persona and rules. See the exact prompt the model receives, then change the instruction and watch its answer change.",
  "lessons.2.cta": "Experiment with a system prompt",
  "lessons.3.title": "Why it sometimes makes things up",
  "lessons.3.term": "hallucination",
  "lessons.3.body":
    "On its own, a model answers from fuzzy memory and can invent confident-sounding facts. Ask one question two ways and watch a made-up answer become a sourced one.",
  "lessons.3.cta": "Compare a guess vs. a grounded answer",
  "lessons.4.title": "How it finds the right passage",
  "lessons.4.term": "RAG / retrieval",
  "lessons.4.body":
    "“Chat with your documents” works by turning meaning into numbers and finding the closest passages to your question. Watch the real search rank every passage in your library.",
  "lessons.4.cta": "Watch retrieval rank your documents",
  "lessons.5.title": "How it uses real tools",
  "lessons.5.term": "MCP",
  "lessons.5.body":
    "A tool is just a function the model is allowed to ask for — read a file, search the web. See a tool’s inputs, then watch the model choose one and fill in the blanks.",
  "lessons.5.cta": "Watch the model use a tool",
  "lessons.6.title": "How it researches a big question",
  "lessons.6.term": "agentic research",
  "lessons.6.body":
    "Give a model tools and a goal and it can work in steps: break the question down, search, read sources, and write a cited answer. Watch a full run unfold live.",
  "lessons.6.cta": "Run a live research trace",

  // ── Visualizations (viz/*) ─────────────────────────────────────────
  "viz.embeddingSpace": "Embedding space",
  "viz.embeddingSpaceAria": "Embedding space map",
  "viz.similarityRanking": "Similarity ranking",
  "viz.clickToRead": "Click to read the full passage",
  "viz.embeddingCaption":
    "Your question (★) and every passage, mapped by meaning. Closer means more similar — the filled dots are the ones retrieved. Click any dot to read the full passage.",
  "viz.rankingCaption":
    "Every passage in your library, scored against your question. The {count} above the line are the ones the assistant would answer from. Click any bar to read the full passage.",
  "viz.cutoff": "top {count} · retrieved",
};
