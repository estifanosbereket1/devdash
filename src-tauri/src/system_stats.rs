use std::fs;
use sysinfo::Components;
use sysinfo::Disks;
use sysinfo::System;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
pub struct MemoryInfo {
    used_gb: f64,
    total_gb: f64,
    ratio: f64,
}

#[tauri::command]
pub fn get_memory_info() -> MemoryInfo {
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
pub struct BatteryInfo {
    percentage: f64,
    capacity_health: f64, // current full charge vs original design capacity
    cycle_count: Option<u32>,
    status: String,
}

#[tauri::command]
pub fn get_battery_info() -> Result<BatteryInfo, String> {
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
pub struct DiskInfo {
    name: String,
    mount_point: String,
    total_gb: f64,
    free_gb: f64,
    used_ratio: f64,
}

#[tauri::command]
pub fn get_disk_info() -> Vec<DiskInfo> {
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
pub struct TempReading {
    label: String,
    celsius: f64,
}

#[tauri::command]
pub fn get_temperatures() -> Vec<TempReading> {
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
