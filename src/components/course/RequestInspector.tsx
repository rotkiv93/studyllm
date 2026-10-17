import { useState } from "react";
import { IconLoader, IconSend, IconStop } from "../icons";
import type { ProviderRow } from "../../lib/db";
import type { RunLab } from "../../lib/course/labs";
import { PROVIDER_MANIFEST } from "../../lib/providers";
import { estimateTokenCount } from "../../lib/tokenize";
import { useLabAnswer } from "./useLabAnswer";
import { useT, type MessageKey } from "../../lib/i18n";

/**
 * Shows what actually travels to the AI when you press send — an HTTP POST with a JSON body — built
 * live from the student's own first provider (never the key: that line is always masked) and from
 * what they type. Press "send" and the *real* call is made, so the answer that comes back is the
 * `choices` / `usage` half of the same exchange. Each field is explained in plain words, mirroring
 * the "what you see → what happens inside → the API request" table in class.
 */

const FIELDS = ["url", "auth", "model", "messages", "temperature", "response"] as const;
/** Model-facing, so it stays English whatever the UI language. */
const SYSTEM = "You are a helpful assistant.";

export function RequestInspector({
  providers,
  run,
  onRan,
}: {
  providers: ProviderRow[];
  run: RunLab;
  onRan?: () => void;
}) {
  const t = useT();
  const provider = providers.find((p) => p.enabled) ?? providers[0] ?? null;
  const [question, setQuestion] = useState(() => t("course.ri.defaultQuestion"));
  const [temperature, setTemperature] = useState(0.5);
  const lab = useLabAnswer(run);
  const { busy, error, who } = lab;
  const answer = lab.text;

  const baseURL = provider
    ? (provider.base_url_override ?? PROVIDER_MANIFEST[provider.type].baseURL).replace(/\/+$/, "")
    : "https://api.example.com/v1";
  const model = provider?.model ?? "model-name";

  const request = `POST ${baseURL}/chat/completions
Authorization: Bearer ••••••••••••••••
Content-Type: application/json

${JSON.stringify(
  {
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: question },
    ],
    temperature,
  },
  null,
  2,
)}`;

  const promptTokens = estimateTokenCount(`${SYSTEM}\n${question}`);
  const response = JSON.stringify(
    {
      choices: [{ message: { role: "assistant", content: answer ?? "…" } }],
      usage: { prompt_tokens: promptTokens, completion_tokens: answer ? estimateTokenCount(answer) : 0 },
    },
    null,
    2,
  );

  async function send() {
    if (!question.trim() || busy || !provider) return;
    const ok = await lab.send({ history: [{ role: "user", content: question.trim() }], system: SYSTEM, temperature });
    if (ok) onRan?.();
  }

  return (
    <div className="course-demo">
      <p className="settings-hint">
        {provider ? t("course.ri.intro", { provider: provider.label }) : t("course.ri.noProvider")}
      </p>

      <div className="course-demo-grid">
        <label className="course-demo-field course-demo-wide">
          {t("course.ri.questionLabel")}
          <textarea
            className="explore-query-input"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.currentTarget.value)}
            disabled={busy}
          />
        </label>
        <label className="course-demo-field">
          {t("course.lab.temperature")} <strong>{temperature.toFixed(1)}</strong>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.currentTarget.value))}
            disabled={busy}
          />
        </label>
      </div>

      <h4 className="course-demo-title">{t("course.ri.requestTitle")}</h4>
      <pre className="course-code" aria-label={t("course.ri.requestTitle")}>
        <code>{request}</code>
      </pre>

      <div className="provider-edit-actions">
        {busy ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={lab.stop}>
            <IconStop size={14} /> {t("course.lab.stop")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void send()}
            disabled={!provider || !question.trim()}
          >
            <IconSend size={14} /> {t("course.ri.send")}
          </button>
        )}
        {busy && <IconLoader size={14} />}
        {who && !busy && <span className="lab-msg-meta">{t("course.lab.answeredBy", { who })}</span>}
      </div>
      {error && <p className="error">{error}</p>}

      <h4 className="course-demo-title">{t("course.ri.responseTitle")}</h4>
      <pre className="course-code course-code-wrap" aria-label={t("course.ri.responseTitle")}>
        <code>{response}</code>
      </pre>

      <dl className="course-fields">
        {FIELDS.map((f) => (
          <div key={f} className="course-fields-row">
            <dt>{t(`course.ri.f.${f}.name` as MessageKey)}</dt>
            <dd>{t(`course.ri.f.${f}.desc` as MessageKey)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
