//! Native, in-process Gmail/Drive tools that call the plain Gmail API v1 / Drive API v3 REST
//! endpoints directly, instead of Google's managed remote MCP servers
//! (`gmailmcp.googleapis.com` / `drivemcp.googleapis.com`). Those managed servers are gated
//! behind the Google Workspace Developer Preview Program, which requires an actual paid
//! Workspace account ("we cannot add service accounts to the program" — a personal `@gmail.com`
//! account is rejected outright) — confirmed by hitting them with a valid, correctly-scoped
//! token and getting `PERMISSION_DENIED: The caller does not have permission` back regardless.
//! The plain REST APIs need none of that: same OAuth consent screen, same scopes' intent, just a
//! different HTTPS host. This module now spans the full read+write surface — Gmail (search/read,
//! labels, drafts, send, trash), Calendar, Tasks, Docs, and Sheets — not just the original
//! read-only Gmail/Drive pair.
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
    Calendar,
    Tasks,
    Docs,
    Sheets,
}

impl GoogleKind {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "gmail" => Ok(GoogleKind::Gmail),
            "drive" => Ok(GoogleKind::Drive),
            "calendar" => Ok(GoogleKind::Calendar),
            "tasks" => Ok(GoogleKind::Tasks),
            "docs" => Ok(GoogleKind::Docs),
            "sheets" => Ok(GoogleKind::Sheets),
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
            GoogleKind::Calendar => calendar_tools(),
            GoogleKind::Tasks => tasks_tools(),
            GoogleKind::Docs => docs_tools(),
            GoogleKind::Sheets => sheets_tools(),
        }
    }

    pub async fn call(&self, name: &str, args: Value) -> Result<McpCallOutcome, String> {
        let token = self.token.read().await.clone();
        match self.kind {
            GoogleKind::Gmail => call_gmail_tool(&token, name, args).await,
            GoogleKind::Drive => call_drive_tool(&token, name, args).await,
            GoogleKind::Calendar => call_calendar_tool(&token, name, args).await,
            GoogleKind::Tasks => call_tasks_tool(&token, name, args).await,
            GoogleKind::Docs => call_docs_tool(&token, name, args).await,
            GoogleKind::Sheets => call_sheets_tool(&token, name, args).await,
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

fn get_opt_str_arg(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Either a hard transport failure (no HTTP response — surfaces as `Err(String)` so the caller's
/// `?` bubbles it up) or a Google 4xx/5xx that the model can react to (a soft
/// `McpCallOutcome{is_error:true}`). Keeps the "transport = hard error, HTTP status = soft error"
/// contract the original two tools established.
enum ApiError {
    Transport(String),
    Http(McpCallOutcome),
}

impl ApiError {
    /// Collapse into the `Result<McpCallOutcome, String>` every tool returns.
    fn into_result(self) -> Result<McpCallOutcome, String> {
        match self {
            ApiError::Transport(e) => Err(e),
            ApiError::Http(outcome) => Ok(outcome),
        }
    }
}

/// One-shot authenticated JSON call against a Google REST endpoint. Cuts the ~15 lines of
/// send/status/parse boilerplate each tool would otherwise repeat. Returns the parsed response
/// body (`Value::Null` for empty 2xx bodies, e.g. a `DELETE`).
async fn google_api_call(
    method: reqwest::Method,
    url: &str,
    query: &[(&str, &str)],
    body: Option<&Value>,
    token: &str,
) -> Result<Value, ApiError> {
    let client = reqwest::Client::new();
    let mut req = client.request(method, url).bearer_auth(token);
    if !query.is_empty() {
        req = req.query(query);
    }
    if let Some(b) = body {
        req = req.json(b);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| ApiError::Transport(format!("Couldn't reach Google: {e}")))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| ApiError::Transport(format!("Couldn't read Google response: {e}")))?;

    if !status.is_success() {
        return Err(ApiError::Http(McpCallOutcome {
            is_error: true,
            text: describe_google_error(&text, status),
        }));
    }

    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text)
        .map_err(|e| ApiError::Transport(format!("Unexpected Google response: {e}")))
}

/// Runs `google_api_call`, short-circuiting the tool fn on either error variant. Sugar so each
/// tool reads as `let body = api_call!(...);` instead of an explicit match.
macro_rules! api_call {
    ($method:expr, $url:expr, $query:expr, $body:expr, $token:expr) => {
        match google_api_call($method, $url, $query, $body, $token).await {
            Ok(v) => v,
            Err(e) => return e.into_result(),
        }
    };
}

/// Builds an RFC822 message and base64url-encodes it (no padding) for Gmail's `raw` field, used by
/// both draft creation and send. Pure/no network so it's directly unit-testable.
fn build_raw_email(to: &str, subject: &str, body: &str) -> String {
    let raw = format!(
        "To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\n\r\n{body}"
    );
    URL_SAFE_NO_PAD.encode(raw.as_bytes())
}

fn ok_text(text: impl Into<String>) -> Result<McpCallOutcome, String> {
    Ok(McpCallOutcome {
        is_error: false,
        text: text.into(),
    })
}

fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|f| f.as_str()).unwrap_or("?")
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
        McpToolInfo {
            name: "gmail_search_threads".to_string(),
            description: Some(
                "Search Gmail conversations (threads) using Gmail's search syntax. Returns the \
                 thread id and a snippet for each match — pass the thread id to gmail_get_thread."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Gmail search query" },
                    "max_results": { "type": "integer", "description": "Maximum threads to return (default 10, max 25)" }
                },
                "required": ["query"]
            }),
        },
        McpToolInfo {
            name: "gmail_get_thread".to_string(),
            description: Some(
                "Fetch every message in a Gmail conversation (thread) by its id — headers plus a \
                 snippet per message, in order."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "The Gmail thread id" }
                },
                "required": ["thread_id"]
            }),
        },
        McpToolInfo {
            name: "gmail_list_labels".to_string(),
            description: Some(
                "List the user's Gmail labels (both system labels like INBOX and user-created \
                 ones), returning each label's id and name."
                    .to_string(),
            ),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        McpToolInfo {
            name: "gmail_create_label".to_string(),
            description: Some("Create a new Gmail label with the given name.".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "The label name to create" }
                },
                "required": ["name"]
            }),
        },
        McpToolInfo {
            name: "gmail_modify_message_labels".to_string(),
            description: Some(
                "Add and/or remove labels on a Gmail message by id. Provide label ids (from \
                 gmail_list_labels); system ids like INBOX, UNREAD, STARRED also work — e.g. remove \
                 'UNREAD' to mark read, add 'TRASH' or use gmail_trash_message to trash."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "message_id": { "type": "string", "description": "The Gmail message id" },
                    "add_label_ids": { "type": "array", "items": { "type": "string" }, "description": "Label ids to add" },
                    "remove_label_ids": { "type": "array", "items": { "type": "string" }, "description": "Label ids to remove" }
                },
                "required": ["message_id"]
            }),
        },
        McpToolInfo {
            name: "gmail_list_drafts".to_string(),
            description: Some(
                "List the user's Gmail drafts, returning each draft id and the id of the message it \
                 holds."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "max_results": { "type": "integer", "description": "Maximum drafts to return (default 10, max 25)" }
                }
            }),
        },
        McpToolInfo {
            name: "gmail_create_draft".to_string(),
            description: Some(
                "Create a Gmail draft email (does not send it). Returns the new draft id."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "to": { "type": "string", "description": "Recipient email address" },
                    "subject": { "type": "string", "description": "Subject line" },
                    "body": { "type": "string", "description": "Plain-text body" }
                },
                "required": ["to", "subject", "body"]
            }),
        },
        McpToolInfo {
            name: "gmail_send_message".to_string(),
            description: Some(
                "Send an email from the user's Gmail account immediately. This actually delivers \
                 the message."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "to": { "type": "string", "description": "Recipient email address" },
                    "subject": { "type": "string", "description": "Subject line" },
                    "body": { "type": "string", "description": "Plain-text body" }
                },
                "required": ["to", "subject", "body"]
            }),
        },
        McpToolInfo {
            name: "gmail_trash_message".to_string(),
            description: Some(
                "Move a Gmail message to Trash by its id. Recoverable from Trash until Gmail purges \
                 it."
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
        "gmail_search_threads" => gmail_search_threads(token, args).await,
        "gmail_get_thread" => gmail_get_thread(token, args).await,
        "gmail_list_labels" => gmail_list_labels(token, args).await,
        "gmail_create_label" => gmail_create_label(token, args).await,
        "gmail_modify_message_labels" => gmail_modify_message_labels(token, args).await,
        "gmail_list_drafts" => gmail_list_drafts(token, args).await,
        "gmail_create_draft" => gmail_create_draft(token, args).await,
        "gmail_send_message" => gmail_send_message(token, args).await,
        "gmail_trash_message" => gmail_trash_message(token, args).await,
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

fn get_str_array_arg(args: &Value, key: &str) -> Vec<String> {
    args.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

async fn gmail_search_threads(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let query = get_str_arg(&args, "query")?;
    let max_results = get_opt_u32_arg(&args, "max_results", 10).clamp(1, 25);
    let body = api_call!(
        reqwest::Method::GET,
        "https://gmail.googleapis.com/gmail/v1/users/me/threads",
        &[("q", query.as_str()), ("maxResults", &max_results.to_string())],
        None,
        token
    );

    let threads = body
        .get("threads")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    if threads.is_empty() {
        return ok_text("No conversations matched that search.");
    }
    let lines: Vec<String> = threads
        .iter()
        .map(|t| {
            format!(
                "thread_id: {}\nsnippet: {}",
                str_field(t, "id"),
                t.get("snippet").and_then(|s| s.as_str()).unwrap_or(""),
            )
        })
        .collect();
    ok_text(lines.join("\n\n"))
}

async fn gmail_get_thread(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let thread_id = get_str_arg(&args, "thread_id")?;
    let body = api_call!(
        reqwest::Method::GET,
        &format!("https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}"),
        &[("format", "metadata")],
        None,
        token
    );

    let messages = body
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    if messages.is_empty() {
        return ok_text("That conversation has no messages.");
    }
    let lines: Vec<String> = messages
        .iter()
        .map(|m| summarize_message_metadata(str_field(m, "id"), m))
        .collect();
    ok_text(lines.join("\n\n"))
}

async fn gmail_list_labels(token: &str, _args: Value) -> Result<McpCallOutcome, String> {
    let body = api_call!(
        reqwest::Method::GET,
        "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        &[],
        None,
        token
    );
    let labels = body
        .get("labels")
        .and_then(|l| l.as_array())
        .cloned()
        .unwrap_or_default();
    if labels.is_empty() {
        return ok_text("No labels found.");
    }
    let lines: Vec<String> = labels
        .iter()
        .map(|l| format!("id: {}\tname: {}", str_field(l, "id"), str_field(l, "name")))
        .collect();
    ok_text(lines.join("\n"))
}

async fn gmail_create_label(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let name = get_str_arg(&args, "name")?;
    let body = api_call!(
        reqwest::Method::POST,
        "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        &[],
        Some(&json!({ "name": name })),
        token
    );
    ok_text(format!(
        "Created label '{}' (id: {}).",
        str_field(&body, "name"),
        str_field(&body, "id"),
    ))
}

async fn gmail_modify_message_labels(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let message_id = get_str_arg(&args, "message_id")?;
    let add = get_str_array_arg(&args, "add_label_ids");
    let remove = get_str_array_arg(&args, "remove_label_ids");
    if add.is_empty() && remove.is_empty() {
        return ok_text("Nothing to do — pass add_label_ids and/or remove_label_ids.");
    }
    let body = api_call!(
        reqwest::Method::POST,
        &format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/modify"),
        &[],
        Some(&json!({ "addLabelIds": add, "removeLabelIds": remove })),
        token
    );
    let label_ids = body
        .get("labelIds")
        .and_then(|l| l.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    ok_text(format!("Updated labels on message {message_id}. Now: {label_ids}"))
}

async fn gmail_list_drafts(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let max_results = get_opt_u32_arg(&args, "max_results", 10).clamp(1, 25);
    let body = api_call!(
        reqwest::Method::GET,
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        &[("maxResults", &max_results.to_string())],
        None,
        token
    );
    let drafts = body
        .get("drafts")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();
    if drafts.is_empty() {
        return ok_text("No drafts found.");
    }
    let lines: Vec<String> = drafts
        .iter()
        .map(|d| {
            format!(
                "draft_id: {}\tmessage_id: {}",
                str_field(d, "id"),
                d.get("message").map(|m| str_field(m, "id")).unwrap_or("?"),
            )
        })
        .collect();
    ok_text(lines.join("\n"))
}

async fn gmail_create_draft(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let to = get_str_arg(&args, "to")?;
    let subject = get_str_arg(&args, "subject")?;
    let body_text = get_str_arg(&args, "body")?;
    let raw = build_raw_email(&to, &subject, &body_text);
    let body = api_call!(
        reqwest::Method::POST,
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        &[],
        Some(&json!({ "message": { "raw": raw } })),
        token
    );
    ok_text(format!("Created draft (id: {}) to {to}.", str_field(&body, "id")))
}

async fn gmail_send_message(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let to = get_str_arg(&args, "to")?;
    let subject = get_str_arg(&args, "subject")?;
    let body_text = get_str_arg(&args, "body")?;
    let raw = build_raw_email(&to, &subject, &body_text);
    let body = api_call!(
        reqwest::Method::POST,
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        &[],
        Some(&json!({ "raw": raw })),
        token
    );
    ok_text(format!(
        "Sent email to {to} (message id: {}).",
        str_field(&body, "id"),
    ))
}

async fn gmail_trash_message(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let message_id = get_str_arg(&args, "message_id")?;
    api_call!(
        reqwest::Method::POST,
        &format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/trash"),
        &[],
        None,
        token
    );
    ok_text(format!("Moved message {message_id} to Trash."))
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

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const CALENDAR_BASE: &str = "https://www.googleapis.com/calendar/v3";

fn calendar_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "calendar_list_calendars".to_string(),
            description: Some(
                "List the calendars on the user's Google Calendar, returning each calendar's id and \
                 name. Use a calendar id as calendar_id in the other calendar tools ('primary' is \
                 the default)."
                    .to_string(),
            ),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        McpToolInfo {
            name: "calendar_list_events".to_string(),
            description: Some(
                "List upcoming events on a calendar, optionally bounded by an RFC3339 time window."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" },
                    "time_min": { "type": "string", "description": "RFC3339 lower bound, e.g. '2026-07-18T00:00:00Z'" },
                    "time_max": { "type": "string", "description": "RFC3339 upper bound" },
                    "max_results": { "type": "integer", "description": "Maximum events to return (default 10, max 50)" }
                }
            }),
        },
        McpToolInfo {
            name: "calendar_search_events".to_string(),
            description: Some(
                "Free-text search for events across a calendar (matches summary, description, \
                 location, attendees)."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Text to search for" },
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" },
                    "max_results": { "type": "integer", "description": "Maximum events to return (default 10, max 50)" }
                },
                "required": ["query"]
            }),
        },
        McpToolInfo {
            name: "calendar_get_event".to_string(),
            description: Some(
                "Fetch the full details of a single calendar event by its id.".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_id": { "type": "string", "description": "The event id" },
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" }
                },
                "required": ["event_id"]
            }),
        },
        McpToolInfo {
            name: "calendar_create_event".to_string(),
            description: Some(
                "Create a calendar event. Times are RFC3339, e.g. '2026-07-20T15:00:00-07:00'. \
                 Provide a time_zone (IANA name) if your start/end omit an offset."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "summary": { "type": "string", "description": "Event title" },
                    "start": { "type": "string", "description": "RFC3339 start datetime" },
                    "end": { "type": "string", "description": "RFC3339 end datetime" },
                    "description": { "type": "string", "description": "Event description" },
                    "location": { "type": "string", "description": "Event location" },
                    "time_zone": { "type": "string", "description": "IANA time zone, e.g. 'America/Los_Angeles'" },
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" }
                },
                "required": ["summary", "start", "end"]
            }),
        },
        McpToolInfo {
            name: "calendar_update_event".to_string(),
            description: Some(
                "Update fields of an existing calendar event by id. Only the fields you pass are \
                 changed."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_id": { "type": "string", "description": "The event id" },
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" },
                    "summary": { "type": "string", "description": "New title" },
                    "start": { "type": "string", "description": "New RFC3339 start datetime" },
                    "end": { "type": "string", "description": "New RFC3339 end datetime" },
                    "description": { "type": "string", "description": "New description" },
                    "location": { "type": "string", "description": "New location" },
                    "time_zone": { "type": "string", "description": "IANA time zone applied to start/end" }
                },
                "required": ["event_id"]
            }),
        },
        McpToolInfo {
            name: "calendar_delete_event".to_string(),
            description: Some("Delete a calendar event by its id.".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_id": { "type": "string", "description": "The event id" },
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" }
                },
                "required": ["event_id"]
            }),
        },
        McpToolInfo {
            name: "calendar_respond_to_event".to_string(),
            description: Some(
                "RSVP to an event you were invited to. response must be 'accepted', 'declined', or \
                 'tentative'."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_id": { "type": "string", "description": "The event id" },
                    "response": { "type": "string", "enum": ["accepted", "declined", "tentative"], "description": "Your RSVP" },
                    "calendar_id": { "type": "string", "description": "Calendar id (default 'primary')" }
                },
                "required": ["event_id", "response"]
            }),
        },
    ]
}

fn event_time(t: &Value) -> String {
    t.get("dateTime")
        .or_else(|| t.get("date"))
        .and_then(|v| v.as_str())
        .unwrap_or("?")
        .to_string()
}

fn summarize_event(e: &Value) -> String {
    format!(
        "id: {}\nsummary: {}\nstart: {}\nend: {}",
        str_field(e, "id"),
        str_field(e, "summary"),
        e.get("start").map(event_time).unwrap_or_else(|| "?".into()),
        e.get("end").map(event_time).unwrap_or_else(|| "?".into()),
    )
}

/// Assembles the `{summary, start, end, description, location}` body shared by create/update.
/// Only keys present in `args` are emitted, so `update` naturally becomes a partial PATCH.
fn build_event_body(args: &Value) -> Value {
    let mut map = serde_json::Map::new();
    if let Some(s) = get_opt_str_arg(args, "summary") {
        map.insert("summary".into(), json!(s));
    }
    if let Some(d) = get_opt_str_arg(args, "description") {
        map.insert("description".into(), json!(d));
    }
    if let Some(l) = get_opt_str_arg(args, "location") {
        map.insert("location".into(), json!(l));
    }
    let tz = get_opt_str_arg(args, "time_zone");
    for (arg_key, field) in [("start", "start"), ("end", "end")] {
        if let Some(dt) = get_opt_str_arg(args, arg_key) {
            let mut slot = serde_json::Map::new();
            slot.insert("dateTime".into(), json!(dt));
            if let Some(tz) = &tz {
                slot.insert("timeZone".into(), json!(tz));
            }
            map.insert(field.into(), Value::Object(slot));
        }
    }
    Value::Object(map)
}

async fn call_calendar_tool(token: &str, name: &str, args: Value) -> Result<McpCallOutcome, String> {
    match name {
        "calendar_list_calendars" => calendar_list_calendars(token, args).await,
        "calendar_list_events" => calendar_list_events(token, args).await,
        "calendar_search_events" => calendar_search_events(token, args).await,
        "calendar_get_event" => calendar_get_event(token, args).await,
        "calendar_create_event" => calendar_create_event(token, args).await,
        "calendar_update_event" => calendar_update_event(token, args).await,
        "calendar_delete_event" => calendar_delete_event(token, args).await,
        "calendar_respond_to_event" => calendar_respond_to_event(token, args).await,
        other => Err(format!("Unknown Calendar tool '{other}'")),
    }
}

fn calendar_id_arg(args: &Value) -> String {
    get_opt_str_arg(args, "calendar_id").unwrap_or_else(|| "primary".to_string())
}

async fn calendar_list_calendars(token: &str, _args: Value) -> Result<McpCallOutcome, String> {
    let body = api_call!(
        reqwest::Method::GET,
        &format!("{CALENDAR_BASE}/users/me/calendarList"),
        &[],
        None,
        token
    );
    let items = body
        .get("items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        return ok_text("No calendars found.");
    }
    let lines: Vec<String> = items
        .iter()
        .map(|c| format!("id: {}\tname: {}", str_field(c, "id"), str_field(c, "summary")))
        .collect();
    ok_text(lines.join("\n"))
}

fn render_event_list(body: &Value) -> Result<McpCallOutcome, String> {
    let items = body
        .get("items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        return ok_text("No events matched.");
    }
    let lines: Vec<String> = items.iter().map(summarize_event).collect();
    ok_text(lines.join("\n\n"))
}

async fn calendar_list_events(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let calendar_id = calendar_id_arg(&args);
    let max_results = get_opt_u32_arg(&args, "max_results", 10).clamp(1, 50).to_string();
    let mut query: Vec<(&str, String)> = vec![
        ("maxResults", max_results),
        ("singleEvents", "true".to_string()),
        ("orderBy", "startTime".to_string()),
    ];
    if let Some(t) = get_opt_str_arg(&args, "time_min") {
        query.push(("timeMin", t));
    }
    if let Some(t) = get_opt_str_arg(&args, "time_max") {
        query.push(("timeMax", t));
    }
    let query_ref: Vec<(&str, &str)> = query.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let body = api_call!(
        reqwest::Method::GET,
        &format!("{CALENDAR_BASE}/calendars/{calendar_id}/events"),
        &query_ref,
        None,
        token
    );
    render_event_list(&body)
}

async fn calendar_search_events(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let query_text = get_str_arg(&args, "query")?;
    let calendar_id = calendar_id_arg(&args);
    let max_results = get_opt_u32_arg(&args, "max_results", 10).clamp(1, 50).to_string();
    let body = api_call!(
        reqwest::Method::GET,
        &format!("{CALENDAR_BASE}/calendars/{calendar_id}/events"),
        &[
            ("q", query_text.as_str()),
            ("maxResults", max_results.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ],
        None,
        token
    );
    render_event_list(&body)
}

async fn calendar_get_event(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let event_id = get_str_arg(&args, "event_id")?;
    let calendar_id = calendar_id_arg(&args);
    let body = api_call!(
        reqwest::Method::GET,
        &format!("{CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}"),
        &[],
        None,
        token
    );
    let description = body.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let location = body.get("location").and_then(|v| v.as_str()).unwrap_or("");
    ok_text(format!(
        "{}\nlocation: {location}\ndescription: {description}",
        summarize_event(&body),
    ))
}

async fn calendar_create_event(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    // Required-arg validation up front (build_event_body itself is all-optional).
    get_str_arg(&args, "summary")?;
    get_str_arg(&args, "start")?;
    get_str_arg(&args, "end")?;
    let calendar_id = calendar_id_arg(&args);
    let body = api_call!(
        reqwest::Method::POST,
        &format!("{CALENDAR_BASE}/calendars/{calendar_id}/events"),
        &[],
        Some(&build_event_body(&args)),
        token
    );
    ok_text(format!(
        "Created event '{}' (id: {}).",
        str_field(&body, "summary"),
        str_field(&body, "id"),
    ))
}

async fn calendar_update_event(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let event_id = get_str_arg(&args, "event_id")?;
    let calendar_id = calendar_id_arg(&args);
    let patch = build_event_body(&args);
    if patch.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return ok_text("Nothing to update — pass at least one field to change.");
    }
    let body = api_call!(
        reqwest::Method::PATCH,
        &format!("{CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}"),
        &[],
        Some(&patch),
        token
    );
    ok_text(format!(
        "Updated event '{}' (id: {}).",
        str_field(&body, "summary"),
        str_field(&body, "id"),
    ))
}

async fn calendar_delete_event(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let event_id = get_str_arg(&args, "event_id")?;
    let calendar_id = calendar_id_arg(&args);
    api_call!(
        reqwest::Method::DELETE,
        &format!("{CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}"),
        &[],
        None,
        token
    );
    ok_text(format!("Deleted event {event_id}."))
}

async fn calendar_respond_to_event(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let event_id = get_str_arg(&args, "event_id")?;
    let response = get_str_arg(&args, "response")?;
    if !matches!(response.as_str(), "accepted" | "declined" | "tentative") {
        return ok_text("response must be 'accepted', 'declined', or 'tentative'.");
    }
    let calendar_id = calendar_id_arg(&args);
    let url = format!("{CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}");

    // Google has no "RSVP" endpoint — patch the current user's attendee entry. Fetch the event,
    // flip the `self` attendee's responseStatus, and PATCH the whole attendee list back.
    let event = api_call!(reqwest::Method::GET, &url, &[], None, token);
    let mut attendees = event
        .get("attendees")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();
    let mut found = false;
    for attendee in &mut attendees {
        if attendee.get("self").and_then(|s| s.as_bool()).unwrap_or(false) {
            if let Some(obj) = attendee.as_object_mut() {
                obj.insert("responseStatus".into(), json!(response));
                found = true;
            }
        }
    }
    if !found {
        return ok_text("You are not an attendee of that event, so there's nothing to RSVP to.");
    }
    api_call!(
        reqwest::Method::PATCH,
        &url,
        &[],
        Some(&json!({ "attendees": attendees })),
        token
    );
    ok_text(format!("RSVP '{response}' recorded for event {event_id}."))
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TASKS_BASE: &str = "https://tasks.googleapis.com/tasks/v1";

fn tasks_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "tasks_list_tasklists".to_string(),
            description: Some(
                "List the user's task lists, returning each list's id and title. Use a list id as \
                 tasklist_id in the other task tools ('@default' is the default list)."
                    .to_string(),
            ),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        McpToolInfo {
            name: "tasks_list_tasks".to_string(),
            description: Some(
                "List the tasks in a task list, returning id/title/status/due for each.".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tasklist_id": { "type": "string", "description": "Task list id (default '@default')" }
                }
            }),
        },
        McpToolInfo {
            name: "tasks_create_task".to_string(),
            description: Some("Create a task in a task list.".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Task title" },
                    "notes": { "type": "string", "description": "Task notes/details" },
                    "due": { "type": "string", "description": "RFC3339 due date, e.g. '2026-07-25T00:00:00Z'" },
                    "tasklist_id": { "type": "string", "description": "Task list id (default '@default')" }
                },
                "required": ["title"]
            }),
        },
        McpToolInfo {
            name: "tasks_update_task".to_string(),
            description: Some(
                "Update a task's fields by id. Set status to 'completed' to mark it done or \
                 'needsAction' to reopen it. Only the fields you pass change."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task_id": { "type": "string", "description": "The task id" },
                    "tasklist_id": { "type": "string", "description": "Task list id (default '@default')" },
                    "title": { "type": "string", "description": "New title" },
                    "notes": { "type": "string", "description": "New notes" },
                    "status": { "type": "string", "enum": ["needsAction", "completed"], "description": "Task status" },
                    "due": { "type": "string", "description": "New RFC3339 due date" }
                },
                "required": ["task_id"]
            }),
        },
        McpToolInfo {
            name: "tasks_delete_task".to_string(),
            description: Some("Delete a task by its id.".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task_id": { "type": "string", "description": "The task id" },
                    "tasklist_id": { "type": "string", "description": "Task list id (default '@default')" }
                },
                "required": ["task_id"]
            }),
        },
    ]
}

async fn call_tasks_tool(token: &str, name: &str, args: Value) -> Result<McpCallOutcome, String> {
    match name {
        "tasks_list_tasklists" => tasks_list_tasklists(token, args).await,
        "tasks_list_tasks" => tasks_list_tasks(token, args).await,
        "tasks_create_task" => tasks_create_task(token, args).await,
        "tasks_update_task" => tasks_update_task(token, args).await,
        "tasks_delete_task" => tasks_delete_task(token, args).await,
        other => Err(format!("Unknown Tasks tool '{other}'")),
    }
}

fn tasklist_id_arg(args: &Value) -> String {
    get_opt_str_arg(args, "tasklist_id").unwrap_or_else(|| "@default".to_string())
}

async fn tasks_list_tasklists(token: &str, _args: Value) -> Result<McpCallOutcome, String> {
    let body = api_call!(
        reqwest::Method::GET,
        &format!("{TASKS_BASE}/users/@me/lists"),
        &[],
        None,
        token
    );
    let items = body
        .get("items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        return ok_text("No task lists found.");
    }
    let lines: Vec<String> = items
        .iter()
        .map(|l| format!("id: {}\ttitle: {}", str_field(l, "id"), str_field(l, "title")))
        .collect();
    ok_text(lines.join("\n"))
}

async fn tasks_list_tasks(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let tasklist_id = tasklist_id_arg(&args);
    let body = api_call!(
        reqwest::Method::GET,
        &format!("{TASKS_BASE}/lists/{tasklist_id}/tasks"),
        &[("showCompleted", "true")],
        None,
        token
    );
    let items = body
        .get("items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        return ok_text("No tasks in that list.");
    }
    let lines: Vec<String> = items
        .iter()
        .map(|t| {
            format!(
                "id: {}\ntitle: {}\nstatus: {}\ndue: {}",
                str_field(t, "id"),
                str_field(t, "title"),
                str_field(t, "status"),
                t.get("due").and_then(|v| v.as_str()).unwrap_or("(none)"),
            )
        })
        .collect();
    ok_text(lines.join("\n\n"))
}

/// Shared `{title, notes, due, status}` body builder for create/update — only present keys emitted.
fn build_task_body(args: &Value) -> Value {
    let mut map = serde_json::Map::new();
    for (arg_key, field) in [("title", "title"), ("notes", "notes"), ("due", "due"), ("status", "status")] {
        if let Some(v) = get_opt_str_arg(args, arg_key) {
            map.insert(field.into(), json!(v));
        }
    }
    Value::Object(map)
}

async fn tasks_create_task(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    get_str_arg(&args, "title")?;
    let tasklist_id = tasklist_id_arg(&args);
    let body = api_call!(
        reqwest::Method::POST,
        &format!("{TASKS_BASE}/lists/{tasklist_id}/tasks"),
        &[],
        Some(&build_task_body(&args)),
        token
    );
    ok_text(format!(
        "Created task '{}' (id: {}).",
        str_field(&body, "title"),
        str_field(&body, "id"),
    ))
}

async fn tasks_update_task(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let task_id = get_str_arg(&args, "task_id")?;
    let tasklist_id = tasklist_id_arg(&args);
    let patch = build_task_body(&args);
    if patch.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return ok_text("Nothing to update — pass at least one field to change.");
    }
    let body = api_call!(
        reqwest::Method::PATCH,
        &format!("{TASKS_BASE}/lists/{tasklist_id}/tasks/{task_id}"),
        &[],
        Some(&patch),
        token
    );
    ok_text(format!(
        "Updated task '{}' (status: {}).",
        str_field(&body, "title"),
        str_field(&body, "status"),
    ))
}

async fn tasks_delete_task(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let task_id = get_str_arg(&args, "task_id")?;
    let tasklist_id = tasklist_id_arg(&args);
    api_call!(
        reqwest::Method::DELETE,
        &format!("{TASKS_BASE}/lists/{tasklist_id}/tasks/{task_id}"),
        &[],
        None,
        token
    );
    ok_text(format!("Deleted task {task_id}."))
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

fn docs_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "docs_create_document".to_string(),
            description: Some(
                "Create a new, empty Google Doc with the given title. Returns the document id and \
                 URL — pass the id to docs_append_text to add content."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Document title" }
                },
                "required": ["title"]
            }),
        },
        McpToolInfo {
            name: "docs_append_text".to_string(),
            description: Some(
                "Append plain text to the end of an existing Google Doc by its id.".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "document_id": { "type": "string", "description": "The Google Doc id" },
                    "text": { "type": "string", "description": "Text to append" }
                },
                "required": ["document_id", "text"]
            }),
        },
    ]
}

async fn call_docs_tool(token: &str, name: &str, args: Value) -> Result<McpCallOutcome, String> {
    match name {
        "docs_create_document" => docs_create_document(token, args).await,
        "docs_append_text" => docs_append_text(token, args).await,
        other => Err(format!("Unknown Docs tool '{other}'")),
    }
}

async fn docs_create_document(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let title = get_str_arg(&args, "title")?;
    let body = api_call!(
        reqwest::Method::POST,
        "https://docs.googleapis.com/v1/documents",
        &[],
        Some(&json!({ "title": title })),
        token
    );
    let doc_id = str_field(&body, "documentId");
    ok_text(format!(
        "Created Google Doc '{}' (id: {doc_id}).\nhttps://docs.google.com/document/d/{doc_id}/edit",
        str_field(&body, "title"),
    ))
}

async fn docs_append_text(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let document_id = get_str_arg(&args, "document_id")?;
    let text = get_str_arg(&args, "text")?;
    api_call!(
        reqwest::Method::POST,
        &format!("https://docs.googleapis.com/v1/documents/{document_id}:batchUpdate"),
        &[],
        Some(&json!({
            "requests": [{
                "insertText": {
                    "endOfSegmentLocation": {},
                    "text": text
                }
            }]
        })),
        token
    );
    ok_text(format!("Appended text to document {document_id}."))
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

fn sheets_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "sheets_create_spreadsheet".to_string(),
            description: Some(
                "Create a new Google Sheets spreadsheet with the given title. Returns the \
                 spreadsheet id and URL."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Spreadsheet title" }
                },
                "required": ["title"]
            }),
        },
        McpToolInfo {
            name: "sheets_append_row".to_string(),
            description: Some(
                "Append a row of values to a sheet in a spreadsheet. values is a list of cell \
                 values (left to right)."
                    .to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "spreadsheet_id": { "type": "string", "description": "The spreadsheet id" },
                    "values": { "type": "array", "items": { "type": "string" }, "description": "Cell values for the new row" },
                    "range": { "type": "string", "description": "Sheet/range to append to (default 'Sheet1')" }
                },
                "required": ["spreadsheet_id", "values"]
            }),
        },
    ]
}

async fn call_sheets_tool(token: &str, name: &str, args: Value) -> Result<McpCallOutcome, String> {
    match name {
        "sheets_create_spreadsheet" => sheets_create_spreadsheet(token, args).await,
        "sheets_append_row" => sheets_append_row(token, args).await,
        other => Err(format!("Unknown Sheets tool '{other}'")),
    }
}

async fn sheets_create_spreadsheet(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let title = get_str_arg(&args, "title")?;
    let body = api_call!(
        reqwest::Method::POST,
        "https://sheets.googleapis.com/v4/spreadsheets",
        &[],
        Some(&json!({ "properties": { "title": title } })),
        token
    );
    ok_text(format!(
        "Created spreadsheet (id: {}).\n{}",
        str_field(&body, "spreadsheetId"),
        str_field(&body, "spreadsheetUrl"),
    ))
}

async fn sheets_append_row(token: &str, args: Value) -> Result<McpCallOutcome, String> {
    let spreadsheet_id = get_str_arg(&args, "spreadsheet_id")?;
    let values = get_str_array_arg(&args, "values");
    if values.is_empty() {
        return ok_text("Pass at least one value to append.");
    }
    let range = get_opt_str_arg(&args, "range").unwrap_or_else(|| "Sheet1".to_string());
    let body = api_call!(
        reqwest::Method::POST,
        &format!("https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range}:append"),
        &[("valueInputOption", "USER_ENTERED"), ("insertDataOption", "INSERT_ROWS")],
        Some(&json!({ "values": [values] })),
        token
    );
    let updated = body
        .pointer("/updates/updatedRange")
        .and_then(|v| v.as_str())
        .unwrap_or(range.as_str());
    ok_text(format!("Appended a row to {updated}."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_parses_known_values() {
        assert_eq!(GoogleKind::parse("gmail"), Ok(GoogleKind::Gmail));
        assert_eq!(GoogleKind::parse("drive"), Ok(GoogleKind::Drive));
        assert_eq!(GoogleKind::parse("calendar"), Ok(GoogleKind::Calendar));
        assert_eq!(GoogleKind::parse("tasks"), Ok(GoogleKind::Tasks));
        assert_eq!(GoogleKind::parse("docs"), Ok(GoogleKind::Docs));
        assert_eq!(GoogleKind::parse("sheets"), Ok(GoogleKind::Sheets));
        assert!(GoogleKind::parse("nope").is_err());
    }

    #[test]
    fn build_raw_email_is_valid_base64url_rfc822() {
        let raw = build_raw_email("a@example.com", "Hi there", "Body line 1");
        let decoded = String::from_utf8(URL_SAFE_NO_PAD.decode(&raw).unwrap()).unwrap();
        assert!(decoded.contains("To: a@example.com"));
        assert!(decoded.contains("Subject: Hi there"));
        // Headers are separated from the body by a blank line.
        assert!(decoded.contains("\r\n\r\nBody line 1"));
        // base64url alphabet: no '+' or '/' and no '=' padding.
        assert!(!raw.contains('+') && !raw.contains('/') && !raw.contains('='));
    }

    #[test]
    fn event_body_only_includes_present_fields_and_nests_times() {
        let args = json!({ "summary": "Standup", "start": "2026-07-20T09:00:00-07:00" });
        let body = build_event_body(&args);
        assert_eq!(body.get("summary").and_then(|v| v.as_str()), Some("Standup"));
        assert_eq!(
            body.pointer("/start/dateTime").and_then(|v| v.as_str()),
            Some("2026-07-20T09:00:00-07:00")
        );
        // No end passed → no end key; no time_zone passed → no timeZone under start.
        assert!(body.get("end").is_none());
        assert!(body.pointer("/start/timeZone").is_none());
    }

    #[test]
    fn event_body_attaches_time_zone_to_each_slot() {
        let args = json!({
            "start": "2026-07-20T09:00:00",
            "end": "2026-07-20T09:30:00",
            "time_zone": "America/Los_Angeles"
        });
        let body = build_event_body(&args);
        assert_eq!(
            body.pointer("/start/timeZone").and_then(|v| v.as_str()),
            Some("America/Los_Angeles")
        );
        assert_eq!(
            body.pointer("/end/timeZone").and_then(|v| v.as_str()),
            Some("America/Los_Angeles")
        );
    }

    #[test]
    fn task_body_maps_only_present_fields() {
        let args = json!({ "title": "Buy milk", "status": "completed" });
        let body = build_task_body(&args);
        assert_eq!(body.get("title").and_then(|v| v.as_str()), Some("Buy milk"));
        assert_eq!(body.get("status").and_then(|v| v.as_str()), Some("completed"));
        assert!(body.get("notes").is_none());
        assert!(body.get("due").is_none());
    }

    #[test]
    fn str_array_arg_extracts_strings_and_defaults_empty() {
        let args = json!({ "add_label_ids": ["INBOX", "STARRED"] });
        assert_eq!(get_str_array_arg(&args, "add_label_ids"), vec!["INBOX", "STARRED"]);
        assert!(get_str_array_arg(&args, "missing").is_empty());
    }

    #[test]
    fn opt_str_arg_treats_empty_string_as_absent() {
        let args = json!({ "a": "x", "b": "" });
        assert_eq!(get_opt_str_arg(&args, "a").as_deref(), Some("x"));
        assert_eq!(get_opt_str_arg(&args, "b"), None);
        assert_eq!(get_opt_str_arg(&args, "c"), None);
    }

    #[test]
    fn event_time_prefers_datetime_then_date() {
        assert_eq!(event_time(&json!({ "dateTime": "2026-07-20T09:00:00Z" })), "2026-07-20T09:00:00Z");
        assert_eq!(event_time(&json!({ "date": "2026-07-20" })), "2026-07-20");
        assert_eq!(event_time(&json!({})), "?");
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
