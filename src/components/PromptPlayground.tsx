import { useRef, useState } from "react";
import { IconSearch, IconLoader, IconStop } from "./icons";
import { Markdown } from "./Markdown";
import { estimateTokenCount } from "../lib/tokenize";
import type { StreamEvent } from "../lib/providerRouter";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * The "System prompt" playground — two lessons in one tab:
 *
 *   • Prompt inspector: a model doesn't just get "your message." Every turn it's handed a hidden
 *     SYSTEM instruction plus your message, and that's *all* it sees. The inspector shows that
 *     assembled prompt exactly, with token counts — demystifying the invisible instructions behind
 *     every chatbot and reinforcing the token budget from the Tokens lesson. It updates live and
 *     needs no API key.
 *   • System-prompt experiment: the student edits the system instruction, runs the same question,
 *     and watches the model's persona/format/behavior change. Runs stack newest-first so you can
 *     compare "helpful assistant" vs. "talk like a pirate" vs. "answer in one word" side by side in
 *     time.
 *
 * Reuses the app's real chat path (`onRunAnswer` → `streamReply` with a top-level system prompt, no
 * tools) — same machinery the grounding playground uses.
 */

/**
 * Preset **labels** are localized (`prompt.preset.*`); the prompt `text` deliberately is not — it's
 * model-facing and lands in the editable textarea, same rule as `studyTemplates.ts`'s `promptSeed`.
 * The student can rewrite it in any language before running.
 */
const PRESETS: { labelKey: MessageKey; text: string }[] = [
  { labelKey: "prompt.preset.helpful", text: "You are a helpful, friendly assistant." },
  { labelKey: "prompt.preset.pirate", text: "You are a pirate. Answer everything in pirate slang." },
  { labelKey: "prompt.preset.oneWord", text: "Answer every question in exactly one word. Never more." },
  {
    labelKey: "prompt.preset.socratic",
    text: "You are a strict tutor. Never give the final answer — only reply with a hint or a guiding question so the student works it out themselves.",
  },
  {
    labelKey: "prompt.preset.json",
    text: 'Reply with ONLY valid JSON in the form {"answer": "..."} and nothing else — no prose, no code fences.',
  },
  { labelKey: "prompt.preset.french", text: "Always respond in French, regardless of the language asked." },
];

const DEFAULT_SYSTEM = PRESETS[0].text;
const DEFAULT_USER = "How do plants make their food?";
const MAX_RUNS = 6;

interface Run {
  id: string;
  system: string;
  user: string;
  answer: string;
  status: "streaming" | "done" | "error";
}

export function PromptPlayground({
  hasProviders,
  onRunAnswer,
}: {
  hasProviders: boolean;
  onRunAnswer: (
    question: string,
    system: string | undefined,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}) {
  const t = useT();
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [user, setUser] = useState(DEFAULT_USER);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const systemTokens = estimateTokenCount(system);
  const userTokens = estimateTokenCount(user);
  const totalTokens = systemTokens + userTokens;

  async function run() {
    if (!user.trim() || running) return;
    setError(null);
    setRunning(true);
    const id = crypto.randomUUID();
    const sys = system.trim();
    setRuns((prev) => [
      { id, system: sys, user: user.trim(), answer: "", status: "streaming" },
      ...prev.slice(0, MAX_RUNS - 1),
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    const patch = (fn: (r: Run) => Run) =>
      setRuns((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));

    try {
      await onRunAnswer(
        user.trim(),
        sys || undefined,
        (e) => {
          if (e.type === "chunk") patch((r) => ({ ...r, answer: r.answer + e.text }));
          else if (e.type === "error") {
            setError(e.message);
            patch((r) => ({ ...r, status: "error" }));
          }
        },
        controller.signal,
      );
      patch((r) => (r.status === "error" ? r : { ...r, status: "done" }));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : t("prompt.failed"));
      }
      patch((r) => ({ ...r, status: "error" }));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  return (
    <div className="explore-body">
      <p className="settings-hint">{t("prompt.intro")}</p>

      <div className="prompt-field">
        <label className="prompt-field-label" htmlFor="pp-system">
          {t("prompt.systemLabel")}{" "}
          <span className="prompt-field-hint">{t("prompt.systemHint")}</span>
        </label>
        <div className="prompt-presets">
          {PRESETS.map((p) => (
            <button
              key={p.labelKey}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSystem(p.text)}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
        <textarea
          id="pp-system"
          className="explore-query-input"
          value={system}
          onChange={(e) => setSystem(e.currentTarget.value)}
          rows={3}
          placeholder={t("prompt.systemPlaceholder")}
        />
      </div>

      <div className="prompt-field">
        <label className="prompt-field-label" htmlFor="pp-user">
          {t("prompt.userLabel")}
        </label>
        <div className="explore-query">
          <textarea
            id="pp-user"
            className="explore-query-input"
            value={user}
            onChange={(e) => setUser(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void run();
              }
            }}
            rows={2}
            placeholder={t("prompt.userPlaceholder")}
            disabled={running}
          />
          {running ? (
            <button type="button" className="btn btn-secondary btn-sm explore-run" onClick={stop}>
              <IconStop size={14} /> {t("prompt.stop")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm explore-run"
              onClick={() => void run()}
              disabled={!user.trim() || !hasProviders}
            >
              <IconSearch size={14} /> {t("prompt.run")}
            </button>
          )}
        </div>
      </div>

      {/* Prompt inspector — the exact assembled prompt the model will receive, updated live. */}
      <div className="prompt-inspector">
        <div className="prompt-inspector-head">
          <span>{t("prompt.inspectorHead")}</span>
          <span className="prompt-inspector-total">
            {t("prompt.totalTokens", { count: totalTokens })}
          </span>
        </div>
        {system.trim() && (
          <div className="prompt-msg prompt-msg-system">
            <div className="prompt-msg-role">
              SYSTEM{" "}
              <span className="prompt-msg-tokens">
                {t("prompt.msgTokens", { count: systemTokens })}
              </span>
            </div>
            <div className="prompt-msg-text">{system}</div>
          </div>
        )}
        <div className="prompt-msg prompt-msg-user">
          <div className="prompt-msg-role">
            USER{" "}
            <span className="prompt-msg-tokens">{t("prompt.msgTokens", { count: userTokens })}</span>
          </div>
          <div className="prompt-msg-text">
            {user || <span className="grounding-wait">{t("prompt.empty")}</span>}
          </div>
        </div>
        <p className="prompt-inspector-note">{t("prompt.inspectorNote")}</p>
      </div>

      {!hasProviders && <p className="notice">{t("prompt.needProvider")}</p>}
      {error && <p className="error">{error}</p>}

      {runs.length > 0 && (
        <div className="prompt-runs">
          {runs.map((r) => (
            <div key={r.id} className="prompt-run">
              <div className="prompt-run-system" title={r.system || t("prompt.noSystemTitle")}>
                <span className="prompt-run-system-label">{t("prompt.runSystemLabel")}</span>{" "}
                {r.system ? (
                  r.system.length > 90 ? `${r.system.slice(0, 90)}…` : r.system
                ) : (
                  <em>{t("prompt.noSystem")}</em>
                )}
                {r.status === "streaming" && <IconLoader size={12} />}
              </div>
              <div className="prompt-run-answer">
                {r.answer ? (
                  <Markdown text={r.answer} />
                ) : (
                  <span className="grounding-wait">…</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
