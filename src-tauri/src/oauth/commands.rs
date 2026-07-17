use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

use crate::credentials;
use crate::mcp::google::{GoogleKind, NativeProvider};
use crate::mcp::host::{McpHost, McpToolInfo, RefreshContext};

use super::{config, flow};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTarget {
    server_id: String,
    /// "gmail" or "drive" — which native tool provider to start (see `mcp::google::GoogleKind`).
    provider: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthConnectResult {
    server_id: String,
    tools: Vec<McpToolInfo>,
    expires_at: i64,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_progress(app: &AppHandle, connector_id: &str, phase: &str, message: Option<String>) {
    let _ = app.emit(
        "oauth://progress",
        serde_json::json!({ "connectorId": connector_id, "phase": phase, "message": message }),
    );
}

fn access_ref_for(server_id: &str) -> String {
    format!("mcp:{server_id}:oauth_access")
}

fn refresh_ref_for(server_id: &str) -> String {
    format!("mcp:{server_id}:oauth_refresh")
}

fn describe_refresh_error(e: String) -> String {
    if e.contains("invalid_grant") {
        "Google access was revoked \u{2014} reconnect from Plugins.".to_string()
    } else {
        format!("Couldn't reconnect to Google: {e}")
    }
}

/// Drives one full "Connect Google Account" click: PKCE + loopback consent flow, then fans the
/// resulting token pair out to every requested target (e.g. Gmail and Drive), starting each as a
/// live remote MCP connection with its own background refresh loop. One consent screen, N
/// resulting `mcp_servers` rows — the frontend is the one that turns each `OAuthConnectResult`
/// into a DB row (mirrors how `handleInstallFromCatalog` already owns DB writes for marketplace
/// installs; this command only does network/keychain/process work).
#[tauri::command]
pub async fn oauth_connect(
    app: AppHandle,
    host: State<'_, McpHost>,
    connector_id: String,
    scopes: Vec<String>,
    targets: Vec<OAuthTarget>,
) -> Result<Vec<OAuthConnectResult>, String> {
    if !config::is_configured() {
        return Err("Google sign-in isn't set up yet \u{2014} contact the app maintainer.".to_string());
    }
    if targets.is_empty() {
        return Err("No connection targets were provided.".to_string());
    }

    emit_progress(&app, &connector_id, "opening-browser", None);

    let (verifier, challenge) = flow::generate_pkce_pair();
    let state = flow::generate_state();
    let (listener, port) = flow::bind_loopback_listener().await?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let authorize_url = flow::build_authorize_url(&scopes, &redirect_uri, &state, &challenge)?;

    if let Err(e) = app.opener().open_url(authorize_url, None::<String>) {
        let message = format!("Couldn't open your browser: {e}");
        emit_progress(&app, &connector_id, "error", Some(message.clone()));
        return Err(message);
    }

    emit_progress(&app, &connector_id, "waiting", None);
    let code = match flow::await_redirect(listener, &state).await {
        Ok(code) => code,
        Err(e) => {
            emit_progress(&app, &connector_id, "error", Some(e.clone()));
            return Err(e);
        }
    };

    emit_progress(&app, &connector_id, "exchanging", None);
    let tokens = match flow::exchange_code(&code, &verifier, &redirect_uri).await {
        Ok(tokens) => tokens,
        Err(e) => {
            emit_progress(&app, &connector_id, "error", Some(e.clone()));
            return Err(e);
        }
    };

    let refresh_token = match &tokens.refresh_token {
        Some(t) => t.clone(),
        None => {
            let message = "Google didn't grant a long-lived connection. If you've connected StudyLLM before, remove its access from your Google Account's \u{201c}Third-party apps\u{201d} settings and try again.".to_string();
            emit_progress(&app, &connector_id, "error", Some(message.clone()));
            return Err(message);
        }
    };

    let expires_at = now_millis() + tokens.expires_in * 1000;
    let mut results = Vec::with_capacity(targets.len());

    for target in targets {
        let access_ref = access_ref_for(&target.server_id);
        let refresh_ref = refresh_ref_for(&target.server_id);
        credentials::store(&access_ref, &tokens.access_token)?;
        credentials::store(&refresh_ref, &refresh_token)?;

        let kind = match GoogleKind::parse(&target.provider) {
            Ok(kind) => kind,
            Err(e) => {
                emit_progress(&app, &connector_id, "error", Some(e.clone()));
                return Err(e);
            }
        };
        let provider = NativeProvider::new(kind, tokens.access_token.clone());
        let tools = match host.start_native(target.server_id.clone(), provider).await {
            Ok(tools) => tools,
            Err(e) => {
                emit_progress(&app, &connector_id, "error", Some(e.clone()));
                return Err(e);
            }
        };

        host.spawn_oauth_refresh(
            app.clone(),
            target.server_id.clone(),
            RefreshContext {
                expires_at,
                access_ref,
                refresh_ref,
            },
        )
        .await;

        results.push(OAuthConnectResult {
            server_id: target.server_id,
            tools,
            expires_at,
        });
    }

    emit_progress(&app, &connector_id, "connected", None);
    Ok(results)
}

/// Silent reconnect for an already-connected OAuth row — used on app-launch autostart, since the
/// previous process's refresh timer died with it. Always refreshes unconditionally rather than
/// trusting a locally-cached `expires_at` across restarts/sleep.
#[tauri::command]
pub async fn oauth_reconnect(
    app: AppHandle,
    host: State<'_, McpHost>,
    server_id: String,
    provider: String,
) -> Result<OAuthConnectResult, String> {
    let access_ref = access_ref_for(&server_id);
    let refresh_ref = refresh_ref_for(&server_id);

    let refresh_token = credentials::load(&refresh_ref)?.ok_or_else(|| {
        "No saved Google connection was found \u{2014} reconnect from Plugins.".to_string()
    })?;

    let tokens = flow::refresh_access_token(&refresh_token)
        .await
        .map_err(describe_refresh_error)?;

    credentials::store(&access_ref, &tokens.access_token)?;
    if let Some(new_refresh_token) = &tokens.refresh_token {
        credentials::store(&refresh_ref, new_refresh_token)?;
    }

    let kind = GoogleKind::parse(&provider)?;
    let native_provider = NativeProvider::new(kind, tokens.access_token.clone());
    let tools = host.start_native(server_id.clone(), native_provider).await?;

    let expires_at = now_millis() + tokens.expires_in * 1000;
    host.spawn_oauth_refresh(
        app,
        server_id.clone(),
        RefreshContext {
            expires_at,
            access_ref,
            refresh_ref,
        },
    )
    .await;

    Ok(OAuthConnectResult {
        server_id,
        tools,
        expires_at,
    })
}
