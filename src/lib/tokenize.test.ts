import { describe, it, expect } from "vitest";
import { tokenize, estimateTokenCount, wordCount } from "./tokenize";

describe("tokenize", () => {
  it("returns nothing for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(estimateTokenCount("")).toBe(0);
    expect(wordCount("")).toBe(0);
  });

  it("attaches a leading space to the following word (GPT-style)", () => {
    const pieces = tokenize("hello world");
    expect(pieces.map((p) => p.text)).toEqual(["hello", " world"]);
  });

  it("breaks a long word into sub-word pieces so tokens != words", () => {
    const pieces = tokenize("strawberry");
    expect(pieces.length).toBeGreaterThan(1);
    // The pieces must reconstruct the original word exactly.
    expect(pieces.map((p) => p.text).join("")).toBe("strawberry");
    expect(estimateTokenCount("strawberry")).toBeGreaterThan(wordCount("strawberry"));
  });

  it("keeps short words whole", () => {
    expect(tokenize("cat").map((p) => p.text)).toEqual(["cat"]);
  });

  it("flags whitespace runs and preserves newlines", () => {
    const pieces = tokenize("a\nb");
    const ws = pieces.find((p) => p.whitespace);
    expect(ws?.text).toBe("\n");
  });

  it("splits punctuation and numbers away from letters", () => {
    const texts = tokenize("Pay $1234, now!").map((p) => p.text);
    // A number run and punctuation are their own pieces, not glued to words.
    expect(texts.some((t) => /\d/.test(t) && !/[a-z]/i.test(t))).toBe(true);
    expect(texts.some((t) => t.includes("!"))).toBe(true);
  });

  it("reconstructs the original text exactly from all pieces", () => {
    const input = "The quick brown fox (jumps) over 42 lazy dogs.\nNew line here.";
    expect(tokenize(input).map((p) => p.text).join("")).toBe(input);
  });
});
