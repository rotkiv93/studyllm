import { searchMcpRegistry, type CatalogEntry } from "./mcp";
import type { MessageKey } from "./i18n";
import {
  upsertCatalogEntries,
  listCachedCatalogEntries,
  searchCachedCatalogEntries,
  evictStaleCatalogEntries,
  clearCatalogCache,
  type McpCatalogCacheRow,
} from "./db";

export { clearCatalogCache };

export type TrustTier = "official" | "verified" | "community";

/** Reference servers live under the modelcontextprotocol org; treat both as "official". */
const OFFICIAL_REPO_SUBSTRING = "github.com/modelcontextprotocol/servers";

export function computeTrustTier(entry: {
  name: string;
  repositoryUrl: string | null;
}): TrustTier {
  const name = entry.name.toLowerCase();
  const repo = entry.repositoryUrl?.toLowerCase() ?? "";
  if (name.startsWith("io.modelcontextprotocol") || repo.includes(OFFICIAL_REPO_SUBSTRING)) {
    return "official";
  }
  if (/^https?:\/\/(github\.com|gitlab\.com)\//.test(repo)) {
    return "verified";
  }
  return "community";
}

/** i18n key for a trust tier's badge label — callers render it through `t()`. */
export function trustTierLabelKey(tier: TrustTier): MessageKey {
  return `trust.${tier}` as MessageKey;
}

/** i18n key for the longer "what this tier means" tooltip. */
export function trustTierTooltipKey(tier: TrustTier): MessageKey {
  return `trust.tooltip.${tier}` as MessageKey;
}

/**
 * Well-known servers, most useful first. The MCP registry exposes no download/star counts and
 * returns entries alphabetically, so "popular" has to be curated: a server whose name or repo
 * contains one of these tokens is boosted, earlier in the list = higher.
 */
const POPULAR_TOKENS = [
  "github", "notion", "playwright", "context7", "filesystem", "fetch", "brave", "tavily", "firecrawl",
  "sequential", "memory", "google", "gmail", "calendar", "drive", "slack", "postgres", "sqlite",
  "supabase", "linear", "figma", "sentry", "stripe", "cloudflare", "docker", "mongodb", "atlassian",
  "jira", "asana", "todoist", "obsidian", "zotero", "youtube", "arxiv", "wikipedia", "puppeteer",
  "excalidraw", "exa",
];

/**
 * Official, widely used servers published to the registry under these exact names. The registry
 * lists alphabetically (so they'd be buried under thousands of "ai.*"/"com.*" entries), which is
 * why the landing view looks each one up directly and pins it near the top.
 */
const FEATURED_SERVERS = [
  "io.github.github/github-mcp-server",
  "io.github.upstash/context7",
  "com.notion/mcp",
  "com.figma.mcp/mcp",
  "app.linear/linear",
  "com.supabase/mcp",
  "io.github.getsentry/sentry-mcp",
  "com.stripe/mcp",
];

function nameTokens(entry: CatalogEntry): Set<string> {
  // Drop the repo host so every github.com URL doesn't count as the "github" server.
  const repoPath = (entry.repositoryUrl ?? "").replace(/^https?:\/\/[^/]+\//, "");
  // Only the part after the reverse-DNS publisher ("io.github.acme/") names the server itself.
  const serverName = entry.name.includes("/") ? entry.name.slice(entry.name.indexOf("/") + 1) : entry.name;
  const text = `${serverName} ${repoPath}`.toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
}

/** Higher = shown earlier. Trust and popularity dominate; keyless and installable entries get a nudge. */
export function catalogScore(entry: CatalogEntry): number {
  let score = { official: 30, verified: 10, community: 0 }[computeTrustTier(entry)];
  const tokens = nameTokens(entry);
  const popularIndex = POPULAR_TOKENS.findIndex((token) => tokens.has(token));
  if (popularIndex >= 0) score += 100 - popularIndex * 2;
  if (FEATURED_SERVERS.some((n) => n.toLowerCase() === entry.name.toLowerCase())) score += 150;
  if (entry.install.kind === "unsupported") score -= 50;
  if (!entry.requiredEnv.some((v) => v.isRequired)) score += 5;
  if (entry.description.trim().length >= 20) score += 2;
  return score;
}

/** Best-first ordering for the Discover list; ties keep the registry's order. Does not mutate. */
export function rankCatalog(entries: CatalogEntry[]): CatalogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, score: catalogScore(entry) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.entry);
}

/**
 * The landing view: the registry's first page plus a direct lookup of every featured server (in
 * parallel; a failed lookup is ignored), de-duplicated by name. A search keeps one plain page.
 */
async function fetchRegistryEntries(query: string): Promise<CatalogEntry[]> {
  if (query) return (await searchMcpRegistry(query)).entries;
  const [first, ...featured] = await Promise.allSettled([
    searchMcpRegistry(undefined),
    ...FEATURED_SERVERS.map((name) => searchMcpRegistry(name)),
  ]);
  if (first.status === "rejected") throw first.reason;
  const byName = new Map<string, CatalogEntry>();
  const results = [first.value, ...featured.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))];
  for (const page of results) {
    for (const entry of page.entries) if (!byName.has(entry.name)) byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

function toCacheRow(entry: CatalogEntry, fetchedAt: number): McpCatalogCacheRow {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    version: entry.version,
    repository_url: entry.repositoryUrl,
    runtime: entry.install.kind,
    install_json: JSON.stringify(entry.install),
    required_env_json: JSON.stringify(entry.requiredEnv),
    fetched_at: fetchedAt,
  };
}

function fromCacheRow(row: McpCatalogCacheRow): CatalogEntry {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    repositoryUrl: row.repository_url,
    install: JSON.parse(row.install_json),
    requiredEnv: JSON.parse(row.required_env_json),
  };
}

export interface CatalogSearchResult {
  entries: CatalogEntry[];
  source: "live" | "cache";
  /** How stale the cache is, in ms; null if there's nothing cached at all. Only set when source is "cache". */
  cacheAgeMs: number | null;
  /** Set when source is "cache" — the error that caused the live fetch to be abandoned. */
  error: string | null;
}

/**
 * Search the live registry and refresh the local cache on success. On failure (offline,
 * registry down, blocked network) degrade to the cached results instead of breaking the
 * marketplace tab — per the plan's "must degrade gracefully" requirement.
 */
export async function searchCatalog(query: string): Promise<CatalogSearchResult> {
  try {
    const page = { entries: await fetchRegistryEntries(query) };
    // Fire-and-forget the cache write + stale eviction: these are pure side effects for the *next*
    // visit, so awaiting them just delays returning the results the user is waiting to see. The
    // eviction only runs on this successful-live path (never on the cache fallback below), so a
    // long offline stretch can't wipe the only fallback data available.
    if (page.entries.length > 0) {
      void upsertCatalogEntries(page.entries.map((e) => toCacheRow(e, Date.now())))
        .then(() => evictStaleCatalogEntries())
        .catch(() => {});
    } else {
      void evictStaleCatalogEntries().catch(() => {});
    }
    return { entries: rankCatalog(page.entries), source: "live", cacheAgeMs: null, error: null };
  } catch (err) {
    const cached = await loadCachedCatalog(query);
    const newestFetch = cached.reduce((max, r) => Math.max(max, r.fetched_at), 0);
    return {
      entries: rankCatalog(cached.map(fromCacheRow)),
      source: "cache",
      cacheAgeMs: newestFetch > 0 ? Date.now() - newestFetch : null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadCachedCatalog(query: string): Promise<McpCatalogCacheRow[]> {
  return query.trim() ? searchCachedCatalogEntries(query.trim()) : listCachedCatalogEntries();
}

/**
 * Cached-only read for instant paint — never touches the network. The marketplace renders this
 * immediately on mount / on a keystroke, then kicks off `searchCatalog` in the background and
 * merges the live results when they arrive (stale-while-revalidate).
 */
export async function getCachedCatalog(query: string): Promise<CatalogEntry[]> {
  const cached = await loadCachedCatalog(query);
  return rankCatalog(cached.map(fromCacheRow));
}
