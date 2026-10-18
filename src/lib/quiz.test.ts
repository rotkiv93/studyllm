import { describe, it, expect } from "vitest";
import {
  buildQuizSystem,
  extractJson,
  numberPassages,
  parseGrade,
  parseQuiz,
  scoreQuiz,
  selectPassages,
} from "./quiz";

describe("selectPassages", () => {
  it("keeps everything when under the cap", () => {
    expect(selectPassages([1, 2, 3], 8)).toEqual([1, 2, 3]);
  });
  it("spreads picks across the whole list", () => {
    const picked = selectPassages(Array.from({ length: 100 }, (_, i) => i), 4);
    expect(picked).toEqual([0, 25, 50, 75]);
  });
});

describe("buildQuizSystem", () => {
  it("numbers passages and forbids outside knowledge", () => {
    const passages = numberPassages([{ documentName: "Doc", seq: 3, text: "Water boils at 100C." }]);
    const s = buildQuizSystem(passages, 5, "mixed");
    expect(s).toContain("[1] (Doc #3)");
    expect(s).toContain("exactly 5 questions");
    expect(s).toContain("ONLY");
  });
});

describe("extractJson", () => {
  it("unwraps fenced blocks and chatter", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```\nEnjoy')).toBe('{"a":1}');
    expect(extractJson('Here: {"a":1} done')).toBe('{"a":1}');
  });
  it("returns null without JSON", () => {
    expect(extractJson("no json")).toBeNull();
  });
});

describe("parseQuiz", () => {
  const good = {
    questions: [
      { type: "choice", question: "Q1?", options: ["a", "b", "c", "d"], answer: 2, explanation: "e", passage: 2 },
      { type: "short", question: "Q2?", answer: "because", explanation: "e", passage: 1 },
    ],
  };
  it("parses a fenced reply", () => {
    const qs = parseQuiz("```json\n" + JSON.stringify(good) + "\n```", 2);
    expect(qs).toHaveLength(2);
    expect(qs[0]).toMatchObject({ type: "choice", answerIndex: 2, passage: 2 });
    expect(qs[1]).toMatchObject({ type: "short", answer: "because" });
  });
  it("accepts a bare array and string numbers", () => {
    const qs = parseQuiz(JSON.stringify(good.questions.map((q) => ({ ...q, answer: q.type === "choice" ? "1" : q.answer }))), 2);
    expect(qs[0].answerIndex).toBe(1);
  });
  it("drops invalid questions and clamps bad passage numbers", () => {
    const qs = parseQuiz(
      JSON.stringify({
        questions: [
          { type: "choice", question: "bad index", options: ["a", "b"], answer: 5, passage: 1 },
          { question: "", answer: "x" },
          { type: "short", question: "ok", answer: "x", passage: 99 },
        ],
      }),
      3,
    );
    expect(qs).toHaveLength(1);
    expect(qs[0].passage).toBe(1);
  });
  it("returns nothing for garbage", () => {
    expect(parseQuiz("I cannot do that", 3)).toEqual([]);
    expect(parseQuiz("{not json}", 3)).toEqual([]);
  });
});

describe("parseGrade", () => {
  it("reads a verdict", () => {
    expect(parseGrade('```json\n{"correct": true, "feedback": "Good."}\n```')).toEqual({ correct: true, feedback: "Good." });
    expect(parseGrade('{"correct":false}')).toEqual({ correct: false, feedback: "" });
  });
  it("rejects an unreadable verdict", () => {
    expect(parseGrade("maybe")).toBeNull();
    expect(parseGrade('{"feedback":"x"}')).toBeNull();
  });
});

describe("scoreQuiz", () => {
  it("counts correct answers", () => {
    expect(scoreQuiz([{ response: "0", correct: true }, { response: "1", correct: false }, undefined])).toEqual({
      correct: 1,
      total: 3,
    });
  });
});
