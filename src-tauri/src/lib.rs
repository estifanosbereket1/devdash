use bollard::query_parameters::{
    ListContainersOptionsBuilder, ListImagesOptionsBuilder, ListVolumesOptionsBuilder,
    RemoveContainerOptionsBuilder, RemoveImageOptionsBuilder, RemoveVolumeOptionsBuilder,
    StopContainerOptionsBuilder,
};

use bollard::Docker;
use std::fs;
use std::path::Path;
use sysinfo::Components;
use sysinfo::Disks;
use sysinfo::System;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use zbus::zvariant::OwnedObjectPath;
use zbus::Connection;

use rodio::stream::{DeviceSinkBuilder, MixerDeviceSink};
use rodio::Decoder;
use rodio::Player;
use std::fs::File;
use std::io::BufReader;
use std::sync::Mutex;
use std::time::Instant;

use sqlx::any::{AnyPoolOptions, AnyRow};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Column, Row, TypeInfo};

use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

struct AudioState {
    _sink: MixerDeviceSink, // must stay alive for the whole app — dropping it kills audio output
    player: Mutex<Option<Player>>,
}

impl AudioState {
    fn new() -> Self {
        let sink = DeviceSinkBuilder::open_default_sink()
            .expect("failed to open default audio output device");
        AudioState {
            _sink: sink,
            player: Mutex::new(None),
        }
    }
}

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "ogg", "m4a", "wav", "opus"];

#[derive(serde::Serialize, Clone)]
struct TrackInfo {
    path: String,
    title: String,
    artist: String,
    album: String,
    duration_secs: u64,
}

fn read_track_metadata(path: &Path) -> TrackInfo {
    use lofty::file::{AudioFile, TaggedFileExt};
    use lofty::tag::Accessor;

    let fallback_title = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let Ok(tagged) = lofty::read_from_path(path) else {
        return TrackInfo {
            path: path.to_string_lossy().to_string(),
            title: fallback_title,
            artist: "Unknown".to_string(),
            album: "Unknown".to_string(),
            duration_secs: 0,
        };
    };

    let tag = tagged.primary_tag();
    let title = tag
        .and_then(|t| t.title())
        .map(|s| s.to_string())
        .unwrap_or(fallback_title);
    let artist = tag
        .and_then(|t| t.artist())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    let album = tag
        .and_then(|t| t.album())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    let duration_secs = tagged.properties().duration().as_secs();

    TrackInfo {
        path: path.to_string_lossy().to_string(),
        title,
        artist,
        album,
        duration_secs,
    }
}

fn scan_music_dir(dir: &Path, results: &mut Vec<TrackInfo>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_music_dir(&path, results);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                results.push(read_track_metadata(&path));
            }
        }
    }
}

#[tauri::command]
fn scan_music_library(roots: Vec<String>) -> Vec<TrackInfo> {
    let mut results = Vec::new();
    for root in roots {
        scan_music_dir(Path::new(&root), &mut results);
    }
    results
}

#[tauri::command]
fn play_track(state: tauri::State<AudioState>, path: String) -> Result<(), String> {
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let source = Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;

    let new_player = Player::connect_new(state._sink.mixer());
    new_player.append(source);
    new_player.play();

    let mut player_guard = state.player.lock().map_err(|e| e.to_string())?;
    *player_guard = Some(new_player);
    Ok(())
}

#[tauri::command]
fn pause_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player.pause();
    }
    Ok(())
}

#[tauri::command]
fn resume_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player.play();
    }
    Ok(())
}

#[tauri::command]
fn stop_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    let mut player_guard = state.player.lock().map_err(|e| e.to_string())?;
    *player_guard = None;
    Ok(())
}

#[tauri::command]
fn set_volume(state: tauri::State<AudioState>, volume: f32) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player.set_volume(volume);
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
struct MemoryInfo {
    used_gb: f64,
    total_gb: f64,
    ratio: f64,
}

#[tauri::command]
fn get_memory_info() -> MemoryInfo {
    let mut sys = System::new_all();
    sys.refresh_memory();
    let used = sys.used_memory() as f64;
    let total = sys.total_memory() as f64;
    MemoryInfo {
        used_gb: used / 1e9,
        total_gb: total / 1e9,
        ratio: if total > 0.0 { used / total } else { 0.0 },
    }
}

#[derive(serde::Serialize)]
struct BatteryInfo {
    percentage: f64,
    capacity_health: f64, // current full charge vs original design capacity
    cycle_count: Option<u32>,
    status: String,
}

#[tauri::command]
fn get_battery_info() -> Result<BatteryInfo, String> {
    // Most laptops expose this as BAT0, some as BAT1 — try both
    let base = if std::path::Path::new("/sys/class/power_supply/BAT0").exists() {
        "/sys/class/power_supply/BAT0"
    } else if std::path::Path::new("/sys/class/power_supply/BAT1").exists() {
        "/sys/class/power_supply/BAT1"
    } else {
        return Err("No battery found — desktop machine?".into());
    };

    let read_num = |file: &str| -> Option<f64> {
        fs::read_to_string(format!("{base}/{file}"))
            .ok()
            .and_then(|s| s.trim().parse::<f64>().ok())
    };

    let capacity_now = read_num("charge_full").or_else(|| read_num("energy_full"));
    let capacity_design = read_num("charge_full_design").or_else(|| read_num("energy_full_design"));
    let percentage = read_num("capacity").unwrap_or(0.0);
    let cycle_count = read_num("cycle_count").map(|v| v as u32);
    let status = fs::read_to_string(format!("{base}/status"))
        .unwrap_or_default()
        .trim()
        .to_string();

    let capacity_health = match (capacity_now, capacity_design) {
        (Some(now), Some(design)) if design > 0.0 => (now / design) * 100.0,
        _ => 100.0,
    };

    Ok(BatteryInfo {
        percentage,
        capacity_health,
        cycle_count,
        status,
    })
}

#[derive(serde::Serialize)]
struct DiskInfo {
    name: String,
    mount_point: String,
    total_gb: f64,
    free_gb: f64,
    used_ratio: f64,
}

#[tauri::command]
fn get_disk_info() -> Vec<DiskInfo> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .map(|d| {
            let total = d.total_space() as f64;
            let free = d.available_space() as f64;
            let used = total - free;
            DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_gb: total / 1e9,
                free_gb: free / 1e9,
                used_ratio: if total > 0.0 { used / total } else { 0.0 },
            }
        })
        .collect()
}

#[derive(serde::Serialize)]
struct TempReading {
    label: String,
    celsius: f64,
}

#[tauri::command]
fn get_temperatures() -> Vec<TempReading> {
    let components = Components::new_with_refreshed_list();
    components
        .iter()
        .filter_map(|c| {
            c.temperature().map(|temp| TempReading {
                label: c.label().to_string(),
                celsius: temp as f64,
            })
        })
        .collect()
}

#[derive(serde::Serialize)]
struct UnitInfo {
    name: String,
    description: String,
    load_state: String,
    active_state: String,
    sub_state: String,
}

#[tauri::command]
async fn get_managed_units() -> Result<Vec<UnitInfo>, String> {
    let connection = Connection::system().await.map_err(|e| e.to_string())?;

    // Step A: get only *enabled* service unit files — this is the actual filter
    let files_reply = connection
        .call_method(
            Some("org.freedesktop.systemd1"),
            "/org/freedesktop/systemd1",
            Some("org.freedesktop.systemd1.Manager"),
            "ListUnitFilesByPatterns",
            &(vec!["enabled"], vec!["*.service"]),
        )
        .await
        .map_err(|e| e.to_string())?;

    let files: Vec<(String, String)> = files_reply
        .body()
        .deserialize()
        .map_err(|e| e.to_string())?;

    // extract just the short unit names ("docker.service") from full paths
    let enabled_names: std::collections::HashSet<String> = files
        .into_iter()
        .filter_map(|(path, _state)| path.rsplit('/').next().map(|s| s.to_string()))
        .collect();

    // Step B: get live status for everything, same as before
    let reply = connection
        .call_method(
            Some("org.freedesktop.systemd1"),
            "/org/freedesktop/systemd1",
            Some("org.freedesktop.systemd1.Manager"),
            "ListUnits",
            &(),
        )
        .await
        .map_err(|e| e.to_string())?;

    type UnitTuple = (
        String,
        String,
        String,
        String,
        String,
        String,
        OwnedObjectPath,
        u32,
        String,
        OwnedObjectPath,
    );
    let units: Vec<UnitTuple> = reply.body().deserialize().map_err(|e| e.to_string())?;

    // Step C: keep only units that are in our "enabled" set
    // let result = units
    //     .into_iter()
    //     .filter(|u| enabled_names.contains(&u.0))
    //     .map(|u| UnitInfo {
    //         name: u.0,
    //         description: u.1,
    //         load_state: u.2,
    //         active_state: u.3,
    //         sub_state: u.4,
    //     })
    //     .collect();

    let result = units
        .into_iter()
        .filter(|u| enabled_names.contains(&u.0) || u.3 == "active")
        .map(|u| UnitInfo {
            name: u.0,
            description: u.1,
            load_state: u.2,
            active_state: u.3,
            sub_state: u.4,
        })
        .collect();

    Ok(result)
}

async fn call_unit_action(unit_name: String, method: &str) -> Result<(), String> {
    let connection = Connection::system().await.map_err(|e| e.to_string())?;
    connection
        .call_method(
            Some("org.freedesktop.systemd1"),
            "/org/freedesktop/systemd1",
            Some("org.freedesktop.systemd1.Manager"),
            method,
            &(unit_name, "replace"),
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn start_unit(unit_name: String) -> Result<(), String> {
    call_unit_action(unit_name, "StartUnit").await
}

#[tauri::command]
async fn stop_unit(unit_name: String) -> Result<(), String> {
    call_unit_action(unit_name, "StopUnit").await
}

#[tauri::command]
async fn restart_unit(unit_name: String) -> Result<(), String> {
    call_unit_action(unit_name, "RestartUnit").await
}

#[derive(serde::Serialize)]
struct ContainerInfo {
    id: String,
    name: String,
    image: String,
    status: String,
    state: String,
}

#[tauri::command]
async fn list_containers() -> Result<Vec<ContainerInfo>, String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;

    let options = ListContainersOptionsBuilder::default()
        .all(true) // include stopped containers, not just running ones
        .build();

    let containers = docker
        .list_containers(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(containers
        .into_iter()
        .map(|c| ContainerInfo {
            id: c.id.unwrap_or_default().chars().take(12).collect(),
            name: c
                .names
                .unwrap_or_default()
                .first()
                .cloned()
                .unwrap_or_default()
                .trim_start_matches('/')
                .to_string(),
            image: c.image.unwrap_or_default(),
            status: c.status.unwrap_or_default(),
            state: c.state.map(|s| s.to_string()).unwrap_or_default(),
        })
        .collect())
}

#[derive(serde::Serialize)]
struct ImageInfo {
    id: String,
    tags: Vec<String>,
    size_mb: f64,
}

#[tauri::command]
async fn list_images() -> Result<Vec<ImageInfo>, String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;

    let options = ListImagesOptionsBuilder::default().all(false).build();

    let images = docker
        .list_images(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(images
        .into_iter()
        .map(|i| ImageInfo {
            id: i.id.chars().skip(7).take(12).collect(), // strips "sha256:" prefix
            tags: i.repo_tags,
            size_mb: i.size as f64 / 1e6,
        })
        .collect())
}

#[tauri::command]
async fn start_container(container_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    docker
        .start_container(&container_id, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_container(container_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = StopContainerOptionsBuilder::default().t(10).build(); // 10s grace period before force-kill
    docker
        .stop_container(&container_id, Some(options))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_container(container_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = RemoveContainerOptionsBuilder::default().force(true).build();
    docker
        .remove_container(&container_id, Some(options))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_image(image_id: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = RemoveImageOptionsBuilder::default().force(true).build();
    docker
        .remove_image(&image_id, Some(options), None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
struct VolumeInfo {
    name: String,
    driver: String,
    mount_point: String,
}

#[tauri::command]
async fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;

    let options = ListVolumesOptionsBuilder::default().build();
    let response = docker
        .list_volumes(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(response
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| VolumeInfo {
            name: v.name,
            driver: v.driver,
            mount_point: v.mountpoint,
        })
        .collect())
}

#[tauri::command]
async fn remove_volume(volume_name: String) -> Result<(), String> {
    let docker = Docker::connect_with_socket_defaults().map_err(|e| e.to_string())?;
    let options = RemoveVolumeOptionsBuilder::default().force(true).build();
    docker
        .remove_volume(&volume_name, Some(options))
        .await
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Clone)]
struct ProjectInfo {
    name: String,
    path: String,
    kind: String,
}

fn detect_kind(dir: &Path) -> Option<String> {
    if dir.join("pubspec.yaml").exists() {
        Some("Flutter".to_string())
    } else if dir.join("pyproject.toml").exists()
        || dir.join("requirements.txt").exists()
        || dir.join("setup.py").exists()
    {
        Some("Python".to_string())
    } else if dir.join("package.json").exists() {
        if dir.join("tsconfig.json").exists() {
            Some("TypeScript".to_string())
        } else {
            Some("JavaScript".to_string())
        }
    } else if dir.join("go.mod").exists() {
        Some("Go".to_string())
    } else if dir.join("Cargo.toml").exists() {
        Some("Rust".to_string())
    } else if has_dotnet_project(dir) {
        Some("C#".to_string())
    } else {
        None
    }
}

fn has_dotnet_project(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        name.ends_with(".sln") || name.ends_with(".csproj")
    })
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".dart_tool",
    "build",
    "dist",
    "target",
    "venv",
    ".venv",
    "__pycache__",
];

fn scan_dir(dir: &Path, depth: u8, max_depth: u8, results: &mut Vec<ProjectInfo>) {
    if depth > max_depth {
        return;
    }

    if let Some(kind) = detect_kind(dir) {
        results.push(ProjectInfo {
            name: dir
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            path: dir.to_string_lossy().to_string(),
            kind,
        });
        return; // found a project here — don't recurse into its internals
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        scan_dir(&path, depth + 1, max_depth, results);
    }
}

#[tauri::command]
fn scan_projects(roots: Vec<String>) -> Vec<ProjectInfo> {
    let mut results = Vec::new();
    for root in roots {
        scan_dir(Path::new(&root), 0, 5, &mut results); // max_depth=5 keeps scans fast
    }
    results
}

#[tauri::command]
fn open_in_editor(path: String, editor: String) -> Result<(), String> {
    let binary = match editor.as_str() {
        "vscode" => "code",
        "zed" => "zed",
        other => other, // allow passing a raw binary name directly too
    };
    std::process::Command::new(binary)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to launch {binary}: {e}"))?;
    Ok(())
}

#[derive(serde::Serialize, Clone)]
struct PortInfo {
    port: u16,
    protocol: String,
    pid: Option<u32>,
    process: Option<String>,
}

#[tauri::command]
fn list_ports() -> Result<Vec<PortInfo>, String> {
    let output = std::process::Command::new("ss")
        .args(["-tulpn"])
        .output()
        .map_err(|e| format!("failed to run ss: {e}"))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in text.lines().skip(1) {
        // e.g. "tcp   LISTEN 0  128  0.0.0.0:5432  0.0.0.0:*  users:((\"postgres\",pid=1234,fd=6))"
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 5 {
            continue;
        }

        let protocol = fields[0].to_string();
        let local_addr = fields[4];

        let port = local_addr
            .rsplit(':')
            .next()
            .and_then(|p| p.parse::<u16>().ok());

        let Some(port) = port else { continue };

        // process info lives in the last field, formatted like: users:(("name",pid=1234,fd=6))
        let process_field = fields.last().unwrap_or(&"");
        let pid = process_field
            .split("pid=")
            .nth(1)
            .and_then(|s| s.split(',').next())
            .and_then(|s| s.parse::<u32>().ok());
        let process = process_field.split('"').nth(1).map(|s| s.to_string());

        results.push(PortInfo {
            port,
            protocol,
            pid,
            process,
        });
    }

    results.sort_by_key(|p| p.port);
    results.dedup_by_key(|p| p.port);
    Ok(results)
}

#[tauri::command]
fn kill_port(pid: u32) -> Result<(), String> {
    let status = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("kill exited with status: {status}"))
    }
}

#[derive(serde::Serialize, Clone)]
struct GitStatus {
    branch: String,
    dirty: bool,
    ahead: u32,
    behind: u32,
    has_remote: bool,
}

fn get_git_status(path: &str) -> Option<GitStatus> {
    let git_dir = std::path::Path::new(path).join(".git");
    if !git_dir.exists() {
        return None; // not a git repo at all
    }

    let run = |args: &[&str]| -> Option<String> {
        std::process::Command::new("git")
            .args(args)
            .current_dir(path)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };

    let branch = run(&["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_else(|| "?".to_string());
    let porcelain = run(&["status", "--porcelain"]).unwrap_or_default();
    let dirty = !porcelain.is_empty();

    // ahead/behind only makes sense if there's an upstream tracking branch
    let upstream = run(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    let has_remote = upstream.is_some();

    let (ahead, behind) = if has_remote {
        run(&["rev-list", "--left-right", "--count", "HEAD...@{u}"])
            .and_then(|s| {
                let parts: Vec<&str> = s.split_whitespace().collect();
                if parts.len() == 2 {
                    Some((parts[0].parse().unwrap_or(0), parts[1].parse().unwrap_or(0)))
                } else {
                    None
                }
            })
            .unwrap_or((0, 0))
    } else {
        (0, 0)
    };

    Some(GitStatus {
        branch,
        dirty,
        ahead,
        behind,
        has_remote,
    })
}

#[tauri::command]
fn scan_git_status(paths: Vec<String>) -> std::collections::HashMap<String, GitStatus> {
    paths
        .into_iter()
        .filter_map(|p| get_git_status(&p).map(|status| (p, status)))
        .collect()
}

#[derive(serde::Serialize, Clone)]
struct EnvRisk {
    project_path: String,
    project_name: String,
    env_file: String,
    gitignored: bool,
    suspicious_keys: Vec<String>,
}

fn is_gitignored(project_path: &Path, target_file: &str) -> bool {
    // ask git directly rather than hand-parsing .gitignore syntax ourselves —
    // git already implements the real matching rules (globs, negation, nested .gitignores)
    std::process::Command::new("git")
        .args(["check-ignore", target_file])
        .current_dir(project_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn looks_like_secret(value: &str) -> bool {
    let v = value.trim().trim_matches('"').trim_matches('\'');
    if v.is_empty() {
        return false;
    }
    let placeholder_markers = [
        "your_",
        "xxx",
        "changeme",
        "example",
        "placeholder",
        "<",
        "todo",
    ];
    let looks_placeholder = placeholder_markers
        .iter()
        .any(|m| v.to_lowercase().contains(m));
    // heuristic: long-ish, no spaces, not an obvious placeholder = probably a real key/token
    v.len() > 12 && !v.contains(' ') && !looks_placeholder
}

fn scan_env_file(project_path: &str, project_name: &str) -> Option<EnvRisk> {
    let dir = Path::new(project_path);
    let env_path = dir.join(".env");
    if !env_path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&env_path).ok()?;
    let mut suspicious_keys = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            if looks_like_secret(value) {
                suspicious_keys.push(key.trim().to_string());
            }
        }
    }

    Some(EnvRisk {
        project_path: project_path.to_string(),
        project_name: project_name.to_string(),
        env_file: ".env".to_string(),
        gitignored: is_gitignored(dir, ".env"),
        suspicious_keys,
    })
}

#[tauri::command]
fn scan_env_risks(projects: Vec<(String, String)>) -> Vec<EnvRisk> {
    // projects: Vec of (path, name)
    projects
        .into_iter()
        .filter_map(|(path, name)| scan_env_file(&path, &name))
        .collect()
}

const BLOAT_DIRS: &[&str] = &[
    "node_modules",
    "target",
    ".venv",
    "venv",
    "build",
    "dist",
    ".dart_tool",
    "__pycache__",
];

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let meta = entry.metadata();
            match meta {
                Ok(m) if m.is_dir() => dir_size(&entry.path()),
                Ok(m) => m.len(),
                Err(_) => 0,
            }
        })
        .sum()
}

#[derive(serde::Serialize, Clone)]
struct BloatEntry {
    project_name: String,
    folder_name: String,
    path: String,
    size_mb: f64,
}

#[tauri::command]
fn scan_bloat(projects: Vec<(String, String)>) -> Vec<BloatEntry> {
    let mut results = Vec::new();
    for (project_path, project_name) in projects {
        for &bloat_dir in BLOAT_DIRS {
            let candidate = Path::new(&project_path).join(bloat_dir);
            if candidate.exists() {
                let size = dir_size(&candidate);
                if size > 1_000_000 {
                    // skip anything under 1MB, not worth showing
                    results.push(BloatEntry {
                        project_name: project_name.clone(),
                        folder_name: bloat_dir.to_string(),
                        path: candidate.to_string_lossy().to_string(),
                        size_mb: size as f64 / 1e6,
                    });
                }
            }
        }
    }
    results.sort_by(|a, b| b.size_mb.partial_cmp(&a.size_mb).unwrap());
    results
}

#[tauri::command]
fn delete_bloat_dir(path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Clone)]
struct CronJob {
    schedule: String,
    command: String,
    human_readable: String,
    raw_line: String,
}

fn humanize_schedule(fields: &[&str]) -> String {
    if fields.len() < 5 {
        return "unrecognized".to_string();
    }
    match fields {
        ["*", "*", "*", "*", "*"] => "every minute".to_string(),
        [min, "*", "*", "*", "*"] if min.starts_with('*') && min.contains('/') => {
            format!("every {} min", min.trim_start_matches("*/"))
        }
        [min, hour, "*", "*", "*"] if !min.contains('*') && !hour.contains('*') => {
            format!("daily at {}:{:0>2}", hour, min)
        }
        [min, hour, "*", "*", dow] if !min.contains('*') && !hour.contains('*') && dow != &"*" => {
            format!("weekly on day {} at {}:{:0>2}", dow, hour, min)
        }
        _ => fields.join(" "),
    }
}

#[tauri::command]
fn list_cron_jobs() -> Result<Vec<CronJob>, String> {
    let output = std::process::Command::new("crontab")
        .arg("-l")
        .output()
        .map_err(|e| e.to_string())?;

    // exit code 1 with "no crontab for user" just means an empty crontab — not a real error
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut jobs = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = trimmed.splitn(6, char::is_whitespace).collect();
        if fields.len() < 6 {
            continue;
        }
        let schedule = fields[0..5].join(" ");
        let command = fields[5].to_string();
        jobs.push(CronJob {
            human_readable: humanize_schedule(&fields[0..5]),
            schedule,
            command,
            raw_line: trimmed.to_string(),
        });
    }

    Ok(jobs)
}

#[tauri::command]
fn delete_cron_job(raw_line: String) -> Result<(), String> {
    let output = std::process::Command::new("crontab")
        .arg("-l")
        .output()
        .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&output.stdout);
    let remaining: Vec<&str> = text
        .lines()
        .filter(|l| l.trim() != raw_line.trim())
        .collect();
    let new_content = remaining.join("\n") + "\n";

    let mut child = std::process::Command::new("crontab")
        .arg("-")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    use std::io::Write;
    child
        .stdin
        .as_mut()
        .ok_or("failed to open stdin")?
        .write_all(new_content.as_bytes())
        .map_err(|e| e.to_string())?;

    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_playback_position(state: tauri::State<AudioState>) -> Result<f64, String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        Ok(player.get_pos().as_secs_f64())
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
fn seek_playback(state: tauri::State<AudioState>, position_secs: f64) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player
            .try_seek(std::time::Duration::from_secs_f64(position_secs))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct HttpResponseInfo {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
    duration_ms: u64,
}

#[tauri::command]
async fn send_http_request(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<HttpResponseInfo, String> {
    let client = reqwest::Client::new();
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;

    let mut request = client.request(method, &url);
    for (key, value) in headers {
        request = request.header(key, value);
    }
    if let Some(b) = body {
        request = request.body(b);
    }

    let start = Instant::now();
    let response = request.send().await.map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let response_headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponseInfo {
        status,
        headers: response_headers,
        body,
        duration_ms,
    })
}

fn build_connection_url(
    provider: &str,
    host: &str,
    port: &str,
    user: &str,
    password: &str,
    database: &str,
    sslmode: &str,
) -> String {
    match provider {
        "postgres" => {
            if sslmode.is_empty() {
                format!("postgres://{user}:{password}@{host}:{port}/{database}")
            } else {
                format!("postgres://{user}:{password}@{host}:{port}/{database}?sslmode={sslmode}")
            }
        }
        "mysql" => format!("mysql://{user}:{password}@{host}:{port}/{database}"),
        "sqlite" => format!("sqlite://{database}"),
        _ => String::new(),
    }
}

fn urlencoding_encode(s: &str) -> String {
    s.replace('/', "%2F")
}

fn build_socket_url(user: &str, socket_dir: &str, database: &str) -> String {
    format!(
        "postgres://{user}@/{database}?host={}",
        urlencoding_encode(socket_dir)
    )
}

async fn connect_pg_socket(
    socket_dir: &str,
    user: &str,
    database: &str,
) -> Result<sqlx::PgPool, sqlx::Error> {
    let opts = sqlx::postgres::PgConnectOptions::new()
        .socket(socket_dir)
        .username(user)
        .database(database);
    sqlx::postgres::PgPoolOptions::new()
        .connect_with(opts)
        .await
}

fn parse_ssl_mode(sslmode: &str) -> sqlx::postgres::PgSslMode {
    match sslmode {
        "require" => sqlx::postgres::PgSslMode::Require,
        "disable" => sqlx::postgres::PgSslMode::Disable,
        "prefer" => sqlx::postgres::PgSslMode::Prefer,
        _ => sqlx::postgres::PgSslMode::Prefer, // sensible default when unspecified
    }
}

async fn connect_pg_tcp(
    host: &str,
    port: &str,
    user: &str,
    password: &str,
    database: &str,
    sslmode: &str,
) -> Result<sqlx::PgPool, sqlx::Error> {
    let opts = sqlx::postgres::PgConnectOptions::new()
        .host(host)
        .port(port.parse().unwrap_or(5432))
        .username(user)
        .password(password)
        .database(database)
        .ssl_mode(parse_ssl_mode(sslmode));
    sqlx::postgres::PgPoolOptions::new()
        .connect_with(opts)
        .await
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn cell_to_string_pg(row: &sqlx::postgres::PgRow, i: usize) -> String {
    use sqlx::ValueRef;

    if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(false) {
        return String::new();
    }

    let type_name = row.column(i).type_info().name();
    match type_name {
        "UUID" => row
            .try_get::<uuid::Uuid, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<uuid decode error>".to_string()),
        "TIMESTAMPTZ" => row
            .try_get::<chrono::DateTime<chrono::Utc>, _>(i)
            .map(|v| v.to_rfc3339())
            .unwrap_or_else(|_| "<timestamptz decode error>".to_string()),
        "TIMESTAMP" => row
            .try_get::<chrono::NaiveDateTime, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<timestamp decode error>".to_string()),
        "DATE" => row
            .try_get::<chrono::NaiveDate, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<date decode error>".to_string()),
        "TIME" => row
            .try_get::<chrono::NaiveTime, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<time decode error>".to_string()),
        "NUMERIC" => row
            .try_get::<bigdecimal::BigDecimal, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<numeric decode error>".to_string()),
        "JSON" | "JSONB" => row
            .try_get::<serde_json::Value, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<json decode error>".to_string()),
        "BOOL" => row
            .try_get::<bool, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<bool decode error>".to_string()),
        "INT2" | "INT4" => row
            .try_get::<i32, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<int decode error>".to_string()),
        "INT8" => row
            .try_get::<i64, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<int decode error>".to_string()),
        "FLOAT4" | "FLOAT8" => row
            .try_get::<f64, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<float decode error>".to_string()),
        "BYTEA" => row
            .try_get::<Vec<u8>, _>(i)
            .map(|v| format!("\\x{}", hex_encode(&v)))
            .unwrap_or_else(|_| "<bytea decode error>".to_string()),

        "MONEY" => row
            .try_get::<sqlx::postgres::types::PgMoney, _>(i)
            .map(|v| format!("{:.2}", v.0 as f64 / 100.0))
            .unwrap_or_else(|_| "<money decode error>".to_string()),

        "TEXT[]" | "VARCHAR[]" | "_TEXT" | "_VARCHAR" => row
            .try_get::<Vec<String>, _>(i)
            .map(|v| format!("{{{}}}", v.join(",")))
            .unwrap_or_else(|_| "<text[] decode error>".to_string()),
        "INT4[]" | "_INT4" => row
            .try_get::<Vec<i32>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|n| n.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<int4[] decode error>".to_string()),
        "INT8[]" | "_INT8" => row
            .try_get::<Vec<i64>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|n| n.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<int8[] decode error>".to_string()),
        "UUID[]" | "_UUID" => row
            .try_get::<Vec<uuid::Uuid>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|u| u.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<uuid[] decode error>".to_string()),
        "BOOL[]" | "_BOOL" => row
            .try_get::<Vec<bool>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|b| b.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<bool[] decode error>".to_string()),

        // Custom enum types (like your StaffRole) decode fine as plain text
        _ => row
            .try_get_unchecked::<String, _>(i)
            .unwrap_or_else(|_| format!("<unsupported type: {type_name}>")),
    }
}

// fn cell_to_string_pg(row: &sqlx::postgres::PgRow, i: usize) -> String {
//     use sqlx::ValueRef;

//     // Check genuine NULL before attempting any decode — this is what was
//     // missing before, and is why real nulls and undecodable types looked identical.
//     if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(false) {
//         return String::new();
//     }

//     let type_name = row.column(i).type_info().name();
//     match type_name {
//         "UUID" => row
//             .try_get::<uuid::Uuid, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<uuid decode error>")),
//         "TIMESTAMPTZ" => row
//             .try_get::<chrono::DateTime<chrono::Utc>, _>(i)
//             .map(|v| v.to_rfc3339())
//             .unwrap_or_else(|_| format!("<timestamptz decode error>")),
//         "TIMESTAMP" => row
//             .try_get::<chrono::NaiveDateTime, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<timestamp decode error>")),
//         "DATE" => row
//             .try_get::<chrono::NaiveDate, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<date decode error>")),
//         "TIME" => row
//             .try_get::<chrono::NaiveTime, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<time decode error>")),
//         "NUMERIC" => row
//             .try_get::<bigdecimal::BigDecimal, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<numeric decode error>")),
//         "JSON" | "JSONB" => row
//             .try_get::<serde_json::Value, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<json decode error>")),
//         "BOOL" => row
//             .try_get::<bool, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<bool decode error>")),
//         "INT2" | "INT4" => row
//             .try_get::<i32, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<int decode error>")),
//         "INT8" => row
//             .try_get::<i64, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<int decode error>")),
//         "FLOAT4" | "FLOAT8" => row
//             .try_get::<f64, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<float decode error>")),
//         _ => row
//             .try_get::<String, _>(i)
//             .unwrap_or_else(|_| format!("<unsupported type: {type_name}>")),
//     }
// }

#[tauri::command]
async fn test_db_connection(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    database: String,
    sslmode: String,
) -> Result<(), String> {
    sqlx::any::install_default_drivers();
    let url = build_connection_url(
        &provider, &host, &port, &user, &password, &database, &sslmode,
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn list_databases(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    sslmode: String,
) -> Result<Vec<String>, String> {
    sqlx::any::install_default_drivers();
    // connect to a default/admin database first, since we need *a* database to connect to before listing others
    let admin_db =
        match provider.as_str() {
            "postgres" => "postgres",
            "mysql" => "mysql",
            _ => return Err(
                "SQLite has no concept of multiple databases — point it directly at a file instead"
                    .into(),
            ),
        };
    let url = build_connection_url(
        &provider, &host, &port, &user, &password, admin_db,
        &sslmode, // ⬅️ use admin_db here, not &database — this fn never took a database param, it connects to the admin db to list others
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let query = match provider.as_str() {
        "postgres" => "SELECT datname::text FROM pg_database WHERE datistemplate = false",
        "mysql" => "SHOW DATABASES",
        _ => unreachable!(),
    };

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    pool.close().await;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

#[tauri::command]
async fn list_tables(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    database: String,
    sslmode: String,
) -> Result<Vec<String>, String> {
    sqlx::any::install_default_drivers();

    if provider == "postgres" && host.starts_with("socket:") {
        let socket_dir = host.trim_start_matches("socket:");
        let pool = connect_pg_socket(socket_dir, &user, &database)
            .await
            .map_err(|e| e.to_string())?;
        let rows = sqlx::query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        pool.close().await;
        return Ok(rows
            .iter()
            .filter_map(|r| r.try_get::<String, _>(0).ok())
            .collect());
    }

    let url = build_connection_url(
        &provider, &host, &port, &user, &password, &database, &sslmode,
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let query = match provider.as_str() {
        "postgres" => {
            "SELECT table_name::text FROM information_schema.tables WHERE table_schema = 'public'"
        }
        "mysql" => "SHOW TABLES",
        "sqlite" => {
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        }
        _ => return Err("Unknown provider".into()),
    };

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    pool.close().await;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

fn cell_to_string(row: &AnyRow, i: usize) -> String {
    use sqlx::ValueRef;

    if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(false) {
        return String::new();
    }

    if let Ok(v) = row.try_get::<String, _>(i) {
        return v;
    }
    if let Ok(v) = row.try_get::<i64, _>(i) {
        return v.to_string();
    }
    if let Ok(v) = row.try_get::<i32, _>(i) {
        return v.to_string();
    }
    if let Ok(v) = row.try_get::<f64, _>(i) {
        return v.to_string();
    }
    if let Ok(v) = row.try_get::<bool, _>(i) {
        return v.to_string();
    }

    format!("<unsupported type: {}>", row.column(i).type_info().name())
}

#[derive(serde::Serialize)]
struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    row_count: usize,
    duration_ms: u64,
}

#[tauri::command]
async fn run_query(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    database: String,
    sql: String,
    sslmode: String,
) -> Result<QueryResult, String> {
    sqlx::any::install_default_drivers();

    if provider == "postgres" && host.starts_with("socket:") {
        let socket_dir = host.trim_start_matches("socket:");
        let pool = connect_pg_socket(socket_dir, &user, &database)
            .await
            .map_err(|e| e.to_string())?;

        let start = std::time::Instant::now();
        let rows = sqlx::query(&sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;
        let duration_ms = start.elapsed().as_millis() as u64;
        pool.close().await;

        let columns = rows
            .first()
            .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
            .unwrap_or_default();
        let result_rows: Vec<Vec<String>> = rows
            .iter()
            .map(|row| {
                (0..row.columns().len())
                    .map(|i| cell_to_string_pg(row, i))
                    .collect()
            })
            .collect();
        let row_count = result_rows.len();

        return Ok(QueryResult {
            columns,
            rows: result_rows,
            row_count,
            duration_ms,
        });
    }

    if provider == "postgres" {
        let pool = connect_pg_tcp(&host, &port, &user, &password, &database, &sslmode)
            .await
            .map_err(|e| e.to_string())?;

        let start = std::time::Instant::now();
        let rows = sqlx::query(&sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;
        let duration_ms = start.elapsed().as_millis() as u64;
        pool.close().await;

        let columns = rows
            .first()
            .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
            .unwrap_or_default();
        let result_rows: Vec<Vec<String>> = rows
            .iter()
            .map(|row| {
                (0..row.columns().len())
                    .map(|i| cell_to_string_pg(row, i))
                    .collect()
            })
            .collect();
        let row_count = result_rows.len();

        return Ok(QueryResult {
            columns,
            rows: result_rows,
            row_count,
            duration_ms,
        });
    }
    let url = build_connection_url(
        &provider, &host, &port, &user, &password, &database, &sslmode,
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    let rows = sqlx::query(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as u64;
    pool.close().await;

    let columns = rows
        .first()
        .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
        .unwrap_or_default();

    let result_rows: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            (0..row.columns().len())
                .map(|i| cell_to_string(row, i))
                .collect()
        })
        .collect();

    let row_count = result_rows.len();
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

#[derive(serde::Serialize, Clone)]
struct DiscoveredServer {
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    connected: bool,
    databases: Vec<String>,
    error: Option<String>,
}

fn port_open(host: &str, port: u16) -> bool {
    let addr = format!("{host}:{port}");
    match addr.to_socket_addrs() {
        Ok(mut addrs) => addrs
            .next()
            .map(|a| TcpStream::connect_timeout(&a, Duration::from_millis(300)).is_ok())
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn os_user() -> Option<String> {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .ok()
}

fn pg_candidates() -> Vec<(String, String)> {
    let mut v = vec![];
    if let Some(u) = os_user() {
        v.push((u, String::new()));
    } // local peer/trust auth
    v.push(("postgres".into(), String::new()));
    v.push(("postgres".into(), "postgres".into()));
    v
}

fn mysql_candidates() -> Vec<(String, String)> {
    vec![
        ("root".into(), String::new()),
        ("root".into(), "root".into()),
    ]
}

fn walk_for_sqlite(root: &str, found: &mut Vec<String>, depth: u8) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if matches!(name, "node_modules" | ".git" | "target" | "dist" | "build") {
                continue;
            }
            walk_for_sqlite(path.to_str().unwrap_or(""), found, depth + 1);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if matches!(ext, "db" | "sqlite" | "sqlite3") {
                found.push(path.to_string_lossy().to_string());
            }
        }
    }
}

#[tauri::command]
async fn discover_databases(sqlite_roots: Vec<String>) -> Vec<DiscoveredServer> {
    sqlx::any::install_default_drivers();
    let mut results = Vec::new();

    let mut socket_connected = false;
    if let Some(user) = os_user() {
        for socket_dir in ["/var/run/postgresql", "/tmp"] {
            eprintln!("[db-discover] trying socket: {socket_dir} as user {user}");

            let opts = sqlx::postgres::PgConnectOptions::new()
                .socket(socket_dir)
                .username(&user)
                .database("postgres");

            match PgPoolOptions::new().connect_with(opts).await {
                Ok(pool) => {
                    match sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false")
                        .fetch_all(&pool)
                        .await
                    {
                        Ok(rows) => {
                            results.push(DiscoveredServer {
                                provider: "postgres".into(),
                                host: format!("socket:{socket_dir}"),
                                port: String::new(),
                                user: user.clone(),
                                password: String::new(),
                                connected: true,
                                databases: rows
                                    .iter()
                                    .filter_map(|r| r.try_get::<String, _>(0).ok())
                                    .collect(),
                                error: None,
                            });
                            socket_connected = true;
                        }
                        Err(e) => eprintln!("[db-discover] query failed: {e}"),
                    }
                    pool.close().await;
                    if socket_connected {
                        break;
                    }
                }
                Err(e) => eprintln!("[db-discover] connect failed: {e}"),
            }
        }
    }

    for port in [5432u16, 5433] {
        if socket_connected {
            break;
        }
        if !port_open("localhost", port) {
            continue;
        }
        let mut server = DiscoveredServer {
            provider: "postgres".into(),
            host: "localhost".into(),
            port: port.to_string(),
            user: String::new(),
            password: String::new(),
            connected: false,
            databases: vec![],
            error: None,
        };
        for (user, pass) in pg_candidates() {
            let url = build_connection_url(
                "postgres",
                "localhost",
                &port.to_string(),
                &user,
                &pass,
                "postgres",
                "", // ⬅️ ADD THIS — local discovery, no SSL needed
            );
            if let Ok(pool) = AnyPoolOptions::new().connect(&url).await {
                if let Ok(rows) =
                    sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false")
                        .fetch_all(&pool)
                        .await
                {
                    server.databases = rows
                        .iter()
                        .filter_map(|r| r.try_get::<String, _>(0).ok())
                        .collect();
                    server.connected = true;
                    server.user = user;
                    server.password = pass;
                }
                pool.close().await;
                if server.connected {
                    break;
                }
            }
        }
        if !server.connected {
            server.error = Some("Found a Postgres server but couldn't auto-authenticate".into());
        }
        results.push(server);
    }

    for port in [3306u16, 3307] {
        if !port_open("localhost", port) {
            continue;
        }
        let mut server = DiscoveredServer {
            provider: "mysql".into(),
            host: "localhost".into(),
            port: port.to_string(),
            user: String::new(),
            password: String::new(),
            connected: false,
            databases: vec![],
            error: None,
        };
        for (user, pass) in mysql_candidates() {
            let url = build_connection_url(
                "mysql",
                "localhost",
                &port.to_string(),
                &user,
                &pass,
                "mysql",
                "", // ⬅️ ADD THIS — local discovery, no SSL needed
            );
            if let Ok(pool) = AnyPoolOptions::new().connect(&url).await {
                if let Ok(rows) = sqlx::query("SHOW DATABASES").fetch_all(&pool).await {
                    server.databases = rows
                        .iter()
                        .filter_map(|r| r.try_get::<String, _>(0).ok())
                        .collect();
                    server.connected = true;
                    server.user = user;
                    server.password = pass;
                }
                pool.close().await;
                if server.connected {
                    break;
                }
            }
        }
        if !server.connected {
            server.error = Some("Found a MySQL server but couldn't auto-authenticate".into());
        }
        results.push(server);
    }

    for root in sqlite_roots {
        let mut found = Vec::new();
        walk_for_sqlite(&root, &mut found, 0);
        for path in found {
            results.push(DiscoveredServer {
                provider: "sqlite".into(),
                host: String::new(),
                port: String::new(),
                user: String::new(),
                password: String::new(),
                connected: true,
                databases: vec![path],
                error: None,
            });
        }
    }

    results
}

#[tauri::command]
fn add_cron_job(schedule: String, command: String) -> Result<(), String> {
    let output = std::process::Command::new("crontab")
        .arg("-l")
        .output()
        .map_err(|e| e.to_string())?;

    let existing = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        String::new()
    };

    let new_content = format!(
        "{}{}\n",
        existing.trim_end(),
        format!("\n{} {}", schedule, command)
    );

    let mut child = std::process::Command::new("crontab")
        .arg("-")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    use std::io::Write;
    child
        .stdin
        .as_mut()
        .ok_or("failed to open stdin")?
        .write_all(new_content.as_bytes())
        .map_err(|e| e.to_string())?;
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AudioState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_memory_info,
            get_battery_info,
            get_disk_info,
            get_temperatures,
            get_managed_units,
            start_unit,
            stop_unit,
            restart_unit,
            list_containers,
            list_images,
            start_container,
            stop_container,
            remove_container,
            remove_image,
            list_volumes,
            remove_volume,
            scan_projects,
            open_in_editor,
            list_ports,
            kill_port,
            scan_git_status,
            scan_env_risks,
            scan_bloat,
            delete_bloat_dir,
            list_cron_jobs,
            delete_cron_job,
            scan_music_library,
            play_track,
            pause_playback,
            resume_playback,
            stop_playback,
            set_volume,
            get_playback_position,
            seek_playback,
            send_http_request,
            test_db_connection,
            list_databases,
            list_tables,
            run_query,
            discover_databases,
            add_cron_job
        ])
        .setup(|app| {
            // Build the right-click menu items
            let show_item = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build the tray icon itself, reusing the app's default icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
