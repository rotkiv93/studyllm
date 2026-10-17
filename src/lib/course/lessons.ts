/**
 * Lesson layout — the *shape* of each module's teaching content, as typed blocks that
 * `components/course/LessonBlocks.tsx` renders as visual cards, timelines, steppers, screenshot
 * walkthroughs, interactive tools and task cards (instead of a wall of Markdown). Like `modules.ts`,
 * only structure and icons live here; every word is a locale key derived from the block's id, so
 * ES/EN stay in lockstep (a test proves it).
 *
 * A lesson reads top to bottom as one flow: explain → try it → explain → do the task. Tasks are
 * placed right where they make sense (`kind: "task"`), each exactly once.
 *
 * Key scheme, for module `n` and block `id` (P = `course.m<n>.b.<id>`):
 *   cards / steps / timeline : P.title, [P.lead], P.i<k>.t, P.i<k>.d   (k = 1…count)
 *   explore                  : P.title, [P.lead], P.i<k>.t, P.i<k>.d (short, on the tile), P.i<k>.more, [P.i<k>.ex]
 *   compare                  : P.title, P.a.t, P.a.p<j>, P.b.t, P.b.p<j> (j = 1…points)
 *   callout                  : P.title, P.body
 *   example                  : P.title, P.a.label, P.a.text, P.b.label, P.b.text
 *   shots                    : P.title, [P.lead], P.i<k>.t, P.i<k>.d   (k = 1…shots.length; the title doubles as alt text)
 *   embed                    : P.title, [P.lead]
 *   task                     : nothing here — a task's copy lives with the task (see `modules.ts`)
 * Hero goals: `course.m<n>.hero.g<k>`.
 */
import type { EmbedId } from "./modules";

export type CalloutTone = "key" | "warn" | "tip";

export type LessonBlock =
  | { kind: "cards"; id: string; icons: string[]; lead?: boolean }
  /**
   * Tiles you click for more: a longer explanation, optionally a copyable example prompt (`examples`)
   * and a link to the real thing (`links[k]`, one entry per item, `undefined` for none).
   */
  | { kind: "explore"; id: string; icons: string[]; lead?: boolean; examples?: boolean; links?: (string | undefined)[] }
  | { kind: "steps"; id: string; count: number; lead?: boolean }
  | { kind: "timeline"; id: string; count: number; lead?: boolean }
  | { kind: "compare"; id: string; icons: [string, string]; points: number }
  | { kind: "callout"; id: string; tone: CalloutTone; icon: string }
  /** Two prompts side by side. `before-after` frames them as weak → strong; `pair` as two equal options. */
  | { kind: "example"; id: string; variant: "before-after" | "pair" }
  /** A walkthrough: one captioned screenshot of the app per step. `shots` are image names, no extension. */
  | { kind: "shots"; id: string; shots: string[]; lead?: boolean }
  /** An interactive tool dropped into the flow of the text (not tied to a task). */
  | { kind: "embed"; id: string; embed: EmbedId; lead?: boolean }
  /** A task, shown right here as an interactive card instead of in a list at the bottom. */
  | { kind: "task"; task: string };

export interface LessonHero {
  /** One emoji that stands for the module on its banner. */
  icon: string;
  /** Rough reading + doing time, shown as "~N min". */
  minutes: number;
  /** How many "what you'll learn" goals the module lists. */
  goals: number;
}

export interface Lesson {
  hero: LessonHero;
  blocks: LessonBlock[];
}

const task = (id: string): LessonBlock => ({ kind: "task", task: id });

export const LESSONS: Record<number, Lesson> = {
  1: {
    hero: { icon: "🔑", minutes: 25, goals: 3 },
    blocks: [
      { kind: "steps", id: "route", count: 4, lead: true },
      { kind: "embed", id: "keys", embed: "keyGuide", lead: true },
      { kind: "callout", id: "safety", tone: "warn", icon: "🔒" },
      { kind: "shots", id: "addKey", shots: ["providers-open", "providers-add"], lead: true },
      task("m1.firstKey"),
      { kind: "shots", id: "tour", shots: ["chat-tour", "panel-open"], lead: true },
      task("m1.firstMessage"),
      { kind: "cards", id: "concepts", icons: ["🔑", "📉", "🔀"] },
      { kind: "shots", id: "order", shots: ["providers-order"], lead: true },
      task("m1.secondKey"),
      { kind: "shots", id: "router", shots: ["omniroute-form"], lead: true },
      task("m1.router"),
      task("m1.quiz"),
    ],
  },
  2: {
    hero: { icon: "🧠", minutes: 15, goals: 3 },
    blocks: [
      { kind: "timeline", id: "history", count: 6 },
      { kind: "cards", id: "how", icons: ["👀", "📚", "🎯"], lead: true },
      task("m2.samples"),
      { kind: "callout", id: "why", tone: "key", icon: "🎲" },
      { kind: "compare", id: "reality", icons: ["✅", "⛔"], points: 3 },
      task("m2.invented"),
      { kind: "callout", id: "risk", tone: "warn", icon: "⚠️" },
      task("m2.quiz"),
    ],
  },
  3: {
    hero: { icon: "🗺️", minutes: 15, goals: 3 },
    blocks: [
      {
        kind: "explore",
        id: "companies",
        icons: ["💬", "🧩", "🔷", "🦙", "🌬️", "🐋", "🪟"],
        lead: true,
        links: [
          "https://openai.com",
          "https://www.anthropic.com",
          "https://deepmind.google",
          "https://www.llama.com",
          "https://mistral.ai",
          "https://www.deepseek.com",
          "https://copilot.microsoft.com",
        ],
      },
      {
        kind: "explore",
        id: "media",
        icons: ["🎨", "🧭", "🧩", "🪄", "🎙️", "🔊", "🎵", "🎬", "🎞️", "🎥", "🧑‍💼"],
        lead: true,
        links: [
          "https://openai.com/dall-e-3",
          "https://www.midjourney.com",
          "https://stability.ai",
          "https://firefly.adobe.com",
          "https://openai.com/index/whisper",
          "https://elevenlabs.io",
          "https://suno.com",
          "https://openai.com/sora",
          "https://runwayml.com",
          "https://deepmind.google/models/veo",
          "https://www.heygen.com",
        ],
      },
      {
        kind: "explore",
        id: "study",
        icons: ["📓", "🔎", "🔷", "🟠", "🪟"],
        lead: true,
        links: [
          "https://notebooklm.google",
          "https://www.perplexity.ai",
          "https://gemini.google.com",
          "https://claude.ai",
          "https://copilot.microsoft.com",
        ],
      },
      { kind: "callout", id: "compare", tone: "tip", icon: "⚖️" },
      task("m3.compare"),
      task("m3.quiz"),
    ],
  },
  4: {
    hero: { icon: "✍️", minutes: 25, goals: 3 },
    blocks: [
      { kind: "explore", id: "anatomy", icons: ["🎭", "👥", "🎚️", "📐", "💡", "🔁"], lead: true, examples: true },
      { kind: "example", id: "beforeAfter", variant: "before-after" },
      task("m4.ab"),
      { kind: "callout", id: "recipe", tone: "tip", icon: "🧪" },
      task("m4.build"),
      { kind: "explore", id: "uses", icons: ["📝", "🔑", "🧒", "⚔️", "❓", "✉️"], lead: true, examples: true },
      task("m4.iterate"),
      task("m4.quiz"),
    ],
  },
  5: {
    hero: { icon: "🎛️", minutes: 20, goals: 3 },
    blocks: [
      { kind: "cards", id: "levers", icons: ["📜", "🌡️"] },
      { kind: "example", id: "system", variant: "pair" },
      task("m5.system"),
      { kind: "cards", id: "temp", icons: ["❄️", "⚖️", "🔥"], lead: true },
      task("m5.temperature"),
      { kind: "shots", id: "where", shots: ["panel-style"], lead: true },
      task("m5.quiz"),
    ],
  },
  6: {
    hero: { icon: "🪙", minutes: 25, goals: 3 },
    blocks: [
      { kind: "cards", id: "tokens", icons: ["🧩", "⚖️", "🔀"] },
      { kind: "embed", id: "explorer", embed: "tokens", lead: true },
      task("m6.split"),
      { kind: "steps", id: "cost", count: 3, lead: true },
      { kind: "embed", id: "calculator", embed: "cost", lead: true },
      task("m6.cost"),
      { kind: "callout", id: "context", tone: "warn", icon: "🧠" },
      task("m6.context"),
      task("m6.quiz"),
    ],
  },
  7: {
    hero: { icon: "🌐", minutes: 15, goals: 3 },
    blocks: [
      { kind: "steps", id: "flow", count: 5, lead: true },
      { kind: "cards", id: "words", icons: ["💻", "🖥️", "🔌", "🔤"] },
      task("m7.inspect"),
      { kind: "callout", id: "same", tone: "key", icon: "🗝️" },
      task("m7.quiz"),
    ],
  },
  8: {
    hero: { icon: "💻", minutes: 20, goals: 3 },
    blocks: [
      { kind: "compare", id: "cloudLocal", icons: ["☁️", "💻"], points: 4 },
      { kind: "cards", id: "gpu", icons: ["🟢", "🟡", "🔴"], lead: true },
      { kind: "embed", id: "vram", embed: "vram", lead: true },
      task("m8.estimate"),
      { kind: "callout", id: "ollama", tone: "tip", icon: "🦙" },
      { kind: "steps", id: "ollamaSteps", count: 4, lead: true },
      task("m8.ollama"),
      task("m8.quiz"),
    ],
  },
  9: {
    hero: { icon: "📚", minutes: 25, goals: 3 },
    blocks: [
      { kind: "steps", id: "pipeline", count: 4, lead: true },
      { kind: "compare", id: "withWithout", icons: ["❓", "📚"], points: 3 },
      { kind: "callout", id: "key", tone: "tip", icon: "🔑" },
      { kind: "shots", id: "library", shots: ["library-open"], lead: true },
      task("m9.addDoc"),
      { kind: "shots", id: "docsOn", shots: ["panel-docs"], lead: true },
      { kind: "embed", id: "retrieval", embed: "retrieval", lead: true },
      task("m9.compare"),
      task("m9.quiz"),
    ],
  },
  10: {
    hero: { icon: "🧰", minutes: 30, goals: 3 },
    blocks: [
      { kind: "explore", id: "three", icons: ["💬", "🔌", "🧰"], examples: true },
      { kind: "compare", id: "llm", icons: ["💬", "🧰"], points: 2 },
      { kind: "steps", id: "example", count: 4, lead: true },
      { kind: "shots", id: "filesystem", shots: ["mcp-open"], lead: true },
      task("m10.filesystem"),
      task("m10.organize"),
      { kind: "callout", id: "safety", tone: "warn", icon: "🛡️" },
      { kind: "shots", id: "permissions", shots: ["mcp-permissions"], lead: true },
      task("m10.ask"),
      { kind: "callout", id: "models", tone: "tip", icon: "🏷️" },
      { kind: "shots", id: "gmail", shots: ["plugins-gmail"], lead: true },
      task("m10.gmail"),
      task("m10.quiz"),
    ],
  },
  11: {
    hero: { icon: "🤖", minutes: 20, goals: 3 },
    blocks: [
      { kind: "compare", id: "chatAgent", icons: ["💬", "🤖"], points: 2 },
      { kind: "steps", id: "loop", count: 4, lead: true },
      { kind: "callout", id: "deepResearch", tone: "key", icon: "🔭" },
      { kind: "shots", id: "researchOn", shots: ["panel-research"], lead: true },
      task("m11.research"),
      { kind: "callout", id: "ethics", tone: "warn", icon: "⚖️" },
      task("m11.reflect"),
      task("m11.quiz"),
    ],
  },
};

/** Every locale key one block needs. */
export function blockLocaleKeys(n: number, block: LessonBlock): string[] {
  if (block.kind === "task") return [];
  const p = `course.m${n}.b.${block.id}`;
  const keys: string[] = [];
  switch (block.kind) {
    case "cards": {
      keys.push(`${p}.title`);
      if (block.lead) keys.push(`${p}.lead`);
      for (let k = 1; k <= block.icons.length; k++) keys.push(`${p}.i${k}.t`, `${p}.i${k}.d`);
      break;
    }
    case "explore": {
      keys.push(`${p}.title`);
      if (block.lead) keys.push(`${p}.lead`);
      for (let k = 1; k <= block.icons.length; k++) {
        keys.push(`${p}.i${k}.t`, `${p}.i${k}.d`, `${p}.i${k}.more`);
        if (block.examples) keys.push(`${p}.i${k}.ex`);
      }
      break;
    }
    case "steps":
    case "timeline": {
      keys.push(`${p}.title`);
      if (block.lead) keys.push(`${p}.lead`);
      for (let k = 1; k <= block.count; k++) keys.push(`${p}.i${k}.t`, `${p}.i${k}.d`);
      break;
    }
    case "shots": {
      keys.push(`${p}.title`);
      if (block.lead) keys.push(`${p}.lead`);
      for (let k = 1; k <= block.shots.length; k++) keys.push(`${p}.i${k}.t`, `${p}.i${k}.d`);
      break;
    }
    case "embed": {
      keys.push(`${p}.title`);
      if (block.lead) keys.push(`${p}.lead`);
      break;
    }
    case "compare": {
      keys.push(`${p}.title`, `${p}.a.t`, `${p}.b.t`);
      for (let j = 1; j <= block.points; j++) keys.push(`${p}.a.p${j}`, `${p}.b.p${j}`);
      break;
    }
    case "callout": {
      keys.push(`${p}.title`, `${p}.body`);
      break;
    }
    case "example": {
      keys.push(`${p}.title`, `${p}.a.label`, `${p}.a.text`, `${p}.b.label`, `${p}.b.text`);
      break;
    }
  }
  return keys;
}

/** Every locale key a module's hero and blocks need — used by tests to prove ES/EN coverage. */
export function lessonLocaleKeys(n: number): string[] {
  const lesson = LESSONS[n];
  if (!lesson) return [];
  const keys: string[] = [];
  for (let k = 1; k <= lesson.hero.goals; k++) keys.push(`course.m${n}.hero.g${k}`);
  for (const block of lesson.blocks) keys.push(...blockLocaleKeys(n, block));
  return keys;
}

/** Ids of the tasks a lesson places, in order — a test proves each module places each of its tasks once. */
export function lessonTaskIds(n: number): string[] {
  const lesson = LESSONS[n];
  if (!lesson) return [];
  return lesson.blocks.flatMap((b) => (b.kind === "task" ? [b.task] : []));
}

/** Every screenshot a lesson references, as image names (no extension). */
export function lessonShotNames(n: number): string[] {
  const lesson = LESSONS[n];
  if (!lesson) return [];
  return lesson.blocks.flatMap((b) => (b.kind === "shots" ? b.shots : []));
}
