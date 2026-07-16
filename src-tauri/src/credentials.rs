const SERVICE: &str = "studyllm";

#[tauri::command]
pub fn credentials_set(ref_key: String, secret: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &ref_key).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credentials_get(ref_key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, &ref_key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn credentials_delete(ref_key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &ref_key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
