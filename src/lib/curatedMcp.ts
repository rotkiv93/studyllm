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

export const CURATED_ENTRIES: CatalogEntry[] = [
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
    install: { kind: "uvx", args: ["mcp-server-fetch"], positionalArgs: [] },
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
];
