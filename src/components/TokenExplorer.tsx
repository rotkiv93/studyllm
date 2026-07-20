import { useMemo, useState } from "react";
import { tokenize, wordCount } from "../lib/tokenize";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * The "What is a token?" playground — the first thing to show a non-technical class, and the only
 * one that needs no API key (so it works even when everyone's free tier is rate-limited mid-lesson).
 *
 * The student types anything and watches it break into colored token chips, with live counts for
 * characters vs. words vs. tokens. The whole point is the mismatch between those three numbers —
 * that's the intuition behind context windows and "why it can't count the letters in strawberry."
 * The tokenizer is a labeled approximation (see `lib/tokenize.ts`); the *behaviour* it shows is real.
 */

/**
 * The sample texts are localized too, not just their labels: what tokenizes interestingly is
 * language-specific (the "count the r's" example only lands in a language where the word has
 * repeated letters), and the "another language" example flips to whichever language *isn't* the UI's.
 */
const EXAMPLE_IDS = ["strawberry", "sentence", "numbers", "otherLang"] as const;

// Chips cycle through soft palette tokens so adjacent pieces are easy to tell apart.
const CHIP_TONES = 6;

export function TokenExplorer() {
  const t = useT();
  // Seeded once from the current language; after that it's the student's own text, so a later
  // language switch deliberately leaves what they typed alone.
  const [text, setText] = useState(() => t("token.example.strawberryText"));

  const pieces = useMemo(() => tokenize(text), [text]);
  const chars = text.length;
  const words = wordCount(text);
  const tokens = pieces.length;

  return (
    <div className="explore-body">
      <p className="settings-hint">{t("token.intro")}</p>

      <textarea
        className="explore-query-input token-input"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        rows={3}
        placeholder={t("token.placeholder")}
      />

      <div className="token-examples">
        <span className="token-examples-label">{t("token.tryLabel")}</span>
        {EXAMPLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setText(t(`token.example.${id}Text` as MessageKey))}
          >
            {t(`token.example.${id}` as MessageKey)}
          </button>
        ))}
      </div>

      <div className="token-stats">
        <div className="token-stat">
          <span className="token-stat-num">{chars}</span>
          <span className="token-stat-label">{t("token.characters")}</span>
        </div>
        <div className="token-stat">
          <span className="token-stat-num">{words}</span>
          <span className="token-stat-label">{t("token.words")}</span>
        </div>
        <div className="token-stat token-stat-accent">
          <span className="token-stat-num">{tokens}</span>
          <span className="token-stat-label">{t("token.tokens")}</span>
        </div>
      </div>

      {tokens > 0 && (
        <div className="token-chips" aria-label={t("token.chipsAria")}>
          {pieces.map((p, i) =>
            p.whitespace ? (
              <span key={i} className="token-chip token-chip-ws" title={t("token.whitespace")}>
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

      <p className="settings-hint token-footnote">{t("token.footnote")}</p>
    </div>
  );
}
