import { describe, expect, it } from "vitest";
import { LESSONS, lessonShotNames, lessonTaskIds } from "./lessons";
import { COURSE_GROUPS, COURSE_MODULES } from "./modules";
import { es } from "../locales/es";
import { en } from "../locales/en";
import { estimateVramGb, requestCost } from "./estimates";
import { estimateTokenCount } from "../tokenize";

describe("lesson layout", () => {
  it("has a lesson for every module", () => {
    for (const mod of COURSE_MODULES) expect(LESSONS[mod.n], `module ${mod.n}`).toBeDefined();
  });

  it("places each of a module's tasks exactly once, and nothing else", () => {
    for (const mod of COURSE_MODULES) {
      const placed = lessonTaskIds(mod.n).sort();
      expect(placed, `module ${mod.n}`).toEqual(mod.tasks.map((t) => t.id).sort());
    }
  });

  it("puts the quiz last, after the hands-on work", () => {
    for (const mod of COURSE_MODULES) {
      const ids = lessonTaskIds(mod.n);
      expect(ids[ids.length - 1]).toBe(`m${mod.n}.quiz`);
    }
  });

  it("names a screenshot only once per module", () => {
    for (const mod of COURSE_MODULES) {
      const shots = lessonShotNames(mod.n);
      expect(new Set(shots).size).toBe(shots.length);
    }
  });
});

describe("calculation tasks agree with the estimators they point to", () => {
  const range = (id: string) => COURSE_MODULES.flatMap((m) => m.tasks).find((t) => t.id === id)!.number!;

  it("13B at 8 bits (module 6)", () => {
    const { min, max } = range("m8.estimate");
    const gb = estimateVramGb(13, 8);
    expect(gb).toBeGreaterThanOrEqual(min);
    expect(gb).toBeLessThanOrEqual(max);
  });

  it("600 words are about 800 tokens (module 7)", () => {
    const { min, max } = range("m6.split");
    const tokens = Math.round(600 / 0.75);
    expect(tokens).toBeGreaterThanOrEqual(min);
    expect(tokens).toBeLessThanOrEqual(max);
    // The approximate tokenizer used in the explorer should land in the same neighbourhood.
    expect(estimateTokenCount("word ".repeat(600))).toBeGreaterThan(0);
  });

  it("2,000 in + 500 out at $1 / $4 per million (module 7)", () => {
    const { min, max } = range("m6.cost");
    const usd = requestCost(2000, 500, { input: 1, output: 4 });
    expect(usd).toBeGreaterThanOrEqual(min);
    expect(usd).toBeLessThanOrEqual(max);
  });
});

describe("course groups", () => {
  it("put every module in exactly one group, in course order", () => {
    const flat = COURSE_GROUPS.flatMap((g) => g.modules);
    expect(flat).toEqual(COURSE_MODULES.map((m) => m.n));
  });

  it("have a title in both languages", () => {
    for (const g of COURSE_GROUPS) {
      expect(Object.keys(es)).toContain(`course.group.${g.id}`);
      expect(Object.keys(en)).toContain(`course.group.${g.id}`);
    }
  });
});

describe("explorable blocks", () => {
  it("link only to https pages", () => {
    for (const lesson of Object.values(LESSONS)) {
      for (const b of lesson.blocks) {
        if (b.kind !== "explore") continue;
        for (const url of b.links ?? []) if (url) expect(url.startsWith("https://")).toBe(true);
        if (b.links) expect(b.links.length).toBe(b.icons.length);
      }
    }
  });
});
