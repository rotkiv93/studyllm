use std::collections::HashMap;
use std::process::Stdio;

use rmcp::RoleClient;
use rmcp::model::{CallToolRequestParam, Content, RawContent, ResourceContents, Tool};
use rmcp::service::{RunningService, ServiceExt};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{ConfigureCommandExt, StreamableHttpClientTransport, TokioChildProcess};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::crashlog::CrashLog;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

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

pub struct RunningServer {
    service: RunningService<RoleClient, ()>,
    tools: Vec<Tool>,
}

#[derive(Default)]
pub struct McpHost {
    running: Mutex<HashMap<String, RunningServer>>,
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
                return Ok(server.tools.iter().map(McpToolInfo::from).collect());
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
                return Ok(server.tools.iter().map(McpToolInfo::from).collect());
            }
        }

        let mut config = StreamableHttpClientTransportConfig::with_uri(url);
        let mut extra_headers = reqwest::header::HeaderMap::new();
        for (name, value) in headers {
            if name.eq_ignore_ascii_case("authorization") {
                config = config.auth_header(value);
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
            RunningServer {
                service,
                tools: tools_result.tools,
            },
        );
        Ok(tool_infos)
    }

    pub async fn stop(&self, id: &str) -> Result<(), String> {
        let server = {
            let mut running = self.running.lock().await;
            running.remove(id)
        };
        if let Some(server) = server {
            server.service.cancel().await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn is_running(&self, id: &str) -> bool {
        self.running.lock().await.contains_key(id)
    }

    pub async fn list_tools(&self, id: &str) -> Result<Vec<McpToolInfo>, String> {
        let running = self.running.lock().await;
        let server = running
            .get(id)
            .ok_or_else(|| format!("MCP server '{id}' is not running"))?;
        Ok(server.tools.iter().map(McpToolInfo::from).collect())
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

        // Some MCP servers (e.g. the official filesystem server's zod schemas) reject a
        // JSON-RPC call whose `arguments` is missing/null for zero-parameter tools — they
        // require an explicit `{}`. Models frequently call such tools with no input at all,
        // which arrives here as `Value::Null`, so always forward an object, never `None`.
        let args_obj = Some(arguments.as_object().cloned().unwrap_or_default());
        let result = server
            .service
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
