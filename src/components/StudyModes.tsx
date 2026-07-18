import { useState } from "react";
import {
  STUDY_TEMPLATES,
  STUDY_TOPIC_LABELS,
  type StudyTopic,
} from "../lib/studyTemplates";
import { IconChevronDown } from "./icons";

interface StudyModesProps {
  /** Called with the chosen template's prompt seed; the caller drops it into the composer. */
  onPick: (seed: string) => void;
}

/** Topic render order. */
const TOPIC_ORDER: StudyTopic[] = ["reading", "writing", "research", "study"];

const FEATURED = STUDY_TEMPLATES.filter((t) => t.featured);

/**
 * Starter prompts on the empty chat screen. By default it shows a single compact row of a few
 * "featured" templates so students aren't faced with a blank box or a wall of options. A "Browse
 * all" disclosure expands the full library grouped by topic. Selecting any chip seeds the composer
 * (via `onPick`). Pure presentation — all data comes from `studyTemplates.ts`.
 */
export function StudyModes({ onPick }: StudyModesProps) {
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="study-modes">
      <div className="study-modes-featured">
        {FEATURED.map((t) => (
          <button
            key={t.id}
            type="button"
            className="study-chip"
            title={t.description}
            onClick={() => onPick(t.promptSeed)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="study-modes-browse"
        aria-expanded={browsing}
        onClick={() => setBrowsing((b) => !b)}
      >
        <IconChevronDown size={13} className={browsing ? "study-browse-chevron-open" : undefined} />
        {browsing ? "Show fewer" : "Browse all"}
      </button>

      {browsing && (
        <div className="study-modes-groups">
          {TOPIC_ORDER.map((topic) => {
            const items = STUDY_TEMPLATES.filter((t) => t.topic === topic);
            if (items.length === 0) return null;
            return (
              <div key={topic} className="study-modes-group">
                <span className="study-modes-group-label">{STUDY_TOPIC_LABELS[topic]}</span>
                <div className="study-modes-chips">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="study-chip"
                      title={t.description}
                      onClick={() => onPick(t.promptSeed)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
