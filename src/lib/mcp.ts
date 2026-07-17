import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface McpToolInfo {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
}

export interface McpCallOutcome {
  isError: boolean;
  text: string;
}

export interface McpServerStatusEvent {
  id: string;
  status: "starting" | "running" | "stopped" | "error";
  message: string | null;
}

export interface EnvVarSpec {
  name: string;
  description: string | null;
  isRequired: boolean;
  isSecret: boolean;
  default: string | null;
}

export interface PositionalArgSpec {
  description: string | null;
  default: string | null;
}

export type InstallSpec =
  | { kind: "npx"; args: string[]; positionalArgs: PositionalArgSpec[] }
  | { kind: "uvx"; args: string[]; positionalArgs: PositionalArgSpec[] }
  | { kind: "remoteHttp"; url: string }
  | { kind: "unsupported"; reason: string };

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  version: string | null;
  repositoryUrl: string | null;
  install: InstallSpec;
  requiredEnv: EnvVarSpec[];
}

export interface RegistryPage {
  entries: CatalogEntry[];
  nextCursor: string | null;
}

export async function searchMcpRegistry(query?: string, cursor?: string): Promise<RegistryPage> {
  return invoke("mcp_registry_search", { query: query ?? null, cursor: cursor ?? null });
}

export async function startMcpServer(
  id: string,
  args: string[],
  env: Record<string, string> = {},
  runtimeKind: "npx" | "uvx" = "npx",
): Promise<McpToolInfo[]> {
  return invoke("mcp_start_server", { id, runtimeKind, args, env });
}

/**
 * `headers` is the full set of resolved env values for this server, keyed by literal HTTP
 * header name. A header named `Authorization` (case-insensitive) is sent as a bearer token;
 * every other name is sent verbatim — so a remote server declaring several required
 * secrets/headers gets all of them wired up, not just the first.
 */
export async function startRemoteMcpServer(
  id: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<McpToolInfo[]> {
  return invoke("mcp_start_remote_server", { id, url, headers });
}

export async function stopMcpServer(id: string): Promise<void> {
  await invoke("mcp_stop_server", { id });
}

export async function isMcpServerRunning(id: string): Promise<boolean> {
  return invoke("mcp_is_server_running", { id });
}

export async function listMcpTools(id: string): Promise<McpToolInfo[]> {
  return invoke("mcp_list_tools", { id });
}

export async function callMcpTool(
  id: string,
  toolName: string,
  arguments_: unknown,
): Promise<McpCallOutcome> {
  return invoke("mcp_call_tool", { id, toolName, arguments: arguments_ });
}

export function onMcpServerStatusChanged(
  handler: (event: McpServerStatusEvent) => void,
): Promise<UnlistenFn> {
  return listen<McpServerStatusEvent>("mcp://server-status-changed", (e) => handler(e.payload));
}

export function onMcpRuntimeLog(handler: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>("mcp://runtime-log", (e) => handler(e.payload));
}

export interface McpServerLogEvent {
  id: string;
  line: string;
}

/** A running stdio server's stderr, forwarded line-by-line (not visible any other way in a
 * packaged build — previously only inherited into the terminal running `npm run tauri dev`). */
export function onMcpServerLog(handler: (event: McpServerLogEvent) => void): Promise<UnlistenFn> {
  return listen<McpServerLogEvent>("mcp://server-log", (e) => handler(e.payload));
}

export const FILESYSTEM_SERVER_ID = "filesystem";

export function filesystemServerArgs(scopedPath: string): string[] {
  return ["-y", "@modelcontextprotocol/server-filesystem", scopedPath];
}

/**
 * "deny" hides the tool from the model entirely (equivalent to deselecting it). "ask" exposes it
 * but the user must approve each call before it runs. "allow" runs it automatically. Tools with no
 * entry in the map default to "allow" so existing servers keep working after this feature ships.
 */
export type ToolPermissionMode = "allow" | "ask" | "deny";

export type ToolPermissionsMap = Record<string, ToolPermissionMode>;

export function parseToolPermissions(json: string): ToolPermissionsMap {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as ToolPermissionsMap) : {};
  } catch {
    return {};
  }
}

export function getToolPermission(map: ToolPermissionsMap, toolName: string): ToolPermissionMode {
  return map[toolName] ?? "allow";
}
