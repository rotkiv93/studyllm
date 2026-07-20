import type { ExplainedChunk } from "../../lib/rag";
import { useT } from "../../lib/i18n";

/**
 * Horizontal bar ranking of every stored chunk by its cosine similarity to the query. The top `k`
 * (what a real turn would actually feed the model) sit above a dashed cutoff line; the rest are
 * shown greyed so the student can see *why these passages and not the others*. Bar length is scaled
 * to the top score so small differences read clearly; the label always shows the true percentage.
 */
export function SimilarityRanking({
  scored,
  k,
  hoveredIndex,
  onHover,
  onSelect,
}: {
  scored: ExplainedChunk[];
  k: number;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}) {
  const t = useT();
  if (scored.length === 0) return null;
  const maxScore = Math.max(...scored.map((s) => Math.max(0, s.score)), 0.0001);
  const cutoff = Math.min(k, scored.length);

  return (
    <div className="viz-block">
      <div className="viz-title">{t("viz.similarityRanking")}</div>
      <p className="viz-caption">{t("viz.rankingCaption", { count: cutoff })}</p>
      <ul className="rank-list">
        {scored.map((s, i) => {
          const showCutoff = i === cutoff && cutoff < scored.length;
          const retrieved = i < cutoff;
          const width = `${Math.max(2, (Math.max(0, s.score) / maxScore) * 100)}%`;
          return (
            <li key={i}>
              {showCutoff && (
                <div className="rank-cutoff" aria-hidden="true">
                  <span>{t("viz.cutoff", { count: cutoff })}</span>
                </div>
              )}
              <button
                type="button"
                className={`rank-row${retrieved ? " rank-row-kept" : ""}${
                  hoveredIndex === i ? " rank-row-hover" : ""
                }`}
                onMouseEnter={() => onHover(i)}
                onFocus={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(i)}
                title={t("viz.clickToRead")}
              >
                <span className="rank-tag">
                  {s.documentName} #{s.seq}
                </span>
                <span className="rank-bar-track">
                  <span className="rank-bar-fill" style={{ width }} />
                </span>
                <span className="rank-score">{Math.round(s.score * 100)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
