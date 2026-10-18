mod crashlog;
mod credentials;
mod db;
mod export;
mod mcp;
mod oauth;
mod omniroute;

use crashlog::CrashLog;
use mcp::McpHost;
use omniroute::OmniRouteHost;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Self-update is desktop-only; the plugins don't exist on mobile targets.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:studyllm.db", db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(McpHost::default())
        .manage(CrashLog::default())
        .manage(OmniRouteHost::default())
        .setup(|app| {
            let handle = app.handle().clone();
            std::panic::set_hook(Box::new(move |info| {
                handle
                    .state::<CrashLog>()
                    .append(&handle, format!("PANIC: {info}"));
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            credentials::credentials_set,
            credentials::credentials_get,
            credentials::credentials_delete,
            export::save_export_file,
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
            oauth::commands::oauth_connect,
            oauth::commands::oauth_reconnect,
            omniroute::omniroute_status,
            omniroute::omniroute_start,
            omniroute::omniroute_stop,
            omniroute::omniroute_api,
            omniroute::omniroute_set_password,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Don't leave a router we started holding the port after the app closes.
            if let tauri::RunEvent::Exit = event {
                let host = app.state::<OmniRouteHost>().inner().clone();
                tauri::async_runtime::block_on(host.stop_blocking());
            }
        });
}
