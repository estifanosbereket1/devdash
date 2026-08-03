#[derive(serde::Serialize, Clone)]
pub struct PortInfo {
    port: u16,
    protocol: String,
    pid: Option<u32>,
    process: Option<String>,
}

#[tauri::command]
pub fn list_ports() -> Result<Vec<PortInfo>, String> {
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
pub fn kill_port(pid: u32) -> Result<(), String> {
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
