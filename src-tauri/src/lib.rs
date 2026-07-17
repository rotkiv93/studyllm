mod crashlog;
mod credentials;
mod db;
mod mcp;

use crashlog::CrashLog;
use mcp::McpHost;
use tauri::Manager;

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
        .manage(CrashLog::default())
        .setup(|app| {
            let handle = app.handle().clone();
            std::panic::set_hook(Box::new(move |info| {
                handle.state::<CrashLog>().append(&handle, format!("PANIC: {info}"));
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            credentials::credentials_set,
            credentials::credentials_get,
            credentials::credentials_delete,
            crashlog::crash_log_read,
            crashlog::crash_log_clear,
            crashlog::crash_log_path,
            crashlog::crash_log_append,
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
