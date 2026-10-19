// Prepares model output for remark-math: normalises LaTeX delimiters and escapes `$` that is
// ordinary text (prices) so it is not mistaken for inline math. Display only — stored and
// exported text is never touched.

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** Escape single `$` that cannot open/close math (pandoc rule: opener followed by non-space,
 *  closer preceded by non-space and not followed by a digit). */
function escapeLooseDollars(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      out += c + s[i + 1];
      i += 2;
    } else if (c === "$" && s[i + 1] === "$") {
      const end = s.indexOf("$$", i + 2);
      const stop = end === -1 ? s.length : end + 2;
      out += s.slice(i, stop);
      i = stop;
    } else if (c === "$") {
      let close = -1;
      // A digit-led span containing whitespace ("$5 (about $x$)") is a price, not math.
      const priceLed = isDigit(s[i + 1]);
      if (!isSpace(s[i + 1])) {
        for (let j = i + 1; j < s.length && s[j] !== "\n"; j++) {
          if (s[j] === "\\") j++;
          else if (s[j] === "$" && !isSpace(s[j - 1]) && !isDigit(s[j + 1])) {
            if (!(priceLed && /\s/.test(s.slice(i + 1, j)))) close = j;
            break;
          }
        }
      }
      if (close === -1) {
        out += "\\$";
        i++;
      } else {
        out += s.slice(i, close + 1);
        i = close + 1;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function convertProse(s: string): string {
  const withDelims = s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string, offset: number) => {
      const lineStart = s.lastIndexOf("\n", offset - 1) + 1;
      const prefix = s.slice(lineStart, offset);
      // Mid-line (e.g. after a list marker): stay inline so lists/quotes aren't broken.
      if (!/^[\s>]*$/.test(prefix)) return `$$${m.trim()}$$`;
      return `\n${prefix}$$\n${prefix}${m.trim()}\n${prefix}$$\n`;
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
  // A line that is only `$$...$$` must be a display block (flow math needs the fences on own lines).
  const display = withDelims.replace(
    /^([ \t>]*)\$\$([^$\n]+)\$\$[ \t]*$/gm,
    (_, prefix: string, m: string) => `${prefix}$$\n${prefix}${m.trim()}\n${prefix}$$`,
  );
  return escapeLooseDollars(display);
}

export function prepareMath(text: string): string {
  if (!text.includes("$") && !text.includes("\\[") && !text.includes("\\(")) return text;
  // Leave fenced and inline code untouched.
  const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/);
  return parts.map((p, i) => (i % 2 === 1 ? p : convertProse(p))).join("");
}
