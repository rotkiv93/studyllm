use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager};

/// Node LTS build used for the portable download fallback. Bump periodically;
/// any Node 22.x satisfies `npx`, so exact patch freshness isn't critical.
const NODE_VERSION: &str = "22.23.1";

/// `uv`/`uvx` release used for the portable download fallback (uvx-launched, PyPI-published
/// MCP servers). Bump periodically.
const UV_VERSION: &str = "0.11.29";

/// Locate a usable `npx`: prefer one already on PATH, then a previously
/// downloaded portable copy, then download one into app-local data.
pub async fn ensure_npx(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = find_on_path("npx") {
        return Ok(path);
    }

    let cached = platform_npx_path(&node_install_dir(app)?);
    if cached.is_file() {
        return Ok(cached);
    }

    download_and_extract_node(app).await
}

/// Locate a usable `uvx`: prefer one already on PATH, then a previously downloaded portable
/// copy, then download one into app-local data. Mirrors `ensure_npx` above.
pub async fn ensure_uvx(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = find_on_path("uvx") {
        return Ok(path);
    }

    let cached = platform_uvx_path(&uv_install_dir(app)?);
    if cached.is_file() {
        return Ok(cached);
    }

    download_and_extract_uv(app).await
}

fn find_on_path(bin: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let candidates: Vec<String> = if cfg!(windows) {
        vec![format!("{bin}.cmd"), format!("{bin}.exe"), bin.to_string()]
    } else {
        vec![bin.to_string()]
    };
    std::env::split_paths(&path_var).find_map(|dir| {
        candidates
            .iter()
            .map(|name| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
}

fn node_install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("node-runtime").join(NODE_VERSION))
}

fn archive_root_name() -> Result<String, String> {
    if cfg!(windows) {
        Ok(format!("node-v{NODE_VERSION}-win-x64"))
    } else if cfg!(target_os = "macos") {
        let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
        Ok(format!("node-v{NODE_VERSION}-darwin-{arch}"))
    } else if cfg!(target_os = "linux") {
        Ok(format!("node-v{NODE_VERSION}-linux-x64"))
    } else {
        Err("Automatic Node.js install isn't supported on this OS".into())
    }
}

fn platform_npx_path(install_dir: &Path) -> PathBuf {
    let root = archive_root_name().unwrap_or_default();
    if cfg!(windows) {
        install_dir.join(root).join("npx.cmd")
    } else {
        install_dir.join(root).join("bin").join("npx")
    }
}

fn download_url() -> Result<String, String> {
    let root = archive_root_name()?;
    let filename = if cfg!(windows) {
        format!("{root}.zip")
    } else {
        format!("{root}.tar.gz")
    };
    Ok(format!("https://nodejs.org/dist/v{NODE_VERSION}/{filename}"))
}

fn emit_log(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit("mcp://runtime-log", message.into());
}

fn uv_install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("uv-runtime").join(UV_VERSION))
}

/// Unlike Node's archives, uv's Windows zip is flat (no subfolder) while the macOS/Linux
/// tar.gz archives extract into a subfolder named after the target triple.
fn uv_archive_subdir() -> Result<Option<String>, String> {
    if cfg!(windows) {
        Ok(None)
    } else if cfg!(target_os = "macos") {
        let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
        Ok(Some(format!("uv-{arch}-apple-darwin")))
    } else if cfg!(target_os = "linux") {
        Ok(Some("uv-x86_64-unknown-linux-gnu".to_string()))
    } else {
        Err("Automatic uv install isn't supported on this OS".into())
    }
}

fn uv_download_filename() -> Result<String, String> {
    if cfg!(windows) {
        Ok("uv-x86_64-pc-windows-msvc.zip".to_string())
    } else if cfg!(target_os = "macos") {
        let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
        Ok(format!("uv-{arch}-apple-darwin.tar.gz"))
    } else if cfg!(target_os = "linux") {
        Ok("uv-x86_64-unknown-linux-gnu.tar.gz".to_string())
    } else {
        Err("Automatic uv install isn't supported on this OS".into())
    }
}

fn platform_uvx_path(install_dir: &Path) -> PathBuf {
    let bin_name = if cfg!(windows) { "uvx.exe" } else { "uvx" };
    match uv_archive_subdir().unwrap_or(None) {
        Some(subdir) => install_dir.join(subdir).join(bin_name),
        None => install_dir.join(bin_name),
    }
}

async fn download_and_extract_uv(app: &AppHandle) -> Result<PathBuf, String> {
    let install_dir = uv_install_dir(app)?;
    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| e.to_string())?;

    let filename = uv_download_filename()?;
    let url = format!("https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{filename}");
    emit_log(app, "Downloading uv runtime (one-time, ~15-20MB)...");

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Failed to download uv runtime: HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    emit_log(app, "Extracting uv runtime...");
    let install_dir_for_extract = install_dir.clone();
    let is_windows = cfg!(windows);
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if is_windows {
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            archive
                .extract(&install_dir_for_extract)
                .map_err(|e| e.to_string())
        } else {
            let decoder = flate2::read::GzDecoder::new(&bytes[..]);
            let mut archive = tar::Archive::new(decoder);
            archive
                .unpack(&install_dir_for_extract)
                .map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let uvx = platform_uvx_path(&install_dir);
    if !uvx.is_file() {
        return Err("uv download completed but uvx was not found in the archive".into());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&uvx) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o111);
            let _ = std::fs::set_permissions(&uvx, perms);
        }
    }

    emit_log(app, "uv runtime ready.");
    Ok(uvx)
}

async fn download_and_extract_node(app: &AppHandle) -> Result<PathBuf, String> {
    let install_dir = node_install_dir(app)?;
    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| e.to_string())?;

    let url = download_url()?;
    emit_log(app, "Downloading Node.js runtime (one-time, ~30-50MB)...");

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download Node.js runtime: HTTP {}",
            response.status()
        ));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    emit_log(app, "Extracting Node.js runtime...");
    let install_dir_for_extract = install_dir.clone();
    let is_windows = cfg!(windows);
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if is_windows {
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            archive
                .extract(&install_dir_for_extract)
                .map_err(|e| e.to_string())
        } else {
            let decoder = flate2::read::GzDecoder::new(&bytes[..]);
            let mut archive = tar::Archive::new(decoder);
            archive
                .unpack(&install_dir_for_extract)
                .map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let npx = platform_npx_path(&install_dir);
    if !npx.is_file() {
        return Err("Node.js download completed but npx was not found in the archive".into());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&npx) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o111);
            let _ = std::fs::set_permissions(&npx, perms);
        }
    }

    emit_log(app, "Node.js runtime ready.");
    Ok(npx)
}
