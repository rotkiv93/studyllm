import type { ProviderType } from "./providers";

interface ModelsSource {
  /** Absolute URL to GET. */
  url: string;
  /** False for registries that are public (no key needed to list models). */
  requiresApiKey: boolean;
  /** Extracts model ids from the parsed JSON body — shapes differ per provider. */
  parse: (body: unknown) => string[];
  /** Drops ids that aren't usable chat models (audio/embedding/image variants etc). */
  filter?: (id: string) => boolean;
}

function openAiStyle(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (m as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string");
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
    parse: openAiStyle,
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
    parse: openAiStyle,
    filter: (id) => id.endsWith(":free"),
  },
  sambanova: {
    url: "https://api.sambanova.ai/v1/models",
    requiresApiKey: false,
    parse: openAiStyle,
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
 * cross-origin path the chat requests already use, no Rust hop needed. Returns null
 * (never throws) when the list can't be loaded, so callers fall back to the manifest's
 * hardcoded `suggestedModels` and the model field simply stays a free-text input.
 */
export async function fetchProviderModels(
  type: ProviderType,
  apiKey: string,
): Promise<string[] | null> {
  const source = MODELS_SOURCE[type];
  if (!source) return null;
  if (source.requiresApiKey && !apiKey.trim()) return null;

  try {
    const headers: Record<string, string> = {};
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const res = await fetch(source.url, { headers });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const ids = source.parse(body).filter((id, i, arr) => arr.indexOf(id) === i);
    const filtered = source.filter ? ids.filter(source.filter) : ids;
    return filtered.sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}
