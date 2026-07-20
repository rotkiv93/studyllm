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

const TRUST_RANK: Record<TrustTier, number> = { official: 0, verified: 1, community: 2 };

export function sortByTrust(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort(
    (a, b) => TRUST_RANK[computeTrustTier(a)] - TRUST_RANK[computeTrustTier(b)],
  );
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
    const page = await searchMcpRegistry(query || undefined);
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
    return { entries: sortByTrust(page.entries), source: "live", cacheAgeMs: null, error: null };
  } catch (err) {
    const cached = await loadCachedCatalog(query);
    const newestFetch = cached.reduce((max, r) => Math.max(max, r.fetched_at), 0);
    return {
      entries: sortByTrust(cached.map(fromCacheRow)),
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
  return sortByTrust(cached.map(fromCacheRow));
}
