const SERVICE: &str = "studyllm";

/// Non-command keyring helpers, shared by the `credentials_*` Tauri commands below and by the
/// OAuth flow (`oauth::commands`), which needs the same one-opaque-string-per-ref storage for
/// access/refresh tokens without going through IPC.
pub fn store(ref_key: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ref_key).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

pub fn load(ref_key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, ref_key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn remove(ref_key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ref_key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn credentials_set(ref_key: String, secret: String) -> Result<(), String> {
    store(&ref_key, &secret)
}

#[tauri::command]
pub fn credentials_get(ref_key: String) -> Result<Option<String>, String> {
    load(&ref_key)
}

#[tauri::command]
pub fn credentials_delete(ref_key: String) -> Result<(), String> {
    remove(&ref_key)
}
