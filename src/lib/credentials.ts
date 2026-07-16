import { invoke } from "@tauri-apps/api/core";

export async function setCredential(refKey: string, secret: string): Promise<void> {
  await invoke("credentials_set", { refKey, secret });
}

export async function getCredential(refKey: string): Promise<string | null> {
  return invoke("credentials_get", { refKey });
}

export async function deleteCredential(refKey: string): Promise<void> {
  await invoke("credentials_delete", { refKey });
}
