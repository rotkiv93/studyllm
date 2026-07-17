//! PKCE + loopback-redirect OAuth engine. Deliberately free of Tauri types (no `AppHandle`) so
//! it's testable with plain `cargo test` — opening the system browser and emitting progress
//! events is the caller's job (`oauth::commands`), which has the `AppHandle` these functions
//! don't need.

use std::collections::HashMap;
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::time::timeout;

use super::config;

/// How long to wait for the user to finish the consent screen and be redirected back.
const REDIRECT_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    /// Google typically omits this on a refresh-grant response — callers must not overwrite a
    /// previously stored refresh token with `None`.
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub expires_in: i64,
}

#[derive(Debug, Deserialize)]
struct GoogleErrorResponse {
    error: String,
    #[serde(default)]
    error_description: Option<String>,
}

fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Generates an RFC 7636 `(code_verifier, code_challenge)` pair using the S256 method.
pub fn generate_pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 64];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = challenge_for(&verifier);
    (verifier, challenge)
}

/// A CSRF-protection token echoed back by Google in the redirect and checked against on return.
pub fn generate_state() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Binds an OS-assigned loopback port and returns it alongside the listener, so the caller can
/// build a `redirect_uri` of `http://127.0.0.1:<port>/callback` before opening the browser.
pub async fn bind_loopback_listener() -> Result<(TcpListener, u16), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Couldn't start the local sign-in listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    Ok((listener, port))
}

pub fn build_authorize_url(
    scopes: &[String],
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
) -> Result<String, String> {
    let mut url = reqwest::Url::parse(config::GOOGLE_AUTHORIZE_URL).map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", config::GOOGLE_OAUTH_CLIENT_ID)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", &scopes.join(" "))
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256")
        // Both of these are required to reliably get a refresh_token back — Google otherwise
        // omits it on anything but the very first-ever consent for that account, which would
        // silently break the whole "stays connected" premise on every subsequent connect.
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    Ok(url.to_string())
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 3 <= bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?;
            let value = parts.next().unwrap_or("");
            Some((percent_decode(key), percent_decode(value)))
        })
        .collect()
}

/// Extracts query params from a raw HTTP request line, e.g.
/// `"GET /callback?code=abc&state=xyz HTTP/1.1"`. Split out from `await_redirect` so it's
/// testable against canned strings without a live socket.
fn extract_query_params(request_line: &str) -> HashMap<String, String> {
    let path_and_query = request_line.split_whitespace().nth(1).unwrap_or("/");
    let query = path_and_query.splitn(2, '?').nth(1).unwrap_or("");
    parse_query(query)
}

const REDIRECT_LANDING_PAGE: &str =
    "<html><body>You're connected \u{2014} you can close this tab and return to StudyLLM.</body></html>";

/// Accepts loopback connections until one carries `code`/`error`/`state` query params (ignoring
/// stray requests like a browser's `/favicon.ico`), replies with a minimal landing page, and
/// returns the authorization code — or an error if the user cancelled, Google reported an error,
/// the `state` didn't match (possible CSRF), or nothing arrived within `REDIRECT_TIMEOUT`.
pub async fn await_redirect(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    let result = timeout(REDIRECT_TIMEOUT, async {
        loop {
            let (socket, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut reader = BufReader::new(socket);

            let mut request_line = String::new();
            reader
                .read_line(&mut request_line)
                .await
                .map_err(|e| e.to_string())?;

            // Drain the remaining request headers so the client doesn't see a broken pipe
            // before we get to write the response back.
            loop {
                let mut header_line = String::new();
                let n = reader
                    .read_line(&mut header_line)
                    .await
                    .map_err(|e| e.to_string())?;
                if n == 0 || header_line == "\r\n" || header_line == "\n" {
                    break;
                }
            }

            let params = extract_query_params(&request_line);
            let mut socket = reader.into_inner();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                REDIRECT_LANDING_PAGE.len(),
                REDIRECT_LANDING_PAGE,
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.shutdown().await;

            if let Some(err) = params.get("error") {
                return Err(format!("Google sign-in was cancelled or denied ({err})."));
            }
            if let Some(code) = params.get("code") {
                let state = params.get("state").map(String::as_str).unwrap_or("");
                if state != expected_state {
                    return Err("Security check failed \u{2014} please try connecting again.".to_string());
                }
                return Ok(code.clone());
            }
            // Neither `code` nor `error` — a stray request, keep waiting for the real redirect.
        }
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => Err("Timed out waiting for you to finish signing in with Google.".to_string()),
    }
}

async fn post_token_request(params: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(config::GOOGLE_TOKEN_URL)
        .form(params)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Google: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<GoogleErrorResponse>(&text) {
            let desc = err.error_description.unwrap_or_default();
            return Err(format!("Google sign-in failed: {} {desc}", err.error));
        }
        return Err(format!("Google sign-in failed ({status}): {text}"));
    }
    serde_json::from_str::<TokenResponse>(&text)
        .map_err(|e| format!("Unexpected response from Google: {e}"))
}

pub async fn exchange_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    post_token_request(&[
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", config::GOOGLE_OAUTH_CLIENT_ID),
        ("client_secret", config::GOOGLE_OAUTH_CLIENT_SECRET),
        ("redirect_uri", redirect_uri),
        ("code_verifier", code_verifier),
    ])
    .await
}

pub async fn refresh_access_token(refresh_token: &str) -> Result<TokenResponse, String> {
    post_token_request(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", config::GOOGLE_OAUTH_CLIENT_ID),
        ("client_secret", config::GOOGLE_OAUTH_CLIENT_SECRET),
    ])
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 7636 Appendix B test vector.
    #[test]
    fn pkce_challenge_matches_rfc7636_vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(challenge_for(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn generated_pkce_pair_is_internally_consistent() {
        let (verifier, challenge) = generate_pkce_pair();
        assert!(verifier.len() >= 43 && verifier.len() <= 128);
        assert_eq!(challenge_for(&verifier), challenge);
    }

    #[test]
    fn extract_query_params_reads_code_and_state() {
        let params = extract_query_params("GET /callback?code=abc&state=xyz HTTP/1.1");
        assert_eq!(params.get("code").map(String::as_str), Some("abc"));
        assert_eq!(params.get("state").map(String::as_str), Some("xyz"));
    }

    #[test]
    fn extract_query_params_reads_error() {
        let params = extract_query_params("GET /callback?error=access_denied&state=xyz HTTP/1.1");
        assert_eq!(params.get("error").map(String::as_str), Some("access_denied"));
    }

    #[test]
    fn extract_query_params_ignores_stray_requests() {
        let params = extract_query_params("GET /favicon.ico HTTP/1.1");
        assert!(params.get("code").is_none());
        assert!(params.get("error").is_none());
    }

    #[test]
    fn extract_query_params_percent_decodes() {
        let params = extract_query_params("GET /callback?state=a%20b%2Bc HTTP/1.1");
        assert_eq!(params.get("state").map(String::as_str), Some("a b+c"));
    }

    /// End-to-end proof (no browser, no Google needed) that the from-scratch `TcpListener` +
    /// hand-rolled HTTP parsing actually catches a real redirect over a real socket, standing in
    /// for hand-typing `http://127.0.0.1:<port>/callback?code=...&state=...` into a browser.
    #[tokio::test]
    async fn await_redirect_catches_a_real_loopback_connection() {
        use tokio::io::AsyncReadExt;

        let (listener, port) = bind_loopback_listener().await.unwrap();
        let state = "test-state".to_string();
        let client_state = state.clone();
        let client = tokio::spawn(async move {
            let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .unwrap();
            let request = format!(
                "GET /callback?code=test123&state={client_state} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
            );
            stream.write_all(request.as_bytes()).await.unwrap();
            let mut buf = Vec::new();
            stream.read_to_end(&mut buf).await.unwrap();
            assert!(String::from_utf8_lossy(&buf).contains("You're connected"));
        });

        let code = await_redirect(listener, &state).await.unwrap();
        assert_eq!(code, "test123");
        client.await.unwrap();
    }

    #[tokio::test]
    async fn await_redirect_ignores_stray_requests_then_catches_the_real_one() {
        use tokio::io::AsyncReadExt;

        let (listener, port) = bind_loopback_listener().await.unwrap();
        let state = "test-state".to_string();
        let client_state = state.clone();
        let client = tokio::spawn(async move {
            // A stray request first (e.g. what a browser's favicon fetch would look like).
            let mut stray = tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .unwrap();
            stray
                .write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                .await
                .unwrap();
            let mut buf = Vec::new();
            stray.read_to_end(&mut buf).await.unwrap();

            // Then the real redirect.
            let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .unwrap();
            let request = format!(
                "GET /callback?code=real-code&state={client_state} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
            );
            stream.write_all(request.as_bytes()).await.unwrap();
            let mut buf2 = Vec::new();
            stream.read_to_end(&mut buf2).await.unwrap();
        });

        let code = await_redirect(listener, &state).await.unwrap();
        assert_eq!(code, "real-code");
        client.await.unwrap();
    }
}
