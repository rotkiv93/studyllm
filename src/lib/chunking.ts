/**
 * Split a document's extracted text into overlapping chunks for RAG embedding + retrieval.
 *
 * Retrieval works best on passage-sized pieces: small enough that a chunk is "about" one thing (so
 * its embedding is a sharp signal), large enough to carry standalone meaning. We split on paragraph
 * boundaries first, fall back to sentence boundaries, and only hard-cut mid-sentence for a single
 * run of text longer than the target. A small overlap between consecutive chunks keeps context that
 * straddles a boundary retrievable from at least one chunk.
 *
 * Pure and dependency-free — unit-tested in `chunking.test.ts`.
 */

export interface TextChunk {
  /** 0-based position of this chunk within its document. */
  seq: number;
  text: string;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  size?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlap?: number;
}

const DEFAULT_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

/** Split into paragraphs (blank-line separated), then sentences, keeping the delimiters trimmed. */
function splitIntoUnits(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const units: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    // Sentence-ish split: keep the terminator with the sentence.
    const sentences = trimmed.match(/[^.!?\n]+[.!?]*(\s+|$)/g);
    if (sentences) {
      for (const s of sentences) {
        const st = s.trim();
        if (st) units.push(st);
      }
    } else {
      units.push(trimmed);
    }
  }
  return units;
}

/** The tail of `text` to repeat as overlap, cut on a whitespace boundary where possible. */
function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return text.length <= overlap ? text : "";
  const tail = text.slice(text.length - overlap);
  const spaceIdx = tail.indexOf(" ");
  return spaceIdx > 0 ? tail.slice(spaceIdx + 1) : tail;
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const size = options.size ?? DEFAULT_SIZE;
  const overlap = Math.min(options.overlap ?? DEFAULT_OVERLAP, Math.floor(size / 2));

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const units = splitIntoUnits(normalized);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const unit of units) {
    // A single unit larger than the target: hard-split it into size-sized windows.
    if (unit.length > size) {
      push();
      current = "";
      for (let i = 0; i < unit.length; i += size - overlap) {
        chunks.push(unit.slice(i, i + size).trim());
      }
      continue;
    }
    if (current && current.length + 1 + unit.length > size) {
      push();
      const tail = overlapTail(current, overlap);
      current = tail ? `${tail} ${unit}` : unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
  }
  push();

  return chunks
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, seq) => ({ seq, text }));
}
