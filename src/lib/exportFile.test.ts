import { describe, expect, it } from "vitest";
import {
  buildExportDoc,
  parseBlocks,
  parseInline,
  renderDocx,
  renderExport,
  renderMarkdown,
  renderPdf,
  splitAttachments,
  suggestFileName,
} from "./exportFile";
import { ATTACHMENT_MARKER } from "./attachments";

const labels = {
  you: "You",
  assistant: "Assistant",
  exportedOn: "Exported on {date}",
  model: "Model",
  attachments: "Attachments",
  sources: "Sources",
};

const attached = `Summarise this\n\n${ATTACHMENT_MARKER} notes.txt ---\nsecret body\n\n${ATTACHMENT_MARKER} b.pdf ---\nmore`;
const messages = [
  { role: "user" as const, content: attached },
  { role: "sources" as const, sources: [{ documentName: "Book", seq: 3 }] },
  { role: "assistant" as const, content: "## Summary\n\nSome **bold** text\n\n```ts\nconst a = 1;\n```\n\n- one\n- two" },
  { role: "tool" as const, content: "ignored" },
];

describe("splitAttachments", () => {
  it("drops bodies and lists names", () => {
    expect(splitAttachments(attached)).toEqual({ text: "Summarise this", names: ["notes.txt", "b.pdf"] });
  });
});

describe("buildExportDoc / renderMarkdown", () => {
  it("includes title, date, model, attachments and sources", () => {
    const md = renderMarkdown(buildExportDoc({ title: "T", messages, labels, date: "1/1/2026", model: "m1" }));
    expect(md).toContain("# T");
    expect(md).toContain("_Exported on 1/1/2026_");
    expect(md).toContain("_Model: m1_");
    expect(md).toContain("**Attachments:** notes.txt, b.pdf");
    expect(md).toContain("## You\n\nSummarise this");
    expect(md).not.toContain("secret body");
    expect(md).toContain("- Book #3");
  });
  it("answers-only keeps just the replies", () => {
    const md = renderMarkdown(buildExportDoc({ title: "T", messages, labels, answersOnly: true }));
    expect(md).not.toContain("## You");
    expect(md).not.toContain("Summarise this");
    expect(md).toContain("Some **bold** text");
  });
});

describe("markdown parsing", () => {
  it("parses inline styles", () => {
    expect(parseInline("a **b** `c` *d*")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", code: true },
      { text: " " },
      { text: "d", italic: true },
    ]);
  });
  it("parses blocks", () => {
    const types = parseBlocks("# H\n\npara\n\n```\ncode\n```\n\n1. a\n- b").map((b) => b.type);
    expect(types).toEqual(["heading", "paragraph", "code", "list", "list"]);
  });
});

describe("renderers", () => {
  const doc = buildExportDoc({ title: "T ñ 日本", messages, labels });
  it("docx is a zip", async () => {
    const bytes = await renderDocx(doc);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
  it("pdf starts with %PDF and survives non-Latin text", async () => {
    const bytes = await renderPdf(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });
  it("pdf wraps very long unbroken words", async () => {
    const long = buildExportDoc({ title: "T", messages: [{ role: "assistant", content: "x".repeat(3000) }], labels });
    expect((await renderPdf(long)).length).toBeGreaterThan(100);
  });
  it("md goes through renderExport", async () => {
    expect(new TextDecoder().decode(await renderExport(doc, "md"))).toContain("# T");
  });
});

describe("suggestFileName", () => {
  it("strips reserved characters", () => {
    expect(suggestFileName('a/b:c?"', "docx")).toBe("abc.docx");
    expect(suggestFileName("", "pdf")).toBe("conversation.pdf");
  });
});
