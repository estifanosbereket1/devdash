use tauri::Manager;

const BACKUP_FILES: &[&str] = &[
    "rest-client.json",
    "journal-entries.json",
    "tasks.json",
    "db-connections.json",
    "project-roots.json",
    "editor-preferences.json",
    "music-roots.json",
    "notes.json",
    "remote-db-connections.json",
    "settings.json",
    "command-palette-usage.json",
];

#[tauri::command]
pub async fn export_backup(app: tauri::AppHandle, target_path: String) -> Result<usize, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let mut bundle = serde_json::Map::new();
    let mut count = 0;
    for file in BACKUP_FILES {
        let path = dir.join(file);
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let json: serde_json::Value =
                serde_json::from_str(&content).unwrap_or(serde_json::Value::Null);
            bundle.insert(file.to_string(), json);
            count += 1;
        }
    }

    let output = serde_json::json!({
        "app": "devdash",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "files": bundle,
    });

    std::fs::write(
        &target_path,
        serde_json::to_string_pretty(&output).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(count)
}

#[tauri::command]
pub async fn import_backup(app: tauri::AppHandle, source_path: String) -> Result<Vec<String>, String> {
    let content = std::fs::read_to_string(&source_path).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let files = parsed
        .get("files")
        .and_then(|f| f.as_object())
        .ok_or("Invalid backup file — missing 'files' key")?;

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut restored = Vec::new();
    for (name, value) in files {
        // safety: only ever write filenames we recognize, never trust arbitrary paths from the bundle
        if !BACKUP_FILES.contains(&name.as_str()) {
            continue;
        }
        let path = dir.join(name);
        std::fs::write(
            &path,
            serde_json::to_string_pretty(value).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        restored.push(name.clone());
    }

    Ok(restored)
}
