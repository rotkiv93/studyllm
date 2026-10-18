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
  /** First / last source page the chunk touches — only set when the caller supplied page spans. */
  pageStart?: number;
  pageEnd?: number;
}

/** Where one source page sits in the text handed to `chunkText` (half-open character offsets). */
export interface PageSpan {
  page: number;
  start: number;
  end: number;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  size?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlap?: number;
  /** Page layout of `text` (offsets into the text as passed in); enables `pageStart`/`pageEnd`. */
  pages?: PageSpan[];
}

const DEFAULT_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

interface Unit {
  text: string;
  /** Offset of `text` within the normalized document. */
  start: number;
}

/** Split into paragraphs (blank-line separated), then sentences, remembering where each begins. */
function splitIntoUnits(text: string): Unit[] {
  const units: Unit[] = [];
  let pos = 0;
  for (const para of text.split(/(\n{2,})/)) {
    const paraStart = pos;
    pos += para.length;
    const trimmed = para.trim();
    if (!trimmed) continue;
    const trimStart = paraStart + (para.length - para.trimStart().length);
    // Sentence-ish split: keep the terminator with the sentence.
    const sentences = [...trimmed.matchAll(/[^.!?\n]+[.!?]*(\s+|$)/g)];
    if (sentences.length > 0) {
      for (const m of sentences) {
        const st = m[0].trim();
        if (st) units.push({ text: st, start: trimStart + m.index + (m[0].length - m[0].trimStart().length) });
      }
    } else {
      units.push({ text: trimmed, start: trimStart });
    }
  }
  return units;
}

/** The page containing `offset` (the last span starting at or before it). */
function pageAt(pages: PageSpan[], offset: number): number {
  let found = pages[0]?.page ?? 0;
  for (const p of pages) {
    if (p.start <= offset) found = p.page;
    else break;
  }
  return found;
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
  const pages = options.pages && options.pages.length > 0 ? options.pages : null;

  const crlf = text.replace(/\r\n/g, "\n");
  const normalized = crlf.trim();
  if (!normalized) return [];
  // `pages` offsets are relative to `text`; units are relative to the trimmed text.
  const lead = crlf.length - crlf.trimStart().length;
  const pageOf = (offset: number) => (pages ? pageAt(pages, offset + lead) : 0);

  const units = splitIntoUnits(normalized);
  const chunks: { text: string; pageStart: number; pageEnd: number }[] = [];
  let current = "";
  let curStart = 0;
  let curEnd = 0;

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push({ text: trimmed, pageStart: curStart, pageEnd: curEnd });
  };

  for (const unit of units) {
    const uStart = pageOf(unit.start);
    const uEnd = pageOf(unit.start + unit.text.length - 1);
    // A single unit larger than the target: hard-split it into size-sized windows.
    if (unit.text.length > size) {
      push();
      current = "";
      for (let i = 0; i < unit.text.length; i += size - overlap) {
        const piece = unit.text.slice(i, i + size);
        chunks.push({
          text: piece.trim(),
          pageStart: pageOf(unit.start + i),
          pageEnd: pageOf(unit.start + i + piece.length - 1),
        });
      }
      continue;
    }
    if (current && current.length + 1 + unit.text.length > size) {
      push();
      const tail = overlapTail(current, overlap);
      // The carried-over tail comes from the end of the chunk just closed.
      current = tail ? `${tail} ${unit.text}` : unit.text;
      curStart = tail ? curEnd : uStart;
      curEnd = uEnd;
    } else {
      if (!current) curStart = uStart;
      current = current ? `${current} ${unit.text}` : unit.text;
      curEnd = uEnd;
    }
  }
  push();

  return chunks
    .filter((c) => c.text)
    .map((c, seq) => (pages ? { seq, text: c.text, pageStart: c.pageStart, pageEnd: c.pageEnd } : { seq, text: c.text }));
}
