use crate::{errors::LauncherError, helpers, injector, samp};
use log::{error, info, warn};
use md5::compute;
use sevenz_rust::decompress_file;
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[tauri::command]
pub async fn inject(
    app_handle: tauri::AppHandle,
    name: &str,
    ip: &str,
    port: i32,
    exe: &str,
    dll: &str,
    omp_file: &str,
    password: &str,
    custom_game_exe: &str,
    debug: bool,
    debug_detailed: bool,
    audio_fix: bool,
    render_fix: bool,
) -> std::result::Result<(), String> {
    let actual_omp_file = if *crate::NO_OMP_FLAG.lock().unwrap() {
        ""
    } else {
        omp_file
    };

    #[cfg(not(target_os = "windows"))]
    let injector_path = app_handle
        .path_resolver()
        .app_local_data_dir()
        .map(|d| d.join("injector.exe"));

    #[cfg(target_os = "windows")]
    let injector_path: Option<std::path::PathBuf> = None;

    match injector::run_samp(
        name,
        ip,
        port,
        exe,
        dll,
        actual_omp_file,
        password,
        custom_game_exe,
        injector_path.as_deref(),
        debug,
        debug_detailed,
        audio_fix,
        render_fix,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(e) => {
            log::warn!("{}", e);
            match e {
                LauncherError::AccessDenied(_) => {
                    return Err("need_admin".to_string());
                }
                _ => return Err(e.to_string()),
            }
        }
    }
}

#[tauri::command]
pub fn get_gtasa_path_from_samp() -> String {
    samp::get_gtasa_path()
}

#[tauri::command]
pub fn get_gtasa_path_for_bottle(bottle_name: String) -> String {
    samp::get_gtasa_path_for_bottle(&bottle_name)
}

#[tauri::command]
pub fn get_nickname_from_samp() -> String {
    samp::get_nickname()
}

#[tauri::command]
pub fn rerun_as_admin() -> std::result::Result<String, String> {
    let exe_path = std::env::current_exe()
        .map_err(|_| "Failed to get current executable path".to_string())?
        .into_os_string()
        .into_string()
        .map_err(|_| "Failed to convert path to string".to_string())?;

    runas::Command::new(exe_path)
        .arg("")
        .status()
        .map_err(|_| "Failed to restart as administrator".to_string())?;

    Ok("SUCCESS".to_string())
}

#[tauri::command]
pub fn get_samp_favorite_list() -> String {
    samp::get_samp_favorite_list()
}

#[tauri::command]
pub fn resolve_hostname(hostname: String) -> std::result::Result<String, String> {
    use std::net::{IpAddr, ToSocketAddrs};

    if hostname.is_empty() {
        return Err("Hostname cannot be empty".to_string());
    }

    let addr = format!("{}:80", hostname);
    let addrs = addr
        .to_socket_addrs()
        .map_err(|e| format!("Failed to resolve hostname '{}': {}", hostname, e))?;

    for ip in addrs {
        if let IpAddr::V4(ipv4) = ip.ip() {
            return Ok(ipv4.to_string());
        }
    }

    Err(format!("No IPv4 address found for hostname '{}'", hostname))
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn is_process_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle != 0 {
            CloseHandle(handle);
            true
        } else {
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn is_process_alive(pid: u32) -> bool {
    use sysinfo::{Pid, System};

    let mut sys = System::new();
    sys.refresh_processes();
    sys.process(Pid::from_u32(pid)).is_some()
}

/// Kill every running GTA SA instance. Used by the launch overlay's Cancel
/// button and to enforce a single game at a time. Returns how many.
#[tauri::command]
pub fn kill_game() -> u32 {
    helpers::kill_game_processes()
}

/// True if a GTA SA process is currently alive (native or under Wine). The
/// frontend polls this after a launch to confirm the game came up, instead of
/// relying on a fixed timeout.
#[tauri::command]
pub fn is_game_running() -> bool {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes();
    sys.processes().values().any(|p| helpers::is_game_process(p))
}

#[derive(serde::Serialize)]
pub struct MacosHealth {
    /// CrossOver is installed and its launch tool is available.
    crossover: bool,
    /// A GTA SA executable was found (auto-detected or via the SA-MP key).
    game_exe: bool,
    /// The Rockstar Games Launcher bottle is present.
    rockstar_launcher: bool,
    /// The detected game directory (empty if none).
    game_path: String,
    /// Name of the CrossOver bottle that was matched (empty if none).
    bottle: String,
}

/// List the CrossOver bottle names (folders under .../CrossOver/Bottles).
#[tauri::command]
pub fn list_bottles() -> Vec<String> {
    use std::path::PathBuf;
    let mut names = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        let bottles =
            PathBuf::from(&home).join("Library/Application Support/CrossOver/Bottles");
        if let Ok(entries) = std::fs::read_dir(&bottles) {
            for e in entries.flatten() {
                if e.path().is_dir() {
                    if let Some(name) = e.file_name().to_str() {
                        if !name.starts_with('.') {
                            names.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    names.sort();
    names
}

/// Health/status check for the macOS setup, surfaced in Settings.
/// `bottle_name` overrides the bottle to look in; empty = auto-scan all.
#[tauri::command]
pub fn get_macos_health(bottle_name: String) -> MacosHealth {
    use std::path::PathBuf;

    let crossover = Path::new("/Applications/CrossOver.app").is_dir()
        && Path::new(
            "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxstart",
        )
        .exists();

    // The Rockstar Games Launcher lives inside a CrossOver bottle. Use the
    // user-provided bottle name if set, otherwise find the bottle that has it.
    let mut rockstar_launcher = false;
    let mut bottle = String::new();
    let mut game_path = String::new();
    if let Ok(home) = std::env::var("HOME") {
        let bottles =
            PathBuf::from(&home).join("Library/Application Support/CrossOver/Bottles");
        let has_rgl =
            |b: &Path| b.join("drive_c/Program Files/Rockstar Games/Launcher").is_dir();

        if !bottle_name.is_empty() {
            let b = bottles.join(&bottle_name);
            if b.is_dir() {
                bottle = bottle_name.clone();
                rockstar_launcher = has_rgl(&b);
                game_path = samp::get_gtasa_path_for_bottle(&bottle_name);
            }
        } else if let Ok(entries) = std::fs::read_dir(&bottles) {
            game_path = samp::get_gtasa_path();
            for e in entries.flatten() {
                let entry_path = e.path();
                if !game_path.is_empty() && Path::new(&game_path).starts_with(&entry_path) {
                    bottle = e.file_name().to_string_lossy().to_string();
                    rockstar_launcher = has_rgl(&entry_path);
                    break;
                }
            }
            if bottle.is_empty() {
                if let Ok(entries) = std::fs::read_dir(&bottles) {
                    for e in entries.flatten() {
                        if has_rgl(&e.path()) {
                            bottle = e.file_name().to_string_lossy().to_string();
                            rockstar_launcher = true;
                            break;
                        }
                    }
                }
            }
        }
    }
    let game_exe = !game_path.is_empty();

    MacosHealth {
        crossover,
        game_exe,
        rockstar_launcher,
        game_path,
        bottle,
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn prepare_macos_samp_files(
    gtasa_dir: String,
    dll: String,
    omp_file: String,
    custom_game_exe: String,
) -> std::result::Result<(), String> {
    use crate::constants::GTA_SA_EXECUTABLE_ALT;
    use std::path::PathBuf;

    let game_dir = PathBuf::from(&gtasa_dir);
    let exe_name = if custom_game_exe.is_empty() {
        GTA_SA_EXECUTABLE_ALT
    } else {
        custom_game_exe.as_str()
    };

    if !game_dir.join(exe_name).is_file() {
        return Err(format!(
            "game_not_found: {}",
            game_dir.join(exe_name).display()
        ));
    }

    injector::prepare_client_files(&game_dir, &dll, &omp_file, true).map_err(String::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn prepare_macos_samp_files(
    _gtasa_dir: String,
    _dll: String,
    _omp_file: String,
    _custom_game_exe: String,
) -> std::result::Result<(), String> {
    Ok(())
}

/// Remove every launcher-placed SA-MP/open.mp file from the game folder and
/// restore it to plain GTA: San Andreas. `files` is the list of game-dir
/// relative paths the frontend installed (samp.dll, omp-client.dll, the
/// shared SA-MP files, ...).
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn uninstall_macos_samp_files(
    gtasa_dir: String,
    files: Vec<String>,
) -> std::result::Result<(), String> {
    use crate::constants::OMP_WINE_INJECTOR_EXE;
    use std::path::PathBuf;

    let game_dir = PathBuf::from(&gtasa_dir);
    if !game_dir.is_dir() {
        return Err(format!("game_not_found: {}", gtasa_dir));
    }

    for rel in &files {
        let p = game_dir.join(rel);
        if p.is_file() {
            if let Err(e) = std::fs::remove_file(&p) {
                return Err(format!("Failed to remove {}: {}", p.display(), e));
            }
            info!("[uninstall] removed {}", p.display());
        }
    }

    let _ = std::fs::remove_file(game_dir.join(OMP_WINE_INJECTOR_EXE));

    // If debug mode left the vorbisFile.dll proxy in place, restore the genuine
    // DLL so the folder is fully reverted.
    let real = game_dir.join("vorbisFile.dll");
    let backup = game_dir.join("vorbisFile_o.dll");
    if backup.is_file() {
        let _ = std::fs::remove_file(&real);
        if std::fs::rename(&backup, &real).is_ok() {
            info!("[uninstall] restored genuine vorbisFile.dll");
        }
    }

    // Revert the SA-MP client registry key the launcher added before launch.
    // Best effort: a missing CrossOver / bottle must not fail the uninstall.
    revert_samp_registry(&game_dir);

    Ok(())
}

/// Delete SA-MP / open.mp files from the GTA:SA User Files directory:
/// omp.cfg, samp.log, chatlog.txt, SAMP/ and omp/ folders.
/// Also wipes <game_dir>/omp-logs/ (debug mode artifacts) when provided.
/// GTA:SA save files and other unrelated files are not touched.
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn clear_samp_user_cache(
    user_files_dir: String,
    game_dir: Option<String>,
) -> std::result::Result<(), String> {
    use std::path::PathBuf;

    let dir = PathBuf::from(&user_files_dir);
    if !dir.is_dir() {
        return Err(format!("user_files_not_found: {}", user_files_dir));
    }

    for f in ["omp.cfg", "samp.log", "chatlog.txt"] {
        let p = dir.join(f);
        if p.is_file() {
            if let Err(e) = std::fs::remove_file(&p) {
                return Err(format!("Failed to remove {}: {}", p.display(), e));
            }
            info!("[cache] removed {}", p.display());
        }
    }

    for d in ["SAMP", "omp"] {
        let p = dir.join(d);
        if p.is_dir() {
            if let Err(e) = std::fs::remove_dir_all(&p) {
                return Err(format!("Failed to remove {}: {}", p.display(), e));
            }
            info!("[cache] removed dir {}", p.display());
        }
    }

    if let Some(gd) = game_dir {
        let logs = PathBuf::from(&gd).join("omp-logs");
        if logs.is_dir() {
            if let Err(e) = std::fs::remove_dir_all(&logs) {
                return Err(format!("Failed to remove {}: {}", logs.display(), e));
            }
            info!("[cache] removed dir {}", logs.display());
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn clear_samp_user_cache(
    _user_files_dir: String,
    _game_dir: Option<String>,
) -> std::result::Result<(), String> {
    Ok(())
}

/// Find the Wine bottle for a game dir (nearest drive_c ancestor) and delete
/// the SA-MP client registry key the launcher added.
#[cfg(not(target_os = "windows"))]
fn revert_samp_registry(game_dir: &Path) {
    use std::process::{Command, Stdio};

    let cxstart = Path::new(crate::constants::CROSSOVER_CXSTART);
    if !cxstart.is_file() {
        return;
    }

    let mut cur = game_dir;
    let bottle = loop {
        match cur.parent() {
            Some(parent) if parent.join("drive_c").is_dir() => {
                break parent.file_name().map(|s| s.to_string_lossy().to_string());
            }
            Some(parent) => cur = parent,
            None => break None,
        }
    };
    let Some(bottle) = bottle else { return };

    let _ = Command::new(cxstart)
        .arg("--bottle")
        .arg(&bottle)
        .args(["reg", "delete", "HKCU\\Software\\SAMP", "/f"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    info!("[uninstall] removed SA-MP registry key in bottle '{}'", bottle);
}

/// Reveal a file or folder in Finder (macOS `open`).
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn open_in_finder(path: String) -> std::result::Result<(), String> {
    use std::path::PathBuf;

    if !PathBuf::from(&path).exists() {
        return Err(format!("path_not_found: {}", path));
    }
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open '{}': {}", path, e))
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn open_in_finder(path: String) -> std::result::Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open '{}': {}", path, e))
}

/// Open macOS Audio MIDI Setup so the user can set the output device's Format
/// to 48000 Hz by hand — the fallback when the Audio fix couldn't set it.
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn open_audio_midi_setup() -> std::result::Result<(), String> {
    std::process::Command::new("open")
        .args(["-a", "Audio MIDI Setup"])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open Audio MIDI Setup: {}", e))
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn open_audio_midi_setup() -> std::result::Result<(), String> {
    Ok(())
}

/// Default audio output device info, used before launch to decide whether to
/// warn about the macOS/CrossOver audio crash (high sample rate is the risk).
/// Returns null when there's nothing to report (no device, or non-macOS).
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn get_audio_output_info() -> Option<serde_json::Value> {
    crate::audio::default_output_device_info().map(|dev| {
        serde_json::json!({
            "name": dev.name,
            "builtIn": dev.built_in,
            "bluetooth": dev.bluetooth,
            "sampleRate": dev.sample_rate,
        })
    })
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn get_audio_output_info() -> Option<serde_json::Value> {
    None
}

/// Set the default output device's nominal sample rate (Hz) and return the rate
/// it actually settled on. Backs the one-click "Set my audio to 44.1 kHz" button
/// in the launch gate so the user doesn't have to open Audio MIDI Setup by hand.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_audio_output_sample_rate(rate: u32) -> std::result::Result<u32, String> {
    crate::audio::set_default_output_sample_rate(rate)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_audio_output_sample_rate(_rate: u32) -> std::result::Result<u32, String> {
    Err("unsupported".into())
}

/// Apply the audio route fix before launch: route Wine away from the built-in
/// speaker driver that faults on Tahoe — to a real external device if one is
/// present, else to our own aggregate device wrapping the speakers. Returns
/// `{ previousUid, routedTo, createdAggregate }` so the caller can restore it
/// when the game exits.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn apply_audio_route_fix() -> std::result::Result<serde_json::Value, String> {
    let route = crate::audio::apply_audio_route_fix()?;
    Ok(serde_json::json!({
        "previousUid": route.previous_uid,
        "routedTo": route.routed_to,
        "createdAggregate": route.created_aggregate,
    }))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn apply_audio_route_fix() -> std::result::Result<serde_json::Value, String> {
    Err("unsupported".into())
}

/// Restore the output device changed by `apply_audio_route_fix` and destroy our
/// aggregate if one was created. Best-effort; never errors so it can't block the
/// post-game cleanup.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn restore_audio_route(previous_uid: Option<String>, destroy_aggregate: bool) {
    crate::audio::restore_audio_route(previous_uid.as_deref(), destroy_aggregate);
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn restore_audio_route(_previous_uid: Option<String>, _destroy_aggregate: bool) {}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn uninstall_macos_samp_files(
    _gtasa_dir: String,
    _files: Vec<String>,
) -> std::result::Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn get_checksum_of_files(list: Vec<String>) -> std::result::Result<Vec<String>, String> {
    let mut result = Vec::new();

    for file in list {
        let mut f =
            File::open(&file).map_err(|e| format!("Failed to open file '{}': {}", file, e))?;

        let mut contents = Vec::new();
        f.read_to_end(&mut contents)
            .map_err(|e| format!("Failed to read file '{}': {}", file, e))?;

        let digest = compute(&contents);
        let checksum_entry = format!("{}|{:x}", file, digest);
        result.push(checksum_entry);
    }

    Ok(result)
}

#[tauri::command]
pub fn extract_7z(path: String, output_path: String) -> std::result::Result<(), String> {
    decompress_file(&path, &output_path)
        .map_err(|e| format!("Failed to extract archive '{}': {}", path, e))
}

#[tauri::command]
pub async fn copy_files_to_gtasa(
    src: String,
    gtasa_dir: String,
) -> std::result::Result<(), String> {
    match helpers::copy_files(&src, &gtasa_dir) {
        Ok(_) => Ok(()),
        Err(e) => {
            log::warn!("{}", e);
            match e {
                LauncherError::AccessDenied(_) => {
                    return Err("need_admin".to_string());
                }
                _ => return Err(e.to_string()),
            }
        }
    }
}

/// Probe ~/Documents to trigger the macOS TCC permission dialog at startup,
/// before the game launcher needs it (clear_samp_user_cache accesses that dir).
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn request_documents_access() {
    if let Ok(home) = std::env::var("HOME") {
        let docs = std::path::Path::new(&home).join("Documents");
        let _ = std::fs::read_dir(&docs);
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn request_documents_access() {}

#[tauri::command]
pub fn log_info(msg: &str) -> () {
    info!("Frontend info: {}", msg);
}

#[tauri::command]
pub fn log_warn(msg: &str) -> () {
    warn!("Frontend warning: {}", msg);
}

#[tauri::command]
pub fn log_error(msg: &str) -> () {
    error!("Frontend error: {}", msg);
}

// Native macOS traffic-light control. We never toggle `decorations` at
// runtime — that drops the `titleBarStyle: Overlay` style and leaves a
// doubled titlebar — so visibility and position are driven through AppKit.
#[cfg(target_os = "macos")]
mod traffic_lights {
    use objc::runtime::Object;
    use objc::{msg_send, sel, sel_impl};
    use once_cell::sync::Lazy;
    use std::sync::Mutex;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSPoint {
        x: f64,
        y: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSSize {
        width: f64,
        height: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSRect {
        origin: NSPoint,
        size: NSSize,
    }

    // Default (un-nudged) y of each button, captured the first time we touch
    // them. AppKit resets the buttons to this on every titlebar relayout, so
    // we always recompute the target from the stored default — never relative
    // to the current (possibly already-nudged) position.
    static DEFAULT_Y: Lazy<Mutex<Option<[f64; 3]>>> = Lazy::new(|| Mutex::new(None));

    // Push the lights down so they sit on the launcher's logo/title row
    // instead of hugging the window's top edge.
    const VERTICAL_OFFSET: f64 = 7.0;

    pub fn set_visible(window: &tauri::Window, visible: bool) {
        let ns_window = match window.ns_window() {
            Ok(ptr) if !ptr.is_null() => ptr as *mut Object,
            _ => return,
        };
        unsafe {
            for button in 0u64..3 {
                let handle: *mut Object = msg_send![ns_window, standardWindowButton: button];
                if !handle.is_null() {
                    let _: () = msg_send![handle, setHidden: !visible];
                }
            }
        }
        if visible {
            reposition(ns_window);
        }
    }

    // Re-apply the vertical nudge. Called after AppKit relayouts (resize) put
    // the buttons back at their defaults.
    pub fn reapply_offset(window: &tauri::Window) {
        if let Ok(ptr) = window.ns_window() {
            if !ptr.is_null() {
                reposition(ptr as *mut Object);
            }
        }
    }

    fn reposition(ns_window: *mut Object) {
        unsafe {
            let mut buttons: [*mut Object; 3] = [std::ptr::null_mut(); 3];
            let mut origins: [NSPoint; 3] = [NSPoint { x: 0.0, y: 0.0 }; 3];
            for i in 0..3 {
                let handle: *mut Object = msg_send![ns_window, standardWindowButton: i as u64];
                if handle.is_null() {
                    return;
                }
                buttons[i] = handle;
                let frame: NSRect = msg_send![handle, frame];
                origins[i] = frame.origin;
            }

            let mut guard = match DEFAULT_Y.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            // Only treat the current y as the default when it has not already
            // been nudged — guards against capturing a shifted value.
            if guard.is_none() {
                *guard = Some([origins[0].y, origins[1].y, origins[2].y]);
            }
            let defaults = guard.unwrap();

            for i in 0..3 {
                let target = NSPoint {
                    x: origins[i].x,
                    y: defaults[i] - VERTICAL_OFFSET,
                };
                let _: () = msg_send![buttons[i], setFrameOrigin: target];
            }
        }
    }
}

/// Show or hide the native macOS traffic lights, and (when shown) nudge them
/// down onto the launcher's logo/title row. The loading splash hides them; the
/// frontend shows them once the main UI is ready.
#[cfg(target_os = "macos")]
pub fn set_traffic_lights_visible(window: &tauri::Window, visible: bool) {
    traffic_lights::set_visible(window, visible);
}

#[tauri::command]
pub fn set_traffic_lights(window: tauri::Window, visible: bool) {
    #[cfg(target_os = "macos")]
    set_traffic_lights_visible(&window, visible);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, visible);
    }
}

/// Re-apply the traffic-light vertical offset after a window resize — AppKit
/// snaps the buttons back to their defaults on every titlebar relayout.
#[tauri::command]
pub fn realign_traffic_lights(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    traffic_lights::reapply_offset(&window);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
}
