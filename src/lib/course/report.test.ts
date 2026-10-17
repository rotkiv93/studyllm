import { describe, expect, it } from "vitest";
import { buildProgressReport } from "./report";
import { COURSE_MODULES } from "./modules";
import { es } from "../locales/es";
import { en } from "../locales/en";
import type { MessageKey, TranslateFn } from "../i18n";

function translator(dict: Record<string, string>): TranslateFn {
  return (key: MessageKey, vars) =>
    dict[key].replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m));
}

describe("buildProgressReport", () => {
  const tEn = translator(en);

  it("starts with a title and an overall summary, then one section per module", () => {
    const md = buildProgressReport(COURSE_MODULES, new Set(), {}, tEn);
    expect(md.startsWith(`# ${en["course.report.title"]}`)).toBe(true);
    expect(md.match(/^## /gm)).toHaveLength(COURSE_MODULES.length);
  });

  it("ticks finished tasks and leaves the rest open", () => {
    const md = buildProgressReport(COURSE_MODULES, new Set(["m2.quiz"]), {}, tEn);
    expect(md).toContain(`- [x] ${en["course.task.quiz.title"]}`);
    expect(md).toContain("- [ ] ");
  });

  it("includes a saved reflection under its task, flattened to one line", () => {
    const md = buildProgressReport(COURSE_MODULES, new Set(["m11.reflect"]), { "m11.reflect": "Always\ncheck sources" }, tEn);
    expect(md).toContain("  > Always check sources");
  });

  it("marks optional tasks and renders in Spanish too", () => {
    const md = buildProgressReport(COURSE_MODULES, new Set(), {}, translator(es));
    expect(md).toContain(es["course.optionalTag"]);
    expect(md.startsWith(`# ${es["course.report.title"]}`)).toBe(true);
  });
});
