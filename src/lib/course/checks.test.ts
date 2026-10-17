import { describe, expect, it } from "vitest";
import {
  EMPTY_COURSE_STATE,
  autoCompletedTaskIds,
  courseProgress,
  evaluateCheck,
  firstIncompleteModule,
  isModuleComplete,
  moduleProgress,
  type CourseState,
} from "./checks";
import { COURSE_MODULES, getModule, moduleLocaleKeys } from "./modules";
import { es } from "../locales/es";
import { en } from "../locales/en";

const withState = (patch: Partial<CourseState>): CourseState => ({ ...EMPTY_COURSE_STATE, ...patch });

describe("evaluateCheck", () => {
  it("passes nothing on a fresh install", () => {
    for (const mod of COURSE_MODULES) {
      for (const task of mod.tasks) {
        if (task.check) expect(evaluateCheck(task.check, EMPTY_COURSE_STATE)).toBe(false);
      }
    }
  });

  it("needs two enabled providers for the failover task but only one for the first key", () => {
    const one = withState({ enabledProviderCount: 1 });
    expect(evaluateCheck("providerAdded", one)).toBe(true);
    expect(evaluateCheck("twoProviders", one)).toBe(false);
    expect(evaluateCheck("twoProviders", withState({ enabledProviderCount: 2 }))).toBe(true);
  });

  it("requires the router to be both configured and reachable", () => {
    expect(evaluateCheck("omnirouteConnected", withState({ hasOmniroute: true }))).toBe(false);
    expect(evaluateCheck("omnirouteConnected", withState({ omnirouteReachable: true }))).toBe(false);
    expect(
      evaluateCheck("omnirouteConnected", withState({ hasOmniroute: true, omnirouteReachable: true })),
    ).toBe(true);
  });

  it("recognises a running Filesystem server by name, case-insensitively stored", () => {
    expect(evaluateCheck("filesystemRunning", withState({ runningServerNames: ["web reader"] }))).toBe(false);
    expect(evaluateCheck("filesystemRunning", withState({ runningServerNames: ["filesystem (docs)"] }))).toBe(true);
  });

  it("reads tool use, documents, Gmail and ask-permission straight from the snapshot", () => {
    expect(evaluateCheck("toolUsed", withState({ toolCallCount: 1 }))).toBe(true);
    expect(evaluateCheck("documentAdded", withState({ ragDocumentCount: 1 }))).toBe(true);
    expect(evaluateCheck("gmailConnected", withState({ googleConnected: true }))).toBe(true);
    expect(evaluateCheck("askPermission", withState({ hasAskPermission: true }))).toBe(true);
    expect(evaluateCheck("messageSent", withState({ assistantMessageCount: 3 }))).toBe(true);
  });
});

describe("autoCompletedTaskIds", () => {
  it("lists only the check tasks that currently pass", () => {
    const ids = autoCompletedTaskIds(COURSE_MODULES, withState({ enabledProviderCount: 1, ragDocumentCount: 2 }));
    expect(ids.sort()).toEqual(["m1.firstKey", "m9.addDoc"]);
  });
});

describe("progress", () => {
  it("ignores optional tasks when counting a module", () => {
    const m2 = getModule(2)!;
    const required = m2.tasks.filter((t) => !t.optional);
    const done = new Set(required.map((t) => t.id));
    expect(moduleProgress(m2, done)).toEqual({ done: required.length, total: required.length, percent: 100 });
    // Finishing the optional router task on its own doesn't move the needle.
    expect(moduleProgress(m2, new Set(["m1.router"])).done).toBe(0);
  });

  it("rolls every module up into one percentage", () => {
    expect(courseProgress(COURSE_MODULES, new Set()).percent).toBe(0);
    const all = new Set(COURSE_MODULES.flatMap((m) => m.tasks.map((t) => t.id)));
    expect(courseProgress(COURSE_MODULES, all).percent).toBe(100);
  });
});

describe("resuming the course", () => {
  const requiredIds = (n: number) =>
    getModule(n)!.tasks.filter((t) => !t.optional).map((t) => t.id);

  it("starts at module 1 on a fresh install", () => {
    expect(firstIncompleteModule(COURSE_MODULES, new Set())?.n).toBe(1);
  });

  it("resumes at the first module that still has a required task open", () => {
    const done = new Set([...requiredIds(1), ...requiredIds(2)]);
    expect(firstIncompleteModule(COURSE_MODULES, done)?.n).toBe(3);
    // Leaving one required task of module 1 open sends the student back to it.
    done.delete("m1.quiz");
    expect(firstIncompleteModule(COURSE_MODULES, done)?.n).toBe(1);
  });

  it("returns nothing once every required task is done", () => {
    const all = new Set(COURSE_MODULES.flatMap((m) => requiredIds(m.n)));
    expect(firstIncompleteModule(COURSE_MODULES, all)).toBeUndefined();
    expect(COURSE_MODULES.every((m) => isModuleComplete(m, all))).toBe(true);
  });
});

describe("course structure", () => {
  it("has unique, correctly-prefixed task ids", () => {
    const seen = new Set<string>();
    for (const mod of COURSE_MODULES) {
      for (const task of mod.tasks) {
        expect(task.id.startsWith(`m${mod.n}.`)).toBe(true);
        expect(seen.has(task.id)).toBe(false);
        seen.add(task.id);
      }
    }
  });

  it("gives every module exactly one quiz, last, with a valid answer", () => {
    for (const mod of COURSE_MODULES) {
      expect(mod.tasks[mod.tasks.length - 1].kind).toBe("quiz");
      const quizzes = mod.tasks.filter((t) => t.kind === "quiz");
      expect(quizzes).toHaveLength(1);
      expect(quizzes[0].correct).toBeGreaterThanOrEqual(0);
      expect(quizzes[0].correct).toBeLessThan(3);
    }
  });

  it("gives every check task a check id, and every task kind the config it needs", () => {
    for (const task of COURSE_MODULES.flatMap((m) => m.tasks)) {
      if (task.kind === "check") expect(task.check).toBeDefined();
      if (task.kind === "lab") expect(task.lab).toBeDefined();
      if (task.kind === "do") expect(task.embed).toBeDefined();
    }
  });

  it("has every locale key the modules need, in both Spanish and English", () => {
    for (const mod of COURSE_MODULES) {
      for (const key of moduleLocaleKeys(mod)) {
        expect(Object.keys(es), `es is missing ${key}`).toContain(key);
        expect(Object.keys(en), `en is missing ${key}`).toContain(key);
      }
    }
  });

  it("keeps the Spanish and English dictionaries at exact key parity", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});
