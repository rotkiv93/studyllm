import { describe, it, expect } from "vitest";
import { buildFtsQuery, splitSnippet, MATCH_START, MATCH_END } from "./chatSearch";

describe("buildFtsQuery", () => {
  it("returns null when nothing is searchable", () => {
    expect(buildFtsQuery("")).toBeNull();
    expect(buildFtsQuery("   ")).toBeNull();
    expect(buildFtsQuery('"*()-:')).toBeNull();
  });

  it("makes each word a quoted prefix term, ANDed", () => {
    expect(buildFtsQuery("treaty westphalia")).toBe('"treaty"* "westphalia"*');
  });

  it("neutralises FTS5 syntax", () => {
    expect(buildFtsQuery('foo" OR bar*')).toBe('"foo"* "OR"* "bar"*');
    expect(buildFtsQuery("a-b:c")).toBe('"a"* "b"* "c"*');
  });

  it("keeps accented and non-latin letters", () => {
    expect(buildFtsQuery("región")).toBe('"región"*');
    expect(buildFtsQuery("日本語 test")).toBe('"日本語"* "test"*');
  });
});

describe("splitSnippet", () => {
  it("returns one plain part when there is no match", () => {
    expect(splitSnippet("hello")).toEqual([{ text: "hello", match: false }]);
  });

  it("splits highlighted runs", () => {
    const s = `the ${MATCH_START}Treaty${MATCH_END} of ${MATCH_START}West${MATCH_END}phalia`;
    expect(splitSnippet(s)).toEqual([
      { text: "the ", match: false },
      { text: "Treaty", match: true },
      { text: " of ", match: false },
      { text: "West", match: true },
      { text: "phalia", match: false },
    ]);
  });

  it("tolerates an unterminated marker", () => {
    expect(splitSnippet(`a ${MATCH_START}b`)).toEqual([
      { text: "a ", match: false },
      { text: "b", match: false },
    ]);
  });
});
