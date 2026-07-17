import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body: string | null;
}

let pendingUpdate: Update | null = null;

/** Returns update metadata if one is available, or null (never throws — offline/registry
 * hiccups should be silent, not an error banner on every launch). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update) return null;
    pendingUpdate = update;
    return { version: update.version, currentVersion: update.currentVersion, body: update.body ?? null };
  } catch {
    return null;
  }
}

/** Downloads and installs the update found by the last `checkForUpdate()` call, then relaunches
 * the app. Throws on failure so the caller can show what went wrong. */
export async function installPendingUpdateAndRelaunch(): Promise<void> {
  if (!pendingUpdate) throw new Error("No update to install — call checkForUpdate() first.");
  await pendingUpdate.downloadAndInstall();
  await relaunch();
}
