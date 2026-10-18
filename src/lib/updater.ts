import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export { getVersion };
export type { Update };

export interface DownloadProgress {
  downloaded: number;
  /** Total size in bytes, or null when the server didn't send a Content-Length. */
  total: number | null;
}

/** Asks the release feed (`latest.json`) for a newer, signature-verified build; null = up to date. */
export function checkForUpdate(): Promise<Update | null> {
  return check();
}

/** 0–100, or null when the total size is unknown (the UI then shows an indeterminate state). */
export function progressPercent(p: DownloadProgress): number | null {
  if (p.total === null || p.total <= 0) return null;
  return Math.min(100, Math.round((p.downloaded / p.total) * 100));
}

/** Downloads + installs the update (the plugin verifies its signature), then restarts the app. */
export async function installUpdate(
  update: Update,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  const progress: DownloadProgress = { downloaded: 0, total: null };
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      progress.total = event.data.contentLength ?? null;
    } else if (event.event === "Progress") {
      progress.downloaded += event.data.chunkLength;
    }
    onProgress({ ...progress });
  });
  await relaunch();
}
