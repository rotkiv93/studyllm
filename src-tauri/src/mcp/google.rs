//! Native, in-process Gmail/Drive tools that call the plain Gmail API v1 / Drive API v3 REST
//! endpoints directly, instead of Google's managed remote MCP servers
//! (`gmailmcp.googleapis.com` / `drivemcp.googleapis.com`). Those managed servers are gated
//! behind the Google Workspace Developer Preview Program, which requires an actual paid
//! Workspace account ("we cannot add service accounts to the program" — a personal `@gmail.com`
//! account is rejected outright) — confirmed by hitting them with a valid, correctly-scoped
//! token and getting `PERMISSION_DENIED: The caller does not have permission` back regardless.
//! The plain REST APIs need none of that: same OAuth consent screen, same scopes' intent
//! (narrowed to read-only here), just a different HTTPS host.
//!
//! Unlike a real MCP connection there is no persistent session to hold open — every call is a
//! one-shot HTTPS request carrying the current access token, so token refresh is just swapping a
//! string under a lock (`set_token`), with no reconnect/teardown involved.

use std::sync::Arc;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use reqwest::StatusCode;
use serde_json::{Value, json};
use tokio::sync::RwLock;

use super::host::{McpCallOutcome, McpToolInfo};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GoogleKind {
    Gmail,
    Drive,
}

impl GoogleKind {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "gmail" => Ok(GoogleKind::Gmail),
            "drive" => Ok(GoogleKind::Drive),
            other => Err(format!("Unknown Google connector kind '{other}'")),
        }
    }
}

pub struct NativeProvider {
    kind: GoogleKind,
    token: Arc<RwLock<String>>,
}

impl NativeProvider {
    pub fn new(kind: GoogleKind, token: String) -> Self {
        Self {
            kind,
            token: Arc::new(RwLock::new(token)),
        }
    }

    /// Swaps in a freshly-refreshed access token. No connection to tear down or reconnect — the
    /// next call just picks up the new value.
    pub async fn set_token(&self, token: String) {
        *self.token.write().await = token;
    }

    pub fn tools(&self) -> Vec<McpToolInfo> {
        match self.kind {
            GoogleKind::Gmail => gmail_tools(),
            GoogleKind::Drive => drive_tools(),
        }
    }

    pub async fn call(&self, name: &str, args: Value) -> Result<McpCallOutcome, String> {
        let token = self.token.read().await.clone();
        match self.kind {
            GoogleKind::Gmail => call_gmail_tool(&token, name, args).await,
            GoogleKind::Drive => call_drive_tool(&token, name, args).await,
        }
    }
}

fn get_str_arg(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing required argument '{key}'"))
}

fn get_opt_u32_arg(args: &Value, key: &str, default: u32) -> u32 {
    args.get(key)
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(default)
}

fn extract_google_error_message(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    v.get("error")?
        .get("message")?
        .as_str()
        .map(|s| s.to_string())
}

fn describe_google_error(body: &str, status: StatusCode) -> String {
    match extract_google_error_message(body) {
        Some(msg) => format!("Google API error ({status}): {msg}"),
        None => format!("Google API error ({status})"),
    }
}

fn find_header<'a>(headers: &'a [Value], name: &str) -> &'a str {
    headers
        .iter()
        .find(|h| {
            h.get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.eq_ignore_ascii_case(name))
                .unwrap_or(false)
        })
        .and_then(|h| h.get("value").and_then(|v| v.as_str()))
        .unwrap_or("(unknown)")
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

fn gmail_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "gmail_search_messages".to_string(),
            description: Some(
                "Search the user's Gmail using Gmail's search syntax (e.g. 'from:someone@example.com', \
                 'subject:invoice', 'is:unread'). Returns a short summary (from/subject/date/snippet) \
                 for each matching message."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Gmail search query, e.g. 'from:boss@example.com is:unread'" },
                    "max_results": { "type": "integer", "description": "Maximum number of messages to return (default 10, max 25)" }
                },
                "required": ["query"]
            }),
        },
        McpToolInfo {
            name: "gmail_get_message".to_string(),
            description: Some(
                "Fetch the full headers and plain-text body of a single Gmail message by its id \
                 (from gmail_search_messages)."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "message_id": { "type": "string", "description": "The Gmail message id" }
                },
                "required": ["message_id"]
            }),
        },
    ]
}

async fn call_gmail_tool(token: &str, name: &str, args: Value) -> Result<McpCallOutcome, String> {
    match name {
        "gmail_search_messages" => gmail_search_messages(token, args).await,
        "gmail_get_message" => gmail_get_message(token, args).await,
        other => Err(format!("Unknown Gmail tool '{other}'")),
    }
}

fn summarize_message_metadata(id: &str, meta: &Value) -> String {
    let headers = meta
        .pointer("/payload/headers")
        .and_then(|h| h.as_array())
        .cloned()
        .unwrap_or_default();
    let snippet = meta.get("snippet").and_then(|v| v.as_str()).unwrap_or("");
    format!(
        "id: {id}\nFrom: {}\nSubject: {}\nDate: {}\nSnippet: {snippet}",
        find_header(&headers, "From"),
        find_header(&headers, "Subject"),
        find_header(&headers, "Date"),
    )
}

async fn gmail_search_messages(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let query = get_str_arg(&args, "query")?;
    let max_results = get_opt_u32_arg(&args, "max_results", 10).clamp(1, 25);
    let client = reqwest::Client::new();

    let list_resp = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .bearer_auth(token)
        .query(&[("q", query.as_str()), ("maxResults", &max_results.to_string())])
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Gmail: {e}"))?;

    let status = list_resp.status();
    let text = list_resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Ok(McpCallOutcome {
            is_error: true,
            text: describe_google_error(&text, status),
        });
    }

    let parsed: Value =
        serde_json::from_str(&text).map_err(|e| format!("Unexpected Gmail response: {e}"))?;
    let ids: Vec<String> = parsed
        .get("messages")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|v| v.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if ids.is_empty() {
        return Ok(McpCallOutcome {
            is_error: false,
            text: "No messages matched that search.".to_string(),
        });
    }

    let mut lines = Vec::with_capacity(ids.len());
    for id in &ids {
        let meta_resp = client
            .get(format!(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}"
            ))
            .bearer_auth(token)
            .query(&[
                ("format", "metadata"),
                ("metadataHeaders", "Subject"),
                ("metadataHeaders", "From"),
                ("metadataHeaders", "Date"),
            ])
            .send()
            .await
            .map_err(|e| format!("Couldn't reach Gmail: {e}"))?;
        if !meta_resp.status().is_success() {
            // Best-effort summary — skip a message we couldn't describe rather than failing
            // the whole search over one bad row.
            continue;
        }
        let meta_json: Value = meta_resp.json().await.map_err(|e| e.to_string())?;
        lines.push(summarize_message_metadata(id, &meta_json));
    }

    Ok(McpCallOutcome {
        is_error: false,
        text: lines.join("\n\n"),
    })
}

/// Walks a Gmail message `payload` (or sub-`part`) looking for the first `text/plain` body,
/// base64url-decoding it. Pure/no network so it's directly unit-testable against canned
/// `messages.get` JSON fixtures.
fn extract_plain_text_body(payload: &Value) -> Option<String> {
    let mime_type = payload.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
    if mime_type.starts_with("text/plain") {
        if let Some(data) = payload
            .get("body")
            .and_then(|b| b.get("data"))
            .and_then(|d| d.as_str())
        {
            if let Ok(bytes) = URL_SAFE_NO_PAD.decode(data) {
                if let Ok(text) = String::from_utf8(bytes) {
                    return Some(text);
                }
            }
        }
    }

    let parts = payload.get("parts").and_then(|p| p.as_array())?;
    // Prefer a direct text/plain part at this level before recursing into nested multiparts
    // (e.g. multipart/alternative nested inside multipart/mixed).
    for part in parts {
        if part.get("mimeType").and_then(|m| m.as_str()) == Some("text/plain") {
            if let Some(text) = extract_plain_text_body(part) {
                return Some(text);
            }
        }
    }
    for part in parts {
        if let Some(text) = extract_plain_text_body(part) {
            return Some(text);
        }
    }
    None
}

async fn gmail_get_message(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let message_id = get_str_arg(&args, "message_id")?;
    let client = reqwest::Client::new();

    let resp = client
        .get(format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}"
        ))
        .bearer_auth(token)
        .query(&[("format", "full")])
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Gmail: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Ok(McpCallOutcome {
            is_error: true,
            text: describe_google_error(&text, status),
        });
    }

    let parsed: Value =
        serde_json::from_str(&text).map_err(|e| format!("Unexpected Gmail response: {e}"))?;
    let payload = parsed.get("payload").cloned().unwrap_or(Value::Null);
    let headers = payload
        .get("headers")
        .and_then(|h| h.as_array())
        .cloned()
        .unwrap_or_default();
    let body = extract_plain_text_body(&payload).unwrap_or_else(|| "(no plain-text body found)".to_string());

    Ok(McpCallOutcome {
        is_error: false,
        text: format!(
            "From: {}\nTo: {}\nSubject: {}\nDate: {}\n\n{}",
            find_header(&headers, "From"),
            find_header(&headers, "To"),
            find_header(&headers, "Subject"),
            find_header(&headers, "Date"),
            body,
        ),
    })
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

fn drive_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "drive_search_files".to_string(),
            description: Some(
                "Search the user's Google Drive files by name/content. Returns id/name/type/modified \
                 date for each match."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Plain-text search term to match against file name and content" },
                    "max_results": { "type": "integer", "description": "Maximum number of files to return (default 10, max 50)" }
                },
                "required": ["query"]
            }),
        },
        McpToolInfo {
            name: "drive_read_file".to_string(),
            description: Some(
                "Read the text content of a Google Drive file by its id (from drive_search_files). \
                 Google Docs/Sheets/Slides are exported as text; other file types are read directly, \
                 capped at ~200KB."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "file_id": { "type": "string", "description": "The Drive file id" }
                },
                "required": ["file_id"]
            }),
        },
    ]
}

async fn call_drive_tool(token: &str, name: &str, args: Value) -> Result<McpCallOutcome, String> {
    match name {
        "drive_search_files" => drive_search_files(token, args).await,
        "drive_read_file" => drive_read_file(token, args).await,
        other => Err(format!("Unknown Drive tool '{other}'")),
    }
}

/// Drive's query language wraps string literals in single quotes; escape backslashes and quotes
/// per https://developers.google.com/drive/api/guides/ref-search-terms.
fn escape_drive_query_literal(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

async fn drive_search_files(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let query = get_str_arg(&args, "query")?;
    let max_results = get_opt_u32_arg(&args, "max_results", 10).clamp(1, 50);
    let q = format!(
        "fullText contains '{}' and trashed = false",
        escape_drive_query_literal(&query)
    );

    let client = reqwest::Client::new();
    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .query(&[
            ("q", q.as_str()),
            ("pageSize", &max_results.to_string()),
            ("fields", "files(id,name,mimeType,modifiedTime)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Drive: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Ok(McpCallOutcome {
            is_error: true,
            text: describe_google_error(&text, status),
        });
    }

    let parsed: Value =
        serde_json::from_str(&text).map_err(|e| format!("Unexpected Drive response: {e}"))?;
    let files = parsed
        .get("files")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();

    if files.is_empty() {
        return Ok(McpCallOutcome {
            is_error: false,
            text: "No files matched that search.".to_string(),
        });
    }

    let lines: Vec<String> = files
        .iter()
        .map(|f| {
            format!(
                "id: {}\nname: {}\ntype: {}\nmodified: {}",
                f.get("id").and_then(|v| v.as_str()).unwrap_or("?"),
                f.get("name").and_then(|v| v.as_str()).unwrap_or("?"),
                f.get("mimeType").and_then(|v| v.as_str()).unwrap_or("?"),
                f.get("modifiedTime").and_then(|v| v.as_str()).unwrap_or("?"),
            )
        })
        .collect();

    Ok(McpCallOutcome {
        is_error: false,
        text: lines.join("\n\n"),
    })
}

fn is_google_native_doc(mime_type: &str) -> bool {
    mime_type.starts_with("application/vnd.google-apps.")
}

fn export_mime_type_for(mime_type: &str) -> &'static str {
    match mime_type {
        "application/vnd.google-apps.spreadsheet" => "text/csv",
        _ => "text/plain",
    }
}

/// Caps how much of a Drive file's content gets pulled into the model's context.
const MAX_DRIVE_READ_BYTES: usize = 200_000;

async fn drive_read_file(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let file_id = get_str_arg(&args, "file_id")?;
    let client = reqwest::Client::new();

    let meta_resp = client
        .get(format!("https://www.googleapis.com/drive/v3/files/{file_id}"))
        .bearer_auth(token)
        .query(&[("fields", "id,name,mimeType")])
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Drive: {e}"))?;
    let meta_status = meta_resp.status();
    let meta_text = meta_resp.text().await.map_err(|e| e.to_string())?;
    if !meta_status.is_success() {
        return Ok(McpCallOutcome {
            is_error: true,
            text: describe_google_error(&meta_text, meta_status),
        });
    }
    let meta: Value =
        serde_json::from_str(&meta_text).map_err(|e| format!("Unexpected Drive response: {e}"))?;
    let mime_type = meta.get("mimeType").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let name = meta
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&file_id)
        .to_string();

    let content_resp = if is_google_native_doc(&mime_type) {
        client
            .get(format!(
                "https://www.googleapis.com/drive/v3/files/{file_id}/export"
            ))
            .bearer_auth(token)
            .query(&[("mimeType", export_mime_type_for(&mime_type))])
            .send()
            .await
    } else {
        client
            .get(format!("https://www.googleapis.com/drive/v3/files/{file_id}"))
            .bearer_auth(token)
            .query(&[("alt", "media")])
            .send()
            .await
    }
    .map_err(|e| format!("Couldn't reach Drive: {e}"))?;

    let content_status = content_resp.status();
    let bytes = content_resp.bytes().await.map_err(|e| e.to_string())?;
    if !content_status.is_success() {
        let text = String::from_utf8_lossy(&bytes).into_owned();
        return Ok(McpCallOutcome {
            is_error: true,
            text: describe_google_error(&text, content_status),
        });
    }

    let truncated = bytes.len() > MAX_DRIVE_READ_BYTES;
    let slice = &bytes[..bytes.len().min(MAX_DRIVE_READ_BYTES)];
    let text = String::from_utf8_lossy(slice).into_owned();
    let suffix = if truncated { "\n\n[...truncated]" } else { "" };

    Ok(McpCallOutcome {
        is_error: false,
        text: format!("# {name}\n\n{text}{suffix}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_parses_known_values() {
        assert_eq!(GoogleKind::parse("gmail"), Ok(GoogleKind::Gmail));
        assert_eq!(GoogleKind::parse("drive"), Ok(GoogleKind::Drive));
        assert!(GoogleKind::parse("calendar").is_err());
    }

    #[test]
    fn extracts_plain_text_from_simple_message() {
        let data = URL_SAFE_NO_PAD.encode("hello world");
        let payload = json!({
            "mimeType": "text/plain",
            "body": { "data": data }
        });
        assert_eq!(extract_plain_text_body(&payload).as_deref(), Some("hello world"));
    }

    #[test]
    fn extracts_plain_text_from_multipart_alternative() {
        let plain = URL_SAFE_NO_PAD.encode("plain body");
        let html = URL_SAFE_NO_PAD.encode("<p>html body</p>");
        let payload = json!({
            "mimeType": "multipart/alternative",
            "parts": [
                { "mimeType": "text/html", "body": { "data": html } },
                { "mimeType": "text/plain", "body": { "data": plain } }
            ]
        });
        assert_eq!(extract_plain_text_body(&payload).as_deref(), Some("plain body"));
    }

    #[test]
    fn extracts_plain_text_from_nested_multipart_mixed() {
        let plain = URL_SAFE_NO_PAD.encode("nested body");
        let payload = json!({
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        { "mimeType": "text/plain", "body": { "data": plain } }
                    ]
                },
                { "mimeType": "application/pdf", "filename": "att.pdf" }
            ]
        });
        assert_eq!(extract_plain_text_body(&payload).as_deref(), Some("nested body"));
    }

    #[test]
    fn returns_none_when_no_plain_text_part_exists() {
        let html = URL_SAFE_NO_PAD.encode("<p>only html</p>");
        let payload = json!({
            "mimeType": "multipart/alternative",
            "parts": [{ "mimeType": "text/html", "body": { "data": html } }]
        });
        assert_eq!(extract_plain_text_body(&payload), None);
    }

    #[test]
    fn native_google_doc_types_are_detected() {
        assert!(is_google_native_doc("application/vnd.google-apps.document"));
        assert!(is_google_native_doc("application/vnd.google-apps.spreadsheet"));
        assert!(!is_google_native_doc("application/pdf"));
        assert!(!is_google_native_doc("text/plain"));
    }

    #[test]
    fn spreadsheet_exports_as_csv_others_as_plain_text() {
        assert_eq!(
            export_mime_type_for("application/vnd.google-apps.spreadsheet"),
            "text/csv"
        );
        assert_eq!(
            export_mime_type_for("application/vnd.google-apps.document"),
            "text/plain"
        );
    }

    #[test]
    fn extracts_google_error_message_from_error_envelope() {
        let body = json!({ "error": { "code": 403, "message": "The caller does not have permission" } })
            .to_string();
        assert_eq!(
            extract_google_error_message(&body).as_deref(),
            Some("The caller does not have permission")
        );
    }

    #[test]
    fn extract_google_error_message_is_none_for_non_json() {
        assert_eq!(extract_google_error_message("not json"), None);
    }

    #[test]
    fn drive_query_literal_escapes_quotes_and_backslashes() {
        assert_eq!(escape_drive_query_literal(r"o'brien"), r"o\'brien");
        assert_eq!(escape_drive_query_literal(r"a\b"), r"a\\b");
    }
}
