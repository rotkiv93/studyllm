import type { ExploreTab } from "./ExplorePanel";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * "Lessons" — the landing tab of the Explore panel, and the thing that turns a pile of playgrounds
 * into something you can teach a class from. Each card is a bite-sized concept in plain language
 * with a "Try it" button that drops the student straight into the matching live playground.
 *
 * Order is a deliberate teaching arc: the model itself (tokens) → its main weakness (making things
 * up) → the two fixes students hear buzzwords for (RAG, tools) → putting it together (research).
 */

/** Lesson copy lives in the locale files under `lessons.<n>.*`; only the ordering and the
 *  playground each card jumps to are structural. */
const LESSONS: { n: number; goTo: ExploreTab }[] = [
  { n: 1, goTo: "tokens" },
  { n: 2, goTo: "system" },
  { n: 3, goTo: "grounding" },
  { n: 4, goTo: "retrieval" },
  { n: 5, goTo: "tools" },
  { n: 6, goTo: "research" },
];

export function LessonsPanel({ onGoTo }: { onGoTo: (tab: ExploreTab) => void }) {
  const t = useT();

  return (
    <div className="explore-body">
      <p className="settings-hint">{t("lessons.intro")}</p>

      <ol className="lesson-grid">
        {LESSONS.map((lesson) => (
          <li key={lesson.n} className="lesson-card">
            <div className="lesson-card-head">
              <span className="lesson-card-num">{lesson.n}</span>
              <div className="lesson-card-titles">
                <span className="lesson-card-title">
                  {t(`lessons.${lesson.n}.title` as MessageKey)}
                </span>
                <span className="lesson-card-term">
                  {t(`lessons.${lesson.n}.term` as MessageKey)}
                </span>
              </div>
            </div>
            <p className="lesson-card-body">{t(`lessons.${lesson.n}.body` as MessageKey)}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm lesson-card-cta"
              onClick={() => onGoTo(lesson.goTo)}
            >
              {t(`lessons.${lesson.n}.cta` as MessageKey)} →
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
