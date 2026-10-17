/**
 * The Course's structure — modules and the tasks inside each, which interactive tool a task embeds,
 * and which tasks the app can verify on its own. **Only structure lives here.** Every visible string
 * (titles, task copy, quiz questions, suggested prompts) is in the locale files under `course.m<n>.*`,
 * so the course is localized and stays out of the model's way (see PROJECT_STATUS: i18n is
 * interface-level). Where each task *appears* in a lesson is decided in `lessons.ts`.
 *
 * The order is a deliberate arc, built from the class slides: what the AI is → get access to one →
 * who makes what → how to ask → how the app talks to it → where it runs → what it costs / remembers →
 * how to steer it → ground it in your documents → give it tools (MCP) → let it act (agents).
 * n8n is intentionally not covered.
 */
import { lessonLocaleKeys } from "./lessons";
import type { LabSpec, NumberSpec } from "./labs";

/** Where a task's "open it" shortcut leads. */
export type CourseTarget = "providers" | "mcp" | "plugins" | "library" | "chat";

/**
 * - `check`   — the app verifies it from real state (a provider exists, a tool ran…).
 * - `do`      — the student does it right in the lesson with an embedded tool; the tool reports back.
 * - `lab`     — try it in a chat embedded in the lesson (optionally confirm what you noticed).
 * - `number`  — work something out with the estimators and type the answer.
 * - `manual`  — the student does something outside the app's sight and ticks it off.
 * - `quiz`    — one multiple-choice question with an explanation.
 * - `reflect` — a short free-text answer saved with the progress report.
 */
export type TaskKind = "check" | "do" | "lab" | "number" | "manual" | "quiz" | "reflect";

/** What the app can verify about the student's setup. Evaluated by `evaluateCheck`. */
export type CheckId =
  | "providerAdded"
  | "twoProviders"
  | "messageSent"
  | "omnirouteConnected"
  | "documentAdded"
  | "filesystemRunning"
  | "toolUsed"
  | "gmailConnected"
  | "askPermission";

/** Interactive tools a lesson can embed — in the flow of the text, or inside a task. */
export type EmbedId =
  | "keyGuide"
  | "providerSetup"
  | "routerSetup"
  | "promptBuilder"
  | "requestInspector"
  | "vram"
  | "tokens"
  | "cost"
  | "system"
  | "retrieval"
  | "librarySetup"
  | "grounding"
  | "filesystemSetup"
  | "tools"
  | "research";

export interface CourseTask {
  /** `m<module>.<slug>` — also the primary key in `course_progress`. */
  id: string;
  kind: TaskKind;
  /** The app can confirm this one by itself. Works on any kind; a pass is remembered. */
  check?: CheckId;
  /** Optional tasks never block a module's completion (e.g. installing a local router). */
  optional?: boolean;
  /** Shortcut button shown next to the task. */
  open?: CourseTarget;
  /** The interactive tool shown inside the task (`do` tasks). */
  embed?: EmbedId;
  /** For `kind: "lab"`: how the embedded chat behaves. */
  lab?: LabSpec;
  /** For `kind: "number"`: the accepted range. */
  number?: NumberSpec;
  /** For `kind: "quiz"`: index of the right option (the question has three). */
  correct?: number;
}

export interface CourseModule {
  /** 1-based; also the `course.m<n>.*` locale prefix. */
  n: number;
  tasks: CourseTask[];
}

/** Keeps side-by-side answers short enough to compare at a glance. Model-facing, so English. */
const BRIEF = "Keep your answer under 80 words, in plain prose without lists or headings.";

const quiz = (n: number, correct: number): CourseTask => ({ id: `m${n}.quiz`, kind: "quiz", correct });

export const COURSE_MODULES: CourseModule[] = [
  {
    n: 1,
    tasks: [
      { id: "m1.firstKey", kind: "do", embed: "providerSetup", check: "providerAdded" },
      {
        id: "m1.firstMessage",
        kind: "lab",
        check: "messageSent",
        lab: {
          mode: "chat",
          suggestions: 3,
          system: "Answer briefly, in at most three sentences, in the language of the user's message.",
        },
      },
      { id: "m1.secondKey", kind: "do", embed: "providerSetup", check: "twoProviders" },
      { id: "m1.router", kind: "do", embed: "routerSetup", check: "omnirouteConnected", optional: true },
      quiz(1, 2),
    ],
  },
  {
    n: 2,
    tasks: [
      { id: "m2.samples", kind: "lab", lab: { mode: "samples", suggestions: 3, samples: 3, confirm: true, system: BRIEF } },
      { id: "m2.invented", kind: "lab", lab: { mode: "chat", suggestions: 3, confirm: true } },
      quiz(2, 1),
    ],
  },
  {
    n: 3,
    tasks: [
      { id: "m3.compare", kind: "lab", open: "providers", lab: { mode: "compare", suggestions: 3, confirm: true, system: "Keep your answer under 120 words." } },
      quiz(3, 0),
    ],
  },
  {
    n: 4,
    tasks: [
      { id: "m4.ab", kind: "lab", lab: { mode: "ab", suggestions: 3, confirm: true } },
      { id: "m4.build", kind: "do", embed: "promptBuilder" },
      { id: "m4.iterate", kind: "lab", lab: { mode: "chat", suggestions: 3, runs: 2 } },
      quiz(4, 2),
    ],
  },
  {
    n: 5,
    tasks: [
      { id: "m5.system", kind: "do", embed: "system" },
      {
        id: "m5.temperature",
        kind: "lab",
        lab: { mode: "samples", suggestions: 3, samples: 3, temperature: true, runs: 2, confirm: true, system: BRIEF },
      },
      quiz(5, 1),
    ],
  },
  {
    n: 6,
    tasks: [
      { id: "m6.split", kind: "number", number: { min: 700, max: 900, unit: "tokens" } },
      { id: "m6.cost", kind: "number", number: { min: 0.0036, max: 0.0044, unit: "USD" } },
      { id: "m6.context", kind: "lab", lab: { mode: "chat", suggestions: 3, runs: 3, contextMeter: true } },
      quiz(6, 2),
    ],
  },
  {
    n: 7,
    tasks: [{ id: "m7.inspect", kind: "do", embed: "requestInspector" }, quiz(7, 1)],
  },
  {
    n: 8,
    tasks: [
      { id: "m8.estimate", kind: "number", number: { min: 14, max: 17.5, unit: "GB" } },
      { id: "m8.ollama", kind: "manual", optional: true, open: "providers" },
      quiz(8, 0),
    ],
  },
  {
    n: 9,
    tasks: [
      { id: "m9.addDoc", kind: "do", embed: "librarySetup", check: "documentAdded", open: "library" },
      { id: "m9.compare", kind: "do", embed: "grounding" },
      quiz(9, 0),
    ],
  },
  {
    n: 10,
    tasks: [
      { id: "m10.filesystem", kind: "do", embed: "filesystemSetup", check: "filesystemRunning", open: "mcp" },
      { id: "m10.organize", kind: "do", embed: "tools", check: "toolUsed" },
      { id: "m10.ask", kind: "check", check: "askPermission", open: "mcp" },
      { id: "m10.gmail", kind: "check", check: "gmailConnected", optional: true, open: "plugins" },
      quiz(10, 2),
    ],
  },
  {
    n: 11,
    tasks: [
      { id: "m11.research", kind: "do", embed: "research" },
      { id: "m11.reflect", kind: "reflect" },
      quiz(11, 1),
    ],
  },
];

/**
 * The modules, bundled into stages that each answer one question. Shown as headings in the lesson list.
 * Every module belongs to exactly one group, and the groups follow the module order.
 */
export interface CourseGroup {
  /** Locale key `course.group.<id>`. */
  id: string;
  icon: string;
  modules: number[];
}

export const COURSE_GROUPS: CourseGroup[] = [
  { id: "start", icon: "🚀", modules: [1, 2, 3] },
  { id: "talk", icon: "💬", modules: [4, 5, 6] },
  { id: "inside", icon: "⚙️", modules: [7, 8] },
  { id: "powers", icon: "🧰", modules: [9, 10, 11] },
];

export function groupOf(n: number): CourseGroup | undefined {
  return COURSE_GROUPS.find((g) => g.modules.includes(n));
}

/** Number of options every quiz question has (the locale files define `o0`…`o2`). */
export const QUIZ_OPTION_COUNT = 3;

export function getModule(n: number): CourseModule | undefined {
  return COURSE_MODULES.find((m) => m.n === n);
}

export function getTask(id: string): CourseTask | undefined {
  for (const m of COURSE_MODULES) {
    const found = m.tasks.find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

/** `m3.compare` → `{ m: "m3", slug: "compare" }`. */
function splitTaskId(id: string): { m: string; slug: string } {
  const [m, slug] = id.split(".");
  return { m, slug };
}

/** Locale prefix of a task's own copy: `course.m3.t.compare`. */
export function taskPrefix(task: CourseTask): string {
  const { m, slug } = splitTaskId(task.id);
  return `course.${m}.t.${slug}`;
}

/** Locale keys for a task's own copy. `quiz` tasks use shared/module-level strings instead. */
export function taskCopyKeys(task: CourseTask): { title: string; desc: string; goal: string } {
  const p = taskPrefix(task);
  return { title: `${p}.title`, desc: `${p}.desc`, goal: `${p}.goal` };
}

/** Locale keys a lab needs under `prefix` (a task's or a block's). */
export function labLocaleKeys(prefix: string, lab: LabSpec): string[] {
  const keys: string[] = [];
  for (let k = 1; k <= lab.suggestions; k++) {
    if (lab.mode === "ab") keys.push(`${prefix}.s${k}.a`, `${prefix}.s${k}.b`);
    else keys.push(`${prefix}.s${k}`);
  }
  if (lab.confirm) keys.push(`${prefix}.confirm`);
  return keys;
}

/** Locale keys for a module's quiz question, its three options and the explanation. */
export function quizKeys(n: number): { q: string; options: string[]; why: string } {
  return {
    q: `course.m${n}.quiz.q`,
    options: Array.from({ length: QUIZ_OPTION_COUNT }, (_, i) => `course.m${n}.quiz.o${i}`),
    why: `course.m${n}.quiz.why`,
  };
}

/** Every locale key a module needs — used by tests to prove ES/EN coverage. */
export function moduleLocaleKeys(mod: CourseModule): string[] {
  const keys = [
    `course.m${mod.n}.title`,
    `course.m${mod.n}.term`,
    `course.m${mod.n}.summary`,
    ...lessonLocaleKeys(mod.n),
  ];
  for (const task of mod.tasks) {
    if (task.kind === "quiz") {
      const q = quizKeys(mod.n);
      keys.push(q.q, ...q.options, q.why);
      continue;
    }
    const c = taskCopyKeys(task);
    keys.push(c.title, c.desc);
    if (task.kind !== "reflect") keys.push(c.goal);
    if (task.lab) keys.push(...labLocaleKeys(taskPrefix(task), task.lab));
    if (task.kind === "number") keys.push(`${taskPrefix(task)}.hint`, `${taskPrefix(task)}.why`);
  }
  return keys;
}
