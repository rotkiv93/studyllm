import { useState } from "react";
import { Markdown } from "../Markdown";
import { IconLoader, IconSend, IconStop } from "../icons";
import type { RunLab } from "../../lib/course/labs";
import { useLabAnswer } from "./useLabAnswer";
import { composePrompt, PROMPT_FORMATS, PROMPT_TONES } from "../../lib/course/promptBuilder";
import { useT, type MessageKey } from "../../lib/i18n";

/**
 * Assembles a prompt from the pieces the class teaches — role, audience, task, tone, output format,
 * an example, and rules — so students see how each part changes what they're really asking for.
 * The model-facing scaffolding lives in `lib/course/promptBuilder.ts` (English, like every other
 * prompt in the app); only the labels around this form are localized.
 */

export function PromptBuilder({
  onUseInChat,
  run,
  onRan,
}: {
  onUseInChat: (prompt: string) => void;
  run: RunLab;
  /** Called when a prompt that uses at least a role and a task has been answered. */
  onRan?: () => void;
}) {
  const t = useT();
  const lab = useLabAnswer(run);
  const [role, setRole] = useState("");
  const [audience, setAudience] = useState("");
  const [task, setTask] = useState("");
  const [tone, setTone] = useState<(typeof PROMPT_TONES)[number]>("informative");
  const [format, setFormat] = useState<(typeof PROMPT_FORMATS)[number]>("bullets");
  const [example, setExample] = useState("");
  const [rules, setRules] = useState("");
  const [copied, setCopied] = useState(false);

  const prompt = composePrompt({ role, audience, task, tone, format, example, rules });
  const ready = task.trim().length > 0;

  async function tryHere() {
    const ok = await lab.send({ history: [{ role: "user", content: prompt }] });
    // A real attempt names who the AI is and what to do — that's what the task asks for.
    if (ok && role.trim() && ready) onRan?.();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the preview is still selectable */
    }
  }

  return (
    <div className="course-demo">
      <p className="settings-hint">{t("course.pb.intro")}</p>

      <div className="course-demo-grid">
        <label className="course-demo-field">
          {t("course.pb.role")}
          <input value={role} onChange={(e) => setRole(e.currentTarget.value)} placeholder={t("course.pb.rolePh")} />
        </label>
        <label className="course-demo-field">
          {t("course.pb.audience")}
          <input
            value={audience}
            onChange={(e) => setAudience(e.currentTarget.value)}
            placeholder={t("course.pb.audiencePh")}
          />
        </label>
      </div>

      <label className="course-demo-field course-demo-wide">
        {t("course.pb.task")}
        <textarea
          className="explore-query-input"
          rows={2}
          value={task}
          onChange={(e) => setTask(e.currentTarget.value)}
          placeholder={t("course.pb.taskPh")}
        />
      </label>

      <div className="course-demo-grid">
        <label className="course-demo-field">
          {t("course.pb.tone")}
          <select value={tone} onChange={(e) => setTone(e.currentTarget.value as (typeof PROMPT_TONES)[number])}>
            {PROMPT_TONES.map((v) => (
              <option key={v} value={v}>
                {t(`course.pb.tone.${v}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="course-demo-field">
          {t("course.pb.format")}
          <select
            value={format}
            onChange={(e) => setFormat(e.currentTarget.value as (typeof PROMPT_FORMATS)[number])}
          >
            {PROMPT_FORMATS.map((v) => (
              <option key={v} value={v}>
                {t(`course.pb.format.${v}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="course-demo-field course-demo-wide">
        {t("course.pb.rules")}
        <input value={rules} onChange={(e) => setRules(e.currentTarget.value)} placeholder={t("course.pb.rulesPh")} />
      </label>
      <label className="course-demo-field course-demo-wide">
        {t("course.pb.example")}
        <textarea
          className="explore-query-input"
          rows={2}
          value={example}
          onChange={(e) => setExample(e.currentTarget.value)}
          placeholder={t("course.pb.examplePh")}
        />
      </label>

      <h4 className="course-demo-title">{t("course.pb.preview")}</h4>
      <pre className="course-code course-code-wrap" aria-live="polite">
        <code>{prompt}</code>
      </pre>

      <div className="provider-edit-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!ready}>
          {copied ? t("course.pb.copied") : t("course.pb.copy")}
        </button>
        {lab.busy ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={lab.stop}>
            <IconStop size={14} /> {t("course.lab.stop")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void tryHere()} disabled={!ready}>
            <IconSend size={14} /> {t("course.pb.tryHere")}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUseInChat(prompt)} disabled={!ready}>
          {t("course.pb.useInChat")}
        </button>
      </div>
      {!role.trim() && ready && <p className="settings-hint">{t("course.pb.needRole")}</p>}
      {lab.error && <p className="error">{lab.error}</p>}
      {lab.text !== null && (
        <div className="lab-slot lab-slot-done">
          <div className="lab-slot-head">
            <strong>{t("course.lab.ai")}</strong>
            {lab.busy && <IconLoader size={12} />}
          </div>
          {lab.text ? <Markdown text={lab.text} /> : <span className="grounding-wait">…</span>}
          {lab.who && !lab.busy && <span className="lab-msg-meta">{t("course.lab.answeredBy", { who: lab.who })}</span>}
        </div>
      )}
    </div>
  );
}
