import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { McpToolInfo } from "./mcp";

export interface OAuthConnectResult {
  serverId: string;
  tools: McpToolInfo[];
  expiresAt: number;
}

export type OAuthProgressPhase =
  | "opening-browser"
  | "waiting"
  | "exchanging"
  | "connected"
  | "error";

export interface OAuthProgressEvent {
  connectorId: string;
  phase: OAuthProgressPhase;
  message: string | null;
}

/**
 * Drives one full "Connect Google Account" click: opens the system browser for consent, catches
 * the loopback redirect, exchanges the code, then starts + registers refresh for every target.
 * `targets` fan one consent screen out to N `mcp_servers` rows (e.g. Gmail + Drive).
 */
export async function oauthConnect(
  connectorId: string,
  scopes: string[],
  targets: { serverId: string; provider: string }[],
): Promise<OAuthConnectResult[]> {
  return invoke("oauth_connect", { connectorId, scopes, targets });
}

/** Silent reconnect for an already-connected OAuth row (e.g. on app-launch autostart). */
export async function oauthReconnect(serverId: string, provider: string): Promise<OAuthConnectResult> {
  return invoke("oauth_reconnect", { serverId, provider });
}

export function onOAuthProgress(
  handler: (event: OAuthProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<OAuthProgressEvent>("oauth://progress", (e) => handler(e.payload));
}
