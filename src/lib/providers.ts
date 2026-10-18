import type { MessageKey } from "./i18n";

export type ProviderType =
  | "gemini"
  | "mistral"
  | "groq"
  | "nvidia"
  | "openrouter"
  | "cohere"
  | "cerebras"
  | "github-models"
  | "sambanova"
  | "omniroute"
  | "ollama";

/** Emoji that makes each provider easy to tell apart in lists and pickers. */
const PROVIDER_ICONS: Record<ProviderType, string> = {
  gemini: "✨",
  mistral: "🌬️",
  groq: "⚡",
  nvidia: "🟩",
  openrouter: "🔀",
  cohere: "🔗",
  cerebras: "🧠",
  "github-models": "🐙",
  sambanova: "🚀",
  omniroute: "🧭",
  ollama: "🦙",
};

export function providerIcon(type: string): string {
  return PROVIDER_ICONS[type as ProviderType] ?? "🤖";
}

export interface ProviderManifestEntry {
  type: ProviderType;
  label: string;
  baseURL: string;
  docsUrl: string;
  apiKeyUrl: string;
  /** Curated tool-capable free model used as the seed and auto-select fallback. */
  defaultModel: string;
  /** Model list drifts often — this is a starting suggestion, not exhaustive. Users can type any model id. */
  suggestedModels: string[];
  /** Flagship free tiers we steer users toward (most generous + reliable for tool calls). */
  recommended: boolean;
  /**
   * One-line free-tier hint shown in the UI, e.g. quota + tool-calling reliability.
   * English source text — the UI renders the localized version via `freeTierNoteKey(type)`.
   */
  freeTierNote: string;
  /** When true, hidden from the add/onboarding pickers but still renders for already-saved rows. */
  deprecated?: boolean;
  /**
   * A router the student runs on their own machine (OmniRoute) rather than a hosted free tier.
   * Its URL is editable, its key is optional, and it's left out of the first-run wizard.
   */
  local?: boolean;
  /** Needs no API key at all (Ollama): the add form shows no key field and stores the placeholder. */
  keyless?: boolean;
}

/**
 * Curated free-tier providers as of mid-2026, ordered best-first (the object key order drives
 * `PROVIDER_TYPES` and the UI). Every `defaultModel` is a model known to support tool/function
 * calling on the provider's free tier. Rate limits and model names drift — treat this as a seed;
 * the model field in Settings is always freely editable and auto-selection prefers live data.
 */
export const PROVIDER_MANIFEST: Record<ProviderType, ProviderManifestEntry> = {
  gemini: {
    type: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    recommended: true,
    freeTierNote: "~1,500 req/day · native tool calling",
  },
  mistral: {
    type: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    docsUrl: "https://docs.mistral.ai/getting-started/models/",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    defaultModel: "mistral-small-latest",
    suggestedModels: ["mistral-small-latest", "open-mistral-nemo"],
    recommended: true,
    freeTierNote: "~1B tokens/month · reliable tools",
  },
  groq: {
    type: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    docsUrl: "https://console.groq.com/docs/models",
    apiKeyUrl: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    recommended: false,
    freeTierNote: "very fast · low daily quota",
  },
  nvidia: {
    type: "nvidia",
    label: "NVIDIA NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
    docsUrl: "https://docs.api.nvidia.com/nim/reference/llm-apis",
    apiKeyUrl: "https://build.nvidia.com/",
    defaultModel: "meta/llama-3.3-70b-instruct",
    suggestedModels: ["meta/llama-3.3-70b-instruct", "mistralai/mistral-small-24b-instruct"],
    recommended: false,
    freeTierNote: "1,000 credits · fresh keys may 429 until activated",
  },
  openrouter: {
    type: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/models?max_price=0",
    apiKeyUrl: "https://openrouter.ai/keys",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    suggestedModels: ["meta-llama/llama-3.3-70b-instruct:free"],
    recommended: false,
    freeTierNote: "many models · tool support varies",
  },
  cohere: {
    type: "cohere",
    label: "Cohere",
    baseURL: "https://api.cohere.ai/compatibility/v1",
    docsUrl: "https://docs.cohere.com/docs/compatibility-api",
    apiKeyUrl: "https://dashboard.cohere.com/api-keys",
    defaultModel: "command-a-03-2025",
    suggestedModels: ["command-a-03-2025", "command-r-plus-08-2024"],
    recommended: false,
    freeTierNote: "~1,000 calls/month · native tools",
  },
  cerebras: {
    type: "cerebras",
    label: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    docsUrl: "https://inference-docs.cerebras.ai/models/overview",
    apiKeyUrl: "https://cloud.cerebras.ai/",
    defaultModel: "llama-3.3-70b",
    suggestedModels: ["llama-3.3-70b", "qwen-3-32b", "gpt-oss-120b"],
    recommended: false,
    freeTierNote: "fast · some models need a paid tier",
  },
  "github-models": {
    type: "github-models",
    label: "GitHub Models",
    baseURL: "https://models.github.ai/inference",
    docsUrl: "https://docs.github.com/en/github-models",
    apiKeyUrl: "https://github.com/settings/tokens",
    defaultModel: "openai/gpt-4o-mini",
    suggestedModels: ["openai/gpt-4o-mini", "meta/Llama-3.3-70B-Instruct"],
    recommended: false,
    freeTierNote: "low daily quota",
  },
  sambanova: {
    type: "sambanova",
    label: "SambaNova",
    baseURL: "https://api.sambanova.ai/v1",
    docsUrl: "https://docs.sambanova.ai/",
    apiKeyUrl: "https://cloud.sambanova.ai/apis",
    defaultModel: "Meta-Llama-3.3-70B-Instruct",
    suggestedModels: ["Meta-Llama-3.3-70B-Instruct"],
    recommended: false,
    freeTierNote: "trial credits only",
    deprecated: true,
  },
  omniroute: {
    type: "omniroute",
    label: "OmniRoute (local router)",
    baseURL: "http://localhost:20128/v1",
    docsUrl: "https://www.omniroute.online/es/",
    apiKeyUrl: "https://github.com/diegosouzapw/OmniRoute",
    // OmniRoute's own "auto" combos pick the upstream provider/model from the keys it holds.
    defaultModel: "auto/best-chat",
    suggestedModels: ["auto/best-chat", "auto/best-fast", "auto/best-coding"],
    recommended: false,
    freeTierNote: "runs on your computer · pools your own free keys",
    local: true,
  },
  ollama: {
    type: "ollama",
    label: "Ollama (local models)",
    // Ollama's OpenAI-compatible surface; the model list comes from its own `/api/tags`.
    baseURL: "http://localhost:11434/v1",
    docsUrl: "https://ollama.com/library",
    apiKeyUrl: "https://ollama.com/download",
    defaultModel: "llama3.2",
    suggestedModels: ["llama3.2", "qwen2.5", "llama3.1"],
    recommended: false,
    freeTierNote: "runs on your computer · no key, no limits, works offline",
    local: true,
    keyless: true,
  },
};

export const PROVIDER_TYPES = Object.keys(PROVIDER_MANIFEST) as ProviderType[];

/**
 * i18n key for a provider's free-tier note. Provider *labels* are brand names and stay untranslated;
 * only the descriptive quota/tool-support note is localized.
 */
export function freeTierNoteKey(type: ProviderType): MessageKey {
  return `provider.freeTier.${type}` as MessageKey;
}

/**
 * Provider types offered in the add/onboarding pickers — excludes deprecated ones. Already-saved
 * providers of any type still render and route; deprecation only removes them from new selection.
 */
export const SELECTABLE_PROVIDER_TYPES = PROVIDER_TYPES.filter(
  (t) => !PROVIDER_MANIFEST[t].deprecated,
);

/** Hosted free tiers offered by the first-run wizard — the local router is an advanced extra. */
export const ONBOARDING_PROVIDER_TYPES = SELECTABLE_PROVIDER_TYPES.filter(
  (t) => !PROVIDER_MANIFEST[t].local,
);

/** Key stored for a local provider that doesn't need one (the keychain entry can't be empty). */
export const LOCAL_ROUTER_PLACEHOLDER_KEY = "local";
