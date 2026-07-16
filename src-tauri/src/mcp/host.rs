use std::collections::HashMap;

use rmcp::RoleClient;
use rmcp::model::{CallToolRequestParam, Content, RawContent, ResourceContents, Tool};
use rmcp::service::{RunningService, ServiceExt};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{ConfigureCommandExt, StreamableHttpClientTransport, TokioChildProcess};
use serde::Serialize;
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
    pub async fn start(
        &self,
        id: String,
        npx_path: &std::path::Path,
        args: Vec<String>,
        extra_env: HashMap<String, String>,
    ) -> Result<Vec<McpToolInfo>, String> {
        {
            let running = self.running.lock().await;
            if let Some(server) = running.get(&id) {
                return Ok(server.tools.iter().map(McpToolInfo::from).collect());
            }
        }

        let npx_path = npx_path.to_path_buf();
        let command = Command::new(npx_path).configure(|cmd| {
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

        let transport = TokioChildProcess::new(command).map_err(|e| e.to_string())?;
        let service = ().serve(transport).await.map_err(|e| e.to_string())?;
        self.finish_start(id, service).await
    }

    /// Start (or reuse) a remote server over Streamable HTTP. `auth_header`, if given, is sent
    /// as a bearer token with every request — rmcp 0.9's client transport only supports a single
    /// authorization header, not arbitrary custom headers, so that's the extent of what a remote
    /// server's declared auth requirement can wire up today.
    pub async fn start_remote(
        &self,
        id: String,
        url: String,
        auth_header: Option<String>,
    ) -> Result<Vec<McpToolInfo>, String> {
        {
            let running = self.running.lock().await;
            if let Some(server) = running.get(&id) {
                return Ok(server.tools.iter().map(McpToolInfo::from).collect());
            }
        }

        let mut config = StreamableHttpClientTransportConfig::with_uri(url);
        if let Some(token) = auth_header {
            config = config.auth_header(token);
        }
        let transport = StreamableHttpClientTransport::from_config(config);
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
