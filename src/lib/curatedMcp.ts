/**
 * Hand-curated catalog of known-good MCP servers that install through the *existing* marketplace
 * flow (`handleInstallFromCatalog` in `App.tsx`) — no new Rust and no OAuth-engine work. This list
 * doubles as the Discover tab's pre-populated "Popular" section so it can paint instantly, before
 * (and independent of) any live registry round-trip.
 *
 * Everything here is either npx- or uvx-based; secret env vars land in the keychain-backed
 * `env_refs_json` path exactly like a registry install. Notion is featured first: its official npx
 * server authenticates with an internal-integration token (`NOTION_TOKEN`) — deliberately the
 * low-friction path that reuses the secret-env install flow rather than requiring remote-OAuth MCP
 * support, which was explicitly deferred.
 */

import type { CatalogEntry } from "./mcp";

/**
 * Upstream `mcp-server-fetch` declares an unbounded `mcp>=1.1.3`, so uvx resolves the 2.x Python
 * SDK — which renamed `McpError` to `MCPError`. The server still imports the old name and dies at
 * startup with `ImportError: cannot import name 'McpError' from 'mcp.shared.exceptions'`. Pinning
 * the SDK below 2.0 for this one server keeps it launchable; drop the pin once upstream publishes
 * a build compatible with the 2.x SDK.
 */
const FETCH_SDK_PIN = ["--with", "mcp<2"];
const FETCH_PACKAGE = "mcp-server-fetch";

/**
 * Repair the stored argv of a server installed before {@link FETCH_SDK_PIN} existed — the row in
 * SQLite still holds the bare `["mcp-server-fetch"]` that crashes on start, and the curated
 * catalog only governs *new* installs. Returns the corrected argv, or `null` when the row is
 * already fine and must be left untouched.
 */
export function repairCuratedArgs(command: string, args: string[]): string[] | null {
  if (command !== "uvx" || !args.includes(FETCH_PACKAGE)) return null;
  if (args.some((a) => a === FETCH_SDK_PIN[1])) return null;
  return [...FETCH_SDK_PIN, ...args];
}

/** Emoji shown on each curated server's card, so they are easy to tell apart at a glance. */
export const CURATED_ICONS: Record<string, string> = {
  "curated:filesystem": "📁",
  "curated:notion": "📓",
  "curated:github": "🐙",
  "curated:brave-search": "🔎",
  "curated:fetch": "🌐",
  "curated:wikipedia": "📖",
  "curated:openalex": "🎓",
  "curated:memory": "🧠",
  "curated:duckduckgo": "🦆",
  "curated:arxiv": "📄",
  "curated:time": "🕐",
  "curated:youtube": "▶️",
  "curated:obsidian": "🗃️",
  "curated:zotero": "📚",
};

/** What a server asks of the student before it works — drives the badge on its Discover card. */
export type CuratedNeeds = "none" | "folder" | "key";

export interface CuratedMeta {
  /** Locale key stem: `market.c.<slug>.does` / `.try`. */
  slug: string;
  /** `start` = works straight away; `account` = needs a token or key from another service. */
  group: "start" | "account";
  needs: CuratedNeeds;
}

/**
 * How Discover presents the curated servers, **in display order**. Ordered for someone finding out
 * what MCP can do: first the ones that show it off in a single question and need no account (a
 * folder the assistant tidies, a web page it reads, the web it searches), then the research and
 * utility ones, then the ones that need a token. The student-facing copy lives in the locale files.
 */
export const CURATED_META: Record<string, CuratedMeta> = {
  "curated:filesystem": { slug: "filesystem", group: "start", needs: "folder" },
  "curated:fetch": { slug: "fetch", group: "start", needs: "none" },
  "curated:duckduckgo": { slug: "duckduckgo", group: "start", needs: "none" },
  "curated:youtube": { slug: "youtube", group: "start", needs: "none" },
  "curated:wikipedia": { slug: "wikipedia", group: "start", needs: "none" },
  "curated:openalex": { slug: "openalex", group: "start", needs: "none" },
  "curated:arxiv": { slug: "arxiv", group: "start", needs: "none" },
  "curated:obsidian": { slug: "obsidian", group: "start", needs: "folder" },
  "curated:memory": { slug: "memory", group: "start", needs: "none" },
  "curated:time": { slug: "time", group: "start", needs: "none" },
  "curated:notion": { slug: "notion", group: "account", needs: "key" },
  "curated:zotero": { slug: "zotero", group: "account", needs: "key" },
  "curated:github": { slug: "github", group: "account", needs: "key" },
  "curated:brave-search": { slug: "brave", group: "account", needs: "key" },
};

/** The curated entries in {@link CURATED_META} order, optionally limited to one group. */
export function curatedInDisplayOrder(group?: CuratedMeta["group"]): CatalogEntry[] {
  return Object.keys(CURATED_META)
    .filter((id) => !group || CURATED_META[id].group === group)
    .map((id) => CURATED_ENTRIES.find((e) => e.id === id))
    .filter((e): e is CatalogEntry => !!e);
}

/** Icon for an installed server: matched by name against the curated list, then Google's, else a plug. */
export function mcpServerIcon(name: string): string {
  const n = name.trim().toLowerCase();
  const curated = CURATED_ENTRIES.find((e) => e.name.toLowerCase() === n);
  if (curated) return CURATED_ICONS[curated.id] ?? "🔌";
  if (n.includes("gmail")) return "✉️";
  if (n.includes("calendar")) return "📅";
  if (n.includes("drive")) return "🗂️";
  if (n.includes("tasks")) return "✅";
  if (n.includes("filesystem")) return "📁";
  return "🔌";
}

export const CURATED_ENTRIES: CatalogEntry[] = [
  {
    id: "curated:filesystem",
    name: "Filesystem",
    description:
      "Let the assistant read and write files inside a folder you choose. You'll pick the folder " +
      "when adding it.",
    version: null,
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    install: {
      kind: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      positionalArgs: [{ description: "Folder the assistant may access", default: null }],
    },
    requiredEnv: [],
  },
  {
    id: "curated:notion",
    name: "Notion",
    description:
      "Read and edit your Notion pages and databases. Create an internal integration in Notion, " +
      "share the pages you want with it, then paste its token below.",
    version: null,
    repositoryUrl: "https://github.com/makenotion/notion-mcp-server",
    install: { kind: "npx", args: ["-y", "@notionhq/notion-mcp-server"], positionalArgs: [] },
    requiredEnv: [
      {
        name: "NOTION_TOKEN",
        description: "Your Notion internal-integration token (starts with 'ntn_' or 'secret_')",
        isRequired: true,
        isSecret: true,
        default: null,
      },
    ],
  },
  {
    id: "curated:github",
    name: "GitHub",
    description:
      "Search repositories, read issues and pull requests, and more on GitHub. Paste a GitHub " +
      "personal access token to connect.",
    version: null,
    repositoryUrl: "https://github.com/github/github-mcp-server",
    install: {
      kind: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      positionalArgs: [],
    },
    requiredEnv: [
      {
        name: "GITHUB_PERSONAL_ACCESS_TOKEN",
        description: "A GitHub personal access token (classic or fine-grained)",
        isRequired: true,
        isSecret: true,
        default: null,
      },
    ],
  },
  {
    id: "curated:brave-search",
    name: "Brave Search",
    description:
      "Search the web with Brave Search. Get a free API key from Brave's developer dashboard and " +
      "paste it below.",
    version: null,
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    install: {
      kind: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      positionalArgs: [],
    },
    requiredEnv: [
      {
        name: "BRAVE_API_KEY",
        description: "Your Brave Search API key",
        isRequired: true,
        isSecret: true,
        default: null,
      },
    ],
  },
  {
    id: "curated:fetch",
    name: "Web Reader",
    description:
      "Give the assistant a web link and it reads the page for you — a news article, a treaty " +
      "text, a UN report. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    install: { kind: "uvx", args: [...FETCH_SDK_PIN, FETCH_PACKAGE], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:wikipedia",
    name: "Wikipedia",
    description:
      "Look up and read Wikipedia articles for quick background on people, places, events, and " +
      "topics. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/rudra-ravi/wikipedia-mcp",
    install: { kind: "uvx", args: ["wikipedia-mcp"], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:openalex",
    name: "OpenAlex — academic search",
    description:
      "Search hundreds of millions of scholarly papers, authors, and journals across every field — " +
      "handy for literature reviews. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/reetp14/openalex-mcp",
    install: { kind: "npx", args: ["-y", "openalex-mcp"], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:memory",
    name: "Memory",
    description:
      "Lets the assistant remember facts about you and your projects between conversations, " +
      "stored locally on your computer. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    install: { kind: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:duckduckgo",
    name: "DuckDuckGo Search",
    description: "Search the web with DuckDuckGo and read the pages it finds. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/nickclyde/duckduckgo-mcp-server",
    install: { kind: "uvx", args: ["duckduckgo-mcp-server"], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:arxiv",
    name: "arXiv",
    description: "Search and read scientific preprints on arXiv. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/blazickjp/arxiv-mcp-server",
    install: { kind: "uvx", args: ["arxiv-mcp-server"], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:time",
    name: "Time",
    description: "Tell the current time anywhere and convert between time zones. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    install: { kind: "uvx", args: ["mcp-server-time"], positionalArgs: [] },
    requiredEnv: [],
  },
  {
    id: "curated:youtube",
    name: "YouTube Transcripts",
    description:
      "Give the assistant a YouTube link and it reads the video's transcript — handy to summarise a " +
      "lecture or pull out the key points. No account or key needed.",
    version: null,
    repositoryUrl: "https://github.com/kimtaeyoon83/mcp-server-youtube-transcript",
    install: {
      kind: "npx",
      args: ["-y", "@kimtaeyoon83/mcp-server-youtube-transcript"],
      positionalArgs: [],
    },
    requiredEnv: [],
  },
  {
    id: "curated:obsidian",
    name: "Obsidian",
    description:
      "Let the assistant read, search and write notes in an Obsidian vault. You'll pick the vault " +
      "folder when adding it.",
    version: null,
    repositoryUrl: "https://github.com/bitbonsai/mcp-obsidian",
    install: {
      kind: "npx",
      args: ["-y", "@mauricio.wolff/mcp-obsidian"],
      positionalArgs: [{ description: "Your Obsidian vault folder", default: null }],
    },
    requiredEnv: [],
  },
  {
    id: "curated:zotero",
    name: "Zotero",
    description:
      "Search your Zotero library, read item details and pull out citations. Create an API key in " +
      "your Zotero account settings and paste it below with your library ID.",
    version: null,
    repositoryUrl: "https://github.com/54yyyu/zotero-mcp",
    install: { kind: "uvx", args: ["--from", "zotero-mcp-server", "zotero-mcp"], positionalArgs: [] },
    requiredEnv: [
      {
        name: "ZOTERO_API_KEY",
        description: "Your Zotero API key (zotero.org → Settings → Security → Applications)",
        isRequired: true,
        isSecret: true,
        default: null,
      },
      {
        name: "ZOTERO_LIBRARY_ID",
        description: "Your numeric Zotero user ID (shown on the same API keys page)",
        isRequired: true,
        isSecret: false,
        default: null,
      },
    ],
  },
];
