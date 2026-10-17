import { useState, type ReactNode } from "react";
import { ChatLab } from "./ChatLab";
import { IconChevronDown } from "../icons";
import { evaluateCheck, type CourseState } from "../../lib/course/checks";
import type { RunLab } from "../../lib/course/labs";
import {
  QUIZ_OPTION_COUNT,
  quizKeys,
  taskCopyKeys,
  taskPrefix,
  type CourseModule,
  type CourseTarget,
  type CourseTask,
  type EmbedId,
  type TaskKind,
} from "../../lib/course/modules";
import type { ProviderRow } from "../../lib/db";
import { useT, type MessageKey } from "../../lib/i18n";

/**
 * One task as an interactive card, placed inside the lesson at the spot where it makes sense. Each
 * card says what to do, when it counts as done, and then *is* the exercise: a chat to try things in,
 * a form that configures the app, a calculator to check, a question to answer. The card never asks the
 * student to go somewhere else unless the action really lives outside the lesson.
 */

const KIND_ICON: Record<TaskKind, string> = {
  check: "🤖",
  do: "🛠️",
  lab: "💬",
  manual: "✋",
  quiz: "❓",
  reflect: "✍️",
};

const OPEN_LABEL: Record<CourseTarget, MessageKey> = {
  providers: "course.open.providers",
  mcp: "course.open.mcp",
  plugins: "course.open.plugins",
  library: "course.open.library",
  chat: "course.open.chat",
};

type Mark = (taskId: string, note?: string | null) => Promise<void>;

export interface TaskCardProps {
  task: CourseTask;
  /** 1-based position in the module's mission list. */
  index: number;
  mod: CourseModule;
  done: boolean;
  note: string | undefined;
  state: CourseState;
  providers: ProviderRow[];
  onMark: Mark;
  onUnmark: (taskId: string) => Promise<void>;
  onOpen: (target: CourseTarget) => void;
  onRunLab: RunLab;
  renderEmbed: (embed: EmbedId, onDone: () => void) => ReactNode;
  /** Folded to just its header — handy once it is done. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function TaskCard({
  task,
  index,
  mod,
  done,
  note,
  state,
  providers,
  onMark,
  onUnmark,
  onOpen,
  onRunLab,
  renderEmbed,
  collapsed,
  onToggleCollapsed,
}: TaskCardProps) {
  const t = useT();
  const [ran, setRan] = useState(0);
  const passing = task.check ? evaluateCheck(task.check, state) : false;
  const prefix = taskPrefix(task);
  const keys = taskCopyKeys(task);
  const isQuiz = task.kind === "quiz";

  const title = isQuiz ? t("course.task.quiz.title") : t(keys.title as MessageKey);
  const desc = isQuiz ? null : t(keys.desc as MessageKey);
  const showGoal = task.kind !== "quiz" && task.kind !== "reflect";

  const need = task.lab?.runs ?? 1;
  const reached = ran >= need;

  function handleRuns(total: number) {
    setRan(total);
    // Without a "what did you notice?" step, trying it is enough.
    if (task.lab && !task.lab.confirm && total >= need && !done) void onMark(task.id);
  }

  return (
    <section id={`task-${task.id}`} className={`task-card task-card-${task.kind}${done ? " task-card-done" : ""}${collapsed ? " task-card-collapsed" : ""}`}>
      <header className="task-card-head">
        <span className="task-card-num" aria-hidden="true">
          {done ? "✓" : index}
        </span>
        <div className="task-card-title">
          <span className="task-card-kind">
            {KIND_ICON[task.kind]} {t(`course.kind.${task.kind}` as MessageKey)}
            {task.optional && <span className="course-task-tag">{t("course.optionalTag")}</span>}
          </span>
          <h4>{title}</h4>
        </div>
        {task.open && !done && !collapsed && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen(task.open!)}>
            {t(OPEN_LABEL[task.open])}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon task-card-fold"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("course.task.expand") : t("course.task.collapse")}
          title={collapsed ? t("course.task.expand") : t("course.task.collapse")}
        >
          <IconChevronDown size={16} />
        </button>
      </header>

      {!collapsed && desc && <p className="task-card-desc">{desc}</p>}
      {!collapsed && showGoal && (
        <p className="task-card-goal">
          <span aria-hidden="true">🎯</span> {t(keys.goal as MessageKey)}
        </p>
      )}

      {/* The body stays mounted when folded, so a chat or a form keeps its state. */}
      <div className="task-card-body" hidden={collapsed}>
        {task.kind === "do" && task.embed && renderEmbed(task.embed, () => void onMark(task.id))}

        {task.kind === "lab" && task.lab && (
          <>
            <ChatLab
              spec={task.lab}
              prefix={prefix}
              providers={providers}
              run={onRunLab}
              onRuns={handleRuns}
              onOpenProviders={() => onOpen("providers")}
            />
            {!done && need > 1 && !reached && (
              <p className="settings-hint">{t("course.lab.progress", { done: ran, total: need })}</p>
            )}
            {task.lab.confirm && reached && !done && (
              <button type="button" className="btn btn-primary btn-sm task-confirm" onClick={() => void onMark(task.id)}>
                ✓ {t(`${prefix}.confirm` as MessageKey)}
              </button>
            )}
          </>
        )}

        {task.kind === "manual" && (
          <TickButton
            done={done}
            doneLabel={t("course.manual.done")}
            label={t("course.manual.mark")}
            onTick={() => onMark(task.id)}
            onUntick={() => onUnmark(task.id)}
          />
        )}

        {task.kind === "quiz" && <Quiz task={task} mod={mod} done={done} onMark={onMark} />}
        {task.kind === "reflect" && <Reflection task={task} done={done} savedNote={note} onMark={onMark} onUnmark={onUnmark} />}
      </div>

      <footer className="task-card-foot" hidden={collapsed}>
        {(task.check || task.kind === "check") && (
          <span className={`course-task-check${passing || done ? " course-task-check-ok" : ""}`}>
            {passing || done ? t("course.check.ok") : t("course.check.pending")}
          </span>
        )}
        {done && task.kind !== "quiz" && task.kind !== "reflect" && !task.check && task.kind !== "manual" && (
          <span className="course-task-check course-task-check-ok">
            {t("course.manual.done")}{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onUnmark(task.id)}>
              {t("course.undo")}
            </button>
          </span>
        )}
      </footer>
    </section>
  );
}

function TickButton({
  done,
  label,
  doneLabel,
  onTick,
  onUntick,
}: {
  done: boolean;
  label: string;
  doneLabel: string;
  onTick: () => Promise<void>;
  onUntick: () => Promise<void>;
}) {
  const t = useT();
  return done ? (
    <span className="course-task-check course-task-check-ok">
      {doneLabel}{" "}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onUntick()}>
        {t("course.undo")}
      </button>
    </span>
  ) : (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => void onTick()}>
      {label}
    </button>
  );
}

function Quiz({ task, mod, done, onMark }: { task: CourseTask; mod: CourseModule; done: boolean; onMark: Mark }) {
  const t = useT();
  const keys = quizKeys(mod.n);
  const [picked, setPicked] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = task.correct ?? 0;
  const right = submitted && picked === correct;
  const showWhy = done || submitted;

  async function submit() {
    if (picked === null) return;
    setSubmitted(true);
    if (picked === correct) await onMark(task.id);
  }

  return (
    <div className="course-quiz">
      <p className="course-quiz-q">{t(keys.q as MessageKey)}</p>
      <ul className="course-quiz-options">
        {Array.from({ length: QUIZ_OPTION_COUNT }, (_, i) => {
          const isRightOption = (done || submitted) && i === correct;
          const isWrongPick = submitted && picked === i && i !== correct;
          return (
            <li key={i}>
              <label
                className={`course-quiz-option${isRightOption ? " course-quiz-option-right" : ""}${isWrongPick ? " course-quiz-option-wrong" : ""}`}
              >
                <input
                  type="radio"
                  name={`quiz-${task.id}`}
                  checked={picked === i}
                  disabled={done || right}
                  onChange={() => {
                    setPicked(i);
                    setSubmitted(false);
                  }}
                />
                {t(keys.options[i] as MessageKey)}
              </label>
            </li>
          );
        })}
      </ul>
      {!done && !right && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={picked === null}>
          {t("course.quiz.check")}
        </button>
      )}
      {submitted && !right && <p className="error">{t("course.quiz.tryAgain")}</p>}
      {showWhy && (done || right) && <p className="notice">{t(keys.why as MessageKey)}</p>}
    </div>
  );
}

function Reflection({
  task,
  done,
  savedNote,
  onMark,
  onUnmark,
}: {
  task: CourseTask;
  done: boolean;
  savedNote: string | undefined;
  onMark: Mark;
  onUnmark: (taskId: string) => Promise<void>;
}) {
  const t = useT();
  const [draft, setDraft] = useState(savedNote ?? "");

  return (
    <div className="course-reflect">
      <textarea
        className="explore-query-input"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        placeholder={t("course.reflect.placeholder")}
      />
      <div className="provider-edit-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={draft.trim().length < 10}
          onClick={() => void onMark(task.id, draft.trim())}
        >
          {done ? t("course.reflect.update") : t("course.reflect.save")}
        </button>
        {done && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onUnmark(task.id)}>
            {t("course.undo")}
          </button>
        )}
      </div>
    </div>
  );
}
