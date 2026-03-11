#[cfg(not(target_os = "macos"))]
use crate::utils::openclaw_command;
/// 配置读写命令
use serde_json::Value;
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use crate::models::types::VersionInfo;

struct GuardianPause {
    reason: &'static str,
}

impl GuardianPause {
    fn new(reason: &'static str) -> Self {
        crate::commands::service::guardian_pause(reason);
        Self { reason }
    }
}

impl Drop for GuardianPause {
    fn drop(&mut self) {
        crate::commands::service::guardian_resume(self.reason);
    }
}

/// 预设 npm 源列表
const DEFAULT_REGISTRY: &str = "https://registry.npmmirror.com";

/// 读取用户配置的 npm registry，fallback 到淘宝镜像
fn get_configured_registry() -> String {
    let path = super::openclaw_dir().join("npm-registry.txt");
    fs::read_to_string(&path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_REGISTRY.to_string())
}

/// 创建使用配置源的 npm Command
/// Windows 上 npm 是 npm.cmd，需要通过 cmd /c 调用，并隐藏窗口
fn npm_command() -> Command {
    let registry = get_configured_registry();
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "npm", "--registry", &registry]);
        cmd.env("PATH", super::enhanced_path());
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("npm");
        cmd.args(["--registry", &registry]);
        cmd.env("PATH", super::enhanced_path());
        cmd
    }
}

fn backups_dir() -> PathBuf {
    super::openclaw_dir().join("backups")
}

#[cfg(target_os = "macos")]
fn cleanup_openclaw_launchagents(logs: &mut Vec<String>) {
    let uid = get_uid().unwrap_or(501);
    let home = dirs::home_dir().unwrap_or_default();
    let agents_dir = home.join("Library/LaunchAgents");

    if let Ok(entries) = fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !name.starts_with("ai.openclaw.") || !name.ends_with(".plist") {
                continue;
            }
            let label = name.trim_end_matches(".plist");
            let target = format!("gui/{uid}/{label}");
            let _ = Command::new("launchctl").args(["bootout", &target]).output();
            if fs::remove_file(&path).is_ok() {
                logs.push(format!("已删除 LaunchAgent: {name}"));
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn cleanup_openclaw_processes(logs: &mut Vec<String>) {
    let patterns = [
        ["taskkill", "/f", "/t", "/im", "node.exe"],
        ["taskkill", "/f", "/t", "/fi", "WINDOWTITLE eq OpenClaw Gateway"],
    ];

    for cmd in patterns {
        let _ = Command::new(cmd[0])
            .args(&cmd[1..])
            .creation_flags(0x08000000)
            .output();
    }
    logs.push("已尝试结束 OpenClaw / Gateway 残留进程".into());
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn cleanup_openclaw_processes(logs: &mut Vec<String>) {
    let patterns = [
        "openclaw.*gateway",
        "openclaw.*node",
        "ai.openclaw",
        "guardian",
    ];
    for pattern in patterns {
        let _ = Command::new("pkill").args(["-f", pattern]).output();
    }
    logs.push("已尝试结束 OpenClaw / Gateway / guardian 残留进程".into());
}

#[cfg(target_os = "windows")]
fn windows_powershell_path() -> String {
    std::env::var("SystemRoot")
        .map(|root| format!(r"{}\System32\WindowsPowerShell\v1.0\powershell.exe", root))
        .unwrap_or_else(|_| "powershell.exe".to_string())
}

#[cfg(target_os = "windows")]
fn resolve_openclaw_cli_path() -> Result<String, String> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let cmd_path = std::path::Path::new(&appdata)
            .join("npm")
            .join("openclaw.cmd");
        if cmd_path.exists() {
            return Ok(cmd_path.to_string_lossy().to_string());
        }
    }

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "where", "openclaw"]);
    cmd.env("PATH", super::enhanced_path());
    cmd.creation_flags(CREATE_NO_WINDOW);

    let out = cmd.output().map_err(|e| format!("查找 openclaw 失败: {e}"))?;
    if !out.status.success() {
        return Err("未找到 openclaw CLI，请安装完成后重启 ClawPanel 再试".into());
    }

    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
        .ok_or_else(|| "未找到 openclaw CLI 可执行文件".into())
}

#[cfg(target_os = "macos")]
fn resolve_openclaw_cli_path() -> Result<String, String> {
    let out = Command::new("which")
        .arg("openclaw")
        .env("PATH", super::enhanced_path())
        .output()
        .map_err(|e| format!("查找 openclaw 失败: {e}"))?;

    if !out.status.success() {
        return Err("未找到 openclaw CLI，请确认已安装并重启 ClawPanel 再试".into());
    }

    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
        .ok_or_else(|| "未找到 openclaw CLI 可执行文件".into())
}

#[tauri::command]
pub fn read_openclaw_config() -> Result<Value, String> {
    let path = super::openclaw_dir().join("openclaw.json");
    let raw = fs::read(&path).map_err(|e| format!("读取配置失败: {e}"))?;

    // 自愈：自动剥离 UTF-8 BOM（EF BB BF），防止 JSON 解析失败
    let content = if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8_lossy(&raw[3..]).into_owned()
    } else {
        String::from_utf8_lossy(&raw).into_owned()
    };

    // 解析 JSON，失败时尝试从备份恢复
    let mut config: Value = match serde_json::from_str(&content) {
        Ok(v) => {
            // BOM 被剥离过，静默写回干净文件
            if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
                let _ = fs::write(&path, &content);
            }
            v
        }
        Err(e) => {
            // JSON 解析失败，尝试从备份恢复
            let bak = super::openclaw_dir().join("openclaw.json.bak");
            if bak.exists() {
                let bak_raw = fs::read(&bak).map_err(|e2| format!("备份也读取失败: {e2}"))?;
                let bak_content = if bak_raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
                    String::from_utf8_lossy(&bak_raw[3..]).into_owned()
                } else {
                    String::from_utf8_lossy(&bak_raw).into_owned()
                };
                let bak_config: Value = serde_json::from_str(&bak_content)
                    .map_err(|e2| format!("配置损坏且备份也无效: 原始={e}, 备份={e2}"))?;
                // 备份有效，恢复主文件
                let _ = fs::write(&path, &bak_content);
                bak_config
            } else {
                return Err(format!("配置 JSON 损坏且无备份: {e}"));
            }
        }
    };

    // 自动清理 UI 专属字段，防止污染配置导致 CLI 启动失败
    if has_ui_fields(&config) {
        config = strip_ui_fields(config);
        // 静默写回清理后的配置
        let bak = super::openclaw_dir().join("openclaw.json.bak");
        let _ = fs::copy(&path, &bak);
        let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
        let _ = fs::write(&path, json);
    }

    Ok(config)
}

/// 供其他模块复用：读取 openclaw.json 为 JSON Value
pub fn load_openclaw_json() -> Result<Value, String> {
    read_openclaw_config()
}

/// 供其他模块复用：将 JSON Value 写回 openclaw.json（含备份和清理）
pub fn save_openclaw_json(config: &Value) -> Result<(), String> {
    write_openclaw_config(config.clone())
}

/// 供其他模块复用：触发 Gateway 重载
pub async fn do_reload_gateway(app: &tauri::AppHandle) -> Result<String, String> {
    let _ = app; // 预留扩展用
    reload_gateway().await
}

#[tauri::command]
pub fn write_openclaw_config(config: Value) -> Result<(), String> {
    let path = super::openclaw_dir().join("openclaw.json");
    // 备份
    let bak = super::openclaw_dir().join("openclaw.json.bak");
    let _ = fs::copy(&path, &bak);
    // 清理 UI 专属字段，避免 CLI schema 校验失败
    let cleaned = strip_ui_fields(config.clone());
    // 写入
    let json = serde_json::to_string_pretty(&cleaned).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&path, &json).map_err(|e| format!("写入失败: {e}"))?;

    // 同步 provider 配置到所有 agent 的 models.json（运行时注册表）
    sync_providers_to_agent_models(&config);

    Ok(())
}

/// 将 openclaw.json 的 models.providers 完整同步到每个 agent 的 models.json
/// 包括：同步 baseUrl/apiKey/api、删除已移除的 provider、删除已移除的 model、
/// 确保 Gateway 运行时不会引用 openclaw.json 中已不存在的模型
fn sync_providers_to_agent_models(config: &Value) {
    let src_providers = config
        .pointer("/models/providers")
        .and_then(|p| p.as_object());

    // 收集 openclaw.json 中所有有效的 provider/model 组合
    let mut valid_models: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Some(providers) = src_providers {
        for (pk, pv) in providers {
            if let Some(models) = pv.get("models").and_then(|m| m.as_array()) {
                for m in models {
                    let id = m.get("id").and_then(|v| v.as_str()).or_else(|| m.as_str());
                    if let Some(id) = id {
                        valid_models.insert(format!("{}/{}", pk, id));
                    }
                }
            }
        }
    }

    // 收集所有 agent ID
    let mut agent_ids = vec!["main".to_string()];
    if let Some(Value::Array(list)) = config.pointer("/agents/list") {
        for agent in list {
            if let Some(id) = agent.get("id").and_then(|v| v.as_str()) {
                if id != "main" {
                    agent_ids.push(id.to_string());
                }
            }
        }
    }

    let agents_dir = super::openclaw_dir().join("agents");
    for agent_id in &agent_ids {
        let models_path = agents_dir.join(agent_id).join("agent").join("models.json");
        if !models_path.exists() {
            continue;
        }
        let Ok(content) = fs::read_to_string(&models_path) else {
            continue;
        };
        let Ok(mut models_json) = serde_json::from_str::<Value>(&content) else {
            continue;
        };

        let mut changed = false;

        // 同步 providers
        if let Some(dst_providers) = models_json
            .get_mut("providers")
            .and_then(|p| p.as_object_mut())
        {
            // 1. 删除 openclaw.json 中已不存在的 provider
            if let Some(src) = src_providers {
                let to_remove: Vec<String> = dst_providers
                    .keys()
                    .filter(|k| !src.contains_key(k.as_str()))
                    .cloned()
                    .collect();
                for k in to_remove {
                    dst_providers.remove(&k);
                    changed = true;
                }

                // 2. 同步存在的 provider 的 baseUrl/apiKey/api + 清理已删除的 models
                for (provider_name, src_provider) in src.iter() {
                    if let Some(dst_provider) = dst_providers.get_mut(provider_name) {
                        if let Some(dst_obj) = dst_provider.as_object_mut() {
                            // 同步连接信息
                            for field in ["baseUrl", "apiKey", "api"] {
                                if let Some(src_val) =
                                    src_provider.get(field).and_then(|v| v.as_str())
                                {
                                    if dst_obj.get(field).and_then(|v| v.as_str()) != Some(src_val)
                                    {
                                        dst_obj.insert(
                                            field.to_string(),
                                            Value::String(src_val.to_string()),
                                        );
                                        changed = true;
                                    }
                                }
                            }
                            // 清理已删除的 models
                            if let Some(dst_models) =
                                dst_obj.get_mut("models").and_then(|m| m.as_array_mut())
                            {
                                let src_model_ids: std::collections::HashSet<String> = src_provider
                                    .get("models")
                                    .and_then(|m| m.as_array())
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|m| {
                                                m.get("id")
                                                    .and_then(|v| v.as_str())
                                                    .or_else(|| m.as_str())
                                                    .map(|s| s.to_string())
                                            })
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                let before = dst_models.len();
                                dst_models.retain(|m| {
                                    let id = m
                                        .get("id")
                                        .and_then(|v| v.as_str())
                                        .or_else(|| m.as_str())
                                        .unwrap_or("");
                                    src_model_ids.contains(id)
                                });
                                if dst_models.len() != before {
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        if changed {
            if let Ok(new_json) = serde_json::to_string_pretty(&models_json) {
                let _ = fs::write(&models_path, new_json);
            }
        }
    }
}

/// 检测配置中是否包含 UI 专属字段
fn has_ui_fields(val: &Value) -> bool {
    if let Some(obj) = val.as_object() {
        if let Some(models_val) = obj.get("models") {
            if let Some(models_obj) = models_val.as_object() {
                if let Some(providers_val) = models_obj.get("providers") {
                    if let Some(providers_obj) = providers_val.as_object() {
                        for (_provider_name, provider_val) in providers_obj.iter() {
                            if let Some(provider_obj) = provider_val.as_object() {
                                if let Some(Value::Array(arr)) = provider_obj.get("models") {
                                    for model in arr.iter() {
                                        if let Some(mobj) = model.as_object() {
                                            if mobj.contains_key("lastTestAt")
                                                || mobj.contains_key("latency")
                                                || mobj.contains_key("testStatus")
                                                || mobj.contains_key("testError")
                                            {
                                                return true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

/// 递归清理 models 数组中的 UI 专属字段（lastTestAt, latency, testStatus, testError）
/// 并为缺少 name 字段的模型自动补上 name = id
fn strip_ui_fields(mut val: Value) -> Value {
    if let Some(obj) = val.as_object_mut() {
        // 处理 models.providers.xxx.models 结构
        if let Some(models_val) = obj.get_mut("models") {
            if let Some(models_obj) = models_val.as_object_mut() {
                if let Some(providers_val) = models_obj.get_mut("providers") {
                    if let Some(providers_obj) = providers_val.as_object_mut() {
                        for (_provider_name, provider_val) in providers_obj.iter_mut() {
                            if let Some(provider_obj) = provider_val.as_object_mut() {
                                if let Some(Value::Array(arr)) = provider_obj.get_mut("models") {
                                    for model in arr.iter_mut() {
                                        if let Some(mobj) = model.as_object_mut() {
                                            mobj.remove("lastTestAt");
                                            mobj.remove("latency");
                                            mobj.remove("testStatus");
                                            mobj.remove("testError");
                                            if !mobj.contains_key("name") {
                                                if let Some(id) =
                                                    mobj.get("id").and_then(|v| v.as_str())
                                                {
                                                    mobj.insert(
                                                        "name".into(),
                                                        Value::String(id.to_string()),
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    val
}

#[tauri::command]
pub fn read_mcp_config() -> Result<Value, String> {
    let path = super::openclaw_dir().join("mcp.json");
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {e}"))
}

#[tauri::command]
pub fn write_mcp_config(config: Value) -> Result<(), String> {
    let path = super::openclaw_dir().join("mcp.json");
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("写入失败: {e}"))
}

/// 获取本地安装的 openclaw 版本号（异步版本）
/// macOS: 优先从 npm 包的 package.json 读取（含完整后缀），fallback 到 CLI
/// Windows/Linux: 优先读文件系统，fallback 到 CLI
async fn get_local_version() -> Option<String> {
    // macOS: 通过 symlink 找到包目录，读 package.json 的 version
    #[cfg(target_os = "macos")]
    {
        if let Ok(target) = fs::read_link("/opt/homebrew/bin/openclaw") {
            let pkg_json = PathBuf::from("/opt/homebrew/bin")
                .join(&target)
                .parent()?
                .join("package.json");
            if let Ok(content) = fs::read_to_string(&pkg_json) {
                if let Some(ver) = serde_json::from_str::<Value>(&content)
                    .ok()
                    .and_then(|v| v.get("version")?.as_str().map(String::from))
                {
                    return Some(ver);
                }
            }
        }
    }
    // Windows: 直接读 npm 全局目录下的 package.json，避免 spawn 进程
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            // 先查汉化版，再查官方版
            for pkg in &["@qingchencloud/openclaw-zh", "openclaw"] {
                let pkg_json = PathBuf::from(&appdata)
                    .join("npm")
                    .join("node_modules")
                    .join(pkg)
                    .join("package.json");
                if let Ok(content) = fs::read_to_string(&pkg_json) {
                    if let Some(ver) = serde_json::from_str::<Value>(&content)
                        .ok()
                        .and_then(|v| v.get("version")?.as_str().map(String::from))
                    {
                        return Some(ver);
                    }
                }
            }
        }
    }
    // 所有平台通用 fallback: CLI 输出（异步）
    use crate::utils::openclaw_command_async;
    let output = openclaw_command_async()
        .arg("--version")
        .output()
        .await
        .ok()?;
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    raw.split_whitespace()
        .last()
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// 从 npm registry 获取最新版本号，超时 5 秒
async fn get_latest_version_for(source: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()?;
    let pkg = npm_package_name(source)
        .replace('/', "%2F")
        .replace('@', "%40");
    let registry = get_configured_registry();
    let url = format!("{registry}/{pkg}/latest");
    let resp = client.get(&url).send().await.ok()?;
    let json: Value = resp.json().await.ok()?;
    json.get("version")
        .and_then(|v| v.as_str())
        .map(String::from)
}

/// 检测当前安装的是官方版还是汉化版
/// macOS: 优先检查 homebrew symlink，fallback 到 npm list
/// Windows: 优先检查 npm 全局目录下的 package.json，避免调用 npm list 阻塞
/// Linux: 直接用 npm list
fn detect_installed_source() -> String {
    // macOS: 检查 openclaw bin 的 symlink 指向
    #[cfg(target_os = "macos")]
    {
        if let Ok(target) = std::fs::read_link("/opt/homebrew/bin/openclaw") {
            if target.to_string_lossy().contains("openclaw-zh") {
                return "chinese".into();
            }
            return "official".into();
        }
        "official".into()
    }
    // Windows: 优先通过文件系统检测，避免 npm list 阻塞
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let zh_dir = PathBuf::from(&appdata)
                .join("npm")
                .join("node_modules")
                .join("@qingchencloud")
                .join("openclaw-zh");
            if zh_dir.exists() {
                return "chinese".into();
            }
        }
        "official".into()
    }
    // 所有平台通用: npm list 检测
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Ok(o) = npm_command()
            .args(["list", "-g", "@qingchencloud/openclaw-zh", "--depth=0"])
            .output()
        {
            if String::from_utf8_lossy(&o.stdout).contains("openclaw-zh@") {
                return "chinese".into();
            }
        }
        "official".into()
    }
}

#[tauri::command]
pub async fn get_version_info() -> Result<VersionInfo, String> {
    let current = get_local_version().await;
    let source = detect_installed_source();
    let latest = get_latest_version_for(&source).await;
    let parse_ver = |v: &str| -> Vec<u32> {
        v.split(|c: char| !c.is_ascii_digit())
            .filter_map(|s| s.parse().ok())
            .collect()
    };
    let update_available = match (&current, &latest) {
        (Some(c), Some(l)) => parse_ver(l) > parse_ver(c),
        _ => false,
    };
    Ok(VersionInfo {
        current,
        latest,
        update_available,
        source,
    })
}

/// npm 包名映射
fn npm_package_name(source: &str) -> &'static str {
    match source {
        "official" => "openclaw",
        _ => "@qingchencloud/openclaw-zh",
    }
}

/// 获取指定源的所有可用版本列表（从 npm registry 查询）
#[tauri::command]
pub async fn list_openclaw_versions(source: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP 初始化失败: {e}"))?;
    let pkg = npm_package_name(&source).replace('/', "%2F");
    let registry = get_configured_registry();
    let url = format!("{registry}/{pkg}");
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("查询版本失败: {e}"))?;
    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;
    let versions = json
        .get("versions")
        .and_then(|v| v.as_object())
        .map(|obj| {
            let mut vers: Vec<String> = obj.keys().cloned().collect();
            // 按版本号排序（新版本在前）
            vers.sort_by(|a, b| {
                let pa: Vec<u32> = a
                    .split(|c: char| !c.is_ascii_digit())
                    .filter_map(|s| s.parse().ok())
                    .collect();
                let pb: Vec<u32> = b
                    .split(|c: char| !c.is_ascii_digit())
                    .filter_map(|s| s.parse().ok())
                    .collect();
                pb.cmp(&pa)
            });
            vers
        })
        .unwrap_or_default();
    Ok(versions)
}

/// 执行 npm 全局安装/升级/降级 openclaw（流式推送日志）
#[tauri::command]
pub async fn upgrade_openclaw(
    app: tauri::AppHandle,
    source: String,
    version: Option<String>,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use tauri::Emitter;
    let _guardian_pause = GuardianPause::new("upgrade");

    let current_source = detect_installed_source();
    let pkg_name = npm_package_name(&source);
    let ver = version.as_deref().unwrap_or("latest");
    let pkg = format!("{}@{}", pkg_name, ver);

    // 切换源时需要卸载旧包，但为避免安装失败导致 CLI 丢失，
    // 先安装新包，成功后再卸载旧包
    let old_pkg = npm_package_name(&current_source);
    let need_uninstall_old = current_source != source;

    // 自动配置 git 使用 HTTPS 替代 SSH，避免用户没配 SSH Key 导致依赖安装失败
    let _ = app.emit("upgrade-log", "配置 Git HTTPS 模式...");
    let _ = Command::new("git")
        .args([
            "config",
            "--global",
            "url.https://github.com/.insteadOf",
            "ssh://git@github.com/",
        ])
        .output();
    let _ = Command::new("git")
        .args([
            "config",
            "--global",
            "url.https://github.com/.insteadOf",
            "git@github.com:",
        ])
        .output();

    let _ = app.emit("upgrade-log", format!("$ npm install -g {pkg}"));
    let _ = app.emit("upgrade-progress", 10);

    // 汉化版只支持官方源和淘宝源
    let configured_registry = get_configured_registry();
    let registry = if pkg_name.contains("openclaw-zh") {
        // 汉化版：淘宝源或官方源
        if configured_registry.contains("npmmirror.com")
            || configured_registry.contains("taobao.org")
        {
            configured_registry.as_str()
        } else {
            "https://registry.npmjs.org"
        }
    } else {
        // 官方版：使用用户配置的镜像源
        configured_registry.as_str()
    };

    let mut child = npm_command()
        .args(["install", "-g", &pkg, "--registry", registry, "--verbose"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("执行升级命令失败: {e}"))?;

    let stderr = child.stderr.take();
    let stdout = child.stdout.take();

    // stderr 每行递增进度（10→80 区间），让用户看到进度在动
    // 同时收集 stderr 用于失败时返回给前端诊断
    let app2 = app.clone();
    let stderr_lines = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let stderr_lines2 = stderr_lines.clone();
    let handle = std::thread::spawn(move || {
        let mut progress: u32 = 15;
        if let Some(pipe) = stderr {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                let _ = app2.emit("upgrade-log", &line);
                stderr_lines2.lock().unwrap().push(line);
                if progress < 75 {
                    progress += 2;
                    let _ = app2.emit("upgrade-progress", progress);
                }
            }
        }
    });

    if let Some(pipe) = stdout {
        for line in BufReader::new(pipe).lines().map_while(Result::ok) {
            let _ = app.emit("upgrade-log", &line);
        }
    }

    let _ = handle.join();
    let _ = app.emit("upgrade-progress", 80);

    let status = child.wait().map_err(|e| format!("等待进程失败: {e}"))?;
    let _ = app.emit("upgrade-progress", 100);

    if !status.success() {
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or("unknown".into());
        let _ = app.emit("upgrade-log", format!("❌ 升级失败 (exit code: {code})"));
        // 把 stderr 最后 15 行带进错误消息，确保前端诊断函数能匹配到
        // npm 内部错误码（如 -4058 ENOENT、EPERM 等）
        let tail = stderr_lines
            .lock()
            .unwrap()
            .iter()
            .rev()
            .take(15)
            .rev()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("升级失败，exit code: {code}\n{tail}"));
    }

    // 安装成功后再卸载旧包（确保 CLI 始终可用）
    if need_uninstall_old {
        let _ = app.emit("upgrade-log", format!("清理旧版本 ({old_pkg})..."));
        let _ = npm_command().args(["uninstall", "-g", old_pkg]).output();
    }

    if need_uninstall_old {
        let _ = app.emit("upgrade-log", "已清理旧版本 npm 包，跳过 Gateway 服务安装");
    }

    let new_ver = get_local_version().await.unwrap_or_else(|| "未知".into());
    let action = if ver == "latest" { "升级" } else { "安装" };
    let msg = format!("✅ {action}成功，当前版本: {new_ver}");
    let _ = app.emit("upgrade-log", &msg);
    Ok(msg)
}

/// 卸载 OpenClaw（npm uninstall + 可选清理配置）
#[tauri::command]
pub async fn uninstall_openclaw(
    app: tauri::AppHandle,
    clean_config: bool,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use tauri::Emitter;
    let _guardian_pause = GuardianPause::new("uninstall openclaw");
    crate::commands::service::guardian_mark_manual_stop();

    let source = detect_installed_source();
    let pkg = npm_package_name(&source);

    // 1. 先停止 Gateway
    let _ = app.emit("upgrade-log", "正在停止 Gateway...");
    #[cfg(target_os = "macos")]
    {
        let uid = get_uid().unwrap_or(501);
        let _ = Command::new("launchctl")
            .args(["bootout", &format!("gui/{uid}/ai.openclaw.gateway")])
            .output();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = openclaw_command().args(["gateway", "stop"]).output();
    }

    // 2. 卸载 Gateway 服务
    let _ = app.emit("upgrade-log", "正在卸载 Gateway 服务...");
    #[cfg(not(target_os = "macos"))]
    {
        let _ = openclaw_command().args(["gateway", "uninstall"]).output();
    }

    // 3. npm uninstall
    let _ = app.emit("upgrade-log", format!("$ npm uninstall -g {pkg}"));
    let _ = app.emit("upgrade-progress", 20);

    let mut child = npm_command()
        .args(["uninstall", "-g", pkg])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("执行卸载命令失败: {e}"))?;

    let stderr = child.stderr.take();
    let stdout = child.stdout.take();

    let app2 = app.clone();
    let handle = std::thread::spawn(move || {
        if let Some(pipe) = stderr {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                let _ = app2.emit("upgrade-log", &line);
            }
        }
    });

    if let Some(pipe) = stdout {
        for line in BufReader::new(pipe).lines().map_while(Result::ok) {
            let _ = app.emit("upgrade-log", &line);
        }
    }

    let _ = handle.join();
    let _ = app.emit("upgrade-progress", 60);

    let status = child.wait().map_err(|e| format!("等待进程失败: {e}"))?;
    if !status.success() {
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or("unknown".into());
        return Err(format!("卸载失败，exit code: {code}"));
    }

    // 4. 两个包都尝试卸载（确保干净）
    let other_pkg = if source == "official" {
        "@qingchencloud/openclaw-zh"
    } else {
        "openclaw"
    };
    let _ = app.emit("upgrade-log", format!("清理 {other_pkg}..."));
    let _ = npm_command().args(["uninstall", "-g", other_pkg]).output();
    let _ = app.emit("upgrade-progress", 80);

    // 5. 可选：清理配置目录
    if clean_config {
        let config_dir = super::openclaw_dir();
        if config_dir.exists() {
            let _ = app.emit(
                "upgrade-log",
                format!("清理配置目录: {}", config_dir.display()),
            );
            if let Err(e) = std::fs::remove_dir_all(&config_dir) {
                let _ = app.emit(
                    "upgrade-log",
                    format!("⚠️ 清理配置目录失败: {e}（可能有文件被占用）"),
                );
            }
        }
    }

    let _ = app.emit("upgrade-progress", 100);
    let msg = if clean_config {
        "✅ OpenClaw 已完全卸载（包括配置文件）"
    } else {
        "✅ OpenClaw 已卸载（配置文件保留在 ~/.openclaw/）"
    };
    let _ = app.emit("upgrade-log", msg);
    Ok(msg.into())
}

#[tauri::command]
pub async fn purge_openclaw(app: tauri::AppHandle) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use tauri::Emitter;

    let _ = app.emit("upgrade-log", "开始彻底卸载 OpenClaw...");
    let _ = app.emit("upgrade-progress", 5);

    let mut cleanup_logs = Vec::new();

    #[cfg(target_os = "macos")]
    cleanup_openclaw_launchagents(&mut cleanup_logs);

    cleanup_openclaw_processes(&mut cleanup_logs);

    for line in cleanup_logs {
        let _ = app.emit("upgrade-log", line);
    }

    // 1. 尝试运行 openclaw uninstall --all --yes（best-effort，失败不中止）
    let _ = app.emit("upgrade-log", "$ openclaw uninstall --all --yes");
    let _ = app.emit("upgrade-progress", 15);

    match crate::utils::openclaw_command()
        .args(["uninstall", "--all", "--yes"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(mut child) => {
            let stderr = child.stderr.take();
            let stdout = child.stdout.take();
            let app2 = app.clone();
            let h = std::thread::spawn(move || {
                if let Some(pipe) = stderr {
                    for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                        let _ = app2.emit("upgrade-log", &line);
                    }
                }
            });
            if let Some(pipe) = stdout {
                for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                    let _ = app.emit("upgrade-log", &line);
                }
            }
            let _ = h.join();
            match child.wait() {
                Ok(s) if s.success() => {
                    let _ = app.emit("upgrade-log", "openclaw uninstall 执行成功");
                }
                Ok(s) => {
                    let code = s.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".into());
                    let _ = app.emit("upgrade-log", format!("⚠️ openclaw uninstall 退出码 {code}，继续兜底清理..."));
                }
                Err(e) => {
                    let _ = app.emit("upgrade-log", format!("⚠️ openclaw uninstall 等待失败: {e}，继续兜底清理..."));
                }
            }
        }
        Err(e) => {
            let _ = app.emit("upgrade-log", format!("⚠️ openclaw 命令未找到（{e}），跳至 npm 兜底卸载..."));
        }
    }

    // 2. npm uninstall 兜底（无论上面是否成功）
    let _ = app.emit("upgrade-progress", 50);
    for pkg in &["openclaw", "@qingchencloud/openclaw-zh"] {
        let _ = app.emit("upgrade-log", format!("$ npm uninstall -g {pkg}"));
        let _ = npm_command()
            .args(["uninstall", "-g", pkg])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }

    // 3. 兜底清理进程
    let _ = app.emit("upgrade-progress", 70);

    #[cfg(target_os = "macos")]
    {
        let mut logs = Vec::new();
        cleanup_openclaw_launchagents(&mut logs);
        cleanup_openclaw_processes(&mut logs);
        for line in logs {
            let _ = app.emit("upgrade-log", line);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut logs = Vec::new();
        cleanup_openclaw_processes(&mut logs);
        for line in logs {
            let _ = app.emit("upgrade-log", line);
        }
    }

    // 4. 删除配置目录（无论前面是否成功，始终执行）
    // Windows 上等待一会儿，让刚退出的进程释放文件句柄
    #[cfg(target_os = "windows")]
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    let _ = app.emit("upgrade-log", "正在删除配置目录...");
    let config_dir = super::openclaw_dir();
    if config_dir.exists() {
        let deleted = match fs::remove_dir_all(&config_dir) {
            Ok(_) => true,
            Err(e) => {
                let _ = app.emit("upgrade-log", format!("fs::remove_dir_all 失败({e})，尝试系统命令强制删除..."));
                false
            }
        };

        // Windows 上用 rmdir /s /q 强制兜底（处理只读文件/文件锁等情况）
        #[cfg(target_os = "windows")]
        if !deleted || config_dir.exists() {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let dir_str = config_dir.to_string_lossy().to_string();
            let _ = Command::new("cmd")
                .args(["/c", "rmdir", "/s", "/q", &dir_str])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }

        if config_dir.exists() {
            let _ = app.emit("upgrade-log", format!("⚠️ 配置目录仍存在，可能有文件正在使用，请手动删除: {}", config_dir.display()));
        } else {
            let _ = app.emit("upgrade-log", format!("✅ 已删除配置目录: {}", config_dir.display()));
        }
    } else {
        let _ = app.emit("upgrade-log", "配置目录不存在，跳过");
    }

    let _ = app.emit("upgrade-progress", 100);
    let msg = "✅ OpenClaw 已彻底卸载（CLI、Gateway、守护进程、LaunchAgent、配置目录）";
    let _ = app.emit("upgrade-log", msg);
    Ok(msg.into())
}

/// 自动初始化配置文件（CLI 已装但 openclaw.json 不存在时）
#[tauri::command]
pub fn init_openclaw_config() -> Result<Value, String> {
    let dir = super::openclaw_dir();
    let config_path = dir.join("openclaw.json");
    let mut result = serde_json::Map::new();

    if config_path.exists() {
        result.insert("created".into(), Value::Bool(false));
        result.insert("message".into(), Value::String("配置文件已存在".into()));
        return Ok(Value::Object(result));
    }

    // 确保目录存在
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let default_config = serde_json::json!({
        "$schema": "https://openclaw.ai/schema/config.json",
        "meta": { "lastTouchedVersion": "2026.1.1" },
        "models": { "providers": {} },
        "gateway": {
            "mode": "local",
            "port": 18789,
            "auth": { "mode": "none" },
            "controlUi": { "allowedOrigins": ["*"], "allowInsecureAuth": true }
        },
        "tools": { "profile": "full", "sessions": { "visibility": "all" } }
    });

    let content =
        serde_json::to_string_pretty(&default_config).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&config_path, content).map_err(|e| format!("写入失败: {e}"))?;

    result.insert("created".into(), Value::Bool(true));
    result.insert("message".into(), Value::String("配置文件已创建".into()));
    Ok(Value::Object(result))
}

#[tauri::command]
pub fn check_installation() -> Result<Value, String> {
    let dir = super::openclaw_dir();
    let installed = dir.join("openclaw.json").exists();
    let mut result = serde_json::Map::new();
    result.insert("installed".into(), Value::Bool(installed));
    result.insert(
        "path".into(),
        Value::String(dir.to_string_lossy().to_string()),
    );
    Ok(Value::Object(result))
}

/// 检测 Node.js 是否已安装，返回版本号
#[tauri::command]
pub fn check_node() -> Result<Value, String> {
    let mut result = serde_json::Map::new();

    // 优先直接读 clawpanel.json 中保存的自定义路径，不走 enhanced_path 缓存
    // 这样便携安装完成后无需重启 ClawPanel 即可立即检测到
    let custom_dir = super::openclaw_dir()
        .join("clawpanel.json")
        .exists()
        .then(|| {
            std::fs::read_to_string(super::openclaw_dir().join("clawpanel.json"))
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("nodePath")?.as_str().map(PathBuf::from))
        })
        .flatten();

    if let Some(dir) = custom_dir {
        #[cfg(target_os = "windows")]
        let node_bin = dir.join("node.exe");
        #[cfg(not(target_os = "windows"))]
        let node_bin = dir.join("node");

        if node_bin.exists() {
            let mut cmd = Command::new(&node_bin);
            cmd.arg("--version");
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000);
            if let Ok(o) = cmd.output() {
                if o.status.success() {
                    let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    result.insert("installed".into(), Value::Bool(true));
                    result.insert("version".into(), Value::String(ver));
                    return Ok(Value::Object(result));
                }
            }
        }
    }

    // 回退：通过 enhanced_path（含系统 PATH + 常见安装目录）查找
    let mut cmd = Command::new("node");
    cmd.arg("--version");
    cmd.env("PATH", super::enhanced_path());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    match cmd.output() {
        Ok(o) if o.status.success() => {
            let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
            result.insert("installed".into(), Value::Bool(true));
            result.insert("version".into(), Value::String(ver));
        }
        _ => {
            result.insert("installed".into(), Value::Bool(false));
            result.insert("version".into(), Value::Null);
        }
    }
    Ok(Value::Object(result))
}

#[tauri::command]
pub fn launch_openclaw_onboard_admin() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let cli_path = resolve_openclaw_cli_path()?;
        let ps_path = windows_powershell_path();
        let ps_escaped = ps_path.replace('\'', "''");
        let cli_escaped = cli_path.replace('\'', "''");
        let script = format!(
            "Start-Process -FilePath '{ps_escaped}' -Verb RunAs -ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-Command','& ''{cli_escaped}'' onboard --install-daemon')"
        );

        Command::new(&ps_path)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .env("PATH", super::enhanced_path())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开管理员命令行失败: {e}"))?;

        Ok("已请求打开管理员 PowerShell 并运行初始化向导".into())
    }

    #[cfg(target_os = "macos")]
    {
        let cli_path = resolve_openclaw_cli_path()?;
        let shell_escaped = cli_path.replace('\'', "'\\''");
        let command_line = format!("sudo '{}' onboard --install-daemon", shell_escaped);
        let applescript_command = command_line
            .replace('\\', "\\\\")
            .replace('"', "\\\"");

        Command::new("osascript")
            .args([
                "-e",
                &format!("tell application \"Terminal\" to do script \"{}\"", applescript_command),
                "-e",
                "tell application \"Terminal\" to activate",
            ])
            .spawn()
            .map_err(|e| format!("打开 Terminal 失败: {e}"))?;

        Ok("已打开 Terminal，并预填 sudo 初始化命令".into())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("当前平台不支持自动打开终端，请手动执行 openclaw onboard --install-daemon".into())
    }
}

/// 打开空白的管理员 PowerShell（用于包管理器安装 Node.js / Git 等）
#[tauri::command]
pub fn launch_admin_powershell() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let ps_path = windows_powershell_path();
        let ps_escaped = ps_path.replace('\'', "''");
        let script = format!(
            "Start-Process -FilePath '{ps_escaped}' -Verb RunAs -ArgumentList @('-NoExit')"
        );
        Command::new(&ps_path)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开管理员 PowerShell 失败: {e}"))?;
        Ok("已请求打开管理员 PowerShell".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台不支持".into())
    }
}

/// 打开系统文件夹选择对话框，返回用户选中的路径（Windows 通过 PowerShell FolderBrowserDialog 实现）
#[tauri::command]
pub fn pick_directory(title: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let ps_path = windows_powershell_path();
        let title_escaped = title.replace('\'', "\\'");
        let script = format!(
            r#"Add-Type -AssemblyName System.Windows.Forms; \
$d = New-Object System.Windows.Forms.FolderBrowserDialog; \
$d.Description = '{title_escaped}'; \
$d.ShowNewFolderButton = $true; \
if ($d.ShowDialog() -eq 'OK') {{ Write-Output $d.SelectedPath }} else {{ Write-Output '' }}"#
        );
        let output = Command::new(&ps_path)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("打开目录选择失败: {e}"))?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台不支持目录选择".into())
    }
}

/// 以管理员身份运行 PowerShell 脚本（写临时 ps1 文件，绕过参数引号限制）
#[tauri::command]
pub fn run_powershell_script_as_admin(commands: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let tmp = std::env::temp_dir().join("openclaw_setup_install.ps1");
        let script_content = format!(
            "{}\r\nWrite-Host ''\r\nWrite-Host 'Done! Close this window and click Re-detect in ClawPanel.' -ForegroundColor Green\r\nRead-Host 'Press Enter to close'",
            commands
        );
        // 写入 UTF-8 BOM，确保 Windows PowerShell 5 能正确读取
        let mut content_bytes = vec![0xEFu8, 0xBBu8, 0xBFu8];
        content_bytes.extend_from_slice(script_content.as_bytes());
        std::fs::write(&tmp, &content_bytes)
            .map_err(|e| format!("写临时脚本失败: {e}"))?;
        let ps_path = windows_powershell_path();
        let ps_escaped = ps_path.replace('\'', "''");
        let tmp_escaped = tmp.to_string_lossy().replace('\'', "''");
        // -NoExit 确保脚本运行完毕（或出错）后窗口保持打开，方便查看输出
        let launch_script = format!(
            "Start-Process -FilePath '{ps_escaped}' -Verb RunAs -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{tmp_escaped}')"
        );
        Command::new(&ps_path)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &launch_script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("启动管理员 PowerShell 失败: {e}"))?;
        Ok("已请求以管理员身份运行安装脚本".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台不支持".into())
    }
}

/// 在指定路径下检测 node 是否存在
#[tauri::command]
pub fn check_node_at_path(node_dir: String) -> Result<Value, String> {
    let dir = std::path::PathBuf::from(&node_dir);
    #[cfg(target_os = "windows")]
    let node_bin = dir.join("node.exe");
    #[cfg(not(target_os = "windows"))]
    let node_bin = dir.join("node");

    let mut result = serde_json::Map::new();
    if !node_bin.exists() {
        result.insert("installed".into(), Value::Bool(false));
        result.insert("version".into(), Value::Null);
        return Ok(Value::Object(result));
    }

    let mut cmd = Command::new(&node_bin);
    cmd.arg("--version");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    match cmd.output() {
        Ok(o) if o.status.success() => {
            let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
            result.insert("installed".into(), Value::Bool(true));
            result.insert("version".into(), Value::String(ver));
            result.insert("path".into(), Value::String(node_dir));
        }
        _ => {
            result.insert("installed".into(), Value::Bool(false));
            result.insert("version".into(), Value::Null);
        }
    }
    Ok(Value::Object(result))
}

/// 扫描常见路径，返回所有找到的 Node.js 安装
#[tauri::command]
pub fn scan_node_paths() -> Result<Value, String> {
    let mut found: Vec<Value> = vec![];
    let home = dirs::home_dir().unwrap_or_default();

    let mut candidates: Vec<String> = vec![];

    #[cfg(target_os = "windows")]
    {
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        let pf86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into());
        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let appdata = std::env::var("APPDATA").unwrap_or_default();

        candidates.push(format!(r"{}\nodejs", pf));
        candidates.push(format!(r"{}\nodejs", pf86));
        if !localappdata.is_empty() {
            candidates.push(format!(r"{}\Programs\nodejs", localappdata));
        }
        if !appdata.is_empty() {
            candidates.push(format!(r"{}\npm", appdata));
        }
        candidates.push(format!(r"{}\.volta\bin", home.display()));
        candidates.push(format!(r"{}\.nvm", home.display()));

        for drive in &["C", "D", "E", "F", "G"] {
            candidates.push(format!(r"{}:\nodejs", drive));
            candidates.push(format!(r"{}:\Node", drive));
            candidates.push(format!(r"{}:\Node.js", drive));
            candidates.push(format!(r"{}:\Program Files\nodejs", drive));
            // 扫描常见 AI 工具目录
            candidates.push(format!(r"{}:\AI\Node", drive));
            candidates.push(format!(r"{}:\AI\nodejs", drive));
            candidates.push(format!(r"{}:\Dev\nodejs", drive));
            candidates.push(format!(r"{}:\Tools\nodejs", drive));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push("/usr/local/bin".into());
        candidates.push("/opt/homebrew/bin".into());
        candidates.push(format!("{}/.nvm/current/bin", home.display()));
        candidates.push(format!("{}/.volta/bin", home.display()));
        candidates.push(format!("{}/.nodenv/shims", home.display()));
        candidates.push(format!("{}/.fnm/current/bin", home.display()));
        candidates.push(format!("{}/n/bin", home.display()));
    }

    for dir in &candidates {
        let path = std::path::Path::new(dir);
        #[cfg(target_os = "windows")]
        let node_bin = path.join("node.exe");
        #[cfg(not(target_os = "windows"))]
        let node_bin = path.join("node");

        if node_bin.exists() {
            let mut cmd = Command::new(&node_bin);
            cmd.arg("--version");
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000);
            if let Ok(o) = cmd.output() {
                if o.status.success() {
                    let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    let mut entry = serde_json::Map::new();
                    entry.insert("path".into(), Value::String(dir.clone()));
                    entry.insert("version".into(), Value::String(ver));
                    found.push(Value::Object(entry));
                }
            }
        }
    }

    Ok(Value::Array(found))
}

/// 保存用户自定义的 Node.js 路径到 ~/.openclaw/clawpanel.json
#[tauri::command]
pub fn save_custom_node_path(node_dir: String) -> Result<(), String> {
    let config_path = super::openclaw_dir().join("clawpanel.json");
    let mut config: serde_json::Map<String, Value> = if config_path.exists() {
        let content =
            std::fs::read_to_string(&config_path).map_err(|e| format!("读取配置失败: {e}"))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    config.insert("nodePath".into(), Value::String(node_dir));
    let json = serde_json::to_string_pretty(&Value::Object(config))
        .map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&config_path, json).map_err(|e| format!("写入配置失败: {e}"))?;
    Ok(())
}

// ===== Node.js 便携版自动安装 =====

/// 根据当前平台返回 Node.js 安装包文件名
fn node_portable_filename(version: &str) -> String {
    let arch = if std::env::consts::ARCH == "aarch64" { "arm64" } else { "x64" };
    if cfg!(target_os = "windows") {
        format!("node-v{version}-win-x64.zip")
    } else if cfg!(target_os = "macos") {
        format!("node-v{version}-darwin-{arch}.tar.gz")
    } else {
        format!("node-v{version}-linux-{arch}.tar.gz")
    }
}

/// 解压后 node 可执行文件所在目录
fn node_portable_bin_dir(install_base: &PathBuf, dir_stem: &str) -> PathBuf {
    let inner = install_base.join(dir_stem);
    if cfg!(target_os = "windows") {
        inner
    } else {
        inner.join("bin")
    }
}

/// 展开路径中的 ~ 为用户主目录（兼容 Unix 的 ~/ 和 Windows 的 ~\）
fn expand_tilde(path: &str) -> PathBuf {
    let stripped = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\"));
    if let Some(rest) = stripped {
        dirs::home_dir().unwrap_or_default().join(rest)
    } else if path == "~" {
        dirs::home_dir().unwrap_or_default()
    } else {
        PathBuf::from(path)
    }
}

/// 从 SHASUMS256.txt 内容中解析 Node.js 版本号
fn parse_node_version_from_shasums(content: &str) -> Option<String> {
    let re = regex::Regex::new(r"node-v(\d+\.\d+\.\d+)").ok()?;
    re.captures(content)?.get(1).map(|m| m.as_str().to_string())
}

/// 从网络获取最新 Node.js LTS 版本号，失败时返回 fallback
async fn fetch_lts_version_inner() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;
    // 淘宝镜像优先（对国内用户更快），失败回退官方
    let urls = [
        "https://registry.npmmirror.com/-/binary/node/latest-v22.x/SHASUMS256.txt",
        "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt",
    ];
    for url in urls {
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Some(ver) = parse_node_version_from_shasums(&text) {
                        return Some(ver);
                    }
                }
            }
        }
    }
    None
}

/// 获取最新 Node.js LTS 版本号（v22.x），失败时返回内置 fallback
#[tauri::command]
pub async fn get_latest_node_lts_version() -> Result<String, String> {
    const FALLBACK: &str = "22.14.0";
    Ok(fetch_lts_version_inner().await.unwrap_or_else(|| FALLBACK.to_string()))
}

/// 自动下载并安装便携版 Node.js（不修改系统 PATH）
#[tauri::command]
pub async fn install_node_portable(
    app: tauri::AppHandle,
    mirror: String,
    version: String,
    install_path: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;

    let filename = node_portable_filename(&version);
    let dir_stem = filename.replace(".tar.gz", "").replace(".zip", "");
    let install_base = install_path
        .as_deref()
        .map(expand_tilde)
        .unwrap_or_else(|| super::openclaw_dir().join("node"));
    let bin_dir = node_portable_bin_dir(&install_base, &dir_stem);

    #[cfg(target_os = "windows")]
    let node_bin = bin_dir.join("node.exe");
    #[cfg(not(target_os = "windows"))]
    let node_bin = bin_dir.join("node");

    // 已安装则跳过下载直接更新路径
    if node_bin.exists() {
        let _ = app.emit("upgrade-log", "已找到便携版 Node.js，跳过下载...");
        let _ = app.emit("upgrade-progress", 90);
        save_custom_node_path(bin_dir.to_string_lossy().to_string())?;
        let _ = app.emit("upgrade-progress", 100);
        let msg = format!("✅ Node.js v{version} 已就绪");
        let _ = app.emit("upgrade-log", &msg);
        return Ok(msg);
    }

    let url = if mirror == "official" {
        format!("https://nodejs.org/dist/v{version}/{filename}")
    } else {
        format!("https://registry.npmmirror.com/-/binary/node/v{version}/{filename}")
    };

    let tmp_path = super::openclaw_dir().join(&filename);

    let _ = app.emit("upgrade-log", format!("下载 Node.js v{version} (~30MB)..."));
    let _ = app.emit("upgrade-log", format!("来源: {url}"));
    let _ = app.emit("upgrade-progress", 5);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let mut response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP {}", response.status()));
    }

    let total = response.content_length();
    let mut buf: Vec<u8> = Vec::new();
    if let Some(t) = total {
        buf.reserve(t as usize);
    }

    let mut last_log_mb = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("下载中断: {e}"))? {
        buf.extend_from_slice(&chunk);
        let downloaded = buf.len() as u64;
        let mb = downloaded / (1024 * 1024);
        if mb > last_log_mb {
            last_log_mb = mb;
            if let Some(t) = total {
                let total_mb = t / (1024 * 1024);
                let _ = app.emit("upgrade-log", format!("下载中... {mb}MB / {total_mb}MB"));
                let p = (downloaded * 50 / t) as u32;
                let _ = app.emit("upgrade-progress", 5 + p);
            } else {
                let _ = app.emit("upgrade-log", format!("下载中... {mb}MB"));
            }
        }
    }

    let dl_mb = buf.len() / (1024 * 1024);
    let _ = app.emit("upgrade-log", format!("下载完成（{dl_mb}MB），正在解压..."));
    let _ = app.emit("upgrade-progress", 58);

    // 确保 openclaw_dir 和 install_base 均存在（首次安装时目录可能未创建）
    fs::create_dir_all(super::openclaw_dir()).map_err(|e| format!("创建基础目录失败: {e}"))?;
    fs::create_dir_all(&install_base).map_err(|e| format!("创建安装目录失败: {e}"))?;
    fs::write(&tmp_path, &buf).map_err(|e| format!("保存临时文件失败: {e}"))?;
    drop(buf);

    #[cfg(target_os = "windows")]
    {
        let file = fs::File::open(&tmp_path).map_err(|e| format!("打开压缩包失败: {e}"))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取 ZIP 失败: {e}"))?;
        let total_entries = archive.len();
        for i in 0..total_entries {
            let mut entry = archive.by_index(i).map_err(|e| format!("读取 ZIP 条目失败: {e}"))?;
            let outpath = install_base.join(entry.name());
            if entry.is_dir() {
                let _ = fs::create_dir_all(&outpath);
            } else {
                if let Some(parent) = outpath.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let mut out = fs::File::create(&outpath)
                    .map_err(|e| format!("创建文件 {} 失败: {e}", outpath.display()))?;
                std::io::copy(&mut entry, &mut out).map_err(|e| format!("解压文件失败: {e}"))?;
            }
            if total_entries > 0 && i % 200 == 0 {
                let p = 58u32 + (i as u32 * 22 / total_entries as u32);
                let _ = app.emit("upgrade-progress", p);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("tar")
            .args([
                "-xzf",
                tmp_path.to_str().unwrap_or_default(),
                "-C",
                install_base.to_str().unwrap_or_default(),
            ])
            .status()
            .map_err(|e| format!("执行 tar 命令失败: {e}"))?;
        if !status.success() {
            let _ = fs::remove_file(&tmp_path);
            return Err("tar 解压失败，请检查磁盘空间是否充足".into());
        }
    }

    let _ = app.emit("upgrade-progress", 85);

    if !node_bin.exists() {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("解压后未找到 node 可执行文件: {}", node_bin.display()));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("chmod")
            .args(["-R", "+x", bin_dir.to_str().unwrap_or_default()])
            .output();
    }

    save_custom_node_path(bin_dir.to_string_lossy().to_string())?;
    let _ = fs::remove_file(&tmp_path);

    let _ = app.emit("upgrade-progress", 100);
    let msg = format!("✅ Node.js v{version} 安装成功");
    let _ = app.emit("upgrade-log", &msg);
    let _ = app.emit("upgrade-log", format!("路径: {}", bin_dir.display()));
    Ok(msg)
}

// ===== Git 便携版自动安装 =====

/// 保存自定义 Git 安装基目录到 clawpanel.json（gitPath = MinGit 解压根目录）
pub fn save_custom_git_path(git_dir: String) -> Result<(), String> {
    let config_path = super::openclaw_dir().join("clawpanel.json");
    let mut config: serde_json::Map<String, Value> = if config_path.exists() {
        let content =
            std::fs::read_to_string(&config_path).map_err(|e| format!("读取配置失败: {e}"))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    config.insert("gitPath".into(), Value::String(git_dir));
    let json = serde_json::to_string_pretty(&Value::Object(config))
        .map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&config_path, json).map_err(|e| format!("写入配置失败: {e}"))?;
    Ok(())
}

/// 检测 Git 是否已安装（优先检查 clawpanel.json 中保存的 gitPath）
#[tauri::command]
pub fn check_git() -> Result<Value, String> {
    let mut result = serde_json::Map::new();

    // 优先读 clawpanel.json 中保存的自定义路径（gitPath = MinGit 根目录）
    let custom_base = super::openclaw_dir()
        .join("clawpanel.json")
        .exists()
        .then(|| {
            std::fs::read_to_string(super::openclaw_dir().join("clawpanel.json"))
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("gitPath")?.as_str().map(PathBuf::from))
        })
        .flatten();

    if let Some(base) = custom_base {
        #[cfg(target_os = "windows")]
        let git_bin = base.join("cmd").join("git.exe");
        #[cfg(not(target_os = "windows"))]
        let git_bin = base.join("bin").join("git");

        if git_bin.exists() {
            let mut cmd = Command::new(&git_bin);
            cmd.arg("--version");
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000);
            if let Ok(o) = cmd.output() {
                if o.status.success() {
                    let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    result.insert("installed".into(), Value::Bool(true));
                    result.insert("version".into(), Value::String(ver));
                    return Ok(Value::Object(result));
                }
            }
        }
    }

    // 回退：通过 enhanced_path（含系统 PATH）查找 git
    let mut cmd = Command::new("git");
    cmd.arg("--version");
    cmd.env("PATH", super::enhanced_path());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    match cmd.output() {
        Ok(o) if o.status.success() => {
            let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
            result.insert("installed".into(), Value::Bool(true));
            result.insert("version".into(), Value::String(ver));
        }
        _ => {
            result.insert("installed".into(), Value::Bool(false));
            result.insert("version".into(), Value::Null);
        }
    }
    Ok(Value::Object(result))
}

/// 从 GitHub API 获取最新 git-for-windows 版本号
async fn fetch_latest_git_version_inner() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("clawpanel/1.0")
        .build()
        .ok()?;
    let resp = client
        .get("https://api.github.com/repos/git-for-windows/git/releases/latest")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: serde_json::Value = resp.json().await.ok()?;
    // tag_name 格式: "v2.48.1.windows.1"，提取 "2.48.1"
    let tag = json.get("tag_name")?.as_str()?;
    let re = regex::Regex::new(r"v(\d+\.\d+\.\d+)").ok()?;
    re.captures(tag)?.get(1).map(|m| m.as_str().to_string())
}

#[tauri::command]
pub async fn get_latest_git_version() -> Result<String, String> {
    const FALLBACK: &str = "2.48.1";
    Ok(fetch_latest_git_version_inner().await.unwrap_or_else(|| FALLBACK.to_string()))
}

/// 自动下载并安装 MinGit 便携版（Windows 专用，不修改系统 PATH）
/// MinGit 约 40MB，解压后 git.exe 位于 {install_base}/cmd/git.exe
#[tauri::command]
pub async fn install_git_portable(
    app: tauri::AppHandle,
    mirror: String,
    version: String,
    install_path: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;

    #[cfg(target_os = "windows")]
    {
        let filename = format!("MinGit-{version}-64-bit.zip");
        let win_tag = format!("v{version}.windows.1");
        let install_base = install_path
            .as_deref()
            .map(expand_tilde)
            .unwrap_or_else(|| PathBuf::from(r"D:\.openclaw\git"));
        let git_bin = install_base.join("cmd").join("git.exe");

        // 已安装则跳过下载
        if git_bin.exists() {
            let _ = app.emit("upgrade-log", "已找到便携版 Git，跳过下载...");
            let _ = app.emit("upgrade-progress", 90);
            save_custom_git_path(install_base.to_string_lossy().to_string())?;
            let _ = app.emit("upgrade-progress", 100);
            let msg = format!("✅ Git v{version} 已就绪");
            let _ = app.emit("upgrade-log", &msg);
            return Ok(msg);
        }

        let url = if mirror == "official" {
            format!("https://github.com/git-for-windows/git/releases/download/{win_tag}/{filename}")
        } else {
            format!("https://registry.npmmirror.com/-/binary/git-for-windows/{win_tag}/{filename}")
        };

        let tmp_path = super::openclaw_dir().join(&filename);

        let _ = app.emit("upgrade-log", format!("下载 MinGit v{version} (~40MB)..."));
        let _ = app.emit("upgrade-log", format!("来源: {url}"));
        let _ = app.emit("upgrade-progress", 5);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

        let mut response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !response.status().is_success() {
            return Err(format!("下载失败，HTTP {}", response.status()));
        }

        let total = response.content_length();
        let mut buf: Vec<u8> = Vec::new();
        if let Some(t) = total {
            buf.reserve(t as usize);
        }

        let mut last_log_mb = 0u64;
        while let Some(chunk) = response.chunk().await.map_err(|e| format!("下载中断: {e}"))? {
            buf.extend_from_slice(&chunk);
            let downloaded = buf.len() as u64;
            let mb = downloaded / (1024 * 1024);
            if mb > last_log_mb {
                last_log_mb = mb;
                if let Some(t) = total {
                    let total_mb = t / (1024 * 1024);
                    let _ = app.emit("upgrade-log", format!("下载中... {mb}MB / {total_mb}MB"));
                    let p = (downloaded * 50 / t) as u32;
                    let _ = app.emit("upgrade-progress", 5 + p);
                } else {
                    let _ = app.emit("upgrade-log", format!("下载中... {mb}MB"));
                }
            }
        }

        let dl_mb = buf.len() / (1024 * 1024);
        let _ = app.emit("upgrade-log", format!("下载完成（{dl_mb}MB），正在解压..."));
        let _ = app.emit("upgrade-progress", 58);

        // 确保 openclaw_dir 和 install_base 均存在（首次安装时目录可能未创建）
        fs::create_dir_all(super::openclaw_dir()).map_err(|e| format!("创建基础目录失败: {e}"))?;
        fs::create_dir_all(&install_base).map_err(|e| format!("创建安装目录失败: {e}"))?;
        fs::write(&tmp_path, &buf).map_err(|e| format!("保存临时文件失败: {e}"))?;
        drop(buf);

        let file = fs::File::open(&tmp_path).map_err(|e| format!("打开压缩包失败: {e}"))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取 ZIP 失败: {e}"))?;
        let total_entries = archive.len();
        for i in 0..total_entries {
            let mut entry = archive.by_index(i).map_err(|e| format!("读取 ZIP 条目失败: {e}"))?;
            let outpath = install_base.join(entry.name());
            if entry.is_dir() {
                let _ = fs::create_dir_all(&outpath);
            } else {
                if let Some(parent) = outpath.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let mut out = fs::File::create(&outpath)
                    .map_err(|e| format!("创建文件 {} 失败: {e}", outpath.display()))?;
                std::io::copy(&mut entry, &mut out).map_err(|e| format!("解压文件失败: {e}"))?;
            }
            if total_entries > 0 && i % 200 == 0 {
                let p = 58u32 + (i as u32 * 22 / total_entries as u32);
                let _ = app.emit("upgrade-progress", p);
            }
        }

        let _ = app.emit("upgrade-progress", 85);

        if !git_bin.exists() {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!("解压后未找到 git 可执行文件: {}", git_bin.display()));
        }

        save_custom_git_path(install_base.to_string_lossy().to_string())?;
        let _ = fs::remove_file(&tmp_path);

        let _ = app.emit("upgrade-progress", 100);
        let msg = format!("✅ Git v{version} 安装成功");
        let _ = app.emit("upgrade-log", &msg);
        let _ = app.emit("upgrade-log", format!("路径: {}", install_base.display()));
        Ok(msg)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, mirror, version, install_path);
        Err("Git 便携版仅支持 Windows 平台，请使用系统包管理器安装 Git".into())
    }
}

#[tauri::command]
pub fn write_env_file(path: String, config: String) -> Result<(), String> {
    let expanded = if let Some(stripped) = path.strip_prefix("~/") {
        dirs::home_dir().unwrap_or_default().join(stripped)
    } else {
        PathBuf::from(&path)
    };

    // 安全限制：只允许写入 ~/.openclaw/ 目录下的文件
    let openclaw_base = super::openclaw_dir();
    if !expanded.starts_with(&openclaw_base) {
        return Err("只允许写入 ~/.openclaw/ 目录下的文件".to_string());
    }

    if let Some(parent) = expanded.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&expanded, &config).map_err(|e| format!("写入 .env 失败: {e}"))
}

// ===== 备份管理 =====

#[tauri::command]
pub fn list_backups() -> Result<Value, String> {
    let dir = backups_dir();
    if !dir.exists() {
        return Ok(Value::Array(vec![]));
    }
    let mut backups: Vec<Value> = vec![];
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取备份目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let meta = fs::metadata(&path).ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        // macOS 支持 created()，fallback 到 modified()
        let created = meta
            .and_then(|m| m.created().ok().or_else(|| m.modified().ok()))
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut obj = serde_json::Map::new();
        obj.insert("name".into(), Value::String(name));
        obj.insert("size".into(), Value::Number(size.into()));
        obj.insert("created_at".into(), Value::Number(created.into()));
        backups.push(Value::Object(obj));
    }
    // 按时间倒序
    backups.sort_by(|a, b| {
        let ta = a.get("created_at").and_then(|v| v.as_u64()).unwrap_or(0);
        let tb = b.get("created_at").and_then(|v| v.as_u64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    Ok(Value::Array(backups))
}

#[tauri::command]
pub fn create_backup() -> Result<Value, String> {
    let dir = backups_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败: {e}"))?;

    let src = super::openclaw_dir().join("openclaw.json");
    if !src.exists() {
        return Err("openclaw.json 不存在".into());
    }

    let now = chrono::Local::now();
    let name = format!("openclaw-{}.json", now.format("%Y%m%d-%H%M%S"));
    let dest = dir.join(&name);
    fs::copy(&src, &dest).map_err(|e| format!("备份失败: {e}"))?;

    let size = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    let mut obj = serde_json::Map::new();
    obj.insert("name".into(), Value::String(name));
    obj.insert("size".into(), Value::Number(size.into()));
    Ok(Value::Object(obj))
}

/// 检查备份文件名是否安全
fn is_unsafe_backup_name(name: &str) -> bool {
    name.contains("..") || name.contains('/') || name.contains('\\')
}

#[tauri::command]
pub fn restore_backup(name: String) -> Result<(), String> {
    if is_unsafe_backup_name(&name) {
        return Err("非法文件名".into());
    }
    let backup_path = backups_dir().join(&name);
    if !backup_path.exists() {
        return Err(format!("备份文件不存在: {name}"));
    }
    let target = super::openclaw_dir().join("openclaw.json");

    // 恢复前先自动备份当前配置
    if target.exists() {
        let _ = create_backup();
    }

    fs::copy(&backup_path, &target).map_err(|e| format!("恢复失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_backup(name: String) -> Result<(), String> {
    if is_unsafe_backup_name(&name) {
        return Err("非法文件名".into());
    }
    let path = backups_dir().join(&name);
    if !path.exists() {
        return Err(format!("备份文件不存在: {name}"));
    }
    fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))
}

/// 获取当前用户 UID（macOS/Linux 用 id -u，Windows 返回 0）
#[allow(dead_code)]
fn get_uid() -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(0)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("id")
            .arg("-u")
            .output()
            .map_err(|e| format!("获取 UID 失败: {e}"))?;
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u32>()
            .map_err(|e| format!("解析 UID 失败: {e}"))
    }
}

/// 重载 Gateway 服务
/// macOS: launchctl kickstart -k
/// Windows/Linux: 直接通过进程管理重启（不走慢 CLI）
#[tauri::command]
pub async fn reload_gateway() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let uid = get_uid()?;
        let target = format!("gui/{uid}/ai.openclaw.gateway");
        let output = tokio::process::Command::new("launchctl")
            .args(["kickstart", "-k", &target])
            .output()
            .await
            .map_err(|e| format!("重载失败: {e}"))?;
        if output.status.success() {
            Ok("Gateway 已重载".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("重载失败: {stderr}"))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        // 直接调用服务管理（进程级别），避免慢 CLI 调用
        crate::commands::service::restart_service("ai.openclaw.gateway".into())
            .await
            .map(|_| "Gateway 已重载".to_string())
    }
}

/// 重启 Gateway 服务（与 reload_gateway 相同实现）
#[tauri::command]
pub async fn restart_gateway() -> Result<String, String> {
    reload_gateway().await
}

/// 清理 base URL：去掉尾部斜杠和已知端点路径，防止用户粘贴完整端点 URL 导致路径重复
fn normalize_base_url(raw: &str) -> String {
    let mut base = raw.trim_end_matches('/').to_string();
    for suffix in &[
        "/chat/completions",
        "/completions",
        "/responses",
        "/messages",
        "/models",
    ] {
        if base.ends_with(suffix) {
            base.truncate(base.len() - suffix.len());
            break;
        }
    }
    base.trim_end_matches('/').to_string()
}

/// 测试模型连通性：向 provider 发送一个简单的 chat completion 请求
#[tauri::command]
pub async fn test_model(
    base_url: String,
    api_key: String,
    model_id: String,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", normalize_base_url(&base_url));

    let body = serde_json::json!({
        "model": model_id,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 16,
        "stream": false
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    let resp = req.send().await.map_err(|e| {
        if e.is_timeout() {
            "请求超时 (30s)".to_string()
        } else if e.is_connect() {
            format!("连接失败: {e}")
        } else {
            format!("请求失败: {e}")
        }
    })?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        // 尝试提取错误信息
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(String::from)
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(msg);
    }

    // 提取回复内容（兼容 reasoning 模型的 reasoning_content 字段）
    let reply = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| {
            let msg = v.get("choices")?.get(0)?.get("message")?;
            // 优先取 content，为空则取 reasoning_content
            let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
            if !content.is_empty() {
                return Some(content.to_string());
            }
            msg.get("reasoning_content")
                .and_then(|c| c.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| format!("[reasoning] {s}"))
        })
        .unwrap_or_else(|| "（无回复内容）".into());

    Ok(reply)
}

/// 获取服务商的远程模型列表（调用 /models 接口）
#[tauri::command]
pub async fn list_remote_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let url = format!("{}/models", normalize_base_url(&base_url));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    let resp = req.send().await.map_err(|e| {
        if e.is_timeout() {
            "请求超时 (15s)，该服务商可能不支持模型列表接口".to_string()
        } else if e.is_connect() {
            format!("连接失败，请检查接口地址是否正确: {e}")
        } else {
            format!("请求失败: {e}")
        }
    })?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(String::from)
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("获取模型列表失败: {msg}"));
    }

    // 解析 OpenAI 格式的 /models 响应
    let ids = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| {
            let data = v.get("data")?.as_array()?;
            let mut ids: Vec<String> = data
                .iter()
                .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from))
                .collect();
            ids.sort();
            Some(ids)
        })
        .unwrap_or_default();

    if ids.is_empty() {
        return Err("该服务商返回了空的模型列表，可能不支持 /models 接口".to_string());
    }

    Ok(ids)
}

/// 安装 Gateway 服务（执行 openclaw gateway install）
#[tauri::command]
pub async fn install_gateway() -> Result<String, String> {
    use crate::utils::openclaw_command_async;
    let _guardian_pause = GuardianPause::new("install gateway");
    // 先检测 openclaw CLI 是否可用
    let cli_check = openclaw_command_async().arg("--version").output().await;
    match cli_check {
        Ok(o) if o.status.success() => {}
        _ => {
            return Err("openclaw CLI 未安装。请先执行以下命令安装：\n\n\
                 npm install -g @qingchencloud/openclaw-zh\n\n\
                 安装完成后再点击此按钮安装 Gateway 服务。"
                .into());
        }
    }

    let output = openclaw_command_async()
        .args(["gateway", "install"])
        .output()
        .await
        .map_err(|e| format!("安装失败: {e}"))?;

    if output.status.success() {
        Ok("Gateway 服务已安装".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("安装失败: {stderr}"))
    }
}

/// 卸载 Gateway 服务
/// macOS: launchctl bootout + 删除 plist
/// Windows: 直接 taskkill
/// Linux: pkill
#[tauri::command]
pub fn uninstall_gateway() -> Result<String, String> {
    let _guardian_pause = GuardianPause::new("uninstall gateway");
    crate::commands::service::guardian_mark_manual_stop();
    #[cfg(target_os = "macos")]
    {
        let uid = get_uid()?;
        let target = format!("gui/{uid}/ai.openclaw.gateway");

        // 先停止服务
        let _ = Command::new("launchctl")
            .args(["bootout", &target])
            .output();

        // 删除 plist 文件
        let home = dirs::home_dir().unwrap_or_default();
        let plist = home.join("Library/LaunchAgents/ai.openclaw.gateway.plist");
        if plist.exists() {
            fs::remove_file(&plist).map_err(|e| format!("删除 plist 失败: {e}"))?;
        }
    }
    #[cfg(target_os = "windows")]
    {
        // 直接杀死 gateway 相关的 node.exe 进程，不走慢 CLI
        let _ = Command::new("taskkill")
            .args(["/f", "/im", "node.exe", "/fi", "WINDOWTITLE eq openclaw*"])
            .creation_flags(0x08000000)
            .output();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill")
            .args(["-f", "openclaw.*gateway"])
            .output();
    }
    Ok("Gateway 服务已卸载".to_string())
}

/// 为 openclaw.json 中所有模型添加 input: ["text", "image"]，使 Gateway 识别模型支持图片输入
#[tauri::command]
pub fn patch_model_vision() -> Result<bool, String> {
    let path = super::openclaw_dir().join("openclaw.json");
    let content = fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {e}"))?;
    let mut config: Value =
        serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {e}"))?;

    let vision_input = Value::Array(vec![
        Value::String("text".into()),
        Value::String("image".into()),
    ]);

    let mut changed = false;

    if let Some(obj) = config.as_object_mut() {
        if let Some(models_val) = obj.get_mut("models") {
            if let Some(models_obj) = models_val.as_object_mut() {
                if let Some(providers_val) = models_obj.get_mut("providers") {
                    if let Some(providers_obj) = providers_val.as_object_mut() {
                        for (_provider_name, provider_val) in providers_obj.iter_mut() {
                            if let Some(provider_obj) = provider_val.as_object_mut() {
                                if let Some(Value::Array(arr)) = provider_obj.get_mut("models") {
                                    for model in arr.iter_mut() {
                                        if let Some(mobj) = model.as_object_mut() {
                                            if !mobj.contains_key("input") {
                                                mobj.insert("input".into(), vision_input.clone());
                                                changed = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if changed {
        let bak = super::openclaw_dir().join("openclaw.json.bak");
        let _ = fs::copy(&path, &bak);
        let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
        fs::write(&path, json).map_err(|e| format!("写入失败: {e}"))?;
    }

    Ok(changed)
}

/// 检查 ClawPanel 自身是否有新版本（通过 GitHub releases API）
#[tauri::command]
pub async fn check_panel_update() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("ClawPanel")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let url = "https://api.github.com/repos/qingchencloud/clawpanel/releases/latest";
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API 返回 {}", resp.status()));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let mut result = serde_json::Map::new();
    result.insert("latest".into(), Value::String(tag));
    result.insert(
        "url".into(),
        json.get("html_url").cloned().unwrap_or(Value::String(
            "https://github.com/qingchencloud/clawpanel/releases".into(),
        )),
    );
    Ok(Value::Object(result))
}

// === 面板配置 (clawpanel.json) ===

#[tauri::command]
pub fn read_panel_config() -> Result<Value, String> {
    let path = super::openclaw_dir().join("clawpanel.json");
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析失败: {e}"))
}

#[tauri::command]
pub fn write_panel_config(config: Value) -> Result<(), String> {
    let dir = super::openclaw_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let path = dir.join("clawpanel.json");
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
pub fn get_npm_registry() -> Result<String, String> {
    Ok(get_configured_registry())
}

#[tauri::command]
pub fn set_npm_registry(registry: String) -> Result<(), String> {
    let path = super::openclaw_dir().join("npm-registry.txt");
    fs::write(&path, registry.trim()).map_err(|e| format!("保存失败: {e}"))
}
