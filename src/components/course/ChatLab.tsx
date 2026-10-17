import { useEffect, useMemo, useRef, useState } from "react";
import { IconLoader, IconSend, IconStop } from "../icons";
import { Markdown } from "../Markdown";
import { estimateTokenCount } from "../../lib/tokenize";
import type { ProviderRow } from "../../lib/db";
import type { LabRequest, LabSpec, RunLab } from "../../lib/course/labs";
import { useT, type MessageKey } from "../../lib/i18n";

/**
 * A chat embedded in a lesson, so the student does the exercise right where it is explained. One
 * component, four shapes (see `LabSpec.mode`): a normal conversation, the same prompt sampled several
 * times, one prompt answered by two providers, or two prompts (A and B) answered side by side.
 *
 * It talks to the model through the app's real router (`run`), but persists nothing — these are
 * practice runs, not conversations. It reports how many sends have finished via `onRuns`, which is
 * how a task knows the student actually tried it.
 */

interface Answer {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  provider?: string;
  model?: string;
  error?: string;
}

const IDLE: Answer = { text: "", status: "idle" };
const EXHAUSTED = "__exhausted__";

/** Streams one model call into `update`, and resolves with the final answer. Never throws. */
async function streamAnswer(
  run: RunLab,
  request: LabRequest,
  signal: AbortSignal,
  update: (a: Answer) => void,
): Promise<Answer> {
  let current: Answer = { text: "", status: "streaming" };
  const push = (patch: Partial<Answer>) => {
    current = { ...current, ...patch };
    update(current);
  };
  push({});
  try {
    await run(
      request,
      (e) => {
        if (e.type === "chunk") push({ text: current.text + e.text });
        else if (e.type === "done") push({ provider: e.providerLabel, model: e.model });
        else if (e.type === "error") push({ error: e.message });
        else if (e.type === "router" && e.event.kind === "exhausted") push({ error: EXHAUSTED });
      },
      signal,
    );
  } catch (err) {
    if (!signal.aborted) push({ error: err instanceof Error ? err.message : String(err) });
  }
  push({ status: current.error || current.text.trim() === "" ? "error" : "done" });
  return current;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  error?: string;
}

export interface ChatLabProps {
  spec: LabSpec;
  /** Locale prefix of the suggested prompts (`<prefix>.s<k>`). */
  prefix: string;
  providers: ProviderRow[];
  run: RunLab;
  /** Called with the running total of finished sends. */
  onRuns?: (runs: number) => void;
  onOpenProviders: () => void;
}

export function ChatLab({ spec, prefix, providers, run, onRuns, onOpenProviders }: ChatLabProps) {
  const t = useT();
  const enabled = useMemo(() => providers.filter((p) => p.enabled), [providers]);
  const [system, setSystem] = useState(spec.system ?? "");
  const [temperature, setTemperature] = useState(0.7);
  const [draft, setDraft] = useState("");
  const [draftB, setDraftB] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [slots, setSlots] = useState<Answer[]>([]);
  const [turnTokens, setTurnTokens] = useState<number[]>([]);
  const [pickA, setPickA] = useState<string>("");
  const [pickB, setPickB] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const runsRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const providerA = pickA || enabled[0]?.id || "";
  const providerB = pickB || enabled[1]?.id || "";
  const needsTwo = spec.mode === "compare" && enabled.length < 2;

  // Abort a stream still running when the lesson changes.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest message in view as it streams.
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages]);

  const systemText = (spec.editableSystem ? system : (spec.system ?? "")).trim();
  const base: Pick<LabRequest, "system"> = { system: systemText || undefined };
  const temp = spec.temperature ? temperature : undefined;

  const empty = spec.mode === "ab" ? !draft.trim() || !draftB.trim() : !draft.trim();
  const canSend = !busy && !empty && enabled.length > 0 && !needsTwo;

  function finishRun() {
    runsRef.current += 1;
    onRuns?.(runsRef.current);
  }

  async function send() {
    if (!canSend) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      if (spec.mode === "chat") await sendChat(controller.signal);
      else await sendParallel(controller.signal);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function sendChat(signal: AbortSignal) {
    const text = draft.trim();
    const history = [...messages.filter((m) => !m.error), { role: "user" as const, content: text }];
    setDraft("");
    setMessages([...messages, { role: "user", content: text }, { role: "assistant", content: "" }]);
    // What the model really reads this turn: the instruction plus the whole conversation so far.
    setTurnTokens((prev) => [
      ...prev,
      estimateTokenCount([systemText, ...history.map((m) => m.content)].join("\n")),
    ]);
    const final = await streamAnswer(run, { ...base, history, temperature: temp }, signal, (a) =>
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: a.text, provider: a.provider, model: a.model, error: a.error },
      ]),
    );
    if (final.status === "done") finishRun();
  }

  async function sendParallel(signal: AbortSignal) {
    const requests: LabRequest[] =
      spec.mode === "samples"
        ? Array.from({ length: spec.samples ?? 3 }, () => ({
            ...base,
            history: [{ role: "user" as const, content: draft.trim() }],
            temperature: temp,
          }))
        : spec.mode === "compare"
          ? [providerA, providerB].map((providerId) => ({
              ...base,
              history: [{ role: "user" as const, content: draft.trim() }],
              providerId,
            }))
          : [draft, draftB].map((text) => ({ ...base, history: [{ role: "user" as const, content: text.trim() }] }));

    setSlots(requests.map(() => ({ ...IDLE, status: "streaming" })));
    const finals = await Promise.all(
      requests.map((req, i) =>
        streamAnswer(run, req, signal, (a) => setSlots((prev) => prev.map((s, j) => (j === i ? a : s)))),
      ),
    );
    if (finals.some((a) => a.status === "done")) finishRun();
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    if (busy) return;
    setMessages([]);
    setSlots([]);
    setTurnTokens([]);
  }

  function applySuggestion(k: number) {
    if (spec.mode === "ab") {
      setDraft(t(`${prefix}.s${k}.a` as MessageKey));
      setDraftB(t(`${prefix}.s${k}.b` as MessageKey));
    } else {
      setDraft(t(`${prefix}.s${k}` as MessageKey));
    }
  }

  const label = (a: Answer, fallback: string) => (a.provider ? `${a.provider} · ${a.model ?? ""}` : fallback);
  const errorText = (a: Answer) => (a.error === EXHAUSTED ? t("course.lab.exhausted") : a.error);
  const hasOutput = messages.length > 0 || slots.length > 0;
  const maxTokens = Math.max(1, ...turnTokens);

  return (
    <div className="lab">
      {enabled.length === 0 && (
        <div className="lab-need">
          <span>{t("course.lab.needProvider")}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenProviders}>
            {t("course.open.providers")}
          </button>
        </div>
      )}
      {needsTwo && enabled.length > 0 && (
        <div className="lab-need">
          <span>{t("course.lab.needTwo")}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenProviders}>
            {t("course.open.providers")}
          </button>
        </div>
      )}

      {spec.editableSystem && (
        <label className="lab-field">
          <span className="lab-field-label">
            {t("course.lab.systemLabel")} <em>{t("course.lab.systemHint")}</em>
          </span>
          <textarea
            className="explore-query-input"
            rows={2}
            value={system}
            onChange={(e) => setSystem(e.currentTarget.value)}
            disabled={busy}
          />
        </label>
      )}

      {spec.mode === "compare" && enabled.length >= 2 && (
        <div className="lab-compare-pick">
          {([
            ["A", providerA, setPickA],
            ["B", providerB, setPickB],
          ] as const).map(([name, value, set]) => (
            <label key={name} className="lab-field">
              <span className="lab-field-label">{t("course.lab.model", { name })}</span>
              <select value={value} onChange={(e) => set(e.currentTarget.value)} disabled={busy}>
                {enabled.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.model}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {spec.temperature && (
        <label className="lab-field lab-temp">
          <span className="lab-field-label">
            {t("course.lab.temperature")} <strong>{temperature.toFixed(1)}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.currentTarget.value))}
            disabled={busy}
          />
          <span className="lab-temp-scale">
            <span>{t("course.lab.tempLow")}</span>
            <span>{t("course.lab.tempHigh")}</span>
          </span>
        </label>
      )}

      {spec.suggestions > 0 && (
        <div className="lab-suggest">
          <span className="lab-suggest-label">{t("course.lab.tryWith")}</span>
          {Array.from({ length: spec.suggestions }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" className="lab-chip" onClick={() => applySuggestion(k)} disabled={busy}>
              {spec.mode === "ab"
                ? t("course.lab.pair", { n: k })
                : t(`${prefix}.s${k}` as MessageKey)}
            </button>
          ))}
        </div>
      )}

      {spec.mode === "chat" && hasOutput && (
        <div className="lab-transcript" ref={transcriptRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`lab-msg lab-msg-${m.role}`}>
              <span className="lab-msg-who">{m.role === "user" ? t("course.lab.you") : t("course.lab.ai")}</span>
              {m.role === "assistant" && m.content === "" && !m.error ? (
                <IconLoader size={14} />
              ) : m.role === "assistant" ? (
                <Markdown text={m.content} />
              ) : (
                <p>{m.content}</p>
              )}
              {m.error && <p className="error">{m.error === EXHAUSTED ? t("course.lab.exhausted") : m.error}</p>}
              {m.provider && (
                <span className="lab-msg-meta">{t("course.lab.answeredBy", { who: `${m.provider} · ${m.model ?? ""}` })}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {spec.mode !== "chat" && slots.length > 0 && (
        <div className={`lab-slots lab-slots-${slots.length}`}>
          {slots.map((a, i) => (
            <div key={i} className={`lab-slot lab-slot-${a.status}`}>
              <div className="lab-slot-head">
                <strong>
                  {spec.mode === "samples"
                    ? t("course.lab.sample", { n: i + 1 })
                    : spec.mode === "ab"
                      ? t("course.lab.prompt", { name: i === 0 ? "A" : "B" })
                      : t("course.lab.model", { name: i === 0 ? "A" : "B" })}
                </strong>
                {a.status === "streaming" && <IconLoader size={12} />}
              </div>
              {a.text ? <Markdown text={a.text} /> : a.status === "streaming" ? <span className="grounding-wait">…</span> : null}
              {a.error && <p className="error">{errorText(a)}</p>}
              {a.provider && <span className="lab-msg-meta">{label(a, "")}</span>}
            </div>
          ))}
        </div>
      )}

      {spec.mode === "chat" && spec.contextMeter && turnTokens.length > 0 && (
        <div className="lab-context">
          <span className="lab-field-label">{t("course.lab.contextTitle")}</span>
          <ul>
            {turnTokens.map((tokens, i) => (
              <li key={i}>
                <span className="lab-context-turn">{t("course.lab.contextTurn", { n: i + 1 })}</span>
                <span className="lab-context-bar">
                  <span style={{ width: `${Math.max(4, Math.round((tokens / maxTokens) * 100))}%` }} />
                </span>
                <span className="lab-context-n">{t("course.lab.contextTokens", { tokens })}</span>
              </li>
            ))}
          </ul>
          <p className="settings-hint">{t("course.lab.contextHint")}</p>
        </div>
      )}

      {spec.mode === "ab" ? (
        <div className="lab-ab">
          <label className="lab-field">
            <span className="lab-field-label">{t("course.lab.prompt", { name: "A" })}</span>
            <textarea
              className="explore-query-input"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              disabled={busy}
            />
          </label>
          <label className="lab-field">
            <span className="lab-field-label">{t("course.lab.prompt", { name: "B" })}</span>
            <textarea
              className="explore-query-input"
              rows={3}
              value={draftB}
              onChange={(e) => setDraftB(e.currentTarget.value)}
              disabled={busy}
            />
          </label>
        </div>
      ) : (
        <div className="explore-query lab-input">
          <textarea
            className="explore-query-input"
            rows={2}
            value={draft}
            placeholder={t("course.lab.placeholder")}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={busy}
          />
        </div>
      )}

      <div className="lab-actions">
        {busy ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={stop}>
            <IconStop size={14} /> {t("course.lab.stop")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void send()} disabled={!canSend}>
            <IconSend size={14} />{" "}
            {spec.mode === "samples"
              ? t("course.lab.sendSamples", { n: spec.samples ?? 3 })
              : spec.mode === "ab" || spec.mode === "compare"
                ? t("course.lab.sendBoth")
                : t("course.lab.send")}
          </button>
        )}
        {hasOutput && !busy && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
            {t("course.lab.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
