export type ProviderType =
  | "cerebras"
  | "groq"
  | "gemini"
  | "github-models"
  | "mistral"
  | "openrouter"
  | "sambanova";

export interface ProviderManifestEntry {
  type: ProviderType;
  label: string;
  baseURL: string;
  docsUrl: string;
  apiKeyUrl: string;
  defaultModel: string;
  /** Model list drifts often — this is a starting suggestion, not exhaustive. Users can type any model id. */
  suggestedModels: string[];
}

/**
 * Free-tier provider defaults as of mid-2026. Rate limits and model names drift —
 * treat this as a seed list; the model field in Settings is always freely editable.
 */
export const PROVIDER_MANIFEST: Record<ProviderType, ProviderManifestEntry> = {
  cerebras: {
    type: "cerebras",
    label: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    docsUrl: "https://inference-docs.cerebras.ai/models/overview",
    apiKeyUrl: "https://cloud.cerebras.ai/",
    defaultModel: "llama-3.3-70b",
    suggestedModels: ["llama-3.3-70b", "qwen-3-32b"],
  },
  groq: {
    type: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    docsUrl: "https://console.groq.com/docs/models",
    apiKeyUrl: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  gemini: {
    type: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
  "github-models": {
    type: "github-models",
    label: "GitHub Models",
    baseURL: "https://models.github.ai/inference",
    docsUrl: "https://docs.github.com/en/github-models",
    apiKeyUrl: "https://github.com/settings/tokens",
    defaultModel: "openai/gpt-4o-mini",
    suggestedModels: ["openai/gpt-4o-mini", "meta/Llama-3.3-70B-Instruct"],
  },
  mistral: {
    type: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    docsUrl: "https://docs.mistral.ai/getting-started/models/",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    defaultModel: "mistral-small-latest",
    suggestedModels: ["mistral-small-latest"],
  },
  openrouter: {
    type: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/models?max_price=0",
    apiKeyUrl: "https://openrouter.ai/keys",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    suggestedModels: ["meta-llama/llama-3.3-70b-instruct:free"],
  },
  sambanova: {
    type: "sambanova",
    label: "SambaNova",
    baseURL: "https://api.sambanova.ai/v1",
    docsUrl: "https://docs.sambanova.ai/",
    apiKeyUrl: "https://cloud.sambanova.ai/apis",
    defaultModel: "Meta-Llama-3.3-70B-Instruct",
    suggestedModels: ["Meta-Llama-3.3-70B-Instruct"],
  },
};

export const PROVIDER_TYPES = Object.keys(PROVIDER_MANIFEST) as ProviderType[];
