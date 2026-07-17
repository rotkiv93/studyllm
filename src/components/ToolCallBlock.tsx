import { useEffect, useState } from "react";
import { IconCheck, IconChevronDown, IconLoader, IconTool, IconX } from "./icons";
import type { McpServerRow } from "../lib/db";

export interface ToolCallBlockProps {
  toolName: string;
  input: unknown;
  output: string;
  isError: boolean;
  pending: boolean;
  mcpServers: McpServerRow[];
}

/** Sanitized tool keys look like `${serverId}_${toolName}`; server ids (UUIDs) never
 * contain underscores, so the first underscore is always the real separator. */
function resolveToolLabel(rawKey: string, servers: McpServerRow[]): { server: string | null; tool: string } {
  const sep = rawKey.indexOf("_");
  if (sep === -1) return { server: null, tool: rawKey };
  const serverId = rawKey.slice(0, sep);
  const tool = rawKey.slice(sep + 1);
  const server = servers.find((s) => s.id === serverId);
  return { server: server?.name ?? null, tool };
}

function formatPayload(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallBlock({ toolName, input, output, isError, pending, mcpServers }: ToolCallBlockProps) {
  const { server, tool } = resolveToolLabel(toolName, mcpServers);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isError) setExpanded(true);
  }, [isError]);

  const inputText = formatPayload(input);
  const hasInput = inputText.trim().length > 0 && inputText.trim() !== "{}";

  return (
    <div className={`tool-block${isError ? " tool-block-error" : ""}`}>
      <button
        type="button"
        className="tool-block-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`tool-block-status ${pending ? "is-pending" : isError ? "is-error" : "is-done"}`}>
          {pending ? <IconLoader size={13} /> : isError ? <IconX size={13} /> : <IconCheck size={13} />}
        </span>
        <IconTool size={14} className="tool-block-icon" />
        <span className="tool-block-name">{tool}</span>
        {server && <span className="tool-block-server">{server}</span>}
        <span className="tool-block-state-label">{pending ? "Running…" : isError ? "Failed" : "Done"}</span>
        <IconChevronDown size={14} className={`tool-block-chevron${expanded ? " is-open" : ""}`} />
      </button>

      {expanded && (
        <div className="tool-block-body">
          {hasInput && (
            <div className="tool-block-section">
              <span className="tool-block-section-label">Input</span>
              <pre className="tool-block-pre">{inputText}</pre>
            </div>
          )}
          <div className="tool-block-section">
            <span className="tool-block-section-label">{isError ? "Error" : "Output"}</span>
            <pre className="tool-block-pre">{pending ? "Running…" : formatPayload(output)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
