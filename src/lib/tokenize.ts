/**
 * A tiny, dependency-free, *approximate* tokenizer for teaching.
 *
 * Real LLMs split text with a learned byte-pair-encoding vocabulary (GPT-4 uses ~100k tokens); we
 * deliberately don't ship that multi-megabyte table. Instead this mimics the *shape* of how those
 * tokenizers behave so a non-technical student can see the important truths for themselves:
 *
 *   • text is split into chunks that are NOT the same as words or letters,
 *   • a leading space rides along with the word after it,
 *   • long words get broken into sub-word pieces,
 *   • numbers and punctuation split oddly,
 *   • so "token count" ≠ "word count" ≠ "character count" — which is *why* a model can't reliably
 *     count the letters in "strawberry": it never sees the letters, only these chunks.
 *
 * The pre-tokenization regex is modeled on GPT-2's. Counts are labeled "approximate" in the UI —
 * this is an intuition-builder, not a billing meter.
 */

export interface TokenPiece {
  /** The raw substring this piece covers (may start with a space or be whitespace). */
  text: string;
  /** True when the piece is purely whitespace (rendered specially in the UI). */
  whitespace: boolean;
}

// Contractions, a space-prefixed word, a space-prefixed number run, a space-prefixed punctuation
// run, or a whitespace run — the GPT-2 split, in that priority order.
const PRETOKEN_RE = /'(?:s|t|re|ve|m|ll|d)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+/gu;

const WORDLIKE_RE = /^[\p{L}\p{N}]+$/u;

/** Roughly how big a sub-word piece is when a long word gets broken up (~4 chars ≈ 1 token). */
function pieceSize(body: string, i: number): number {
  const remaining = body.length - i;
  if (remaining <= 5) return remaining; // don't leave an awkward 1-char tail
  return 4;
}

/**
 * Split `text` into approximate tokens. Returns [] for empty input. Long alphanumeric runs are
 * broken into sub-word pieces; whitespace runs and punctuation stay whole.
 */
export function tokenize(text: string): TokenPiece[] {
  if (!text) return [];
  const pretokens = text.match(PRETOKEN_RE) ?? [];
  const out: TokenPiece[] = [];

  for (const pre of pretokens) {
    if (/^\s+$/.test(pre)) {
      out.push({ text: pre, whitespace: true });
      continue;
    }
    const leading = pre.startsWith(" ") ? " " : "";
    const body = leading ? pre.slice(1) : pre;

    if (WORDLIKE_RE.test(body) && body.length > 6) {
      let i = 0;
      let first = true;
      while (i < body.length) {
        const size = pieceSize(body, i);
        const piece = (first ? leading : "") + body.slice(i, i + size);
        out.push({ text: piece, whitespace: false });
        i += size;
        first = false;
      }
    } else {
      out.push({ text: pre, whitespace: false });
    }
  }

  return out;
}

/** Approximate token count — the number of pieces {@link tokenize} would produce. */
export function estimateTokenCount(text: string): number {
  return tokenize(text).length;
}

/** Word count (whitespace-delimited), for the side-by-side "tokens ≠ words" comparison. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
