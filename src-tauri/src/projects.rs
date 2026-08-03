use std::path::Path;

#[derive(serde::Serialize, Clone)]
pub struct ProjectInfo {
    name: String,
    path: String,
    kind: String,
    has_compose: bool,
}

const COMPOSE_FILENAMES: &[&str] = &[
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
];

fn has_compose_file(dir: &Path) -> bool {
    COMPOSE_FILENAMES.iter().any(|f| dir.join(f).exists())
}

fn detect_kind(dir: &Path) -> Option<String> {
    if dir.join("pubspec.yaml").exists() {
        Some("Flutter".to_string())
    } else if dir.join("pyproject.toml").exists()
        || dir.join("requirements.txt").exists()
        || dir.join("setup.py").exists()
    {
        Some("Python".to_string())
    } else if dir.join("composer.json").exists() {
        Some("PHP".to_string())
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
    } else if dir.join("pom.xml").exists()
        || dir.join("build.gradle").exists()
        || dir.join("build.gradle.kts").exists()
    {
        Some("Java".to_string())
    } else if has_compose_file(dir) {
        // infra-only folder (no app source at this level) but still worth surfacing
        // so its compose stack isn't invisible to the scanner
        Some("Docker".to_string())
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
            has_compose: has_compose_file(dir),
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
pub fn scan_projects(roots: Vec<String>) -> Vec<ProjectInfo> {
    let mut results = Vec::new();
    for root in roots {
        scan_dir(Path::new(&root), 0, 5, &mut results); // max_depth=5 keeps scans fast
    }
    results
}

#[tauri::command]
pub fn open_in_editor(path: String, editor: String) -> Result<(), String> {
    let binary = match editor.as_str() {
        "vscode" => "code",
        "zed" => "zed",
        other => other, // allow passing a raw binary name/path directly too
    };
    std::process::Command::new(binary)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to launch {binary}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn compose_up(project_path: String) -> Result<(), String> {
    let status = std::process::Command::new("docker")
        .args(["compose", "up", "-d"])
        .current_dir(&project_path)
        .status()
        .map_err(|e| format!("failed to run docker compose up: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("docker compose up exited with status: {status}"))
    }
}

#[tauri::command]
pub fn compose_down(project_path: String) -> Result<(), String> {
    let status = std::process::Command::new("docker")
        .args(["compose", "down"])
        .current_dir(&project_path)
        .status()
        .map_err(|e| format!("failed to run docker compose down: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("docker compose down exited with status: {status}"))
    }
}

#[derive(serde::Serialize, Clone)]
pub struct EditorInfo {
    id: String,
    label: String,
    command: String,
    color: String,
    // project `kind`s this editor is a good match for; empty = suits any project
    kinds: Vec<String>,
}

struct EditorDef {
    id: &'static str,
    label: &'static str,
    color: &'static str,
    kinds: &'static [&'static str],
    binaries: &'static [&'static str],
}

// General-purpose editors have empty `kinds` (shown for every project);
// IDEs are scoped to the project kind(s) they're built for.
const EDITOR_DEFS: &[EditorDef] = &[
    EditorDef { id: "vscode", label: "VS Code", color: "#519aba", kinds: &[], binaries: &["code", "code-insiders", "codium", "vscodium"] },
    EditorDef { id: "zed", label: "Zed", color: "#ff9f5b", kinds: &[], binaries: &["zed"] },
    EditorDef { id: "sublime", label: "Sublime Text", color: "#ff9800", kinds: &[], binaries: &["subl"] },
    EditorDef { id: "androidstudio", label: "Android Studio", color: "#3ddc84", kinds: &["Flutter", "Java"], binaries: &["studio.sh", "studio", "android-studio"] },
    EditorDef { id: "pycharm", label: "PyCharm", color: "#21d789", kinds: &["Python"], binaries: &["pycharm", "pycharm.sh", "charm"] },
    EditorDef { id: "phpstorm", label: "PhpStorm", color: "#b075f0", kinds: &["PHP"], binaries: &["phpstorm", "phpstorm.sh"] },
    EditorDef { id: "intellij", label: "IntelliJ IDEA", color: "#fe315d", kinds: &["Java"], binaries: &["idea", "idea.sh", "idea-ce", "intellij-idea-community", "intellij-idea-ultimate"] },
    EditorDef { id: "webstorm", label: "WebStorm", color: "#40b6e0", kinds: &["TypeScript", "JavaScript"], binaries: &["webstorm", "webstorm.sh"] },
    EditorDef { id: "goland", label: "GoLand", color: "#4a7ef2", kinds: &["Go"], binaries: &["goland", "goland.sh"] },
    EditorDef { id: "rustrover", label: "RustRover", color: "#f74c00", kinds: &["Rust"], binaries: &["rustrover", "rustrover.sh"] },
    EditorDef { id: "rider", label: "Rider", color: "#c90f5e", kinds: &["C#"], binaries: &["rider", "rider.sh"] },
    EditorDef { id: "clion", label: "CLion", color: "#22cae6", kinds: &[], binaries: &["clion", "clion.sh"] },
    EditorDef { id: "eclipse", label: "Eclipse", color: "#2c58ba", kinds: &["Java"], binaries: &["eclipse"] },
];

// Looks for the first matching binary name on PATH (via `which`), falling back
// to a handful of install locations JetBrains/Google installers commonly use
// but don't always add to PATH (Toolbox scripts, snap, tarball installs under /opt).
fn find_binary(names: &[&str]) -> Option<String> {
    for name in names {
        if let Ok(output) = std::process::Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let mut search_dirs = vec![
        "/snap/bin".to_string(),
        format!("{home}/.local/share/JetBrains/Toolbox/scripts"),
    ];
    if let Ok(entries) = std::fs::read_dir("/opt") {
        for entry in entries.flatten() {
            let bin_dir = entry.path().join("bin");
            if bin_dir.is_dir() {
                search_dirs.push(bin_dir.to_string_lossy().to_string());
            }
        }
    }

    for dir in &search_dirs {
        for name in names {
            let candidate = Path::new(dir).join(name);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub fn detect_editors() -> Vec<EditorInfo> {
    EDITOR_DEFS
        .iter()
        .filter_map(|def| {
            find_binary(def.binaries).map(|command| EditorInfo {
                id: def.id.to_string(),
                label: def.label.to_string(),
                command,
                color: def.color.to_string(),
                kinds: def.kinds.iter().map(|k| k.to_string()).collect(),
            })
        })
        .collect()
}

#[derive(serde::Serialize, Clone)]
pub struct GitStatus {
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
pub fn scan_git_status(paths: Vec<String>) -> std::collections::HashMap<String, GitStatus> {
    paths
        .into_iter()
        .filter_map(|p| get_git_status(&p).map(|status| (p, status)))
        .collect()
}

#[derive(serde::Serialize, Clone)]
pub struct EnvRisk {
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
pub fn scan_env_risks(projects: Vec<(String, String)>) -> Vec<EnvRisk> {
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
pub struct BloatEntry {
    project_name: String,
    folder_name: String,
    path: String,
    size_mb: f64,
}

#[tauri::command]
pub fn scan_bloat(projects: Vec<(String, String)>) -> Vec<BloatEntry> {
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
pub fn delete_bloat_dir(path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
}
