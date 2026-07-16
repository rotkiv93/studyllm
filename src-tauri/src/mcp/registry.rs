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

/// Only npm-published (npx-launched) packages and remote Streamable HTTP servers are
/// installable today — matches what `McpHost` can actually run. `uvx`/Docker packages
/// still show up in search results (for visibility) but are marked unsupported.
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
        let mut args = vec!["-y".to_string()];
        let versioned = match &pkg.version {
            Some(v) if !v.is_empty() => format!("{}@{}", pkg.identifier, v),
            _ => pkg.identifier.clone(),
        };
        args.push(versioned);

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

        let env = pkg.environment_variables.iter().map(env_from_kv).collect();
        (
            InstallSpec::Npx {
                args,
                positional_args,
            },
            env,
        )
    } else if !raw.packages.is_empty() || !raw.remotes.is_empty() {
        (
            InstallSpec::Unsupported {
                reason: "Only npm-based (npx) and remote HTTP servers are supported yet".into(),
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
