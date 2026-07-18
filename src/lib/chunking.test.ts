import { describe, it, expect } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText", () => {
  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const chunks = chunkText("A short note about photosynthesis.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ seq: 0, text: "A short note about photosynthesis." });
  });

  it("assigns sequential seq numbers starting at 0", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about a topic.`).join(" ");
    const chunks = chunkText(long, { size: 200, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.seq).toBe(i));
  });

  it("respects the target size (allowing for overlap slack)", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Fact ${i} is interesting.`).join(" ");
    const size = 150;
    const chunks = chunkText(long, { size, overlap: 30 });
    // No chunk should wildly exceed the target; a small margin covers boundary joins.
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(size + 60);
    }
  });

  it("hard-splits a single run longer than the target", () => {
    const oneLongWord = "x".repeat(2500);
    const chunks = chunkText(oneLongWord, { size: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("carries overlap text between consecutive chunks", () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `Unique token ${i} here.`).join(" ");
    const chunks = chunkText(sentences, { size: 120, overlap: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    // The tail of chunk 0 should reappear at the head of chunk 1.
    const tailWord = chunks[0].text.split(" ").slice(-2).join(" ");
    expect(chunks[1].text).toContain(tailWord.split(" ").pop()!);
  });
});
