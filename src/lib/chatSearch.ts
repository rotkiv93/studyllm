/** Helpers for the sidebar's search over all conversations (SQLite FTS5, see migration 12). */

/** Markers `searchMessages` asks FTS5's snippet() to wrap each match in. Control characters, so
 *  they can't collide with anything a student types. */
export const MATCH_START = "\u0001";
export const MATCH_END = "\u0002";

/**
 * Turns what the student typed into a safe FTS5 MATCH expression: every word becomes a quoted
 * prefix term (`"reg"*`), all ANDed, so partial words match as you type and FTS5 syntax characters
 * (quotes, `-`, `:`, `*`, parentheses, AND/OR/NOT) are taken literally. Returns null when there is
 * nothing searchable. Accent-insensitivity comes from the table's tokenizer, not from here.
 */
export function buildFtsQuery(input: string): string | null {
  const words = input.match(/[\p{L}\p{N}]+/gu);
  if (!words) return null;
  return words.map((w) => `"${w}"*`).join(" ");
}

export interface SnippetPart {
  text: string;
  match: boolean;
}

/** Splits an FTS5 snippet (matches wrapped in MATCH_START/MATCH_END) into plain/highlighted parts. */
export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let rest = snippet;
  while (rest.length > 0) {
    const start = rest.indexOf(MATCH_START);
    if (start === -1) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false });
    const end = rest.indexOf(MATCH_END, start + 1);
    if (end === -1) {
      parts.push({ text: rest.slice(start + 1), match: false });
      break;
    }
    parts.push({ text: rest.slice(start + 1, end), match: true });
    rest = rest.slice(end + 1);
  }
  return parts;
}
