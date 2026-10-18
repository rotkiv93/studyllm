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

  describe("page tracking", () => {
    const pageText = (n: number) => Array.from({ length: 8 }, (_, i) => `Page ${n} sentence ${i} here.`).join(" ");
    const build = (count: number) => {
      const pages = [];
      let text = "";
      for (let n = 1; n <= count; n++) {
        if (text) text += "\n\n";
        const body = pageText(n);
        pages.push({ page: n, start: text.length, end: text.length + body.length });
        text += body;
      }
      return { text, pages };
    };

    it("omits page fields when no pages are supplied", () => {
      const [c] = chunkText("Just text.");
      expect(c).not.toHaveProperty("pageStart");
    });

    it("tags a chunk inside one page with that page", () => {
      const { text, pages } = build(3);
      const chunks = chunkText(text, { size: 5000, overlap: 0, pages: [pages[0]!] });
      expect(chunks[0]).toMatchObject({ pageStart: 1, pageEnd: 1 });
    });

    it("reports a range when a chunk spans a page break", () => {
      const { text, pages } = build(3);
      const [c] = chunkText(text, { size: 5000, overlap: 0, pages });
      expect(c).toMatchObject({ pageStart: 1, pageEnd: 3 });
    });

    it("keeps pages monotonic and lets overlap pull the previous page in", () => {
      const { text, pages } = build(4);
      const chunks = chunkText(text, { size: 300, overlap: 60, pages });
      expect(chunks.length).toBeGreaterThan(2);
      for (const c of chunks) expect(c.pageEnd!).toBeGreaterThanOrEqual(c.pageStart!);
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i]!.pageStart!).toBeGreaterThanOrEqual(chunks[i - 1]!.pageStart!);
        // the overlap tail belongs to the previous chunk's last page
        expect(chunks[i]!.pageStart!).toBeLessThanOrEqual(chunks[i - 1]!.pageEnd!);
      }
      expect(chunks[0]!.pageStart).toBe(1);
      expect(chunks[chunks.length - 1]!.pageEnd).toBe(4);
    });

    it("tracks pages through hard-split windows", () => {
      const text = `${"a".repeat(1500)}\n\n${"b".repeat(1500)}`;
      const pages = [
        { page: 1, start: 0, end: 1500 },
        { page: 2, start: 1502, end: 3002 },
      ];
      const chunks = chunkText(text, { size: 1000, overlap: 100, pages });
      expect(chunks[0]).toMatchObject({ pageStart: 1, pageEnd: 1 });
      expect(chunks[chunks.length - 1]).toMatchObject({ pageEnd: 2 });
    });
  });
});
