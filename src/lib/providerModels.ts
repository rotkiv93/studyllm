import { PROVIDER_MANIFEST, type ProviderType } from "./providers";
import { fetchModelCatalog, lookupToolSupport } from "./modelCatalog";

/**
 * A live model plus what we know about its tool-calling support:
 * `true`/`false` when known, `undefined` when we couldn't determine it (the UI then
 * leaves it unbadged and never filters it out).
 */
export interface ModelInfo {
  id: string;
  supportsTools?: boolean;
}

interface ModelsSource {
  /** Absolute URL to GET. */
  url: string;
  /** False for registries that are public (no key needed to list models). */
  requiresApiKey: boolean;
  /** Extracts models from the parsed JSON body — shapes differ per provider. */
  parse: (body: unknown) => ModelInfo[];
  /** Drops ids that aren't usable chat models (audio/embedding/image variants etc). */
  filter?: (id: string) => boolean;
}

/** OpenAI-style `{ data: [{ id }] }` — no capability metadata, so supportsTools stays unknown. */
function openAiStyle(body: unknown): ModelInfo[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (m as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string")
    .map((id) => ({ id }));
}

/** OpenRouter exposes `supported_parameters`, which contains "tools" for tool-capable models. */
function openRouterStyle(body: unknown): ModelInfo[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => m as { id?: unknown; supported_parameters?: unknown })
    .filter((m): m is { id: string; supported_parameters?: unknown } => typeof m?.id === "string")
    .map((m) => ({
      id: m.id,
      supportsTools: Array.isArray(m.supported_parameters)
        ? m.supported_parameters.includes("tools")
        : undefined,
    }));
}

/** Mistral exposes `capabilities.function_calling` per model. */
function mistralStyle(body: unknown): ModelInfo[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => m as { id?: unknown; capabilities?: { function_calling?: unknown } })
    .filter((m): m is { id: string; capabilities?: { function_calling?: unknown } } => typeof m?.id === "string")
    .map((m) => ({
      id: m.id,
      supportsTools:
        typeof m.capabilities?.function_calling === "boolean"
          ? m.capabilities.function_calling
          : undefined,
    }));
}

const excludes = (keywords: string[]) => (id: string) => {
  const lower = id.toLowerCase();
  return !keywords.some((k) => lower.includes(k));
};

const MODELS_SOURCE: Partial<Record<ProviderType, ModelsSource>> = {
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    requiresApiKey: true,
    parse: openAiStyle,
    filter: excludes(["whisper", "tts"]),
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/models",
    requiresApiKey: true,
    parse: openAiStyle,
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    requiresApiKey: true,
    parse: mistralStyle,
    filter: excludes(["embed", "moderat", "ocr"]),
  },
  gemini: {
    // The OpenAI-compatible surface (same one used for chat) also serves GET /models.
    url: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    requiresApiKey: true,
    parse: openAiStyle,
    filter: excludes(["embedding", "aqa", "imagen", "veo", "tts"]),
  },
  openrouter: {
    // Public catalog with pricing; only the $0 "free" tier is relevant to this app.
    url: "https://openrouter.ai/api/v1/models",
    requiresApiKey: false,
    parse: openRouterStyle,
    filter: (id) => id.endsWith(":free"),
  },
  nvidia: {
    // OpenAI-compatible catalog; capability metadata comes from models.dev enrichment.
    url: "https://integrate.api.nvidia.com/v1/models",
    requiresApiKey: true,
    parse: openAiStyle,
    filter: excludes(["embed", "rerank", "embedqa", "vila", "ocr"]),
  },
  cohere: {
    // Cohere's OpenAI-compatibility surface serves GET /models with a (trial) key.
    url: "https://api.cohere.ai/compatibility/v1/models",
    requiresApiKey: true,
    parse: openAiStyle,
    filter: excludes(["embed", "rerank"]),
  },
  "github-models": {
    // The inference host's own /models needs a token; the public catalog doesn't.
    url: "https://models.github.ai/catalog/models",
    requiresApiKey: false,
    parse: (body) =>
      Array.isArray(body)
        ? body
            .map((m) => (m as { id?: unknown })?.id)
            .filter((id): id is string => typeof id === "string")
            .map((id) => ({ id }))
        : [],
  },
};

export function providerSupportsLiveModels(type: ProviderType): boolean {
  return type in MODELS_SOURCE;
}

export function providerModelsNeedApiKey(type: ProviderType): boolean {
  return MODELS_SOURCE[type]?.requiresApiKey ?? false;
}

/**
 * Fetches the live model list for a provider directly from its HTTPS API — same
 * cross-origin path the chat requests already use, no Rust hop needed. Each model is
 * enriched with tool-calling support: the provider's own metadata when available
 * (OpenRouter/Mistral), otherwise the models.dev catalog, otherwise left unknown.
 * Returns null (never throws) when the list can't be loaded, so callers fall back to
 * the manifest's hardcoded `suggestedModels` and the model field stays a free-text input.
 */
export async function fetchProviderModels(
  type: ProviderType,
  apiKey: string,
): Promise<ModelInfo[] | null> {
  const source = MODELS_SOURCE[type];
  if (!source) return null;
  if (source.requiresApiKey && !apiKey.trim()) return null;

  try {
    const headers: Record<string, string> = {};
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const res = await fetch(source.url, { headers });
    if (!res.ok) return null;
    const body: unknown = await res.json();

    const seen = new Set<string>();
    const parsed = source.parse(body).filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    const filtered = source.filter ? parsed.filter((m) => source.filter!(m.id)) : parsed;

    // Fill in any still-unknown capability from the external catalog.
    const catalog = await fetchModelCatalog();
    const enriched = filtered.map((m) =>
      m.supportsTools === undefined
        ? { ...m, supportsTools: lookupToolSupport(catalog, type, m.id) }
        : m,
    );

    return enriched.sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return null;
  }
}

/**
 * Picks the model to auto-select for a provider once its live list is known, preferring
 * tool-capable free models so a freshly-added provider can run MCP tools out of the box:
 *   1. the highest-priority curated `suggestedModel` present in the live list and not known to
 *      lack tools (curation is trusted, so unknown capability still counts here);
 *   2. otherwise the first live model explicitly flagged tool-capable;
 *   3. otherwise the manifest's `defaultModel` (also the fallback when `models` is empty/undefined).
 * Users can always override afterward — this only chooses a sensible starting point.
 */
export function pickBestModel(type: ProviderType, models: ModelInfo[] | null): string {
  const fallback = PROVIDER_MANIFEST[type].defaultModel;
  if (!models || models.length === 0) return fallback;

  // 1. Curated suggestions in priority order — pick the flagship first when it's live.
  for (const id of PROVIDER_MANIFEST[type].suggestedModels) {
    const live = models.find((m) => m.id === id);
    if (live && live.supportsTools !== false) return id;
  }

  // 2. Any other model the live list explicitly reports as tool-capable.
  const firstToolCapable = models.find((m) => m.supportsTools === true);
  if (firstToolCapable) return firstToolCapable.id;

  return fallback;
}
