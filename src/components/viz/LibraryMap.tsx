import { useMemo, useState } from "react";
import { projectTo2D } from "../../lib/projection";
import { fitToView } from "../../lib/ragInsights";
import type { LibraryChunk } from "../../lib/rag";
import { useT } from "../../lib/i18n";

/**
 * A 2D map of the whole library: every stored passage projected (PCA) onto one plane and coloured by
 * the document it came from. Passages that sit together mean similar things, so a document about one
 * topic forms a cluster and two documents about the same topic overlap. Like the retrieval map it is
 * an approximation — hundreds of dimensions squashed to two — meant as a teaching lens.
 */

const VIEW = 100;
const PAD = 8;
const SERIES = 6;

export function LibraryMap({ chunks, documentOrder }: { chunks: LibraryChunk[]; documentOrder: string[] }) {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);

  const placed = useMemo(
    () => fitToView(projectTo2D(chunks.map((c) => c.vector)), VIEW, PAD),
    [chunks],
  );
  const seriesOf = (docId: string) => Math.max(0, documentOrder.indexOf(docId)) % SERIES;

  if (chunks.length < 2) return <p className="settings-hint">{t("library.mapNeedMore")}</p>;

  const picked = selected !== null ? chunks[selected] : null;

  return (
    <div className="viz-block library-map">
      <div className="viz-title">{t("library.mapTitle")}</div>
      <p className="viz-caption">{t("library.mapHint")}</p>
      <svg className="embed-map" viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={t("library.mapTitle")}>
        {placed.map((p, i) => (
          <circle
            key={chunks[i].id}
            cx={p.x}
            cy={p.y}
            r={selected === i ? 3.6 : 2.3}
            className={`lib-dot lib-dot-${seriesOf(chunks[i].documentId)}${selected === i ? " lib-dot-selected" : ""}`}
            onClick={() => setSelected(i)}
          >
            <title>{`${chunks[i].documentName} #${chunks[i].seq}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="library-map-legend">
        {documentOrder.map((id) => {
          const name = chunks.find((c) => c.documentId === id)?.documentName;
          if (!name) return null;
          return (
            <li key={id} className="embed-legend-item">
              <span className={`lib-swatch lib-dot-${seriesOf(id)}`} /> {name}
            </li>
          );
        })}
      </ul>
      {picked ? (
        <div className="library-map-pick">
          <span className="passage-dialog-tag">
            {picked.documentName} #{picked.seq}
          </span>
          <p>{picked.text}</p>
        </div>
      ) : (
        <p className="viz-caption">{t("library.mapPickHint")}</p>
      )}
    </div>
  );
}
