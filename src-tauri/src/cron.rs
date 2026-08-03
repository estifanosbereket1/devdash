#[derive(serde::Serialize, Clone)]
pub struct CronJob {
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
pub fn list_cron_jobs() -> Result<Vec<CronJob>, String> {
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
pub fn delete_cron_job(raw_line: String) -> Result<(), String> {
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
pub fn add_cron_job(schedule: String, command: String) -> Result<(), String> {
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
