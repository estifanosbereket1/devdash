use rodio::stream::{DeviceSinkBuilder, MixerDeviceSink};
use rodio::Decoder;
use rodio::Player;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Mutex;

pub struct AudioState {
    _sink: MixerDeviceSink, // must stay alive for the whole app — dropping it kills audio output
    player: Mutex<Option<Player>>,
}

impl AudioState {
    pub fn new() -> Self {
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
pub struct TrackInfo {
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
pub fn scan_music_library(roots: Vec<String>) -> Vec<TrackInfo> {
    let mut results = Vec::new();
    for root in roots {
        scan_music_dir(Path::new(&root), &mut results);
    }
    results
}

#[tauri::command]
pub fn play_track(state: tauri::State<AudioState>, path: String) -> Result<(), String> {
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
pub fn pause_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player.pause();
    }
    Ok(())
}

#[tauri::command]
pub fn resume_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player.play();
    }
    Ok(())
}

#[tauri::command]
pub fn stop_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    let mut player_guard = state.player.lock().map_err(|e| e.to_string())?;
    *player_guard = None;
    Ok(())
}

#[tauri::command]
pub fn set_volume(state: tauri::State<AudioState>, volume: f32) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player.set_volume(volume);
    }
    Ok(())
}

#[tauri::command]
pub fn get_playback_position(state: tauri::State<AudioState>) -> Result<f64, String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        Ok(player.get_pos().as_secs_f64())
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub fn seek_playback(state: tauri::State<AudioState>, position_secs: f64) -> Result<(), String> {
    if let Some(player) = state.player.lock().map_err(|e| e.to_string())?.as_ref() {
        player
            .try_seek(std::time::Duration::from_secs_f64(position_secs))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
