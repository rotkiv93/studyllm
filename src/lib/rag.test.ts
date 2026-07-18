import { describe, it, expect, vi } from "vitest";
import { buildRagSystemBlock, retrieveExplained } from "./rag";
import type { RetrievedChunk } from "./rag";
import type { ResolvedEmbedder } from "./embeddings";

// retrieveExplained pulls chunks from SQLite and embeds the query over the network — mock both so we
// can exercise the pure scoring/ranking/shape logic deterministically.
vi.mock("./db", () => ({
  listAllRagChunks: vi.fn(async () => [
    { document_name: "A.txt", seq: 0, text: "far", embedding: JSON.stringify([0, 1]) },
    { document_name: "A.txt", seq: 1, text: "near", embedding: JSON.stringify([1, 0]) },
    { document_name: "B.txt", seq: 0, text: "mid", embedding: JSON.stringify([1, 1]) },
  ]),
}));
vi.mock("./embeddings", async (importActual) => {
  const actual = await importActual<typeof import("./embeddings")>();
  return { ...actual, embedQuery: vi.fn(async () => [1, 0]) }; // query aligns with "near"
});

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

describe("retrieveExplained", () => {
  const embedder: ResolvedEmbedder = { name: "gemini", baseURL: "", apiKey: "", model: "m" };

  it("returns every chunk scored, sorted best-first, with vectors and the query vector", async () => {
    const out = await retrieveExplained("q", embedder, 2);
    // All three chunks kept (nothing sliced away).
    expect(out.scored).toHaveLength(3);
    // Sorted descending by score.
    const scores = out.scored.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // The chunk aligned with the query ranks first.
    expect(out.scored[0].text).toBe("near");
    // Each carries its embedding vector, and the query vector comes back too.
    expect(out.scored.every((c) => Array.isArray(c.vector) && c.vector.length === 2)).toBe(true);
    expect(out.queryVector).toEqual([1, 0]);
    expect(out.k).toBe(2);
  });
});
