//! Writes an exported chat (Markdown / .docx / PDF bytes) to a path the user picked in the native
//! save dialog. Kept as a tiny command so the webview needs no broad `fs` plugin scope.

#[tauri::command]
pub fn save_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write {path}: {e}"))
}
