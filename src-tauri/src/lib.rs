use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

mod system_stats;
use system_stats::*;
mod systemd;
use systemd::*;
mod ports;
use ports::*;
mod cron;
use cron::*;
mod backup;
use backup::*;
mod docker;
use docker::*;
mod network;
use network::*;
mod projects;
use projects::*;
mod database;
use database::*;
mod music;
use music::*;

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
            compose_up,
            compose_down,
            open_in_editor,
            detect_editors,
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
            list_tunnels,
            test_db_connection,
            list_databases,
            list_tables,
            run_query,
            discover_databases,
            add_cron_job,
            export_backup,
            import_backup
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
