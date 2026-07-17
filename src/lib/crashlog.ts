import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Local-only ring-buffered log (MCP stderr, MCP start failures, Rust panics, frontend errors).
 * Nothing here ever leaves the machine — it exists purely so a student can see what went wrong
 * after the fact, since a packaged build has no visible terminal. */
export async function readCrashLog(): Promise<string> {
  return invoke("crash_log_read");
}

export async function clearCrashLog(): Promise<void> {
  await invoke("crash_log_clear");
}

export async function getCrashLogPath(): Promise<string | null> {
  return invoke("crash_log_path");
}

export async function appendCrashLog(line: string): Promise<void> {
  await invoke("crash_log_append", { line });
}

export async function revealCrashLog(): Promise<void> {
  const path = await getCrashLogPath();
  if (path) await revealItemInDir(path);
}
