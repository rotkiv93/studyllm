import { useEffect, useMemo, useRef, useState } from "react";
import { chunkText } from "../../lib/chunking";
import { overlapLength } from "../../lib/ragInsights";
import { useT } from "../../lib/i18n";

/**
 * The first step of RAG made visible, with no API key: paste a text, drag the sliders and watch it
 * being cut into passages. Each passage is a coloured block; the part a passage repeats from the
 * one before it (the overlap) is highlighted. It runs the app's real `chunkText`, so what you see
 * is exactly how your documents are split when you add them to the Library.
 */

const MIN_SIZE = 200;
const MAX_SIZE = 1500;
const MAX_TEXT = 20_000;

export function ChunkingPlayground({ onRan }: { onRan?: () => void }) {
  const t = useT();
  const [text, setText] = useState(() => t("chunking.sample"));
  const [size, setSize] = useState(500);
  const [overlap, setOverlap] = useState(80);
  const touched = useRef(false);
  const fired = useRef(false);

  const effectiveOverlap = Math.min(overlap, Math.floor(size / 2));
  const chunks = useMemo(
    () => chunkText(text.slice(0, MAX_TEXT), { size, overlap: effectiveOverlap }),
    [text, size, effectiveOverlap],
  );
  const average = chunks.length ? Math.round(chunks.reduce((n, c) => n + c.text.length, 0) / chunks.length) : 0;

  // The task counts as done once the student has actually moved something.
  const markTouched = () => {
    touched.current = true;
  };
  useEffect(() => {
    if (touched.current && !fired.current) {
      fired.current = true;
      onRan?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on a real change only, not on every render
  }, [text, size, overlap]);

  const sizeNote = size < 400 ? "small" : size > 1100 ? "large" : "medium";

  return (
    <div className="explore-body chunking">
      <p className="settings-hint">{t("chunking.intro")}</p>

      <textarea
        className="explore-query-input"
        rows={4}
        value={text}
        maxLength={MAX_TEXT}
        onChange={(e) => {
          markTouched();
          setText(e.currentTarget.value);
        }}
        aria-label={t("chunking.textLabel")}
      />

      <div className="chunking-controls">
        <label className="chunking-control">
          <span>
            {t("chunking.size")} <strong>{size}</strong>
          </span>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={50}
            value={size}
            onChange={(e) => {
              markTouched();
              setSize(Number(e.currentTarget.value));
            }}
          />
        </label>
        <label className="chunking-control">
          <span>
            {t("chunking.overlap")} <strong>{effectiveOverlap}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={400}
            step={10}
            value={overlap}
            onChange={(e) => {
              markTouched();
              setOverlap(Number(e.currentTarget.value));
            }}
          />
        </label>
      </div>

      <p className="chunking-summary">
        {t("chunking.summary", { count: chunks.length, avg: average })} {t(`chunking.note.${sizeNote}`)}
      </p>

      <ol className="chunking-list">
        {chunks.map((c, i) => {
          const shared = i > 0 ? overlapLength(chunks[i - 1].text, c.text, effectiveOverlap) : 0;
          return (
            <li key={c.seq} className={`chunking-chunk chunking-chunk-${i % 2}`}>
              <span className="chunking-chunk-tag">
                #{c.seq} · {t("chunking.chars", { count: c.text.length })}
              </span>
              <p>
                {shared > 0 && <mark className="chunking-overlap">{c.text.slice(0, shared)}</mark>}
                {c.text.slice(shared)}
              </p>
            </li>
          );
        })}
      </ol>
      {effectiveOverlap > 0 && chunks.length > 1 && <p className="viz-caption">{t("chunking.legend")}</p>}
    </div>
  );
}
