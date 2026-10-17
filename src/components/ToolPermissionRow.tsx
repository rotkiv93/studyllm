import type { McpToolInfo, ToolPermissionMode } from "../lib/mcp";
import { useT } from "../lib/i18n";

/** One tool with its Allow / Ask / Deny selector — shared by the MCP and Plugins panels. */
export function ToolPermissionRow({
  tool,
  permission,
  onChange,
}: {
  tool: McpToolInfo;
  permission: ToolPermissionMode;
  onChange: (mode: ToolPermissionMode) => void;
}) {
  const t = useT();
  return (
    <li className="tool-perm-row">
      <div className="tool-perm-info">
        <span className="tool-perm-name">{tool.name}</span>
        {tool.description && <span className="tool-perm-desc">{tool.description}</span>}
      </div>
      <select value={permission} onChange={(e) => onChange(e.currentTarget.value as ToolPermissionMode)}>
        <option value="allow">{t("mcp.perm.allow")}</option>
        <option value="ask">{t("mcp.perm.ask")}</option>
        <option value="deny">{t("mcp.perm.deny")}</option>
      </select>
    </li>
  );
}
