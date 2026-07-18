import { ATTACHMENT_MARKER } from "../lib/attachments";
import { IconPaperclip } from "./icons";

/**
 * Renders a user message that may carry attached-file text. The outgoing message embeds each file as
 * a `--- Attached file: NAME ---` block (see `attachments.ts`); here we peel those back out so the
 * chat shows the student's own words plus a collapsed, expandable card per file instead of a wall of
 * extracted text.
 */
export function UserMessageContent({ content }: { content: string }) {
  const markerIdx = content.indexOf(ATTACHMENT_MARKER);
  if (markerIdx === -1) return <p>{content}</p>;

  const lead = content.slice(0, markerIdx).trim();
  const blocks = content
    .slice(markerIdx)
    .split(ATTACHMENT_MARKER)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const newline = block.indexOf("\n");
      const name = (newline === -1 ? block : block.slice(0, newline)).replace(/-+\s*$/, "").trim();
      const body = newline === -1 ? "" : block.slice(newline + 1).trim();
      return { name, body };
    });

  return (
    <div className="user-message-content">
      {lead && <p>{lead}</p>}
      {blocks.map((b, i) => (
        <details key={i} className="attachment-details">
          <summary>
            <IconPaperclip size={13} />
            <span>{b.name}</span>
          </summary>
          <pre>{b.body}</pre>
        </details>
      ))}
    </div>
  );
}
