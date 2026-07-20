import { useMemo } from "react";
import { projectTo2D } from "../../lib/projection";
import type { ExplainedChunk } from "../../lib/rag";
import { useT } from "../../lib/i18n";

/**
 * A 2D "map" of the embedding space: the query and every chunk projected (via PCA) onto the plane
 * of greatest variance. Passages near the query star are near it in meaning; the retrieved ones
 * (top-k) are highlighted. Cross-highlights with the ranking bars — hovering one lights the other —
 * so the student *feels* that "high score" and "close in space" are the same thing.
 *
 * The projection is an approximation of a high-dimensional space squashed to 2D; it's a teaching
 * lens, not a precise metric (see PROJECT_STATUS.md).
 */

const VIEW = 100;
const PAD = 10;

export function EmbeddingMap({
  queryVector,
  scored,
  k,
  hoveredIndex,
  onHover,
  onSelect,
}: {
  queryVector: number[];
  scored: ExplainedChunk[];
  k: number;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}) {
  const t = useT();
  // Project the query (index 0) together with all chunks so they share one coordinate frame.
  const points = useMemo(
    () => projectTo2D([queryVector, ...scored.map((s) => s.vector)]),
    [queryVector, scored],
  );

  const placed = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const span = Math.max(spanX, spanY); // uniform scale keeps distances honest
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const mid = VIEW / 2;
    const scale = (VIEW - 2 * PAD) / span;
    return points.map(([x, y]) => ({
      x: mid + (x - cx) * scale,
      y: mid - (y - cy) * scale, // flip: SVG y grows downward
    }));
  }, [points]);

  if (!placed || placed.length < 2) return null;
  const cutoff = Math.min(k, scored.length);
  const [queryPt, ...chunkPts] = placed;

  return (
    <div className="viz-block">
      <div className="viz-title">{t("viz.embeddingSpace")}</div>
      <p className="viz-caption">{t("viz.embeddingCaption")}</p>
      <svg
        className="embed-map"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={t("viz.embeddingSpaceAria")}
      >
        {chunkPts.map((p, i) => {
          const retrieved = i < cutoff;
          const hovered = hoveredIndex === i;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hovered ? 3.4 : retrieved ? 2.6 : 2}
              className={`embed-dot${retrieved ? " embed-dot-kept" : ""}${
                hovered ? " embed-dot-hover" : ""
              }`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(i)}
            >
              <title>{t("viz.clickToRead")}</title>
            </circle>
          );
        })}
        {/* Query marker (a small 4-point star) drawn last so it sits on top. */}
        <path
          className="embed-query"
          transform={`translate(${queryPt.x} ${queryPt.y})`}
          d="M0 -4.5 L1.1 -1.1 L4.5 0 L1.1 1.1 L0 4.5 L-1.1 1.1 L-4.5 0 L-1.1 -1.1 Z"
        />
      </svg>
      <div className="embed-legend">
        <span className="embed-legend-item">
          <span className="embed-legend-star">★</span> your question
        </span>
        <span className="embed-legend-item">
          <span className="embed-legend-swatch embed-legend-kept" /> retrieved
        </span>
        <span className="embed-legend-item">
          <span className="embed-legend-swatch" /> other passages
        </span>
      </div>
    </div>
  );
}
