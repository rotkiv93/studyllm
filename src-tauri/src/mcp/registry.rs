use serde::{Deserialize, Serialize};

const REGISTRY_BASE: &str = "https://registry.modelcontextprotocol.io/v0";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVarSpec {
    pub name: String,
    pub description: Option<String>,
    pub is_required: bool,
    pub is_secret: bool,
    pub default: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionalArgSpec {
    pub description: Option<String>,
    pub default: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind")]
pub enum InstallSpec {
    Npx {
        args: Vec<String>,
        positional_args: Vec<PositionalArgSpec>,
    },
    Uvx {
        args: Vec<String>,
        positional_args: Vec<PositionalArgSpec>,
    },
    RemoteHttp {
        url: String,
    },
    Unsupported {
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: Option<String>,
    pub repository_url: Option<String>,
    pub install: InstallSpec,
    pub required_env: Vec<EnvVarSpec>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryPage {
    pub entries: Vec<CatalogEntry>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawListResponse {
    #[serde(default)]
    servers: Vec<serde_json::Value>,
    #[serde(default)]
    metadata: Option<RawMetadata>,
}

#[derive(Debug, Deserialize)]
struct RawMetadata {
    #[serde(rename = "nextCursor", default)]
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawServer {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    repository: Option<RawRepository>,
    #[serde(default)]
    packages: Vec<RawPackage>,
    #[serde(default)]
    remotes: Vec<RawRemote>,
}

#[derive(Debug, Deserialize)]
struct RawRepository {
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawPackage {
    #[serde(rename = "registryType", default)]
    registry_type: Option<String>,
    identifier: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(rename = "packageArguments", default)]
    package_arguments: Vec<RawArgument>,
    #[serde(rename = "environmentVariables", default)]
    environment_variables: Vec<RawKeyValue>,
}

#[derive(Debug, Deserialize)]
struct RawArgument {
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    default: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawKeyValue {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    default: Option<String>,
    #[serde(rename = "isRequired", default)]
    is_required: bool,
    #[serde(rename = "isSecret", default)]
    is_secret: bool,
}

#[derive(Debug, Deserialize)]
struct RawRemote {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    headers: Vec<RawKeyValue>,
}

fn env_from_kv(kv: &RawKeyValue) -> EnvVarSpec {
    EnvVarSpec {
        name: kv.name.clone(),
        description: kv.description.clone(),
        is_required: kv.is_required,
        is_secret: kv.is_secret,
        default: kv.default.clone(),
    }
}

fn versioned_identifier(pkg: &RawPackage) -> String {
    match &pkg.version {
        Some(v) if !v.is_empty() => format!("{}@{}", pkg.identifier, v),
        _ => pkg.identifier.clone(),
    }
}

/// Splits a package's declared arguments into ones with a fixed value (appended directly to
/// `args`) and free-form positional ones the user fills in at install time. Shared between the
/// npx and uvx branches of `normalize` — both runtimes take a flat argv after the package spec.
fn split_package_arguments(pkg: &RawPackage, mut args: Vec<String>) -> (Vec<String>, Vec<PositionalArgSpec>) {
    let mut positional_args = Vec::new();
    for arg in &pkg.package_arguments {
        if arg.kind.as_deref() == Some("named") {
            if let (Some(name), Some(value)) =
                (&arg.name, arg.value.clone().or_else(|| arg.default.clone()))
            {
                args.push(name.clone());
                args.push(value);
            }
        } else if let Some(value) = arg.value.clone().or_else(|| arg.default.clone()) {
            args.push(value);
        } else {
            positional_args.push(PositionalArgSpec {
                description: arg.description.clone().or_else(|| arg.name.clone()),
                default: arg.default.clone(),
            });
        }
    }
    (args, positional_args)
}

/// npm-published (npx-launched) and PyPI-published (uvx-launched) packages, plus remote
/// Streamable HTTP servers, are installable today — matches what `McpHost` can actually run.
/// Docker packages still show up in search results (for visibility) but are marked unsupported.
fn normalize(raw: RawServer) -> CatalogEntry {
    let description = raw.description.clone().unwrap_or_default();
    let repository_url = raw.repository.and_then(|r| r.url);

    let remote_http = raw
        .remotes
        .iter()
        .find(|r| r.kind.eq_ignore_ascii_case("streamable-http") && r.url.is_some());

    let (install, required_env) = if let Some(remote) = remote_http {
        let env = remote.headers.iter().map(env_from_kv).collect();
        (
            InstallSpec::RemoteHttp {
                url: remote.url.clone().unwrap(),
            },
            env,
        )
    } else if let Some(pkg) = raw.packages.iter().find(|p| {
        p.registry_type
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case("npm"))
            .unwrap_or(false)
    }) {
        let args = vec!["-y".to_string(), versioned_identifier(pkg)];
        let (args, positional_args) = split_package_arguments(pkg, args);
        let env = pkg.environment_variables.iter().map(env_from_kv).collect();
        (
            InstallSpec::Npx {
                args,
                positional_args,
            },
            env,
        )
    } else if let Some(pkg) = raw.packages.iter().find(|p| {
        p.registry_type
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case("pypi"))
            .unwrap_or(false)
    }) {
        let args = vec![versioned_identifier(pkg)];
        let (args, positional_args) = split_package_arguments(pkg, args);
        let env = pkg.environment_variables.iter().map(env_from_kv).collect();
        (
            InstallSpec::Uvx {
                args,
                positional_args,
            },
            env,
        )
    } else if !raw.packages.is_empty() || !raw.remotes.is_empty() {
        (
            InstallSpec::Unsupported {
                reason: "Only npm (npx), PyPI (uvx), and remote HTTP servers are supported yet".into(),
            },
            Vec::new(),
        )
    } else {
        (
            InstallSpec::Unsupported {
                reason: "The registry entry has no install information".into(),
            },
            Vec::new(),
        )
    };

    CatalogEntry {
        id: raw.name.clone(),
        name: raw.name,
        description,
        version: raw.version,
        repository_url,
        install,
        required_env,
    }
}

/// `false` only when the registry explicitly marks this version as superseded; missing/malformed
/// `_meta` defaults to keeping the entry rather than dropping servers the API didn't annotate.
fn is_latest_version(v: &serde_json::Value) -> bool {
    v.get("_meta")
        .and_then(|m| m.get("io.modelcontextprotocol.registry/official"))
        .and_then(|o| o.get("isLatest"))
        .and_then(|b| b.as_bool())
        .unwrap_or(true)
}

#[tauri::command]
pub async fn mcp_registry_search(
    query: Option<String>,
    cursor: Option<String>,
) -> Result<RegistryPage, String> {
    let client = reqwest::Client::new();
    let mut req = client
        .get(format!("{REGISTRY_BASE}/servers"))
        .query(&[("limit", "30")]);
    if let Some(q) = query.as_ref().filter(|q| !q.is_empty()) {
        req = req.query(&[("search", q.as_str())]);
    }
    if let Some(c) = cursor.as_ref().filter(|c| !c.is_empty()) {
        req = req.query(&[("cursor", c.as_str())]);
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("Registry request failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Registry returned HTTP {}", response.status()));
    }

    let raw: RawListResponse = response
        .json()
        .await
        .map_err(|e| format!("Registry response was not valid JSON: {e}"))?;

    // Each list entry is `{"server": {...ServerJSON fields...}, "_meta": {...}}` — unwrap the
    // `server` key, but fall back to the raw value in case a future API version flattens it.
    //
    // The registry keeps every published version of a server as its own list entry, so a single
    // server with many releases can flood a result page with near-duplicate rows (same name,
    // different version) — the `isLatest` flag in `_meta` is how the API marks the current one.
    // Drop everything else, and dedupe defensively in case `_meta` is ever missing.
    let mut seen_names = std::collections::HashSet::new();
    let entries = raw
        .servers
        .into_iter()
        .filter(is_latest_version)
        .filter_map(|v| {
            let server_value = v.get("server").cloned().unwrap_or(v);
            serde_json::from_value::<RawServer>(server_value).ok()
        })
        .filter(|s| seen_names.insert(s.name.clone()))
        .map(normalize)
        .collect();

    Ok(RegistryPage {
        entries,
        next_cursor: raw.metadata.and_then(|m| m.next_cursor),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn raw_server(value: serde_json::Value) -> RawServer {
        serde_json::from_value(value).expect("test fixture should deserialize as RawServer")
    }

    #[test]
    fn is_latest_version_defaults_true_when_meta_missing() {
        assert!(is_latest_version(&json!({ "name": "acme/thing" })));
    }

    #[test]
    fn is_latest_version_defaults_true_when_meta_malformed() {
        assert!(is_latest_version(&json!({ "_meta": { "something-else": {} } })));
        assert!(is_latest_version(
            &json!({ "_meta": { "io.modelcontextprotocol.registry/official": {} } })
        ));
    }

    #[test]
    fn is_latest_version_respects_explicit_flag() {
        assert!(is_latest_version(&json!({
            "_meta": { "io.modelcontextprotocol.registry/official": { "isLatest": true } }
        })));
        assert!(!is_latest_version(&json!({
            "_meta": { "io.modelcontextprotocol.registry/official": { "isLatest": false } }
        })));
    }

    #[test]
    fn normalize_prefers_remote_streamable_http_over_packages() {
        let raw = raw_server(json!({
            "name": "acme/server",
            "description": "does things",
            "remotes": [
                { "type": "streamable-http", "url": "https://acme.example/mcp" },
            ],
            "packages": [
                { "registryType": "npm", "identifier": "acme-server" },
            ],
        }));
        let entry = normalize(raw);
        match entry.install {
            InstallSpec::RemoteHttp { url } => assert_eq!(url, "https://acme.example/mcp"),
            other => panic!("expected RemoteHttp, got {other:?}"),
        }
    }

    #[test]
    fn normalize_matches_remote_type_case_insensitively() {
        let raw = raw_server(json!({
            "name": "acme/server",
            "remotes": [{ "type": "Streamable-HTTP", "url": "https://acme.example/mcp" }],
        }));
        let entry = normalize(raw);
        assert!(matches!(entry.install, InstallSpec::RemoteHttp { .. }));
    }

    #[test]
    fn normalize_builds_npx_args_with_pinned_version() {
        let raw = raw_server(json!({
            "name": "acme/server",
            "packages": [
                { "registryType": "npm", "identifier": "acme-server", "version": "1.2.3" },
            ],
        }));
        let entry = normalize(raw);
        match entry.install {
            InstallSpec::Npx { args, positional_args } => {
                assert_eq!(args, vec!["-y".to_string(), "acme-server@1.2.3".to_string()]);
                assert!(positional_args.is_empty());
            }
            other => panic!("expected Npx, got {other:?}"),
        }
    }

    #[test]
    fn normalize_splits_named_vs_positional_package_arguments() {
        let raw = raw_server(json!({
            "name": "acme/server",
            "packages": [{
                "registryType": "npm",
                "identifier": "acme-server",
                "packageArguments": [
                    { "type": "named", "name": "--config", "value": "prod" },
                    { "type": "positional", "description": "workspace path" },
                ],
            }],
        }));
        let entry = normalize(raw);
        match entry.install {
            InstallSpec::Npx { args, positional_args } => {
                assert!(args.contains(&"--config".to_string()));
                assert!(args.contains(&"prod".to_string()));
                assert_eq!(positional_args.len(), 1);
                assert_eq!(positional_args[0].description.as_deref(), Some("workspace path"));
            }
            other => panic!("expected Npx, got {other:?}"),
        }
    }

    #[test]
    fn normalize_marks_docker_packages_unsupported() {
        let raw = raw_server(json!({
            "name": "acme/server",
            "packages": [{ "registryType": "oci", "identifier": "acme-server" }],
        }));
        let entry = normalize(raw);
        assert!(matches!(entry.install, InstallSpec::Unsupported { .. }));
    }

    #[test]
    fn normalize_builds_uvx_args_for_pypi_packages() {
        let raw = raw_server(json!({
            "name": "acme/server",
            "packages": [
                { "registryType": "pypi", "identifier": "acme-server", "version": "1.2.3" },
            ],
        }));
        let entry = normalize(raw);
        match entry.install {
            InstallSpec::Uvx { args, positional_args } => {
                assert_eq!(args, vec!["acme-server@1.2.3".to_string()]);
                assert!(positional_args.is_empty());
            }
            other => panic!("expected Uvx, got {other:?}"),
        }
    }

    #[test]
    fn normalize_marks_entries_with_no_install_info_unsupported() {
        let raw = raw_server(json!({ "name": "acme/server" }));
        let entry = normalize(raw);
        match entry.install {
            InstallSpec::Unsupported { reason } => assert!(reason.contains("no install information")),
            other => panic!("expected Unsupported, got {other:?}"),
        }
    }
}
