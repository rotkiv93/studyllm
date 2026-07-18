/**
 * Turning a chat into a document. Two output shapes:
 *  - Markdown (for "Copy as Markdown" — pastes into Notion/Docs/an editor keeping formatting).
 *  - Plain text (for the Google Docs `docs_append_text` tool, which inserts literal text).
 *
 * Tool-call blocks are intentionally omitted — an exported conversation is meant to read like notes
 * / a draft, not a debug trace. Empty assistant turns (tool-only steps) are skipped too.
 */

import type { McpToolInfo } from "./mcp";

/** The subset of the chat message shape we need — mirrors `DisplayMessage` in `App.tsx`. */
export interface ExportableMessage {
  role: "user" | "assistant" | "tool";
  content?: string;
}

function conversationText(messages: ExportableMessage[]): { role: string; content: string }[] {
  return messages
    .filter((m): m is { role: "user" | "assistant"; content: string } =>
      (m.role === "user" || m.role === "assistant") && !!m.content && m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }));
}

/** A Markdown transcript: `# title`, then a `## You` / `## Assistant` section per turn. */
export function buildTranscriptMarkdown(title: string, messages: ExportableMessage[]): string {
  const heading = `# ${title || "Conversation"}\n\n_Exported from StudyLLM on ${new Date().toLocaleDateString()}_\n`;
  const body = conversationText(messages)
    .map((m) => `## ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}`)
    .join("\n\n");
  return `${heading}\n${body}\n`;
}

/** A plain-text transcript for Google Docs (no Markdown syntax, just labelled turns). */
export function buildTranscriptPlainText(title: string, messages: ExportableMessage[]): string {
  const heading = `${title || "Conversation"}\nExported from StudyLLM on ${new Date().toLocaleDateString()}\n\n`;
  const body = conversationText(messages)
    .map((m) => `${m.role === "user" ? "You" : "Assistant"}:\n${m.content}`)
    .join("\n\n");
  return `${heading}${body}\n`;
}

/** Find the running MCP server (a connected Google account) that exposes the Docs tools. */
export function findDocsServerId(toolsByServer: Record<string, McpToolInfo[]>): string | null {
  for (const [serverId, tools] of Object.entries(toolsByServer)) {
    const names = new Set(tools.map((t) => t.name));
    if (names.has("docs_create_document") && names.has("docs_append_text")) return serverId;
  }
  return null;
}

/** Pull the document id out of `docs_create_document`'s text result (it embeds the doc URL). */
export function extractDocId(resultText: string): string | null {
  const fromUrl = resultText.match(/document\/d\/([A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  const fromId = resultText.match(/id:\s*([A-Za-z0-9_-]+)/);
  return fromId ? fromId[1] : null;
}

/** Pull the shareable doc URL out of the same result text, if present. */
export function extractDocUrl(resultText: string): string | null {
  const m = resultText.match(/https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit/);
  return m ? m[0] : null;
}
