use std::collections::VecDeque;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

/// Ring-buffered, local-only log: MCP server stderr/start failures and (best-effort) Rust
/// panics and frontend JS errors all funnel through here. Nothing leaves the machine — it's
/// purely a "reveal log" aid for a student debugging a broken tool or a crash after the fact.
const MAX_LINES: usize = 1000;

#[derive(Default)]
pub struct CrashLog {
    lines: Mutex<VecDeque<String>>,
}

/// Minimal, dependency-free UTC calendar conversion (Howard Hinnant's `civil_from_days`) —
/// avoids pulling in a full date/time crate just to timestamp log lines.
fn format_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs() as i64;
    let days = secs.div_euclid(86400);
    let time_of_day = secs.rem_euclid(86400);
    let (h, min, s) = (time_of_day / 3600, (time_of_day / 60) % 60, time_of_day % 60);

    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as i64;
    let m_num = if mp < 10 { mp + 3 } else { mp - 9 } as i64;
    let y = if m_num <= 2 { y + 1 } else { y };

    format!("{y:04}-{m_num:02}-{d:02} {h:02}:{min:02}:{s:02} UTC")
}

fn log_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_local_data_dir().ok()?;
    Some(dir.join("studyllm.log"))
}

impl CrashLog {
    pub fn append(&self, app: &AppHandle, line: impl AsRef<str>) {
        let entry = format!("[{}] {}", format_timestamp(), line.as_ref());
        let joined = {
            let mut lines = self.lines.lock().unwrap();
            if lines.len() >= MAX_LINES {
                lines.pop_front();
            }
            lines.push_back(entry);
            lines.iter().cloned().collect::<Vec<_>>().join("\n")
        };
        if let Some(path) = log_path(app) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(path, joined);
        }
    }
}

#[tauri::command]
pub fn crash_log_read(app: AppHandle, log: State<'_, CrashLog>) -> String {
    let lines = log.lines.lock().unwrap();
    if !lines.is_empty() {
        return lines.iter().cloned().collect::<Vec<_>>().join("\n");
    }
    // Ring buffer is per-process (empty right after a fresh launch) — fall back to the file,
    // which persists across restarts, so a crash from the *previous* run is still visible.
    log_path(&app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn crash_log_clear(app: AppHandle, log: State<'_, CrashLog>) {
    log.lines.lock().unwrap().clear();
    if let Some(path) = log_path(&app) {
        let _ = std::fs::write(path, "");
    }
}

#[tauri::command]
pub fn crash_log_path(app: AppHandle) -> Option<String> {
    log_path(&app).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn crash_log_append(app: AppHandle, log: State<'_, CrashLog>, line: String) {
    log.append(&app, line);
}
