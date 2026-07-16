import { searchMcpRegistry, type CatalogEntry } from "./mcp";
import {
  upsertCatalogEntries,
  listCachedCatalogEntries,
  searchCachedCatalogEntries,
  type McpCatalogCacheRow,
} from "./db";

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

export function trustTierLabel(tier: TrustTier): string {
  return tier === "official" ? "Official" : tier === "verified" ? "Verified" : "Community";
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
    if (page.entries.length > 0) {
      await upsertCatalogEntries(page.entries.map((e) => toCacheRow(e, Date.now())));
    }
    return { entries: sortByTrust(page.entries), source: "live", cacheAgeMs: null, error: null };
  } catch (err) {
    const cached = query.trim()
      ? await searchCachedCatalogEntries(query.trim())
      : await listCachedCatalogEntries();
    const newestFetch = cached.reduce((max, r) => Math.max(max, r.fetched_at), 0);
    return {
      entries: sortByTrust(cached.map(fromCacheRow)),
      source: "cache",
      cacheAgeMs: newestFetch > 0 ? Date.now() - newestFetch : null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
