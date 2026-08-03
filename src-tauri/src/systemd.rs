use zbus::zvariant::OwnedObjectPath;
use zbus::Connection;

#[derive(serde::Serialize)]
pub struct UnitInfo {
    name: String,
    description: String,
    load_state: String,
    active_state: String,
    sub_state: String,
}

#[tauri::command]
pub async fn get_managed_units() -> Result<Vec<UnitInfo>, String> {
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
pub async fn start_unit(unit_name: String) -> Result<(), String> {
    call_unit_action(unit_name, "StartUnit").await
}

#[tauri::command]
pub async fn stop_unit(unit_name: String) -> Result<(), String> {
    call_unit_action(unit_name, "StopUnit").await
}

#[tauri::command]
pub async fn restart_unit(unit_name: String) -> Result<(), String> {
    call_unit_action(unit_name, "RestartUnit").await
}
