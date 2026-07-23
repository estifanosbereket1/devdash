use bollard::query_parameters::{
    ListContainersOptionsBuilder, ListImagesOptionsBuilder, RemoveContainerOptionsBuilder,
    RemoveImageOptionsBuilder, StopContainerOptionsBuilder,
};

use bollard::Docker;
use std::fs;
use sysinfo::Components;
use sysinfo::Disks;
use sysinfo::System;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use zbus::zvariant::OwnedObjectPath;
use zbus::Connection;

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
    let result = units
        .into_iter()
        .filter(|u| enabled_names.contains(&u.0))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            remove_image
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
