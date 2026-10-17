import { describe, expect, it } from "vitest";
import { LESSONS, lessonShotNames, lessonTaskIds } from "./lessons";
import { COURSE_GROUPS, COURSE_MODULES } from "./modules";
import { es } from "../locales/es";
import { en } from "../locales/en";

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
