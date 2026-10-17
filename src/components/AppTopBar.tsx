import { IconCompass, IconMessage } from "./icons";
import { useT } from "../lib/i18n";

export type AppMode = "chat" | "course";

interface Props {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  /** Overall Course completion (0–100); shown beside "Course" once the student has started. */
  courseProgressPercent: number;
}

/**
 * The app's single top bar. Left: the app name (each side bar collapses with its own button, at its own
 * top, like the Lab on the right). Centre: the two modes, **Chat** (the
 * normal conversation with its history) and **Course** (guided lessons, where the left bar becomes the
 * lesson list). Switching never discards anything — the chat stays mounted underneath, so a reply that
 * is still streaming keeps going while the student reads a lesson.
 */
export function AppTopBar({ mode, onChange, courseProgressPercent }: Props) {
  const t = useT();
  const options: { id: AppMode; label: string; icon: typeof IconMessage }[] = [
    { id: "chat", label: t("mode.chat"), icon: IconMessage },
    { id: "course", label: t("mode.course"), icon: IconCompass },
  ];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">StudyLLM</span>
      </div>

      <div className="mode-switch" role="group" aria-label={t("mode.label")}>
        {options.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`mode-switch-btn${mode === id ? " mode-switch-btn-active" : ""}`}
            aria-pressed={mode === id}
            onClick={() => onChange(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
            {id === "course" && courseProgressPercent > 0 && (
              <span className="mode-switch-badge">{courseProgressPercent}%</span>
            )}
          </button>
        ))}
      </div>

      {/* Empty right-hand cell: keeps the switch truly centred whatever the left cluster's width. */}
      <div className="topbar-right" aria-hidden="true" />
    </header>
  );
}
