/**
 * Chat file attachments (Priority 4, phases 1–2): let a student drop a plain-text or PDF file into
 * the composer and have its extracted text travel with their message so the model can read it.
 *
 * Parsing runs entirely in the frontend — plain text via `File.text()`, PDFs via `pdfjs-dist`. The
 * pdf.js library is **dynamically imported** (it touches browser-only globals, and the Vitest suite
 * runs in a node env), and its worker is a same-origin bundled asset (`?url`), which the app's CSP
 * (`default-src 'self'`) permits without any policy change.
 *
 * Images and OCR (phases 4–5) are out of scope here.
 */

// Same-origin worker asset URL (Vite resolves `?url` to a bundled path); just a string, safe to
// import in the node test env since it doesn't load pdf.js itself.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Cap per file so a huge PDF can't blow the model's context; a note is appended when it trips. */
export const MAX_ATTACHMENT_CHARS = 20000;
/** Cap on how many files can ride along with one message. */
export const MAX_ATTACHMENTS = 5;
/** Marker that opens each attached file's block in the outgoing message (also used to render it). */
export const ATTACHMENT_MARKER = "--- Attached file:";

export interface ParsedAttachment {
  name: string;
  text: string;
  /** True when the extracted text was cut to `MAX_ATTACHMENT_CHARS`. */
  truncated: boolean;
}

const TEXT_EXTS = ["txt", "md", "markdown", "csv", "tsv", "json", "log", "rtf"];
const PDF_EXTS = ["pdf"];
const DOCX_EXTS = ["docx"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Human-facing list of what can be dropped, for the composer hint. */
export const SUPPORTED_ATTACHMENT_HINT = "PDF, Word, .txt, .md, .csv";

export function isSupportedAttachment(name: string): boolean {
  const ext = extensionOf(name);
  return TEXT_EXTS.includes(ext) || PDF_EXTS.includes(ext) || DOCX_EXTS.includes(ext);
}

/** Parse one file into text, throwing a friendly error for unsupported types. */
export async function parseAttachment(file: File): Promise<ParsedAttachment> {
  const ext = extensionOf(file.name);
  let text: string;
  if (PDF_EXTS.includes(ext)) {
    text = await extractPdfText(file);
  } else if (DOCX_EXTS.includes(ext)) {
    text = await extractDocxText(file);
  } else if (TEXT_EXTS.includes(ext)) {
    text = await file.text();
  } else if (ext === "doc") {
    throw new Error(`Old ".doc" files aren't supported — re-save "${file.name}" as .docx or PDF.`);
  } else {
    throw new Error(`Can't read ".${ext || "?"}" files yet — try a ${SUPPORTED_ATTACHMENT_HINT}.`);
  }
  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = text.length > MAX_ATTACHMENT_CHARS;
  if (truncated) text = text.slice(0, MAX_ATTACHMENT_CHARS);
  if (!text) throw new Error(`"${file.name}" had no readable text (it may be a scanned image).`);
  return { name: file.name, text, truncated };
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pages: string[] = [];
    let total = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => (item as { str?: string }).str ?? "")
        .join(" ");
      pages.push(pageText);
      total += pageText.length;
      if (total > MAX_ATTACHMENT_CHARS) break; // stop early — parseAttachment will truncate anyway
    }
    return pages.join("\n\n");
  } finally {
    await doc.destroy();
  }
}

async function extractDocxText(file: File): Promise<string> {
  // Vite applies mammoth's `browser` field (swaps its node-only unzip/fs internals); types come
  // from its bundled index.d.ts. Dynamically imported so the node test env never loads it.
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

/**
 * Combine the student's typed message with any attachments into the single string that gets sent to
 * the model (and persisted). The typed text leads — so it drives the conversation title — followed
 * by one delimited block per file.
 */
export function buildOutgoingContent(typed: string, attachments: ParsedAttachment[]): string {
  if (attachments.length === 0) return typed;
  const blocks = attachments
    .map(
      (a) =>
        `${ATTACHMENT_MARKER} ${a.name} ---\n${a.text}${a.truncated ? "\n[… truncated …]" : ""}`,
    )
    .join("\n\n");
  const lead = typed.trim();
  return lead ? `${lead}\n\n${blocks}` : blocks;
}
