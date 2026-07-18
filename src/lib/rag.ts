/**
 * RAG orchestration — "chat with your documents". Ties together the pieces:
 *   ingest:   parse a file (reusing the attachment parser) → chunk → embed → store
 *   retrieve: embed the query → cosine-rank stored chunks → top-k passages
 *   ground:   turn the top passages into a system block the model must answer from, with citations
 *
 * Retrieval ranks in TypeScript (cosine over every stored chunk). That's fine at student scale
 * (tens of documents); it would need a real vector index for thousands. See PROJECT_STATUS.md.
 */

import { parseAttachment } from "./attachments";
import { chunkText } from "./chunking";
import {
  embedTexts,
  embedQuery,
  cosineSimilarity,
  loadEmbeddingConfig,
  type ResolvedEmbedder,
} from "./embeddings";
import { PROVIDER_MANIFEST } from "./providers";
import { getCredential } from "./credentials";
import {
  insertRagDocument,
  insertRagChunks,
  listAllRagChunks,
  type ProviderRow,
  type RagChunkRow,
  type RagDocumentRow,
} from "./db";

function newId(): string {
  return crypto.randomUUID();
}

/** How many passages to retrieve per question by default. */
export const DEFAULT_RETRIEVE_K = 5;

/**
 * Resolve the persisted embedding config against the live providers list + keychain into something
 * callable. Returns null (with a reason) when embeddings aren't set up — the caller surfaces it.
 */
export async function resolveEmbedder(
  providers: ProviderRow[],
): Promise<{ embedder: ResolvedEmbedder } | { error: string }> {
  const config = loadEmbeddingConfig();
  if (!config) {
    return { error: "No embedding model selected. Pick one in the Library settings." };
  }
  const row = providers.find((p) => p.id === config.providerId && p.enabled);
  if (!row) {
    return { error: "The embedding provider is missing or disabled. Choose another in Library settings." };
  }
  const apiKey = (await getCredential(row.secret_ref)) ?? "";
  if (!apiKey) {
    return { error: `No API key found for ${row.label}. Re-enter it in Providers.` };
  }
  return {
    embedder: {
      name: row.type,
      baseURL: row.base_url_override ?? PROVIDER_MANIFEST[row.type].baseURL,
      apiKey,
      model: config.model,
    },
  };
}

/** Parse + chunk + embed + persist a file as a library document. Returns the stored document row. */
export async function ingestDocument(file: File, embedder: ResolvedEmbedder): Promise<RagDocumentRow> {
  const parsed = await parseAttachment(file);
  const chunks = chunkText(parsed.text);
  if (chunks.length === 0) {
    throw new Error(`"${file.name}" had no usable text to index.`);
  }
  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    embedder,
  );
  const now = Date.now();
  const documentId = newId();
  const doc: RagDocumentRow = {
    id: documentId,
    name: parsed.name,
    char_count: parsed.text.length,
    chunk_count: chunks.length,
    embed_model: embedder.model,
    created_at: now,
  };
  const chunkRows: RagChunkRow[] = chunks.map((c, i) => ({
    id: newId(),
    document_id: documentId,
    seq: c.seq,
    text: c.text,
    embedding: JSON.stringify(vectors[i] ?? []),
    created_at: now,
  }));
  await insertRagDocument(doc);
  await insertRagChunks(chunkRows);
  return doc;
}

export interface RetrievedChunk {
  documentName: string;
  seq: number;
  text: string;
  score: number;
}

/** Embed the query and return the top-k most similar stored chunks across all documents. */
export async function retrieve(
  query: string,
  embedder: ResolvedEmbedder,
  k: number = DEFAULT_RETRIEVE_K,
): Promise<RetrievedChunk[]> {
  const rows = await listAllRagChunks();
  if (rows.length === 0) return [];
  const queryVec = await embedQuery(query, embedder);
  const scored = rows.map((row) => {
    let vec: number[];
    try {
      vec = JSON.parse(row.embedding) as number[];
    } catch {
      vec = [];
    }
    return {
      documentName: row.document_name,
      seq: row.seq,
      text: row.text,
      score: cosineSimilarity(queryVec, vec),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** A scored chunk that also carries its embedding vector — for the retrieval-explorer visuals. */
export interface ExplainedChunk extends RetrievedChunk {
  /** The chunk's stored embedding vector (used to plot it in the 2D embedding map). */
  vector: number[];
}

/** The full, teachable picture of one retrieval run — every chunk scored, nothing discarded. */
export interface RetrievalExplanation {
  /** The embedded query vector (dimension = the embedding model's size). */
  queryVector: number[];
  /** How many top chunks a real turn would keep (the cutoff shown in the ranking). */
  k: number;
  /** Every stored chunk, scored against the query, sorted best-first. Retrieved = first `k`. */
  scored: ExplainedChunk[];
}

/**
 * Like {@link retrieve}, but keeps *everything* the chat path throws away — the query vector, every
 * chunk's score, and every chunk's vector — so the retrieval playground can visualize the whole
 * ranking and the embedding space. Does not touch the chat retrieval path.
 */
export async function retrieveExplained(
  query: string,
  embedder: ResolvedEmbedder,
  k: number = DEFAULT_RETRIEVE_K,
): Promise<RetrievalExplanation> {
  const rows = await listAllRagChunks();
  const queryVec = await embedQuery(query, embedder);
  const scored: ExplainedChunk[] = rows.map((row) => {
    let vec: number[];
    try {
      vec = JSON.parse(row.embedding) as number[];
    } catch {
      vec = [];
    }
    return {
      documentName: row.document_name,
      seq: row.seq,
      text: row.text,
      score: cosineSimilarity(queryVec, vec),
      vector: vec,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return { queryVector: queryVec, k, scored };
}

/**
 * Build the grounding system block fed to the model. It instructs the model to answer only from the
 * retrieved passages and to cite them as `[DocName #seq]`, so the answer is traceable to the
 * student's own sources (and honestly admits when the library doesn't cover the question).
 */
export function buildRagSystemBlock(chunks: RetrievedChunk[]): string {
  const passages = chunks
    .map((c) => `[${c.documentName} #${c.seq}]\n${c.text}`)
    .join("\n\n");
  return (
    "You are answering using the student's personal document library (retrieval-augmented). " +
    "Use ONLY the passages below to answer. Cite every claim with its source tag like " +
    "[DocName #seq]. If the passages do not contain the answer, say so plainly instead of guessing.\n\n" +
    "=== Retrieved passages ===\n" +
    passages
  );
}
