//! Runs OmniRoute — a local, OpenAI-compatible AI router — on the student's behalf, so using it is a
//! switch in the app instead of a terminal session. The app spawns `npx omniroute serve` (reusing the
//! same Node bootstrap the MCP servers use, so no manual Node install either), keeps the last lines of its
//! output for the UI, and stops the whole process tree on request or when the app quits.
//!
//! Whether the router is *answering* is the frontend's call (it asks `/v1/models`); this module only
//! knows about the process it started itself. A router the student launched on their own is left alone.

use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::mcp::runtime;

/// Pinned so a new upstream release can't change behaviour under students; bump deliberately.
const OMNIROUTE_VERSION: &str = "3.8.48";
const OMNIROUTE_PORT: u16 = 20128;
const MAX_LOG_LINES: usize = 300;
/// How many trailing log lines `omniroute_status` returns.
const TAIL_LINES: usize = 8;

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    pid: Option<u32>,
    logs: Vec<String>,
    /// Why the last process we started ended (set when we notice it died on its own).
    last_exit: Option<String>,
    /// Dashboard password used to sign in to the management API. OmniRoute ships with a well-known
    /// default; a student who changed it tells the app through `omniroute_set_password`.
    password: Option<String>,
    /// Session cookie from the last sign-in.
    cookie: Option<String>,
}

const DEFAULT_PASSWORD: &str = "CHANGEME";

#[derive(Default, Clone)]
pub struct OmniRouteHost {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Serialize)]
pub struct OmniRouteStatus {
    /// A process started by this app is alive.
    pub managed: bool,
    pub pid: Option<u32>,
    pub port: u16,
    pub version: &'static str,
    /// The most recent output lines, for a "starting…" hint or an error.
    pub log_tail: Vec<String>,
    /// Set when the process we started has ended by itself (a crash, e.g. an unsupported Node).
    pub exited: Option<String>,
}

fn push_log(inner: &mut Inner, line: String) {
    let line = line.trim_end().to_string();
    if line.is_empty() {
        return;
    }
    inner.logs.push(line);
    if inner.logs.len() > MAX_LOG_LINES {
        let drop = inner.logs.len() - MAX_LOG_LINES;
        inner.logs.drain(0..drop);
    }
}

/// Strips terminal colour codes so the log reads cleanly in the UI.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for n in chars.by_ref() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn pump_lines<R: AsyncRead + Unpin + Send + 'static>(reader: R, inner: Arc<Mutex<Inner>>) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            push_log(&mut *inner.lock().await, strip_ansi(&line));
        }
    });
}

/// Kills `pid` and everything it started. OmniRoute's CLI supervises a separate server process, so
/// killing only the launcher would leave the server holding the port.
fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000);
        let _ = cmd.stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    #[cfg(not(windows))]
    {
        // The child was started in its own process group, so a negative pid signals the group.
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

impl OmniRouteHost {
    async fn snapshot(&self) -> OmniRouteStatus {
        let mut inner = self.inner.lock().await;
        let mut managed = false;
        if let Some(child) = inner.child.as_mut() {
            match child.try_wait() {
                Ok(None) => managed = true,
                Ok(Some(status)) => {
                    let msg = format!("exit {}", status.code().map(|c| c.to_string()).unwrap_or_else(|| "?".into()));
                    inner.last_exit = Some(msg);
                    inner.child = None;
                    inner.pid = None;
                }
                Err(_) => managed = true,
            }
        }
        let start = inner.logs.len().saturating_sub(TAIL_LINES);
        OmniRouteStatus {
            managed,
            pid: inner.pid,
            port: OMNIROUTE_PORT,
            version: OMNIROUTE_VERSION,
            log_tail: inner.logs[start..].to_vec(),
            exited: if managed { None } else { inner.last_exit.clone() },
        }
    }

    /// Stops our own process tree if one is running. Used by the stop command and on app exit.
    pub async fn stop_blocking(&self) {
        let mut inner = self.inner.lock().await;
        if let Some(pid) = inner.pid.take() {
            kill_tree(pid);
        }
        if let Some(mut child) = inner.child.take() {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
        }
    }
}

#[tauri::command]
pub async fn omniroute_status(host: State<'_, OmniRouteHost>) -> Result<OmniRouteStatus, String> {
    Ok(host.snapshot().await)
}

#[tauri::command]
pub async fn omniroute_start(app: AppHandle, host: State<'_, OmniRouteHost>) -> Result<OmniRouteStatus, String> {
    if host.snapshot().await.managed {
        return Ok(host.snapshot().await);
    }

    let npx = runtime::ensure_npx(&app).await?;
    let mut cmd = Command::new(npx);
    cmd.args([
        "-y",
        &format!("omniroute@{OMNIROUTE_VERSION}"),
        "serve",
        "--no-open",
        "--no-tray",
        "--port",
        &OMNIROUTE_PORT.to_string(),
    ]);
    // Only this computer may reach it: the router has no real login by default.
    cmd.env("OMNIROUTE_SERVER_HOST", "127.0.0.1");
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    #[cfg(unix)]
    cmd.process_group(0);

    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start OmniRoute: {e}"))?;
    let pid = child.id();
    {
        let mut inner = host.inner.lock().await;
        inner.logs.clear();
        inner.last_exit = None;
        push_log(&mut inner, format!("Starting OmniRoute {OMNIROUTE_VERSION} (the first run downloads it)…"));
    }
    if let Some(out) = child.stdout.take() {
        pump_lines(out, host.inner.clone());
    }
    if let Some(err) = child.stderr.take() {
        pump_lines(err, host.inner.clone());
    }
    {
        let mut inner = host.inner.lock().await;
        inner.pid = pid;
        inner.child = Some(child);
    }
    Ok(host.snapshot().await)
}

#[tauri::command]
pub async fn omniroute_stop(host: State<'_, OmniRouteHost>) -> Result<OmniRouteStatus, String> {
    host.stop_blocking().await;
    let mut inner = host.inner.lock().await;
    inner.last_exit = None;
    drop(inner);
    Ok(host.snapshot().await)
}

#[derive(Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    pub body: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: serde_json::Value,
}

async fn sign_in(inner: &Arc<Mutex<Inner>>) -> Result<String, String> {
    let password = inner.lock().await.password.clone().unwrap_or_else(|| DEFAULT_PASSWORD.to_string());
    let resp = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{OMNIROUTE_PORT}/api/auth/login"))
        .json(&serde_json::json!({ "password": password }))
        .send()
        .await
        .map_err(|e| format!("OmniRoute isn't answering: {e}"))?;
    if !resp.status().is_success() {
        return Err("auth".into());
    }
    let cookie = resp
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .filter_map(|v| v.split(';').next())
        .collect::<Vec<_>>()
        .join("; ");
    inner.lock().await.cookie = Some(cookie.clone());
    Ok(cookie)
}

/// Calls OmniRoute's provider-management API (add / list / remove API keys) on the student's behalf.
/// Done here rather than in the webview because the API authenticates with a session cookie, which a
/// cross-origin `fetch` can't carry. Only `/api/providers…` paths are allowed. `Err("auth")` means the
/// dashboard password isn't the default any more.
#[tauri::command]
pub async fn omniroute_api(host: State<'_, OmniRouteHost>, request: ApiRequest) -> Result<ApiResponse, String> {
    if !request.path.starts_with("/api/providers") || request.path.contains("..") {
        return Err("path not allowed".into());
    }
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|e| e.to_string())?;
    let url = format!("http://127.0.0.1:{OMNIROUTE_PORT}{}", request.path);
    let client = reqwest::Client::new();

    for attempt in 0..2 {
        let stored = host.inner.lock().await.cookie.clone();
        let cookie = match stored {
            Some(c) if attempt == 0 => c,
            _ => sign_in(&host.inner).await?,
        };
        let mut builder = client.request(method.clone(), &url).header(reqwest::header::COOKIE, cookie);
        if let Some(body) = &request.body {
            builder = builder.json(body);
        }
        let resp = builder.send().await.map_err(|e| format!("OmniRoute isn't answering: {e}"))?;
        let status = resp.status().as_u16();
        if status == 401 && attempt == 0 {
            host.inner.lock().await.cookie = None;
            continue;
        }
        let text = resp.text().await.unwrap_or_default();
        let body = serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text));
        return Ok(ApiResponse { status, body });
    }
    Err("auth".into())
}

#[tauri::command]
pub async fn omniroute_set_password(host: State<'_, OmniRouteHost>, password: String) -> Result<(), String> {
    let mut inner = host.inner.lock().await;
    inner.password = Some(password);
    inner.cookie = None;
    Ok(())
}
