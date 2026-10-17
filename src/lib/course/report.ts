import { courseProgress, moduleProgress } from "./checks";
import type { CourseModule } from "./modules";
import { taskCopyKeys } from "./modules";
import type { MessageKey, TranslateFn } from "../i18n";

/**
 * Builds the Markdown progress report students can paste into their written submission (the class
 * boletín asks for a memoria explaining each step). Pure — takes the translator and the saved state, so
 * the same function serves both languages and is trivially testable.
 */
export function buildProgressReport(
  modules: CourseModule[],
  done: ReadonlySet<string>,
  notes: Readonly<Record<string, string>>,
  t: TranslateFn,
): string {
  const total = courseProgress(modules, done);
  const lines: string[] = [
    `# ${t("course.report.title")}`,
    "",
    t("course.report.summary", { done: total.done, total: total.total, percent: total.percent }),
    "",
  ];

  for (const mod of modules) {
    const p = moduleProgress(mod, done);
    lines.push(
      `## ${mod.n}. ${t(`course.m${mod.n}.title` as MessageKey)} — ${p.done}/${p.total}`,
    );
    for (const task of mod.tasks) {
      const mark = done.has(task.id) ? "[x]" : "[ ]";
      lines.push(`- ${mark} ${taskLabel(task, mod.n, t)}${task.optional ? ` ${t("course.optionalTag")}` : ""}`);
      const note = notes[task.id]?.trim();
      if (note) lines.push(`  > ${note.replace(/\n+/g, " ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function taskLabel(task: CourseModule["tasks"][number], n: number, t: TranslateFn): string {
  if (task.kind === "quiz") return t("course.task.quiz.title");
  return t(taskCopyKeys(task).title as MessageKey) || `m${n}`;
}
