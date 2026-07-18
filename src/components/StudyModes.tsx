import {
  STUDY_TEMPLATES,
  STUDY_TOPIC_LABELS,
  type StudyTopic,
} from "../lib/studyTemplates";

interface StudyModesProps {
  /** Called with the chosen template's prompt seed; the caller drops it into the composer. */
  onPick: (seed: string) => void;
}

/** Topic render order. */
const TOPIC_ORDER: StudyTopic[] = ["reading", "writing", "research", "study"];

/**
 * The "study modes" palette shown on the empty chat screen: grouped chips that seed the composer
 * with a ready-made prompt so students don't face a blank box. Pure presentation — all data comes
 * from `studyTemplates.ts`.
 */
export function StudyModes({ onPick }: StudyModesProps) {
  return (
    <div className="study-modes">
      <p className="study-modes-title">Study modes — pick a starting point</p>
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
  );
}
