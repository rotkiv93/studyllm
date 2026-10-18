//! Writes an exported chat (Markdown / .docx / PDF bytes) to a path the user picked in the native
//! save dialog. Kept as a tiny command so the webview needs no broad `fs` plugin scope.
//!
//! The file bytes travel as the raw IPC body (no JSON number array); the path is a header.

use tauri::ipc::{InvokeBody, Request};

const ALLOWED_EXTENSIONS: [&str; 3] = ["md", "docx", "pdf"];

fn validate_path(path: &str) -> Result<(), String> {
    let p = std::path::Path::new(path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !p.is_absolute() || !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err("Export files must be saved as .md, .docx or .pdf".into());
    }
    Ok(())
}

#[tauri::command]
pub fn save_export_file(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw file bytes".into());
    };
    let path = request
        .headers()
        .get("x-export-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing export path")?;
    let path = urlencoding_decode(path)?;
    validate_path(&path)?;
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write {path}: {e}"))
}

/// Percent-decode the `encodeURIComponent`-encoded header value (headers must be ASCII).
fn urlencoding_decode(s: &str) -> Result<String, String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3).ok_or("Bad path encoding")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "Bad path encoding")?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Bad path encoding".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_extension_and_absolute() {
        // `/tmp/...` isn't absolute on Windows, so build the root per-OS.
        let root = if cfg!(windows) { "C:\\tmp" } else { "/tmp" };
        assert!(validate_path(&format!("{root}/a.md")).is_ok());
        assert!(validate_path(&format!("{root}/a.PDF")).is_ok());
        assert!(validate_path(&format!("{root}/a.sh")).is_err());
        assert!(validate_path("a.md").is_err());
    }

    #[test]
    fn decodes_path() {
        assert_eq!(
            urlencoding_decode("%2Ftmp%2Fa%20b.md").unwrap(),
            "/tmp/a b.md"
        );
    }
}
