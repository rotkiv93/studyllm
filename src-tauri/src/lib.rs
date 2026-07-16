mod credentials;
mod db;
mod mcp;

use mcp::McpHost;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:studyllm.db", db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(McpHost::default())
        .invoke_handler(tauri::generate_handler![
            credentials::credentials_set,
            credentials::credentials_get,
            credentials::credentials_delete,
            mcp::commands::mcp_start_server,
            mcp::commands::mcp_start_remote_server,
            mcp::commands::mcp_stop_server,
            mcp::commands::mcp_is_server_running,
            mcp::commands::mcp_list_tools,
            mcp::commands::mcp_call_tool,
            mcp::registry::mcp_registry_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
