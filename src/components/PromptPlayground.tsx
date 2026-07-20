import { useRef, useState } from "react";
import { IconSearch, IconLoader, IconStop } from "./icons";
import { Markdown } from "./Markdown";
import { estimateTokenCount } from "../lib/tokenize";
import type { StreamEvent } from "../lib/providerRouter";

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

const PRESETS: { label: string; text: string }[] = [
  { label: "Helpful assistant", text: "You are a helpful, friendly assistant." },
  { label: "Talk like a pirate", text: "You are a pirate. Answer everything in pirate slang." },
  { label: "One word only", text: "Answer every question in exactly one word. Never more." },
  {
    label: "Socratic tutor",
    text: "You are a strict tutor. Never give the final answer — only reply with a hint or a guiding question so the student works it out themselves.",
  },
  {
    label: "JSON only",
    text: 'Reply with ONLY valid JSON in the form {"answer": "..."} and nothing else — no prose, no code fences.',
  },
  { label: "Always in French", text: "Always respond in French, regardless of the language asked." },
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
        setError(err instanceof Error ? err.message : "The run failed.");
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
      <p className="settings-hint">
        A chatbot never just gets your message. Behind every turn is a hidden <strong>system
        prompt</strong> — standing instructions the model follows. Edit it below, watch the exact
        thing the model receives, then run it and see how the same question gets a different answer.
      </p>

      <div className="prompt-field">
        <label className="prompt-field-label" htmlFor="pp-system">
          System prompt <span className="prompt-field-hint">the hidden instructions</span>
        </label>
        <div className="prompt-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSystem(p.text)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          id="pp-system"
          className="explore-query-input"
          value={system}
          onChange={(e) => setSystem(e.currentTarget.value)}
          rows={3}
          placeholder="e.g. You are a helpful assistant."
        />
      </div>

      <div className="prompt-field">
        <label className="prompt-field-label" htmlFor="pp-user">
          Your message
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
            placeholder="Ask anything…"
            disabled={running}
          />
          {running ? (
            <button type="button" className="btn btn-secondary btn-sm explore-run" onClick={stop}>
              <IconStop size={14} /> Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm explore-run"
              onClick={() => void run()}
              disabled={!user.trim() || !hasProviders}
            >
              <IconSearch size={14} /> Run
            </button>
          )}
        </div>
      </div>

      {/* Prompt inspector — the exact assembled prompt the model will receive, updated live. */}
      <div className="prompt-inspector">
        <div className="prompt-inspector-head">
          <span>What the model actually receives</span>
          <span className="prompt-inspector-total">{totalTokens} tokens total</span>
        </div>
        {system.trim() && (
          <div className="prompt-msg prompt-msg-system">
            <div className="prompt-msg-role">
              SYSTEM <span className="prompt-msg-tokens">{systemTokens} tokens</span>
            </div>
            <div className="prompt-msg-text">{system}</div>
          </div>
        )}
        <div className="prompt-msg prompt-msg-user">
          <div className="prompt-msg-role">
            USER <span className="prompt-msg-tokens">{userTokens} tokens</span>
          </div>
          <div className="prompt-msg-text">{user || <span className="grounding-wait">(empty)</span>}</div>
        </div>
        <p className="prompt-inspector-note">
          That’s the whole prompt — the model sees nothing else about you. In a real chat, the earlier
          back-and-forth would be stacked in here too, which is why long chats fill up the token
          budget and older turns eventually get dropped.
        </p>
      </div>

      {!hasProviders && (
        <p className="notice">Add an AI provider in Providers to run the prompt and see the answer.</p>
      )}
      {error && <p className="error">{error}</p>}

      {runs.length > 0 && (
        <div className="prompt-runs">
          {runs.map((r) => (
            <div key={r.id} className="prompt-run">
              <div className="prompt-run-system" title={r.system || "(no system prompt)"}>
                <span className="prompt-run-system-label">System:</span>{" "}
                {r.system ? (
                  r.system.length > 90 ? `${r.system.slice(0, 90)}…` : r.system
                ) : (
                  <em>none</em>
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
