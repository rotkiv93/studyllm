import {
  PROVIDER_MANIFEST,
  SELECTABLE_PROVIDER_TYPES,
  freeTierNoteKey,
} from "../../lib/providers";
import { useT } from "../../lib/i18n";

/**
 * Module 2's "where do I get a key?" list: straight from the curated manifest, so it can't drift from
 * the Providers panel. The key itself is pasted into the inline setup form further down the lesson.
 */
export function KeyGuide() {
  const t = useT();
  const hosted = SELECTABLE_PROVIDER_TYPES.filter((p) => !PROVIDER_MANIFEST[p].local);

  return (
    <ul className="course-key-list">
      {hosted.map((type) => {
        const m = PROVIDER_MANIFEST[type];
        return (
          <li key={type} className="course-key-item">
            <div className="course-key-main">
              <strong>{m.label}</strong>
              {m.recommended && <span className="provider-badge-recommended">{t("providers.recommended")}</span>}
              <span className="provider-free-note">{t(freeTierNoteKey(type))}</span>
            </div>
            <a href={m.apiKeyUrl} target="_blank" rel="noreferrer">
              {t("course.kg.getKey")}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
