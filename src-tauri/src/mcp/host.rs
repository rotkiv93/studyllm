use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rmcp::RoleClient;
use rmcp::model::{CallToolRequestParam, Content, RawContent, ResourceContents, Tool};
use rmcp::service::{RunningService, ServiceExt};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{ConfigureCommandExt, StreamableHttpClientTransport, TokioChildProcess};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::crashlog::CrashLog;
use crate::credentials;
use crate::oauth;
use super::google::NativeProvider;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::sleep;

/// Environment variables an MCP child process gets even when the server's own
/// `required_env` doesn't mention them — just enough for `npx`/Node to function
/// (especially on Windows, which breaks in obscure ways without `SystemRoot`).
/// Everything else from the parent process's env is deliberately withheld.
const INHERITED_ENV_KEYS: &[&str] = &[
    "PATH",
    "SystemRoot",
    "windir",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
];

pub enum RunningServer {
    Remote {
        service: RunningService<RoleClient, ()>,
        tools: Vec<Tool>,
    },
    /// In-process tool provider (currently just Gmail/Drive REST wrappers) — no live connection
    /// to hold open, so there's nothing for `cancel_connection` to tear down and nothing for the
    /// refresh loop to reconnect; a token refresh is just `NativeProvider::set_token`.
    Native {
        provider: NativeProvider,
    },
}

impl RunningServer {
    fn tool_infos(&self) -> Vec<McpToolInfo> {
        match self {
            RunningServer::Remote { tools, .. } => tools.iter().map(McpToolInfo::from).collect(),
            RunningServer::Native { provider } => provider.tools(),
        }
    }
}

#[derive(Default)]
pub struct McpHost {
    running: Mutex<HashMap<String, RunningServer>>,
    /// Background token-refresh loops for OAuth-backed remote servers, keyed by server id.
    /// `stop(id)` aborts and removes the entry here so a disconnected/removed server can never
    /// keep silently refreshing in the background.
    refresh_tasks: Mutex<HashMap<String, JoinHandle<()>>>,
}

/// Everything an OAuth token-refresh loop needs to keep a native provider's token fresh: when the
/// current access token expires (epoch ms) and which keychain refs to read/write. Constructed by
/// `oauth::commands::oauth_connect`/`oauth_reconnect` right after a successful token exchange.
/// Only native providers currently get OAuth treatment (Google's managed remote MCP servers
/// aren't reachable from a personal account — see `mcp::google`), so there's nothing here about
/// *where* to apply a refreshed token beyond the server `id` already passed to the refresh loop.
pub struct RefreshContext {
    pub expires_at: i64,
    pub access_ref: String,
    pub refresh_ref: String,
}

/// Refresh a bit before the access token actually expires, to tolerate clock skew and the time
/// the reconnect itself takes.
const REFRESH_MARGIN_MS: i64 = 5 * 60 * 1000;
/// Never schedule a refresh sooner than this — a token that's already near-expired when we start
/// watching it still gets one prompt refresh instead of spinning in a near-zero-delay loop.
const MIN_SLEEP_MS: i64 = 5_000;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Sleeps until shortly before `ctx.expires_at`, refreshes the Google access token, persists it
/// (and a rotated refresh token, if Google sent one — it usually doesn't, so the existing one
/// must never be overwritten with `None`), then tears down and re-establishes the remote MCP
/// connection with the fresh bearer header. Runs until a hard failure (revoked grant, missing
/// refresh token) or the server is stopped out from under it via `McpHost::stop`.
async fn run_oauth_refresh_loop(app: AppHandle, id: String, mut ctx: RefreshContext) {
    loop {
        let now = now_millis();
        let wake_at = (ctx.expires_at - REFRESH_MARGIN_MS).max(now + MIN_SLEEP_MS);
        sleep(Duration::from_millis((wake_at - now).max(MIN_SLEEP_MS) as u64)).await;

        let refresh_token = match credentials::load(&ctx.refresh_ref) {
            Ok(Some(token)) => token,
            _ => {
                super::commands::emit_status(
                    &app,
                    &id,
                    "error",
                    Some("Google sign-in expired and no refresh token was found \u{2014} reconnect from Plugins.".to_string()),
                );
                app.state::<McpHost>().clear_refresh_task_entry(&id).await;
                return;
            }
        };

        let tokens = match oauth::flow::refresh_access_token(&refresh_token).await {
            Ok(tokens) => tokens,
            Err(e) => {
                let message = if e.contains("invalid_grant") {
                    "Google access was revoked \u{2014} reconnect from Plugins.".to_string()
                } else {
                    format!("Couldn't refresh Google access: {e}")
                };
                super::commands::emit_status(&app, &id, "error", Some(message));
                app.state::<McpHost>().clear_refresh_task_entry(&id).await;
                return;
            }
        };

        let _ = credentials::store(&ctx.access_ref, &tokens.access_token);
        if let Some(new_refresh_token) = &tokens.refresh_token {
            let _ = credentials::store(&ctx.refresh_ref, new_refresh_token);
        }

        let host = app.state::<McpHost>();
        if let Err(e) = host.update_native_token(&id, tokens.access_token.clone()).await {
            super::commands::emit_status(&app, &id, "error", Some(e));
            host.clear_refresh_task_entry(&id).await;
            return;
        }
        super::commands::emit_status(&app, &id, "running", None);
        ctx.expires_at = now_millis() + tokens.expires_in * 1000;
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallOutcome {
    pub is_error: bool,
    pub text: String,
}

impl From<&Tool> for McpToolInfo {
    fn from(t: &Tool) -> Self {
        McpToolInfo {
            name: t.name.to_string(),
            description: t.description.as_ref().map(|d| d.to_string()),
            input_schema: serde_json::to_value(&*t.input_schema).unwrap_or_else(|_| serde_json::json!({})),
        }
    }
}

/// Forward a child process's stderr line-by-line to the frontend as `mcp://server-log` events,
/// instead of leaving it inherited into the terminal (invisible in a packaged build).
fn spawn_stderr_forwarder(app: AppHandle, id: String, stderr: tokio::process::ChildStderr) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    app.state::<CrashLog>().append(&app, format!("mcp[{id}] {line}"));
                    let _ = app.emit("mcp://server-log", serde_json::json!({ "id": id, "line": line }));
                }
                _ => break,
            }
        }
    });
}

fn content_to_text(content: &Content) -> String {
    match &content.raw {
        RawContent::Text(t) => t.text.clone(),
        RawContent::Image(_) => "[image content]".to_string(),
        RawContent::Audio(_) => "[audio content]".to_string(),
        RawContent::Resource(r) => match &r.resource {
            ResourceContents::TextResourceContents { text, .. } => text.clone(),
            _ => String::new(),
        },
        RawContent::ResourceLink(link) => format!("[resource link: {}]", link.name),
    }
}

impl McpHost {
    /// Start (or reuse) a server identified by `id`, spawning `npx_path` with `args`.
    /// `extra_env` (the server's declared `required_env`) is layered on top of a minimal,
    /// explicit env allowlist — not the full parent environment.
    /// `binary_path` is whichever launcher this server needs — `npx` for npm-published
    /// packages, `uvx` for PyPI-published ones. Both are spawned identically from here.
    pub async fn start(
        &self,
        app: &AppHandle,
        id: String,
        binary_path: &std::path::Path,
        args: Vec<String>,
        extra_env: HashMap<String, String>,
    ) -> Result<Vec<McpToolInfo>, String> {
        {
            let running = self.running.lock().await;
            if let Some(server) = running.get(&id) {
                return Ok(server.tool_infos());
            }
        }

        let binary_path = binary_path.to_path_buf();
        let command = Command::new(binary_path).configure(|cmd| {
            cmd.args(&args);
            cmd.env_clear();
            for key in INHERITED_ENV_KEYS {
                if let Ok(val) = std::env::var(key) {
                    cmd.env(key, val);
                }
            }
            for (k, v) in &extra_env {
                cmd.env(k, v);
            }
        });

        let (transport, stderr) = TokioChildProcess::builder(command)
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stderr) = stderr {
            spawn_stderr_forwarder(app.clone(), id.clone(), stderr);
        }
        let service = ().serve(transport).await.map_err(|e| e.to_string())?;
        self.finish_start(id, service).await
    }

    /// Start (or reuse) a remote server over Streamable HTTP. `headers` is the full set of
    /// resolved secrets/values the registry declared for this server, keyed by literal HTTP
    /// header name. A header named `Authorization` (case-insensitive) is sent as a bearer token
    /// via rmcp's `auth_header` config (matches the "Bearer <token>" convention most remote MCP
    /// servers expect); every other header name is sent verbatim via a custom `reqwest::Client`
    /// with those defaults baked in — `reqwest::Client` already implements rmcp's
    /// `StreamableHttpClient` trait and is what `StreamableHttpClientTransportConfig` uses
    /// internally, so this needs no rmcp changes, just constructing our own client instead of
    /// the default one. This is what actually lifts the old "only one auth header" limitation.
    pub async fn start_remote(
        &self,
        id: String,
        url: String,
        headers: HashMap<String, String>,
    ) -> Result<Vec<McpToolInfo>, String> {
        {
            let running = self.running.lock().await;
            if let Some(server) = running.get(&id) {
                return Ok(server.tool_infos());
            }
        }

        let mut config = StreamableHttpClientTransportConfig::with_uri(url);
        let mut extra_headers = reqwest::header::HeaderMap::new();
        for (name, value) in headers {
            if name.eq_ignore_ascii_case("authorization") {
                // rmcp's `auth_header` wants a bare bearer token and prepends "Bearer " itself
                // internally (it calls reqwest's `bearer_auth`); our `headers` map always carries
                // the full literal header value (e.g. "Bearer <token>") like every other header,
                // so strip the prefix here or the request goes out as "Bearer Bearer <token>".
                let token = value
                    .strip_prefix("Bearer ")
                    .or_else(|| value.strip_prefix("bearer "))
                    .unwrap_or(&value);
                config = config.auth_header(token);
                continue;
            }
            let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
                .map_err(|e| format!("Invalid header name '{name}': {e}"))?;
            let header_value = reqwest::header::HeaderValue::from_str(&value)
                .map_err(|e| format!("Invalid value for header '{name}': {e}"))?;
            extra_headers.insert(header_name, header_value);
        }

        let client = if extra_headers.is_empty() {
            reqwest::Client::default()
        } else {
            reqwest::Client::builder()
                .default_headers(extra_headers)
                .build()
                .map_err(|e| e.to_string())?
        };

        let transport = StreamableHttpClientTransport::with_client(client, config);
        let service = ().serve(transport).await.map_err(|e| e.to_string())?;
        self.finish_start(id, service).await
    }

    async fn finish_start(
        &self,
        id: String,
        service: RunningService<RoleClient, ()>,
    ) -> Result<Vec<McpToolInfo>, String> {
        let tools_result = service
            .list_tools(Default::default())
            .await
            .map_err(|e| e.to_string())?;
        let tool_infos: Vec<McpToolInfo> = tools_result.tools.iter().map(McpToolInfo::from).collect();

        let mut running = self.running.lock().await;
        running.insert(
            id,
            RunningServer::Remote {
                service,
                tools: tools_result.tools,
            },
        );
        Ok(tool_infos)
    }

    /// Start (or reuse) a native, in-process tool provider (currently Gmail/Drive REST wrappers)
    /// — no network round trip needed to list its (static) tools, unlike a real MCP `initialize`.
    pub async fn start_native(
        &self,
        id: String,
        provider: NativeProvider,
    ) -> Result<Vec<McpToolInfo>, String> {
        {
            let running = self.running.lock().await;
            if let Some(server) = running.get(&id) {
                return Ok(server.tool_infos());
            }
        }

        let tools = provider.tools();
        let mut running = self.running.lock().await;
        running.insert(id, RunningServer::Native { provider });
        Ok(tools)
    }

    /// Swaps a freshly-refreshed access token into a running native provider in place — no
    /// cancel/reconnect involved, unlike a remote MCP connection's refresh cycle.
    pub async fn update_native_token(&self, id: &str, token: String) -> Result<(), String> {
        let running = self.running.lock().await;
        match running.get(id) {
            Some(RunningServer::Native { provider }) => {
                provider.set_token(token).await;
                Ok(())
            }
            Some(RunningServer::Remote { .. }) => {
                Err(format!("MCP server '{id}' is not a native connection"))
            }
            None => Err(format!("MCP server '{id}' is not running")),
        }
    }

    pub async fn stop(&self, id: &str) -> Result<(), String> {
        if let Some(handle) = self.refresh_tasks.lock().await.remove(id) {
            handle.abort();
        }
        self.cancel_connection(id).await
    }

    /// Tears down the live connection only, leaving `refresh_tasks` untouched — used internally
    /// by the refresh loop's own stop-then-reconnect cycle, where aborting `refresh_tasks[id]`
    /// would self-cancel the very task making the call. User/UI-initiated stops must go through
    /// `stop()` instead, which also cancels any refresh loop. A native provider has no live
    /// connection to tear down — removing it from the map is enough.
    async fn cancel_connection(&self, id: &str) -> Result<(), String> {
        let server = {
            let mut running = self.running.lock().await;
            running.remove(id)
        };
        if let Some(RunningServer::Remote { service, .. }) = server {
            service.cancel().await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Starts a background loop that keeps an OAuth-backed remote connection's access token
    /// fresh, reconnecting with a new bearer header shortly before each expiry. Opt-in — only
    /// called by `oauth::commands` right after a successful connect/reconnect; ordinary
    /// static-token remote servers are untouched.
    pub async fn spawn_oauth_refresh(&self, app: AppHandle, id: String, ctx: RefreshContext) {
        let task_id = id.clone();
        let handle = tokio::spawn(run_oauth_refresh_loop(app, task_id, ctx));
        self.refresh_tasks.lock().await.insert(id, handle);
    }

    async fn clear_refresh_task_entry(&self, id: &str) {
        self.refresh_tasks.lock().await.remove(id);
    }

    pub async fn is_running(&self, id: &str) -> bool {
        self.running.lock().await.contains_key(id)
    }

    pub async fn list_tools(&self, id: &str) -> Result<Vec<McpToolInfo>, String> {
        let running = self.running.lock().await;
        let server = running
            .get(id)
            .ok_or_else(|| format!("MCP server '{id}' is not running"))?;
        Ok(server.tool_infos())
    }

    pub async fn call_tool(
        &self,
        id: &str,
        tool_name: String,
        arguments: serde_json::Value,
    ) -> Result<McpCallOutcome, String> {
        let running = self.running.lock().await;
        let server = running
            .get(id)
            .ok_or_else(|| format!("MCP server '{id}' is not running"))?;

        match server {
            RunningServer::Native { provider } => provider.call(&tool_name, arguments).await,
            RunningServer::Remote { service, .. } => {
                // Some MCP servers (e.g. the official filesystem server's zod schemas) reject a
                // JSON-RPC call whose `arguments` is missing/null for zero-parameter tools — they
                // require an explicit `{}`. Models frequently call such tools with no input at
                // all, which arrives here as `Value::Null`, so always forward an object, never
                // `None`.
                let args_obj = Some(arguments.as_object().cloned().unwrap_or_default());
                let result = service
                    .call_tool(CallToolRequestParam {
                        name: tool_name.into(),
                        arguments: args_obj,
                    })
                    .await
                    .map_err(|e| e.to_string())?;

                let text = result
                    .content
                    .iter()
                    .map(content_to_text)
                    .collect::<Vec<_>>()
                    .join("\n");

                Ok(McpCallOutcome {
                    is_error: result.is_error.unwrap_or(false),
                    text,
                })
            }
        }
    }
}
