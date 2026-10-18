/**
 * Saving a chat as a local file: Markdown, Word (.docx) or PDF. The pure pieces (turning messages
 * into an `ExportDoc`, rendering Markdown, parsing Markdown into blocks) are unit-tested; the
 * `.docx` / PDF renderers are lazy-loaded so the libraries stay out of the startup bundle.
 */

import { ATTACHMENT_MARKER } from "./attachments";
import type { ExportableMessage } from "./exportChat";

export type ExportFormat = "md" | "docx" | "pdf";

export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = { md: "md", docx: "docx", pdf: "pdf" };

/** Words the document itself uses — passed in so the file follows the app's language. */
export interface ExportLabels {
  you: string;
  assistant: string;
  exportedOn: string; // "Exported from StudyLLM on {date}"
  model: string; // "Model"
  attachments: string; // "Attachments"
  sources: string; // "Sources"
}

export interface ExportInput {
  title: string;
  messages: (ExportableMessage | { role: "sources"; sources: { documentName: string; seq: number }[] })[];
  labels: ExportLabels;
  /** Display date; defaults to today's locale date. */
  date?: string;
  /** Model name(s) shown in the header. */
  model?: string;
  /** Keep only the assistant's replies (for pasting into an essay). */
  answersOnly?: boolean;
}

export interface ExportTurn {
  role: "user" | "assistant";
  label: string;
  content: string;
}

export interface ExportDoc {
  title: string;
  meta: string[];
  turns: ExportTurn[];
  attachments: string[];
  sources: string[];
  labels: ExportLabels;
  answersOnly: boolean;
}

const ATTACHMENT_RE = new RegExp(
  `${ATTACHMENT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (.+?) ---\\n[\\s\\S]*?(?=\\n\\n${ATTACHMENT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|$)`,
  "g",
);

/** Split a user message into its typed text and the names of attached files (bodies dropped). */
export function splitAttachments(content: string): { text: string; names: string[] } {
  const names: string[] = [];
  const text = content
    .replace(ATTACHMENT_RE, (_m, name: string) => {
      names.push(name.trim());
      return "";
    })
    .trim();
  return { text, names };
}

export function buildExportDoc(input: ExportInput): ExportDoc {
  const { labels } = input;
  const turns: ExportTurn[] = [];
  const attachments: string[] = [];
  const sources: string[] = [];
  for (const m of input.messages) {
    if (m.role === "sources" && "sources" in m) {
      for (const s of m.sources) {
        const label = `${s.documentName} #${s.seq}`;
        if (!sources.includes(label)) sources.push(label);
      }
      continue;
    }
    if (m.role !== "user" && m.role !== "assistant") continue;
    const raw = ("content" in m ? m.content : "")?.trim();
    if (!raw) continue;
    if (m.role === "user") {
      const { text, names } = splitAttachments(raw);
      for (const n of names) if (!attachments.includes(n)) attachments.push(n);
      if (input.answersOnly || !text) continue;
      turns.push({ role: "user", label: labels.you, content: text });
    } else {
      turns.push({ role: "assistant", label: labels.assistant, content: raw });
    }
  }
  const meta = [labels.exportedOn.replace("{date}", input.date ?? new Date().toLocaleDateString())];
  if (input.model) meta.push(`${labels.model}: ${input.model}`);
  return {
    title: input.title || "Conversation",
    meta,
    turns,
    attachments: input.answersOnly ? [] : attachments,
    sources,
    labels,
    answersOnly: !!input.answersOnly,
  };
}

/** Markdown text of an `ExportDoc`. In answers-only mode the turn headings are dropped. */
export function renderMarkdown(doc: ExportDoc): string {
  const parts = [`# ${doc.title}`, doc.meta.map((m) => `_${m}_`).join("  \n")];
  if (doc.attachments.length > 0) {
    parts.push(`**${doc.labels.attachments}:** ${doc.attachments.join(", ")}`);
  }
  for (const t of doc.turns) {
    parts.push(doc.answersOnly ? t.content : `## ${t.label}\n\n${t.content}`);
  }
  if (doc.sources.length > 0) {
    parts.push(`## ${doc.labels.sources}\n\n${doc.sources.map((s) => `- ${s}`).join("\n")}`);
  }
  return parts.join("\n\n") + "\n";
}

// ---------- Markdown → blocks (for docx / pdf) ----------

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type Block =
  | { type: "heading"; level: number; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "code"; text: string }
  | { type: "list"; ordered: boolean; index: number; runs: Run[] }
  | { type: "quote"; runs: Run[] }
  | { type: "rule" };

export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*|__)(.+?)\1|`([^`]+)`|(\*|_)(.+?)\4|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) runs.push({ text: m[3], code: true });
    else if (m[5] !== undefined) runs.push({ text: m[5], italic: true });
    else runs.push({ text: `${m[6]} (${m[7]})` });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", runs: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    let m: RegExpMatchArray | null;
    if (!line.trim()) flush();
    else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      blocks.push({ type: "heading", level: m[1].length, runs: parseInline(m[2]) });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
    } else if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
      flush();
      const ordered = /\d/.test(m[1]);
      blocks.push({ type: "list", ordered, index: ordered ? parseInt(m[1], 10) : 0, runs: parseInline(m[2]) });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      blocks.push({ type: "quote", runs: parseInline(m[1]) });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}

/** The document as a flat block list: title, meta, then per-turn headings + parsed content. */
export function docToBlocks(doc: ExportDoc): Block[] {
  const blocks: Block[] = [
    { type: "heading", level: 1, runs: [{ text: doc.title }] },
    ...doc.meta.map((m): Block => ({ type: "paragraph", runs: [{ text: m, italic: true }] })),
  ];
  if (doc.attachments.length > 0) {
    blocks.push({
      type: "paragraph",
      runs: [{ text: `${doc.labels.attachments}: `, bold: true }, { text: doc.attachments.join(", ") }],
    });
  }
  for (const t of doc.turns) {
    if (!doc.answersOnly) blocks.push({ type: "heading", level: 2, runs: [{ text: t.label }] });
    blocks.push(...parseBlocks(t.content));
  }
  if (doc.sources.length > 0) {
    blocks.push({ type: "heading", level: 2, runs: [{ text: doc.labels.sources }] });
    for (const s of doc.sources) blocks.push({ type: "list", ordered: false, index: 0, runs: [{ text: s }] });
  }
  return blocks;
}

// ---------- Renderers ----------

export async function renderDocx(doc: ExportDoc): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const headings = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];
  const toRuns = (runs: Run[], extra: { bold?: boolean; italics?: boolean } = {}) =>
    runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: r.bold || extra.bold,
          italics: r.italic || extra.italics,
          font: r.code ? "Courier New" : undefined,
        }),
    );
  const children = docToBlocks(doc).flatMap((b) => {
    switch (b.type) {
      case "heading":
        return [new Paragraph({ heading: headings[b.level - 1], children: toRuns(b.runs) })];
      case "paragraph":
        return [new Paragraph({ children: toRuns(b.runs), spacing: { after: 120 } })];
      case "quote":
        return [new Paragraph({ children: toRuns(b.runs, { italics: true }), indent: { left: 480 } })];
      case "list":
        return [
          new Paragraph({
            children: [new TextRun(b.ordered ? `${b.index}. ` : "• "), ...toRuns(b.runs)],
            indent: { left: 480, hanging: 240 },
          }),
        ];
      case "code":
        // One paragraph per line, monospace with a shaded background, so code stays intact.
        return b.text.split("\n").map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, font: "Courier New", size: 20 })],
              shading: { fill: "F2F2F2" },
              spacing: { after: 0 },
            }),
        );
      case "rule":
        return [new Paragraph({ border: { bottom: { style: "single", size: 6, space: 1, color: "999999" } } })];
    }
  });
  // toBlob, not toBuffer: the latter needs Node's Buffer, which the webview doesn't have.
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function renderPdf(doc: ExportDoc): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  // Standard PDF fonts only cover WinAnsi (Latin-1 + a few); other characters become "?".
  const safe = (s: string, f: typeof fonts.regular) => {
    let out = "";
    for (const ch of s.replace(/\t/g, "    ")) {
      try {
        f.encodeText(ch);
        out += ch;
      } catch {
        out += "?";
      }
    }
    return out;
  };
  const PAGE = { w: 595.28, h: 841.89, margin: 56 };
  const maxW = PAGE.w - PAGE.margin * 2;
  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;
  const ensure = (h: number) => {
    if (y - h < PAGE.margin) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };

  /** Word-wrap styled words into lines, then draw them. */
  const drawRuns = (runs: Run[], size: number, opts: { indent?: number; bold?: boolean; prefix?: string } = {}) => {
    const lead = opts.indent ?? 0;
    type W = { text: string; font: typeof fonts.regular };
    const words: W[] = [];
    if (opts.prefix) words.push({ text: opts.prefix, font: fonts.regular });
    for (const r of runs) {
      const font = r.code ? fonts.mono : r.bold || opts.bold ? fonts.bold : r.italic ? fonts.italic : fonts.regular;
      for (const w of r.text.split(/\s+/).filter(Boolean)) {
        // Break words wider than the line (long URLs) into chunks that fit.
        let rest = safe(w, font);
        const limit = maxW - lead - 20;
        while (font.widthOfTextAtSize(rest, size) > limit) {
          let n = rest.length - 1;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > limit) n--;
          words.push({ text: rest.slice(0, n), font });
          rest = rest.slice(n);
        }
        words.push({ text: rest, font });
      }
    }
    const lineH = size * 1.35;
    let line: W[] = [];
    let width = 0;
    const emit = () => {
      ensure(lineH);
      y -= lineH;
      let x = PAGE.margin + lead;
      for (const w of line) {
        page.drawText(w.text, { x, y: y + size * 0.25, size, font: w.font, color: rgb(0, 0, 0) });
        x += w.font.widthOfTextAtSize(w.text + " ", size);
      }
      line = [];
      width = 0;
    };
    for (const w of words) {
      const ww = w.font.widthOfTextAtSize(w.text + " ", size);
      if (line.length && width + ww > maxW - lead) emit();
      line.push(w);
      width += ww;
    }
    if (line.length) emit();
    y -= size * 0.4;
  };

  for (const b of docToBlocks(doc)) {
    switch (b.type) {
      case "heading":
        y -= b.level === 1 ? 4 : 10;
        drawRuns(b.runs, [20, 15, 13, 12, 11, 11][b.level - 1], { bold: true });
        break;
      case "paragraph":
        drawRuns(b.runs, 11);
        break;
      case "quote":
        drawRuns(b.runs, 11, { indent: 18 });
        break;
      case "list":
        drawRuns(b.runs, 11, { indent: 14, prefix: b.ordered ? `${b.index}.` : "-" });
        break;
      case "rule":
        ensure(10);
        y -= 6;
        page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.w - PAGE.margin, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
        y -= 6;
        break;
      case "code": {
        const size = 9;
        const charW = fonts.mono.widthOfTextAtSize("M", size);
        const per = Math.max(10, Math.floor((maxW - 12) / charW));
        for (const raw of b.text.split("\n")) {
          const line = safe(raw, fonts.mono);
          for (let i = 0; i === 0 || i < line.length; i += per) {
            ensure(size * 1.4);
            y -= size * 1.4;
            page.drawRectangle({ x: PAGE.margin, y: y - 2, width: maxW, height: size * 1.4, color: rgb(0.95, 0.95, 0.95) });
            page.drawText(line.slice(i, i + per), { x: PAGE.margin + 6, y, size, font: fonts.mono });
          }
        }
        y -= 8;
        break;
      }
    }
  }
  pdf.setTitle(safe(doc.title, fonts.regular));
  return pdf.save();
}

/** A filesystem-safe default file name (no path separators / reserved characters). */
export function suggestFileName(title: string, format: ExportFormat): string {
  const base = (title || "conversation")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "conversation"}.${EXPORT_EXTENSIONS[format]}`;
}

export async function renderExport(doc: ExportDoc, format: ExportFormat): Promise<Uint8Array> {
  if (format === "md") return new TextEncoder().encode(renderMarkdown(doc));
  return format === "docx" ? renderDocx(doc) : renderPdf(doc);
}
