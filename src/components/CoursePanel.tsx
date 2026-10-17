import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LessonBlocks, LessonHero } from "./course/LessonBlocks";
import { TaskCard } from "./course/TaskCard";
import { TokenExplorer } from "./TokenExplorer";
import { PromptPlayground } from "./PromptPlayground";
import { RetrievalExplorer } from "./RetrievalExplorer";
import { GroundingContrast } from "./GroundingContrast";
import { McpToolExplorer, type ExplorerServer } from "./McpToolExplorer";
import { ResearchTrace } from "./ResearchTrace";
import { KeyGuide } from "./course/KeyGuide";
import { PromptBuilder } from "./course/PromptBuilder";
import { RequestInspector } from "./course/RequestInspector";
import { VramEstimator } from "./course/VramEstimator";
import { CostEstimator } from "./course/CostEstimator";
import { ProviderSetup, RouterSetup } from "./course/ProviderSetup";
import { FilesystemSetup } from "./course/FilesystemSetup";
import { LibrarySetup } from "./course/LibrarySetup";
import { IconChevronsLeft, IconChevronsRight, IconCompass } from "./icons";
import type { ProviderDraft } from "./ProvidersPanel";
import type { ProviderMode } from "./OmniRouteView";
import {
  EMPTY_COURSE_STATE,
  autoCompletedTaskIds,
  courseProgress,
  firstIncompleteModule,
  isModuleComplete,
  moduleProgress,
  type CourseState,
} from "../lib/course/checks";
import type { RunLab } from "../lib/course/labs";
import {
  COURSE_GROUPS,
  COURSE_MODULES,
  getModule,
  getTask,
  type CourseModule,
  type CourseTarget,
  type EmbedId,
} from "../lib/course/modules";
import { buildProgressReport } from "../lib/course/report";
import { countAssistantMessages, countToolCalls, type ProviderRow, type RagDocumentRow } from "../lib/db";
import { fetchProviderModels } from "../lib/providerModels";
import { PROVIDER_MANIFEST } from "../lib/providers";
import type { ResearchMode } from "../lib/researchModes";
import type { StreamEvent } from "../lib/providerRouter";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * The Course — a full-page, guided path through everything the class covers, replacing the old
 * "Explore" modal. A lesson is one flow: short explanations in visual blocks, annotated screenshots of
 * the app for every configuration step, and interactive task cards in between — a chat to try things
 * in, a form that really configures the app, a calculator, a quiz. Many tasks are verified from the
 * student's actual setup. Progress is saved to SQLite and can be exported as a Markdown report.
 *
 * Structure lives in `lib/course/modules.ts`; all copy lives in the locale files (`course.m<n>.*`).
 */

const MODULE_STORAGE_KEY = "studyllm.course.module";
const FOLDED_STORAGE_KEY = "studyllm.course.folded";

/** The part of `CourseState` the app already holds; the panel adds the values that need a query. */
export type CourseAppState = Omit<
  CourseState,
  "assistantMessageCount" | "toolCallCount" | "omnirouteReachable"
>;

interface CoursePanelProps {
  providers: ProviderRow[];
  documents: RagDocumentRow[];
  appState: CourseAppState;
  /** Left bar collapsed to a narrow rail (same toggle as the chat sidebar). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Task ids the student has finished, and their saved reflections. */
  done: ReadonlySet<string>;
  notes: Readonly<Record<string, string>>;
  onMark: (taskId: string, note?: string | null) => Promise<void>;
  onUnmark: (taskId: string) => Promise<void>;
  onReset: () => Promise<void>;
  onOpen: (target: CourseTarget) => void;
  onUsePrompt: (prompt: string) => void;
  /** Run one practice model call through the app's router (nothing is saved). */
  onRunLab: RunLab;
  onAddProvider: (draft: ProviderDraft) => Promise<void>;
  providerMode: ProviderMode;
  onProviderMode: (mode: ProviderMode) => void;
  providerModeBusy: boolean;
  onAddFilesystem: (scopedPath: string) => Promise<void>;
  onAddLibraryFiles: (files: File[]) => Promise<void>;
  libraryBusy: boolean;
  libraryError: string | null;
  hasProviders: boolean;
  hasResearchTools: boolean;
  installingResearchTools: boolean;
  onInstallResearchTools: () => Promise<void>;
  toolServers: ExplorerServer[];
  onRunToolProbe: (
    question: string,
    serverId: string,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  onRunAnswer: (
    question: string,
    system: string | undefined,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  onRunResearch: (
    question: string,
    mode: ResearchMode,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

function loadInitialModule(): number {
  try {
    const saved = Number(localStorage.getItem(MODULE_STORAGE_KEY));
    if (getModule(saved)) return saved;
  } catch {
    /* localStorage unavailable — start at the top */
  }
  return COURSE_MODULES[0].n;
}

function loadFolded(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLDED_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function CoursePanel(props: CoursePanelProps) {
  const {
    providers,
    appState,
    collapsed,
    onToggleCollapsed,
    done,
    notes,
    onMark,
    onUnmark,
    onReset,
    onOpen,
  } = props;
  const t = useT();
  const [current, setCurrent] = useState(loadInitialModule);
  const [checking, setChecking] = useState(false);
  const [queried, setQueried] = useState({ assistantMessageCount: 0, toolCallCount: 0, omnirouteReachable: false });
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);
  // Task cards the student folded away (remembered across sessions).
  const [folded, setFolded] = useState<Set<string>>(loadFolded);

  const updateFolded = useCallback((change: (prev: Set<string>) => Set<string>) => {
    setFolded((prev) => {
      const next = change(prev);
      try {
        localStorage.setItem(FOLDED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  const state: CourseState = useMemo(() => ({ ...EMPTY_COURSE_STATE, ...appState, ...queried }), [appState, queried]);

  /** Reads the counts and whether the local router answers. Cheap enough to run on open and on demand. */
  const load = useCallback(async () => {
    const router = providers.find((p) => p.type === "omniroute" && p.enabled);
    const [assistantMessageCount, toolCallCount, models] = await Promise.all([
      countAssistantMessages().catch(() => 0),
      countToolCalls().catch(() => 0),
      router
        ? fetchProviderModels("omniroute", "", router.base_url_override ?? PROVIDER_MANIFEST.omniroute.baseURL)
        : Promise.resolve(null),
    ]);
    return { assistantMessageCount, toolCallCount, omnirouteReachable: models !== null };
  }, [providers]);

  // Check on open and whenever the providers change.
  useEffect(() => {
    let active = true;
    void load().then((q) => {
      if (active) setQueried(q);
    });
    return () => {
      active = false;
    };
  }, [load]);

  /** The "Check again" button: same read, with a visible busy state. */
  async function recheck() {
    setChecking(true);
    try {
      setQueried(await load());
    } finally {
      setChecking(false);
    }
  }

  // The first time an auto-checked task passes, remember it — removing the provider later shouldn't
  // un-finish the lesson.
  useEffect(() => {
    for (const id of autoCompletedTaskIds(COURSE_MODULES, state)) {
      if (!done.has(id)) void onMark(id);
    }
  }, [state, done, onMark]);

  function select(n: number) {
    setCurrent(n);
    try {
      localStorage.setItem(MODULE_STORAGE_KEY, String(n));
    } catch {
      /* non-fatal */
    }
  }

  const mod = getModule(current) ?? COURSE_MODULES[0];
  const total = courseProgress(COURSE_MODULES, done);
  const index = COURSE_MODULES.findIndex((m) => m.n === mod.n);
  const prev = COURSE_MODULES[index - 1];
  const next = COURSE_MODULES[index + 1];
  // "Continue where you left off" — the first module with a required task still open.
  const resume = firstIncompleteModule(COURSE_MODULES, done);
  const courseFinished = total.total > 0 && total.done === total.total;
  const moduleFinished = isModuleComplete(mod, done);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildProgressReport(COURSE_MODULES, done, notes, t));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function reset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    await onReset();
  }

  return (
    <>
      {/* In Course mode this bar replaces the chat sidebar: the lesson list is the navigation. */}
      <aside className={`sidebar course-sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
        <header className="side-head course-top">
          <h1>
            <IconCompass size={18} /> {t("nav.course")}
          </h1>
          <button
            type="button"
            className="btn btn-ghost btn-icon sidebar-toggle"
            onClick={onToggleCollapsed}
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-expanded={!collapsed}
          >
            {collapsed ? <IconChevronsRight size={16} /> : <IconChevronsLeft size={16} />}
          </button>
        </header>
        <div className="course-side-head">
          <div
            className="course-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={total.percent}
            aria-label={t("course.progressLabel")}
          >
            <div className="course-bar-fill" style={{ width: `${total.percent}%` }} />
          </div>
          <span className="course-header-progress-text">
            {t("course.progress", { done: total.done, total: total.total, percent: total.percent })}
          </span>
          {resume && (
            <button
              type="button"
              className="btn btn-primary btn-sm course-side-continue"
              onClick={() => select(resume.n)}
              disabled={resume.n === mod.n}
              title={t(`course.m${resume.n}.title` as MessageKey)}
            >
              {total.done === 0 ? t("course.start") : t("course.continue")}
            </button>
          )}
        </div>

        <nav className="course-rail" aria-label={t("course.modulesLabel")}>
          {COURSE_GROUPS.map((group) => {
            const mods = group.modules.map((n) => getModule(n)).filter((m): m is CourseModule => !!m);
            const groupDone = mods.filter((m) => isModuleComplete(m, done)).length;
            return (
              <div key={group.id} className="course-group">
                <h2 className="course-group-title">
                  <span aria-hidden="true">{group.icon}</span>
                  <span>{t(`course.group.${group.id}` as MessageKey)}</span>
                  <span className="course-group-count">
                    {groupDone}/{mods.length}
                  </span>
                </h2>
                <ol>
                  {mods.map((m) => {
                    const p = moduleProgress(m, done);
                    const complete = p.total > 0 && p.done === p.total;
                    return (
                      <li key={m.n}>
                        <button
                          type="button"
                          className={`course-rail-item${m.n === mod.n ? " course-rail-item-active" : ""}${complete ? " course-rail-item-done" : ""}`}
                          onClick={() => select(m.n)}
                          aria-current={m.n === mod.n ? "step" : undefined}
                          title={t(`course.m${m.n}.title` as MessageKey)}
                        >
                          <span className="course-rail-num">{complete ? "✓" : m.n}</span>
                          <span className="course-rail-text">
                            <span className="course-rail-title">{t(`course.m${m.n}.title` as MessageKey)}</span>
                            <span className="course-rail-count">
                              {p.done}/{p.total}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </nav>

        <div className="course-side-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyReport}>
            {copied ? t("course.reportCopied") : t("course.copyReport")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset} onBlur={() => setConfirmReset(false)}>
            {confirmReset ? t("course.resetConfirm") : t("course.reset")}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <div className="course-page">
          {total.done === 0 && <p className="settings-hint course-intro">{t("course.subtitle")}</p>}

          {courseFinished && (
            <div className="course-finished" role="status">
              <div>
                <strong>{t("course.finished.title")}</strong>
                <p>{t("course.finished.body")}</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={copyReport}>
                {copied ? t("course.reportCopied") : t("course.copyReport")}
              </button>
            </div>
          )}

          <article className="course-module" key={mod.n}>
            <LessonHero mod={mod} taskCount={mod.tasks.length} complete={moduleFinished} />

            <MissionBar
              mod={mod}
              done={done}
              folded={folded}
              checking={checking}
              onRecheck={() => void recheck()}
              onFoldDone={(fold) =>
                updateFolded((prev) => {
                  const next = new Set(prev);
                  for (const task of mod.tasks) {
                    if (!done.has(task.id)) continue;
                    if (fold) next.add(task.id);
                    else next.delete(task.id);
                  }
                  return next;
                })
              }
              onReveal={(id) => updateFolded((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : prev))}
            />

            <LessonBlocks
              n={mod.n}
              renderTask={(taskId) => {
                const task = getTask(taskId);
                if (!task) return null;
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    index={mod.tasks.findIndex((x) => x.id === task.id) + 1}
                    mod={mod}
                    done={done.has(task.id)}
                    note={notes[task.id]}
                    state={state}
                    providers={providers}
                    onMark={onMark}
                    onUnmark={onUnmark}
                    onOpen={onOpen}
                    onRunLab={props.onRunLab}
                    renderEmbed={(embed, onDone) => renderEmbed(embed, props, state, onDone)}
                    collapsed={folded.has(task.id)}
                    onToggleCollapsed={() =>
                      updateFolded((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      })
                    }
                  />
                );
              }}
              renderEmbed={(embed) => renderEmbed(embed, props, state)}
              folded={folded}
              onToggleFold={(k) =>
                updateFolded((prev) => {
                  const next = new Set(prev);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                })
              }
            />

            <footer className="course-nav">
              {prev ? (
                <button type="button" className="btn btn-secondary" onClick={() => select(prev.n)}>
                  ← {t(`course.m${prev.n}.title` as MessageKey)}
                </button>
              ) : (
                <span />
              )}
              {next && (
                <button type="button" className="btn btn-primary" onClick={() => select(next.n)}>
                  {t(`course.m${next.n}.title` as MessageKey)} →
                </button>
              )}
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}

/** The module's tasks as a checklist under the banner; each chip scrolls to its card in the lesson. */
function MissionBar({
  mod,
  done,
  folded,
  checking,
  onRecheck,
  onFoldDone,
  onReveal,
}: {
  mod: CourseModule;
  done: ReadonlySet<string>;
  folded: ReadonlySet<string>;
  checking: boolean;
  onRecheck: () => void;
  /** Fold (true) or unfold (false) every finished task of this module. */
  onFoldDone: (fold: boolean) => void;
  onReveal: (taskId: string) => void;
}) {
  const t = useT();
  const p = moduleProgress(mod, done);
  const doneTasks = mod.tasks.filter((x) => done.has(x.id));
  const allFolded = doneTasks.length > 0 && doneTasks.every((x) => folded.has(x.id));

  function go(id: string) {
    onReveal(id);
    // Wait a frame so a card that was folded has grown back before we scroll to it.
    requestAnimationFrame(() =>
      document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <nav className="mission-bar" aria-label={t("course.mission.title")}>
      <div className="mission-bar-head">
        <strong>
          <span aria-hidden="true">🚀</span> {t("course.mission.title")}
        </strong>
        <span className="mission-bar-count">{t("course.mission.count", { done: p.done, total: p.total })}</span>
        {doneTasks.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFoldDone(!allFolded)}>
            {allFolded ? t("course.mission.showAll") : t("course.mission.hideDone")}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRecheck} disabled={checking}>
          {checking ? t("course.checking") : t("course.checkAgain")}
        </button>
      </div>
      <ol className="mission-bar-list">
        {mod.tasks.map((task, i) => {
          const isDone = done.has(task.id);
          const label =
            task.kind === "quiz"
              ? t("course.task.quiz.title")
              : t(`course.m${mod.n}.t.${task.id.split(".")[1]}.title` as MessageKey);
          return (
            <li key={task.id}>
              <button type="button" className={`mission-chip${isDone ? " mission-chip-done" : ""}`} onClick={() => go(task.id)}>
                <span className="mission-chip-num" aria-hidden="true">
                  {isDone ? "✓" : i + 1}
                </span>
                <span className="mission-chip-label">{label}</span>
                {task.optional && <span className="course-task-tag">{t("course.optionalTag")}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The interactive tool behind an `embed` id. `onDone` is given when the tool sits inside a task: the
 * tool calls it once the student has really used it, and the task is marked.
 */
function renderEmbed(id: EmbedId, p: CoursePanelProps, state: CourseState, onDone?: () => void): ReactNode {
  switch (id) {
    case "keyGuide":
      return <KeyGuide />;
    case "providerSetup":
      return <ProviderSetup providers={p.providers} onAddProvider={p.onAddProvider} />;
    case "routerSetup":
      return <RouterSetup mode={p.providerMode} onMode={p.onProviderMode} modeBusy={p.providerModeBusy} />;
    case "promptBuilder":
      return <PromptBuilder onUseInChat={p.onUsePrompt} run={p.onRunLab} onRan={onDone} />;
    case "requestInspector":
      return <RequestInspector providers={p.providers} run={p.onRunLab} onRan={onDone} />;
    case "vram":
      return <VramEstimator />;
    case "tokens":
      return <TokenExplorer />;
    case "cost":
      return <CostEstimator />;
    case "system":
      return <PromptPlayground hasProviders={p.hasProviders} onRunAnswer={p.onRunAnswer} onRan={onDone} />;
    case "retrieval":
      return <RetrievalExplorer providers={p.providers} documents={p.documents} onOpenLibrary={() => p.onOpen("library")} />;
    case "librarySetup":
      return (
        <LibrarySetup documents={p.documents} busy={p.libraryBusy} error={p.libraryError} onAddFiles={p.onAddLibraryFiles} />
      );
    case "grounding":
      return (
        <GroundingContrast
          providers={p.providers}
          documents={p.documents}
          onOpenLibrary={() => p.onOpen("library")}
          onRunAnswer={p.onRunAnswer}
          onRan={onDone}
        />
      );
    case "filesystemSetup":
      return (
        <FilesystemSetup
          running={state.runningServerNames.some((n) => n.includes("filesystem"))}
          onAddFilesystem={p.onAddFilesystem}
        />
      );
    case "tools":
      return (
        <McpToolExplorer servers={p.toolServers} hasProviders={p.hasProviders} onRunToolProbe={p.onRunToolProbe} onRan={onDone} />
      );
    case "research":
      return (
        <ResearchTrace
          hasResearchTools={p.hasResearchTools}
          installingTools={p.installingResearchTools}
          onInstallTools={p.onInstallResearchTools}
          onRun={p.onRunResearch}
          onRan={onDone}
        />
      );
  }
}
