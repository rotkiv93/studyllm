import { useMemo, useState } from "react";
import { tokenize } from "../../lib/tokenize";
import {
  conversationCost,
  formatUsd,
  requestCost,
  type TokenPrice,
} from "../../lib/course/estimates";
import { useT } from "../../lib/i18n";

/**
 * "What would this cost — and why do long chats cost more?" Counts the tokens of a real prompt, prices
 * it at illustrative per-million rates, then shows the same chat after N turns, where the history is
 * re-sent every time. Prices are the ones on the class slide; they drift, so they're editable.
 */

const PRESETS: { id: string; label: string | null; price: TokenPrice }[] = [
  { id: "free", label: null, price: { input: 0, output: 0 } },
  { id: "mini", label: "GPT-5 mini", price: { input: 0.25, output: 2 } },
  { id: "sonnet", label: "Claude Sonnet 4.6", price: { input: 3, output: 15 } },
  { id: "opus", label: "Claude Opus 4.6", price: { input: 5, output: 25 } },
];

export function CostEstimator() {
  const t = useT();
  const [text, setText] = useState(() => t("course.cost.sample"));
  const [answerTokens, setAnswerTokens] = useState(400);
  const [turns, setTurns] = useState(10);
  const [presetId, setPresetId] = useState("sonnet");
  const [price, setPrice] = useState<TokenPrice>(PRESETS[2].price);

  const promptTokens = useMemo(() => tokenize(text).length, [text]);
  const single = requestCost(promptTokens, answerTokens, price);
  const chat = conversationCost(turns, promptTokens, answerTokens, price);

  function pick(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setPrice(preset.price);
  }

  return (
    <div className="course-demo">
      <p className="settings-hint">{t("course.cost.intro")}</p>

      <label className="course-demo-field course-demo-wide">
        {t("course.cost.prompt")}
        <textarea
          className="explore-query-input token-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      </label>

      <div className="course-demo-row">
        <label className="course-demo-field">
          {t("course.cost.answerTokens")}
          <input
            type="number"
            min={0}
            step={50}
            value={answerTokens}
            onChange={(e) => setAnswerTokens(Math.max(0, Number(e.currentTarget.value)))}
          />
        </label>
        <label className="course-demo-field">
          {t("course.cost.turns")}
          <input
            type="number"
            min={1}
            max={200}
            value={turns}
            onChange={(e) => setTurns(Math.max(1, Number(e.currentTarget.value)))}
          />
        </label>
      </div>

      <div className="course-demo-row">
        <span className="course-demo-label">{t("course.cost.model")}</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-secondary btn-sm${presetId === p.id ? " course-chip-active" : ""}`}
            onClick={() => pick(p.id)}
          >
            {p.label ?? t("course.cost.free")}
          </button>
        ))}
      </div>

      <div className="course-demo-row">
        <label className="course-demo-field">
          {t("course.cost.inPrice")}
          <input
            type="number"
            min={0}
            step={0.05}
            value={price.input}
            onChange={(e) => setPrice({ ...price, input: Math.max(0, Number(e.currentTarget.value)) })}
          />
        </label>
        <label className="course-demo-field">
          {t("course.cost.outPrice")}
          <input
            type="number"
            min={0}
            step={0.05}
            value={price.output}
            onChange={(e) => setPrice({ ...price, output: Math.max(0, Number(e.currentTarget.value)) })}
          />
        </label>
      </div>
      <p className="settings-hint">{t("course.cost.priceNote")}</p>

      <div className="course-result course-result-stack" aria-live="polite">
        <span>{t("course.cost.single", { tokens: promptTokens, cost: formatUsd(single) })}</span>
        <strong>
          {t("course.cost.chat", {
            turns,
            input: chat.inputTokens.toLocaleString(),
            cost: formatUsd(chat.cost),
          })}
        </strong>
        <span className="course-result-note">{t("course.cost.insight")}</span>
      </div>
    </div>
  );
}
