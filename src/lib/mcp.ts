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
): Promise<McpToolInfo[]> {
  return invoke("mcp_start_server", { id, args, env });
}

/**
 * `authHeader`, if given, is sent as a bearer token with every request. rmcp's Streamable HTTP
 * client transport only supports one authorization header, not arbitrary custom headers — so a
 * remote server that requires more than one secret can't be fully wired up yet.
 */
export async function startRemoteMcpServer(
  id: string,
  url: string,
  authHeader?: string,
): Promise<McpToolInfo[]> {
  return invoke("mcp_start_remote_server", { id, url, authHeader: authHeader ?? null });
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

export const FILESYSTEM_SERVER_ID = "filesystem";

export function filesystemServerArgs(scopedPath: string): string[] {
  return ["-y", "@modelcontextprotocol/server-filesystem", scopedPath];
}
