import type { CheckId, CourseModule, CourseTask } from "./modules";

/**
 * What the Course can see of the student's setup. A pure snapshot — `App.tsx` builds the synchronous
 * part from state it already holds, and `CoursePanel` adds the few values that need a query
 * (message / tool-call counts, whether the local router answers).
 */
export interface CourseState {
  enabledProviderCount: number;
  /** An OmniRoute provider row exists (enabled or not). */
  hasOmniroute: boolean;
  /** The router answered a `/v1/models` request just now. */
  omnirouteReachable: boolean;
  /** Assistant replies stored across all conversations. */
  assistantMessageCount: number;
  /** Tool calls the model has made, across all conversations. */
  toolCallCount: number;
  /** Lower-cased names of MCP servers that are running right now. */
  runningServerNames: string[];
  /** A non-Google server has at least one tool set to "ask before running". */
  hasAskPermission: boolean;
  googleConnected: boolean;
  ragDocumentCount: number;
}

export const EMPTY_COURSE_STATE: CourseState = {
  enabledProviderCount: 0,
  hasOmniroute: false,
  omnirouteReachable: false,
  assistantMessageCount: 0,
  toolCallCount: 0,
  runningServerNames: [],
  hasAskPermission: false,
  googleConnected: false,
  ragDocumentCount: 0,
};

export function evaluateCheck(id: CheckId, s: CourseState): boolean {
  switch (id) {
    case "providerAdded":
      return s.enabledProviderCount >= 1;
    case "twoProviders":
      return s.enabledProviderCount >= 2;
    case "messageSent":
      return s.assistantMessageCount >= 1;
    case "omnirouteConnected":
      return s.hasOmniroute && s.omnirouteReachable;
    case "documentAdded":
      return s.ragDocumentCount >= 1;
    case "filesystemRunning":
      return s.runningServerNames.some((n) => n.includes("filesystem"));
    case "toolUsed":
      return s.toolCallCount >= 1;
    case "gmailConnected":
      return s.googleConnected;
    case "askPermission":
      return s.hasAskPermission;
  }
}

/** Ids of tasks the app can already confirm — used to persist them as done the first time they pass. */
export function autoCompletedTaskIds(modules: CourseModule[], state: CourseState): string[] {
  return modules
    .flatMap((m) => m.tasks)
    .filter((t) => t.check && evaluateCheck(t.check, state))
    .map((t) => t.id);
}

export function isTaskDone(task: CourseTask, done: ReadonlySet<string>): boolean {
  return done.has(task.id);
}

export interface Progress {
  done: number;
  total: number;
  /** 0–100, whole number. */
  percent: number;
}

/** Counts only required tasks — optional ones (a local router, Gmail) never hold a module back. */
export function moduleProgress(mod: CourseModule, done: ReadonlySet<string>): Progress {
  const required = mod.tasks.filter((t) => !t.optional);
  const doneCount = required.filter((t) => done.has(t.id)).length;
  return toProgress(doneCount, required.length);
}

export function courseProgress(modules: CourseModule[], done: ReadonlySet<string>): Progress {
  const required = modules.flatMap((m) => m.tasks).filter((t) => !t.optional);
  const doneCount = required.filter((t) => done.has(t.id)).length;
  return toProgress(doneCount, required.length);
}

/** A module is complete once every required task is done. */
export function isModuleComplete(mod: CourseModule, done: ReadonlySet<string>): boolean {
  const p = moduleProgress(mod, done);
  return p.total > 0 && p.done === p.total;
}

/**
 * The module a returning student should resume: the first one with a required task still open, or
 * `undefined` once the whole course is finished. Order follows the course, not what was opened last.
 */
export function firstIncompleteModule(
  modules: CourseModule[],
  done: ReadonlySet<string>,
): CourseModule | undefined {
  return modules.find((m) => !isModuleComplete(m, done));
}

function toProgress(done: number, total: number): Progress {
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
