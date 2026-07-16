use std::collections::HashMap;

use tauri::{AppHandle, Emitter, State};

use super::host::{McpCallOutcome, McpHost, McpToolInfo};
use super::runtime;

fn emit_status(app: &AppHandle, id: &str, status: &str, message: Option<String>) {
    let _ = app.emit(
        "mcp://server-status-changed",
        serde_json::json!({ "id": id, "status": status, "message": message }),
    );
}

#[tauri::command]
pub async fn mcp_start_server(
    app: AppHandle,
    host: State<'_, McpHost>,
    id: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<Vec<McpToolInfo>, String> {
    emit_status(&app, &id, "starting", None);

    let npx = match runtime::ensure_npx(&app).await {
        Ok(path) => path,
        Err(e) => {
            emit_status(&app, &id, "error", Some(e.clone()));
            return Err(e);
        }
    };

    match host.start(id.clone(), &npx, args, env).await {
        Ok(tools) => {
            emit_status(&app, &id, "running", None);
            Ok(tools)
        }
        Err(e) => {
            emit_status(&app, &id, "error", Some(e.clone()));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn mcp_start_remote_server(
    app: AppHandle,
    host: State<'_, McpHost>,
    id: String,
    url: String,
    auth_header: Option<String>,
) -> Result<Vec<McpToolInfo>, String> {
    emit_status(&app, &id, "starting", None);

    match host.start_remote(id.clone(), url, auth_header).await {
        Ok(tools) => {
            emit_status(&app, &id, "running", None);
            Ok(tools)
        }
        Err(e) => {
            emit_status(&app, &id, "error", Some(e.clone()));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn mcp_stop_server(
    app: AppHandle,
    host: State<'_, McpHost>,
    id: String,
) -> Result<(), String> {
    host.stop(&id).await?;
    emit_status(&app, &id, "stopped", None);
    Ok(())
}

#[tauri::command]
pub async fn mcp_is_server_running(host: State<'_, McpHost>, id: String) -> Result<bool, String> {
    Ok(host.is_running(&id).await)
}

#[tauri::command]
pub async fn mcp_list_tools(
    host: State<'_, McpHost>,
    id: String,
) -> Result<Vec<McpToolInfo>, String> {
    host.list_tools(&id).await
}

#[tauri::command]
pub async fn mcp_call_tool(
    host: State<'_, McpHost>,
    id: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<McpCallOutcome, String> {
    host.call_tool(&id, tool_name, arguments).await
}
