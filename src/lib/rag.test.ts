import { describe, it, expect } from "vitest";
import { buildRagSystemBlock } from "./rag";
import type { RetrievedChunk } from "./rag";

const chunk = (documentName: string, seq: number, text: string, score = 0.9): RetrievedChunk => ({
  documentName,
  seq,
  text,
  score,
});

describe("buildRagSystemBlock", () => {
  it("includes each passage tagged with its document name and seq", () => {
    const block = buildRagSystemBlock([
      chunk("Lecture 3.pdf", 0, "Mitochondria are the powerhouse of the cell."),
      chunk("Notes.md", 2, "ATP stores chemical energy."),
    ]);
    expect(block).toContain("[Lecture 3.pdf #0]");
    expect(block).toContain("Mitochondria are the powerhouse of the cell.");
    expect(block).toContain("[Notes.md #2]");
    expect(block).toContain("ATP stores chemical energy.");
  });

  it("instructs the model to answer only from the passages and to cite them", () => {
    const block = buildRagSystemBlock([chunk("Doc.txt", 0, "Some fact.")]);
    expect(block.toLowerCase()).toContain("only");
    expect(block).toMatch(/cite/i);
  });

  it("handles an empty passage list without throwing", () => {
    expect(() => buildRagSystemBlock([])).not.toThrow();
  });
});
