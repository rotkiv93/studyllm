import { useMemo, useState } from "react";
import { tokenize, wordCount } from "../lib/tokenize";

/**
 * The "What is a token?" playground — the first thing to show a non-technical class, and the only
 * one that needs no API key (so it works even when everyone's free tier is rate-limited mid-lesson).
 *
 * The student types anything and watches it break into colored token chips, with live counts for
 * characters vs. words vs. tokens. The whole point is the mismatch between those three numbers —
 * that's the intuition behind context windows and "why it can't count the letters in strawberry."
 * The tokenizer is a labeled approximation (see `lib/tokenize.ts`); the *behaviour* it shows is real.
 */

const EXAMPLES: { label: string; text: string }[] = [
  { label: "strawberry", text: "How many r's are in strawberry?" },
  { label: "A sentence", text: "The quick brown fox jumps over the lazy dog." },
  { label: "Numbers & code", text: "Invoice #4021 total: $1,299.00 — pay by 2026-08-01." },
  {
    label: "Another language",
    text: "La inteligencia artificial aprende de muchísimos ejemplos.",
  },
];

// Chips cycle through soft palette tokens so adjacent pieces are easy to tell apart.
const CHIP_TONES = 6;

export function TokenExplorer() {
  const [text, setText] = useState(EXAMPLES[0].text);

  const pieces = useMemo(() => tokenize(text), [text]);
  const chars = text.length;
  const words = wordCount(text);
  const tokens = pieces.length;

  return (
    <div className="explore-body">
      <p className="settings-hint">
        A model never sees your letters. First it chops the text into <strong>tokens</strong> — the
        chunks below. Type anything and watch how it splits. Notice the three counts rarely match:
        that mismatch is why a model struggles to “count the letters in a word,” and why every model
        has a <em>token</em> limit, not a word limit.
      </p>

      <textarea
        className="explore-query-input token-input"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        rows={3}
        placeholder="Type or paste anything…"
      />

      <div className="token-examples">
        <span className="token-examples-label">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setText(ex.text)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="token-stats">
        <div className="token-stat">
          <span className="token-stat-num">{chars}</span>
          <span className="token-stat-label">characters</span>
        </div>
        <div className="token-stat">
          <span className="token-stat-num">{words}</span>
          <span className="token-stat-label">words</span>
        </div>
        <div className="token-stat token-stat-accent">
          <span className="token-stat-num">{tokens}</span>
          <span className="token-stat-label">tokens (approx.)</span>
        </div>
      </div>

      {tokens > 0 && (
        <div className="token-chips" aria-label="The text split into tokens">
          {pieces.map((p, i) =>
            p.whitespace ? (
              <span key={i} className="token-chip token-chip-ws" title="whitespace">
                {p.text.includes("\n") ? "↵" : "·"}
              </span>
            ) : (
              <span key={i} className={`token-chip token-tone-${i % CHIP_TONES}`}>
                {p.text.startsWith(" ") ? <span className="token-chip-space">·</span> : null}
                {p.text.replace(/^ /, "")}
              </span>
            ),
          )}
        </div>
      )}

      <p className="settings-hint token-footnote">
        Roughly 4 characters make one token in English. A model’s <strong>context window</strong> —
        everything it can “hold in mind” at once (your question, the chat history, any documents) — is
        measured in these tokens: small models fit a few thousand, big ones over 100,000. This is a
        teaching approximation of a real tokenizer, not an exact count.
      </p>
    </div>
  );
}
