import { describe, expect, it } from "vitest";
import { composePrompt } from "./promptBuilder";

const base = {
  role: "",
  audience: "",
  task: "",
  tone: "informative" as const,
  format: "bullets" as const,
  example: "",
  rules: "",
};

describe("composePrompt", () => {
  it("always states tone and format, even when nothing else is filled in", () => {
    expect(composePrompt(base)).toBe("Tone: informative and neutral\nOutput format: a bulleted list");
  });

  it("includes only the parts the student filled in, in a fixed order", () => {
    const out = composePrompt({
      ...base,
      role: "  a history teacher ",
      task: "Explain the Treaty of Westphalia",
      rules: "No jargon",
      tone: "friendly",
      format: "steps",
    });
    expect(out.split("\n")).toEqual([
      "Role: a history teacher",
      "Task: Explain the Treaty of Westphalia",
      "Tone: friendly and approachable",
      "Output format: numbered step-by-step instructions",
      "Rules: No jargon",
    ]);
  });

  it("keeps the student's own wording untouched, in any language", () => {
    const out = composePrompt({ ...base, task: "Resume este texto sobre la ONU", audience: "estudiantes de 1º" });
    expect(out).toContain("Task: Resume este texto sobre la ONU");
    expect(out).toContain("Audience: estudiantes de 1º");
  });

  it("appends a worked example last", () => {
    const out = composePrompt({ ...base, example: "- Point one\n- Point two" });
    expect(out.endsWith("Example of what I want:\n- Point one\n- Point two")).toBe(true);
  });
});
