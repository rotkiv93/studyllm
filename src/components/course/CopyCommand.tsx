import { useState } from "react";
import { useT } from "../../lib/i18n";

/** A terminal command in a code box with a one-click copy button. */
export function CopyCommand({ command }: { command: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the command is still selectable */
    }
  }

  return (
    <div className="course-command">
      <code>{command}</code>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
        {copied ? t("course.pb.copied") : t("course.pb.copy")}
      </button>
    </div>
  );
}
