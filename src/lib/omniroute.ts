import { invoke } from "@tauri-apps/api/core";
import { fetchProviderModels } from "./providerModels";
import { PROVIDER_MANIFEST, type ProviderType } from "./providers";

/**
 * OmniRoute, the optional local AI router. The Rust side starts/stops the process (`omniroute.rs`); this
 * file is the thin client plus the one question the UI cares about: *is it running, and is it ours?*
 */

export interface OmniStatus {
  /** A process this app started is alive. */
  managed: boolean;
  pid: number | null;
  port: number;
  version: string;
  logTail: string[];
  /** The process we started ended on its own (a crash); the text says how. */
  exited: string | null;
}

interface RawStatus {
  managed: boolean;
  pid: number | null;
  port: number;
  version: string;
  log_tail: string[];
  exited: string | null;
}

const toStatus = (r: RawStatus): OmniStatus => ({
  managed: r.managed,
  pid: r.pid,
  port: r.port,
  version: r.version,
  logTail: r.log_tail,
  exited: r.exited,
});

export const omniStatus = async () => toStatus(await invoke<RawStatus>("omniroute_status"));
export const omniStart = async () => toStatus(await invoke<RawStatus>("omniroute_start"));
export const omniStop = async () => toStatus(await invoke<RawStatus>("omniroute_stop"));

/**
 * - `off`      — nothing is running.
 * - `starting` — the app launched it and it isn't answering yet (the first run downloads it).
 * - `running`  — the app launched it and it answers.
 * - `external` — it answers but the student started it themselves; the app leaves it alone.
 * - `error`    — the process the app started has ended.
 */
export type OmniState = "off" | "starting" | "running" | "external" | "error";

export function deriveOmniState(status: OmniStatus | null, reachable: boolean): OmniState {
  if (reachable) return status?.managed ? "running" : "external";
  if (status?.managed) return "starting";
  if (status?.exited) return "error";
  return "off";
}

/** Asks the router for its model list; the number of models, or null when it doesn't answer. */
export async function probeOmniRoute(baseURL?: string): Promise<number | null> {
  const models = await fetchProviderModels("omniroute", "", baseURL ?? PROVIDER_MANIFEST.omniroute.baseURL);
  return models ? models.length : null;
}

export const OMNI_AUTOSTART_KEY = "studyllm.omniroute.autostart";
export const OMNI_DASHBOARD_URL = "http://localhost:20128/dashboard";

// ── Management API (add/list/remove the provider keys OmniRoute itself uses) ─────────────────────

export interface OmniConnection {
  id: string;
  /** OmniRoute's own provider id ("groq", "mistral"…). */
  provider: string;
  name: string;
  isActive: boolean;
  /** Masked by the server, e.g. `gsk_test****ummy`. */
  apiKey?: string;
  testStatus?: string;
}

/** The dashboard password isn't the default any more — the student has to type it. */
export class OmniAuthError extends Error {
  constructor() {
    super("auth");
  }
}

async function omniApi<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  try {
    return await invoke<{ status: number; body: T }>("omniroute_api", { request: { method, path, body: body ?? null } });
  } catch (e) {
    if (e === "auth" || (e instanceof Error && e.message === "auth")) throw new OmniAuthError();
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export const setOmniPassword = (password: string) => invoke<void>("omniroute_set_password", { password });

export async function listOmniConnections(): Promise<OmniConnection[]> {
  const { body } = await omniApi<{ connections?: OmniConnection[] }>("GET", "/api/providers");
  return body.connections ?? [];
}

export async function addOmniConnection(provider: string, name: string, apiKey: string): Promise<void> {
  const { status, body } = await omniApi<{ error?: { message?: string } | string }>("POST", "/api/providers", {
    provider,
    name,
    apiKey,
    authType: "apikey",
  });
  if (status >= 400) {
    const err = body?.error;
    throw new Error(typeof err === "string" ? err : (err?.message ?? `OmniRoute answered ${status}`));
  }
}

export async function removeOmniConnection(id: string): Promise<void> {
  await omniApi("DELETE", `/api/providers/${encodeURIComponent(id)}`);
}

export async function setOmniConnectionActive(id: string, isActive: boolean): Promise<void> {
  await omniApi("PATCH", `/api/providers/${encodeURIComponent(id)}`, { isActive });
}

/** True when OmniRoute could reach the upstream provider with the saved key. */
export async function testOmniConnection(id: string): Promise<{ ok: boolean; message?: string }> {
  const { status, body } = await omniApi<{ valid?: boolean; error?: string; message?: string }>(
    "POST",
    `/api/providers/${encodeURIComponent(id)}/test`,
  );
  const ok = status < 400 && body?.valid !== false;
  return { ok, message: body?.error ?? body?.message };
}

/** Our provider types that OmniRoute can take a key for, mapped to OmniRoute's own ids. */
export const OMNI_PROVIDER_IDS: Partial<Record<ProviderType, string>> = {
  gemini: "gemini",
  mistral: "mistral",
  groq: "groq",
  nvidia: "nvidia",
  openrouter: "openrouter",
  cohere: "cohere",
  cerebras: "cerebras",
  "github-models": "github",
  sambanova: "sambanova",
};
