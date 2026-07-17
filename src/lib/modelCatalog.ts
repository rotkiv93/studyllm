import type { ProviderType } from "./providers";

/**
 * External model-capability catalog sourced from models.dev — an open, keyless
 * catalog keyed `provider -> modelId -> { tool_call: boolean, ... }`. Our own
 * providers' /models endpoints mostly return ids only (only OpenRouter and Mistral
 * expose tool support), so this catalog is what lets us badge/filter tool-capable
 * models for every provider. It's advisory: any failure degrades to "unknown", never
 * blocks the UI, and users can still type any model id.
 */

const CATALOG_URL = "https://models.dev/api.json";
const CACHE_KEY = "studyllm.modelCatalog.v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — capability data drifts slowly.

/** One catalog entry keeps only the fields we read; the real payload has many more. */
interface CatalogModel {
  tool_call?: boolean;
}

/** provider key -> (model id -> entry). */
export type ModelCatalog = Record<string, Record<string, CatalogModel>>;

/**
 * Maps our `ProviderType` to the provider key models.dev uses. Most match by name; the
 * odd one out is Gemini, catalogued under Google's "google" key.
 */
const PROVIDER_TO_CATALOG_KEY: Record<ProviderType, string> = {
  cerebras: "cerebras",
  groq: "groq",
  gemini: "google",
  nvidia: "nvidia",
  cohere: "cohere",
  "github-models": "github-models",
  mistral: "mistral",
  openrouter: "openrouter",
  sambanova: "sambanova",
};

let inflight: Promise<ModelCatalog | null> | null = null;

function readCache(): ModelCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: ModelCatalog };
    if (!parsed?.data || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: ModelCatalog): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Quota/serialization issues are non-fatal — we just refetch next session.
  }
}

/**
 * Fetches the models.dev catalog, memoized for the session and cached to localStorage
 * for ~24h. Returns null (never throws) when it can't be loaded, so callers treat every
 * model's capability as "unknown" rather than blocking.
 */
export async function fetchModelCatalog(): Promise<ModelCatalog | null> {
  const cached = readCache();
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) return null;
      const data = (await res.json()) as ModelCatalog;
      if (!data || typeof data !== "object") return null;
      writeCache(data);
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Normalizes a model id to the form models.dev catalogs it under. OpenRouter free-tier
 * ids carry a `:free` suffix the catalog doesn't use; everything else is passed through
 * (owner/model prefixes like `meta-llama/...` are kept — the catalog uses them too).
 */
function normalizeModelId(id: string): string {
  return id.replace(/:free$/, "");
}

/**
 * Looks up whether a given provider's model supports tool calling per the catalog.
 * Returns true/false when the model is catalogued, or undefined when it isn't found (or
 * the catalog is unavailable) — i.e. "unknown", which the UI leaves unbadged.
 */
export function lookupToolSupport(
  catalog: ModelCatalog | null,
  type: ProviderType,
  modelId: string,
): boolean | undefined {
  if (!catalog) return undefined;
  const providerModels = catalog[PROVIDER_TO_CATALOG_KEY[type]];
  if (!providerModels) return undefined;
  const normalized = normalizeModelId(modelId);
  const entry = providerModels[normalized] ?? providerModels[modelId];
  if (!entry || typeof entry.tool_call !== "boolean") return undefined;
  return entry.tool_call;
}
