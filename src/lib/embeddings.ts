/**
 * Text embeddings for RAG — turns document chunks and queries into vectors so we can rank passages
 * by semantic similarity (meaning, not just keyword overlap).
 *
 * Embeddings are computed in the frontend by calling a configured provider's OpenAI-compatible
 * `/embeddings` endpoint directly (same architecture as chat — no Rust hop; the app CSP already
 * permits `connect-src https:`). We reuse the exact client the chat router uses
 * (`createOpenAICompatible`), pointed at whichever provider the student chose for embeddings.
 *
 * `cosineSimilarity` is pure and unit-tested; `embedTexts` hits the network.
 */

import { embedMany, embed } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderType } from "./providers";

/**
 * Providers whose OpenAI-compatible endpoint reliably serves embeddings, mapped to a sensible
 * default embedding model. Students can still edit the model id in the Library settings. Providers
 * absent here aren't offered for embeddings in the picker.
 */
export const EMBEDDING_CAPABLE: Partial<Record<ProviderType, string>> = {
  gemini: "text-embedding-004",
  mistral: "mistral-embed",
};

/** Persisted (localStorage) choice of which configured provider + model to embed with. */
export interface EmbeddingConfig {
  /** A `providers` row id (not a ProviderType) — the concrete configured provider to use. */
  providerId: string;
  model: string;
}

/** Everything needed to actually make the call, resolved from a config + the provider's secret. */
export interface ResolvedEmbedder {
  /** Provider type name passed to the AI SDK client (e.g. "gemini"). */
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

const CONFIG_KEY = "ragEmbeddingConfig";
/** Batch size for embedding many chunks — keeps request bodies within provider limits. */
const EMBED_BATCH = 64;

export function loadEmbeddingConfig(): EmbeddingConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EmbeddingConfig;
    if (parsed && typeof parsed.providerId === "string" && typeof parsed.model === "string") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function saveEmbeddingConfig(config: EmbeddingConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Embed a batch of texts into vectors, preserving input order. */
export async function embedTexts(texts: string[], embedder: ResolvedEmbedder): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = createOpenAICompatible({
    name: embedder.name,
    baseURL: embedder.baseURL,
    apiKey: embedder.apiKey,
  });
  const model = client.textEmbeddingModel(embedder.model);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const slice = texts.slice(i, i + EMBED_BATCH);
    const { embeddings } = await embedMany({ model, values: slice });
    out.push(...embeddings);
  }
  return out;
}

/** Embed a single string (e.g. a search query). */
export async function embedQuery(text: string, embedder: ResolvedEmbedder): Promise<number[]> {
  const client = createOpenAICompatible({
    name: embedder.name,
    baseURL: embedder.baseURL,
    apiKey: embedder.apiKey,
  });
  const { embedding } = await embed({ model: client.textEmbeddingModel(embedder.model), value: text });
  return embedding;
}

/** Cosine similarity of two equal-length vectors; 0 when either is degenerate. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
