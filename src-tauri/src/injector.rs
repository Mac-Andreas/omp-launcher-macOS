#[cfg(target_os = "windows")]
use dll_syringe::{process::OwnedProcess, Syringe};
#[cfg(target_os = "windows")]
use log::info;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use crate::{constants::*, errors::*};

#[cfg(not(target_os = "windows"))]
use crate::{constants::*, errors::*};
#[cfg(not(target_os = "windows"))]
use log::info;
#[cfg(not(target_os = "windows"))]
use std::path::{Path, PathBuf};
#[cfg(not(target_os = "windows"))]
use std::process::{Command, Stdio};

#[cfg(not(target_os = "windows"))]
pub fn prepare_client_files(
    game_dir: &Path,
    dll_path: &str,
    omp_file: &str,
    _strict: bool,
) -> Result<()> {
    place_client_file(game_dir, dll_path, SAMP_DLL)?;
    place_client_file(game_dir, omp_file, OMP_CLIENT_DLL)
}

#[cfg(not(target_os = "windows"))]
fn place_client_file(game_dir: &Path, src: &str, dst_name: &str) -> Result<()> {
    if src.is_empty() {
        return Ok(());
    }

    let src_path = Path::new(src);
    if !src_path.is_file() {
        return Err(LauncherError::NotFound(format!(
            "Client DLL source not found: {}",
            src
        )));
    }

    let dst = game_dir.join(dst_name);
    // The "custom" SA-MP version passes the in-folder DLL back as the source.
    // std::fs::copy(x, x) truncates the file to 0 bytes on macOS, which then
    // crashes the game. If src and dst are the same file it is already in
    // place: skip the copy.
    let same_file = match (std::fs::canonicalize(src_path), std::fs::canonicalize(&dst)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    if same_file {
        info!("[run_samp] already in place, skip self-copy: {}", dst.display());
        return Ok(());
    }

    std::fs::copy(src_path, &dst)
        .map(|_| info!("[run_samp] placed {} -> {}", src, dst.display()))
        .map_err(|e| LauncherError::Process(format!("Failed to place {}: {}", dst.display(), e)))
}

#[cfg(not(target_os = "windows"))]
fn stage_injector(game_dir: &Path, downloaded: Option<&Path>) -> Result<PathBuf> {
    const BUNDLED: &[u8] = include_bytes!("../../tools/injector.exe");
    let dest = game_dir.join(OMP_WINE_INJECTOR_EXE);

    // Prefer the version downloaded at runtime (newer), fall back to bundled.
    let bytes: std::borrow::Cow<[u8]> = match downloaded {
        Some(p) if p.is_file() => {
            std::fs::read(p)
                .map(std::borrow::Cow::Owned)
                .unwrap_or(std::borrow::Cow::Borrowed(BUNDLED))
        }
        _ => std::borrow::Cow::Borrowed(BUNDLED),
    };

    std::fs::write(&dest, bytes.as_ref()).map_err(|e| {
        LauncherError::Process(format!("Failed to stage injector.exe: {}", e))
    })?;
    info!("[run_samp] staged injector at {}", dest.display());
    Ok(dest)
}

// Windowed mode (Beta → Windowed mode, on by default): ThirteenAG's
// WindowedMode packaged as a plain DLL (github.com/Mac-Andreas/omp-windowedmode).
// GTA SA's true fullscreen does an exclusive D3D mode-set that is unstable under
// CrossOver; the DLL keeps the device windowed, here as a normal bordered
// window. Stages the DLL next to the exe and returns its path.
#[cfg(not(target_os = "windows"))]
fn stage_windowed_mode(game_dir: &Path) -> Option<PathBuf> {
    const DLL: &[u8] = include_bytes!("../../tools/windowedmode/windowedmode.dll");
    const INI: &str = include_str!("../../tools/windowedmode/windowedmode.ini");
    let dll_path = game_dir.join("windowedmode.dll");
    if let Err(e) = std::fs::write(&dll_path, DLL) {
        log::warn!("[run_samp] failed to stage windowedmode.dll: {}", e);
        return None;
    }
    let ini_path = game_dir.join("windowedmode.ini");
    let ini = match std::fs::read_to_string(&ini_path) {
        Ok(existing) => pin_bordered_window(&existing),
        Err(_) => INI.to_string(),
    };
    if let Err(e) = std::fs::write(&ini_path, ini) {
        log::warn!("[run_samp] failed to stage windowedmode.ini: {}", e);
    }
    info!("[run_samp] staged windowed mode at {}", dll_path.display());
    Some(dll_path)
}

// The DLL writes its state (mode, position, size) back to windowedmode.ini on
// exit. Keep that, but pin the bordered window mode (Alt+Enter changes only
// last until the next launch) and move a window still at the old 640x480
// default up to 1280x800, so the game doesn't render tiny and get upscaled.
#[cfg(not(target_os = "windows"))]
fn pin_bordered_window(ini: &str) -> String {
    let value = |key: &str| -> Option<i32> {
        ini.lines()
            .find_map(|l| l.trim().strip_prefix(key)?.strip_prefix('='))
            .and_then(|v| v.split(|c: char| c == ';' || c.is_whitespace()).next())
            .and_then(|v| v.parse().ok())
    };
    let bump = value("resolutionX").map_or(false, |x| x <= 640);
    ini.lines()
        .map(|line| {
            let key = line.trim().split('=').next().unwrap_or("").trim();
            match key {
                "mode" => "mode=1\t\t\t; 1: window, 2: window borderless, 3: fullscreen".to_string(),
                "resolutionX" if bump => "resolutionX=1280".to_string(),
                "resolutionY" if bump => "resolutionY=800".to_string(),
                _ => line.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("\r\n")
}

// Debug-mode injection uses a vorbisFile.dll proxy instead of the external
// injector. gta-sa.exe imports vorbisFile.dll, so Wine loads the proxy at
// process start; the proxy then LoadLibrary's samp.dll + omp-client.dll. The
// upshot is that gta-sa.exe is the *direct* child of cxstart, so its stdout /
// stderr (and any Wine unhandled-exception backtrace) stay wired to our log
// for the whole session — the external injector exits right after injecting,
// severing that pipe and hiding every in-game crash.
#[cfg(not(target_os = "windows"))]
const VORBIS_PROXY: &[u8] = include_bytes!("../../tools/samp-loader/vorbisFile.dll");
#[cfg(not(target_os = "windows"))]
const VORBIS_REAL: &str = "vorbisFile.dll";
#[cfg(not(target_os = "windows"))]
const VORBIS_BACKUP: &str = "vorbisFile_o.dll";

#[cfg(not(target_os = "windows"))]
fn stage_vorbis_proxy(game_dir: &Path) -> Result<()> {
    let real = game_dir.join(VORBIS_REAL);
    let backup = game_dir.join(VORBIS_BACKUP);
    // Back up the genuine DLL exactly once. If the backup already exists the
    // proxy is (or was) installed, so the current vorbisFile.dll may itself be
    // the proxy — never overwrite the genuine backup with it.
    if !backup.exists() && real.is_file() {
        std::fs::rename(&real, &backup).map_err(|e| {
            LauncherError::Process(format!("Failed to back up vorbisFile.dll: {}", e))
        })?;
    }
    std::fs::write(&real, VORBIS_PROXY).map_err(|e| {
        LauncherError::Process(format!("Failed to stage vorbis proxy: {}", e))
    })?;
    info!("[run_samp] staged vorbis proxy (debug injection)");
    Ok(())
}

// Undo stage_vorbis_proxy: put the genuine vorbisFile.dll back. Called on every
// non-debug launch so a left-over proxy can't double-inject alongside the
// external injector (which would crash the game on start).
#[cfg(not(target_os = "windows"))]
fn restore_vorbis_proxy(game_dir: &Path) {
    let real = game_dir.join(VORBIS_REAL);
    let backup = game_dir.join(VORBIS_BACKUP);
    if backup.is_file() {
        let _ = std::fs::remove_file(&real);
        if std::fs::rename(&backup, &real).is_ok() {
            info!("[run_samp] restored genuine vorbisFile.dll (debug off)");
        }
    }
}

// WINEDEBUG channels for the two debug-log levels (passed to cxstart
// --debugmsg). STANDARD is error class only: it keeps real failures like
// `err:msvcrt:_wassert` (the mmdevapi audio abort) and `err:seh` unhandled
// exceptions while turning off trace/warn/fixme. That matters because the
// open.mp client floods trace:unwind / trace:seh (~350k lines, tens of MB) with
// C++ exceptions during normal play. A genuine unhandled crash still prints its
// module-named backtrace — Wine dumps that unconditionally, regardless of
// WINEDEBUG. DETAILED turns those traces back on plus module/dll/process
// tracking: large files and a slower game, but a full trail of everything.
// The mmdevapi assert(!status) crash is now identified (CoreAudio rejecting the
// negotiated buffer format/period — see the Audio fix below), so STANDARD no
// longer force-traces +mmdevapi,+coreaudio: those flooded logs to >1GB/session.
// DETAILED still enables them for anyone diagnosing a new audio failure.
#[cfg(not(target_os = "windows"))]
const STANDARD_WINE_CHANNELS: &str = "err+all,fixme-all,warn-all,trace-all";
#[cfg(not(target_os = "windows"))]
const DETAILED_WINE_CHANNELS: &str =
    "+seh,+module,+loaddll,+process,+mmdevapi,+coreaudio,err+all,fixme+all";

// Create <game>/omp-logs/session_<YYYY-MM-DD_HH-MM-SS>.log, write a header, and
// return its path (the file is closed so cxstart can append wine's stderr to it
// via --cx-log without fighting us for the handle).
#[cfg(not(target_os = "windows"))]
fn start_session_log(game_dir: &Path, header: &[(&str, String)]) -> Option<PathBuf> {
    use std::io::Write;
    let dir = game_dir.join("omp-logs");
    std::fs::create_dir_all(&dir).ok()?;
    let now = chrono::Local::now();
    let path = dir.join(format!("session_{}.log", now.format("%Y-%m-%d_%H-%M-%S")));
    let mut f = std::fs::File::create(&path).ok()?;
    let _ = writeln!(f, "================ open.mp launcher session ================");
    let _ = writeln!(f, "started : {}", now.format("%Y-%m-%d %H:%M:%S%.3f %z"));
    for (k, v) in header {
        let _ = writeln!(f, "{k:<9}: {v}");
    }
    let _ = writeln!(f, "==========================================================");
    let _ = writeln!(f, "Below is the wine process stderr (game + injector + Wine).");
    let _ = writeln!(f, "An unhandled C++ exception prints 'Unhandled exception:");
    let _ = writeln!(f, "0xe06d7363' with a Backtrace naming the faulting module.");
    let _ = writeln!(f, "----------------------------------------------------------\n");
    let _ = f.flush();
    Some(path)
}

// Wait (off-thread) for the launched cxstart/wine process to exit, then append
// the exit status and the tail of the SA-MP chatlog (the in-game "samp debug")
// to the session log. Non-blocking: the launcher process stays alive while the
// user plays, so the thread lives until the game ends.
#[cfg(not(target_os = "windows"))]
fn finalize_session_log(mut child: std::process::Child, log_path: PathBuf) {
    use std::io::Write;
    std::thread::spawn(move || {
        let status = child.wait();
        let exit_code = status
            .as_ref()
            .ok()
            .and_then(|s| s.code())
            .map(|c| c.to_string())
            .unwrap_or_else(|| "?".into());
        if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&log_path) {
            let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let _ = writeln!(f, "\n----------------------------------------------------------");
            let _ = writeln!(f, "[{ts}] game process exited (code {exit_code}): {status:?}");
            if exit_code == "3" {
                let _ = writeln!(f, "  note: exit code 3 = CRT abort() — an unhandled C++");
                let _ = writeln!(f, "  exception / terminate(). Look above for 'Unhandled");
                let _ = writeln!(f, "  exception: 0xe06d7363' and its Backtrace.");
            }
            if let Some(home) = dirs_next::home_dir() {
                let chat = home.join("Documents/GTA San Andreas User Files/SAMP/chatlog.txt");
                if let Ok(contents) = std::fs::read_to_string(&chat) {
                    let lines: Vec<&str> = contents.lines().collect();
                    let tail = &lines[lines.len().saturating_sub(40)..];
                    let _ = writeln!(f, "----- SA-MP chatlog (last {} lines) -----", tail.len());
                    for l in tail {
                        let _ = writeln!(f, "{l}");
                    }
                }
            }
            let _ = writeln!(f, "================ session end ================");
            let _ = f.flush();
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub async fn run_samp(
    name: &str,
    ip: &str,
    port: i32,
    executable_dir: &str,
    dll_path: &str,
    omp_file: &str,
    password: &str,
    custom_game_exe: &str,
    injector_path: Option<&Path>,
    debug: bool,
    detailed: bool,
    audio_fix: bool,
    render_fix: bool,
    text_fix: bool,
    windowed_mode: bool,
) -> Result<()> {
    let game_dir = PathBuf::from(executable_dir);
    let wine_channels = if detailed {
        DETAILED_WINE_CHANNELS
    } else {
        STANDARD_WINE_CHANNELS
    };
    if !game_dir.is_dir() {
        return Err(LauncherError::NotFound(format!(
            "GTA SA directory not found: {}",
            executable_dir
        )));
    }

    // Only one game at a time: kill any running/zombie GTA SA first. A
    // crashed instance left behind also makes the next connection crash on
    // the loading screen and can hold the DLLs we are about to replace.
    let killed = crate::helpers::kill_game_processes();
    if killed > 0 {
        info!("[run_samp] killed {} stale game process(es)", killed);
        // Give the OS a moment to reap them and release file locks.
        std::thread::sleep(std::time::Duration::from_millis(1200));
    }

    let exe_name = if !custom_game_exe.is_empty() {
        custom_game_exe.to_string()
    } else {
        GTA_SA_EXECUTABLE_ALT.to_string()
    };
    let exe_path = game_dir.join(&exe_name);
    if !exe_path.is_file() {
        return Err(LauncherError::NotFound(format!(
            "Game executable not found: {}",
            exe_path.display()
        )));
    }

    // Place the chosen client DLLs next to the exe so the injector can find
    // them by their canonical Windows paths inside the bottle.
    place_client_file(&game_dir, dll_path, SAMP_DLL)?;
    place_client_file(&game_dir, omp_file, OMP_CLIENT_DLL)?;

    let prefix = {
        let mut cur = game_dir.as_path();
        let mut found: Option<PathBuf> = None;
        while let Some(parent) = cur.parent() {
            if parent.join("drive_c").is_dir() {
                found = Some(parent.to_path_buf());
                break;
            }
            cur = parent;
        }
        found
    };

    // SA-MP / open.mp connect arguments (used for the direct-exe fallback).
    let mut game_args: Vec<String> = vec![
        "-c".into(),
        "-n".into(),
        name.to_string(),
        "-h".into(),
        ip.to_string(),
        "-p".into(),
        port.to_string(),
    ];
    if !password.is_empty() {
        game_args.push("-z".into());
        game_args.push(password.to_string());
    }

    let cxstart = Path::new(CROSSOVER_CXSTART);
    let wine_bin = [CROSSOVER_WINE_BIN, CROSSOVER_WINE_HOSTED]
        .iter()
        .map(Path::new)
        .find(|p| p.is_file());

    let pfx = prefix.ok_or_else(|| {
        LauncherError::NotFound(
            "Could not locate the Wine bottle (no drive_c ancestor)".to_string(),
        )
    })?;
    let bottle = pfx
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // Debug mode (Settings → Danger Zone): inject via the vorbisFile.dll proxy
    // (so the game is cxstart's direct child and keeps its stderr) and capture
    // a verbose per-session log. Off: restore the genuine vorbisFile.dll so a
    // left-over proxy can't double-inject with the external injector.
    if debug {
        stage_vorbis_proxy(&game_dir)?;
    } else {
        restore_vorbis_proxy(&game_dir);
    }

    // Map a unix path inside the bottle to its Windows path: everything
    // under <prefix>/drive_c maps to C:\ .
    let to_win_path = |p: &Path| -> Option<String> {
        let rel = p.strip_prefix(pfx.join("drive_c")).ok()?;
        let mut s = String::from("C:\\");
        s.push_str(&rel.to_string_lossy().replace('/', "\\"));
        Some(s)
    };

    if !cxstart.is_file() {
        // No CrossOver: best-effort direct exe launch via bundled wine.
        let wine = wine_bin.ok_or_else(|| {
            LauncherError::NotFound(
                "CrossOver not found at /Applications/CrossOver.app. Install \
                 CrossOver to run the game on macOS."
                    .to_string(),
            )
        })?;
        if debug {
            stage_vorbis_proxy(&game_dir)?;
            let header = vec![
                ("mode".into(), "wine fallback (no CrossOver) + vorbis-proxy".to_string()),
                ("level".into(), if detailed { "detailed" } else { "standard" }.to_string()),
                ("WINEDEBUG".into(), wine_channels.to_string()),
                ("wine".into(), wine.display().to_string()),
                ("prefix".into(), pfx.display().to_string()),
                ("exe".into(), exe_path.display().to_string()),
                ("args".into(), game_args.join(" ")),
            ];
            let log_path = start_session_log(&game_dir, &header);
            // Running wine directly: its stderr is ours, so redirect it to the
            // session log file (no cxstart --cx-log here).
            let log_file = log_path.as_ref().and_then(|p| {
                std::fs::OpenOptions::new().append(true).open(p).ok()
            });
            let mut cmd = Command::new(wine);
            cmd.env("WINEPREFIX", &pfx)
                .env("WINEDEBUG", wine_channels)
                .arg(&exe_path)
                .args(&game_args)
                .current_dir(&game_dir)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(log_file.map(Stdio::from).unwrap_or_else(Stdio::null));
            info!("[run_samp] wine fallback exe='{}' debug=on", exe_path.display());
            let child = cmd
                .spawn()
                .map_err(|e| LauncherError::Process(format!("Failed to launch via Wine: {}", e)))?;
            if let Some(p) = log_path {
                finalize_session_log(child, p);
            }
            return Ok(());
        }
        restore_vorbis_proxy(&game_dir);
        info!("[run_samp] wine fallback exe='{}' debug=off", exe_path.display());
        return Command::new(wine)
            .env("WINEPREFIX", &pfx)
            .arg(&exe_path)
            .args(&game_args)
            .current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|e| LauncherError::Process(format!("Failed to launch via Wine: {}", e)));
    }

    // --- CrossOver path ---------------------------------------------------

    // Write the SA-MP client registry key so the game knows the exe path and
    // the player name — SA-MP reads HKCU\Software\SAMP on startup.
    let reg = |key: &str, val: &str, data: &str| {
        let _ = Command::new(cxstart)
            .arg("--bottle")
            .arg(&bottle)
            .args(["reg", "add", key, "/v", val, "/t", "REG_SZ", "/d", data, "/f"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        info!("[run_samp] reg add {}\\{} = {}", key, val, data);
    };
    let reg_dword = |key: &str, val: &str, data: &str| {
        let _ = Command::new(cxstart)
            .arg("--bottle")
            .arg(&bottle)
            .args(["reg", "add", key, "/v", val, "/t", "REG_DWORD", "/d", data, "/f"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        info!("[run_samp] reg add (dword) {}\\{} = {}", key, val, data);
    };
    let reg_del = |key: &str, val: &str| {
        let _ = Command::new(cxstart)
            .arg("--bottle")
            .arg(&bottle)
            .args(["reg", "delete", key, "/v", val, "/f"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        info!("[run_samp] reg delete {}\\{}", key, val);
    };
    if let Some(exe_win) = to_win_path(&exe_path) {
        reg("HKCU\\Software\\SAMP", "gta_sa_exe", &exe_win);
    }
    reg("HKCU\\Software\\SAMP", "PlayerName", name);

    // Audio fix (Advanced → Audio fix, on by default). GTA SA aborts the whole
    // process (exit 3) when Wine's mmdevapi hits assert(!status) negotiating an
    // audio format CoreAudio rejects — a frequent, intermittent crash on macOS.
    // Forcing DirectSound to software emulation at a fixed 48kHz/16-bit format
    // (which every built-in Mac output supports) keeps the game off that failing
    // path. Audio must be a real driver regardless: with it empty the game
    // refuses to start ("cannot find Audio card installed"). When the user
    // reverts the fix we delete those DirectSound values so Wine negotiates the
    // format itself (i.e. back to the crashy default) for comparison.
    reg("HKCU\\Software\\Wine\\Drivers", "Audio", "coreaudio");
    if audio_fix {
        reg("HKCU\\Software\\Wine\\DirectSound", "HardwareAcceleration", "Emulation");
        reg("HKCU\\Software\\Wine\\DirectSound", "DefaultSampleRate", "48000");
        reg("HKCU\\Software\\Wine\\DirectSound", "DefaultBitsPerSample", "16");
    } else {
        reg_del("HKCU\\Software\\Wine\\DirectSound", "HardwareAcceleration");
        reg_del("HKCU\\Software\\Wine\\DirectSound", "DefaultSampleRate");
        reg_del("HKCU\\Software\\Wine\\DirectSound", "DefaultBitsPerSample");
    }

    // Render fix (Beta → Render fix). GTA SA is a Direct3D8 game; under Wine its
    // D3D8 calls go through wined3d's GL backend. The recurring texture crash —
    // an access violation deep in wined3d (0x7Bxxxxxx) while the game locks a
    // surface into mapped/write-combined GPU memory (a 0xBCF4xxxx pointer in the
    // EAX/EDX of the dump) — happens on the FBO offscreen-rendering path. Two
    // wined3d registry knobs steer it off that path:
    //   OffscreenRenderingMode=backbuffer — render to the backbuffer instead of
    //     FBO-backed textures, the codepath that faults on the lock.
    //   csmt=0 — disable the command-stream multithreading that races the lock
    //     under heavy texture churn (the open.mp client streams many textures).
    // We also pin MaxVersionGL so the backend doesn't pick a core-profile path
    // GTA's fixed-function D3D8 emulation mishandles. Turning the fix off deletes
    // these so wined3d returns to its (crashy on this hardware) defaults.
    if render_fix {
        reg("HKCU\\Software\\Wine\\Direct3D", "OffscreenRenderingMode", "backbuffer");
        reg_dword("HKCU\\Software\\Wine\\Direct3D", "csmt", "0");
        reg_dword("HKCU\\Software\\Wine\\Direct3D", "MaxVersionGL", "0x00030002");
    } else {
        reg_del("HKCU\\Software\\Wine\\Direct3D", "OffscreenRenderingMode");
        reg_del("HKCU\\Software\\Wine\\Direct3D", "csmt");
        reg_del("HKCU\\Software\\Wine\\Direct3D", "MaxVersionGL");
    }

    // Text fix (Beta → Text fix). SA-MP draws chat, dialogs and textdraws with
    // ID3DXFont from d3dx9_25.dll (D3DXCreateFont, small bold Arial), which
    // rasterises glyphs through GDI with the system font smoothing. The bottle
    // defaults to plain grayscale smoothing (FontSmoothingType=1), and Arial's
    // GASP table turns grayscale off at these small sizes, so the text comes
    // out aliased: hard pixel edges inside SA-MP's black outline. Windows
    // defaults to ClearType, which ignores GASP — set the same in the bottle
    // (type 2, gamma 1400, RGB). The game exe also prefers Microsoft's native
    // d3dx9_25.dll when the bottle has it (AppDefaults, not bottle-wide).
    // Turning the fix off restores the bottle's grayscale defaults.
    let desktop = "HKCU\\Control Panel\\Desktop";
    let d3dx_overrides = format!(
        "HKCU\\Software\\Wine\\AppDefaults\\{}\\DllOverrides",
        exe_name
    );
    reg(desktop, "FontSmoothing", "2");
    if text_fix {
        reg_dword(desktop, "FontSmoothingType", "2");
        reg_dword(desktop, "FontSmoothingGamma", "0x578");
        reg_dword(desktop, "FontSmoothingOrientation", "1");
        reg(&d3dx_overrides, "d3dx9_25", "native,builtin");
    } else {
        reg_dword(desktop, "FontSmoothingType", "1");
        reg_dword(desktop, "FontSmoothingGamma", "0");
        reg_del(&d3dx_overrides, "d3dx9_25");
    }

    let exe_win = to_win_path(&exe_path).ok_or_else(|| {
        LauncherError::NotFound("game exe is outside the bottle drive_c".to_string())
    })?;

    // --- Debug: launch the game directly; the vorbis proxy injects samp.dll +
    // omp-client.dll. cxstart's --cx-log redirects the wine process stderr (the
    // game + Wine, incl. unhandled-exception backtraces) to the session log —
    // piping cxstart's own stdio does NOT capture a GUI app's output. ---
    if debug {
        let header = vec![
            ("mode".into(), "cxstart --cx-log + vorbis-proxy injection".to_string()),
            ("level".into(), if detailed { "detailed" } else { "standard" }.to_string()),
            ("WINEDEBUG".into(), wine_channels.to_string()),
            ("bottle".into(), bottle.clone()),
            ("exe".into(), exe_win.clone()),
            ("args".into(), game_args.join(" ")),
            ("samp".into(), to_win_path(&game_dir.join(SAMP_DLL)).unwrap_or_default()),
            ("omp".into(), if omp_file.is_empty() {
                "<disabled>".into()
            } else {
                to_win_path(&game_dir.join(OMP_CLIENT_DLL)).unwrap_or_default()
            }),
            ("game_dir".into(), game_dir.display().to_string()),
        ];
        let log_path = start_session_log(&game_dir, &header);

        let mut cmd = Command::new(cxstart);
        cmd.arg("--bottle").arg(&bottle);
        if let Some(ref p) = log_path {
            cmd.arg("--cx-log").arg(p).arg("--debugmsg").arg(wine_channels);
            info!("[run_samp] session log -> {}", p.display());
        }
        cmd.arg(&exe_win)
            .args(&game_args)
            .current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        info!("[run_samp] cxstart bottle='{}' exe='{}' debug=on (vorbis-proxy)", bottle, exe_win);

        let child = cmd
            .spawn()
            .map_err(|e| LauncherError::Process(format!("Failed to launch game: {}", e)))?;
        if let Some(p) = log_path {
            finalize_session_log(child, p);
        }
        return Ok(());
    }

    // --- Normal: external injector spawns the game and injects the DLLs. ---
    let injector_unix = stage_injector(&game_dir, injector_path)?;
    let injector_win = to_win_path(&injector_unix).ok_or_else(|| {
        LauncherError::NotFound("injector.exe is outside the bottle drive_c".to_string())
    })?;

    // Build the game args string as a single quoted argument for injector.exe
    // --spawn (it passes it verbatim to CreateProcess).
    let args_str = game_args.join(" ");

    let samp_win = to_win_path(&game_dir.join(SAMP_DLL)).ok_or_else(|| {
        LauncherError::NotFound("samp.dll is outside the bottle drive_c".to_string())
    })?;
    let mut dll_args: Vec<String> = vec!["--".into()];
    // Windowed mode goes first so its hooks are in place before the client
    // DLLs run and before the game creates its D3D device.
    if windowed_mode {
        let windowed_win = stage_windowed_mode(&game_dir)
            .and_then(|p| to_win_path(&p))
            .ok_or_else(|| {
                LauncherError::Process("Failed to stage windowedmode.dll".to_string())
            })?;
        dll_args.push(windowed_win);
    }
    dll_args.push(samp_win);
    if !omp_file.is_empty() {
        if let Some(omp_win) = to_win_path(&game_dir.join(OMP_CLIENT_DLL)) {
            dll_args.push(omp_win);
        }
    }

    let mut cmd = Command::new(cxstart);
    cmd.arg("--bottle")
        .arg(&bottle)
        .arg(&injector_win)
        .args(["--spawn", &exe_win, &args_str])
        .args(&dll_args)
        .current_dir(&game_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    info!(
        "[run_samp] cxstart bottle='{}' injector='{}' exe='{}' debug=off",
        bottle, injector_win, exe_win
    );

    cmd.spawn()
        .map(|_| ())
        .map_err(|e| LauncherError::Process(format!("Failed to launch injector through Wine: {}", e)))
}

#[cfg(target_os = "windows")]
pub async fn run_samp(
    name: &str,
    ip: &str,
    port: i32,
    executable_dir: &str,
    dll_path: &str,
    omp_file: &str,
    password: &str,
    custom_game_exe: &str,
    _injector_path: Option<&std::path::Path>,
    _debug: bool,
    _detailed: bool,
    _audio_fix: bool,
    _render_fix: bool,
    _text_fix: bool,
    _windowed_mode: bool,
) -> Result<()> {
    // Prepare the command to spawn the executable
    let target_game_exe = if custom_game_exe.len() > 0 {
        custom_game_exe.to_string()
    } else {
        GTA_SA_EXECUTABLE.to_string()
    };

    let exe_path = PathBuf::from(executable_dir).join(&target_game_exe);

    let exe_path = exe_path.canonicalize().map_err(|e| {
        LauncherError::Process(format!("Invalid executable path {:?}: {}", exe_path, e))
    })?;

    let mut cmd = Command::new(&exe_path);

    let mut ready_for_exec = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .current_dir(executable_dir)
        .arg("-c")
        .arg("-n")
        .arg(name)
        .arg("-h")
        .arg(ip)
        .arg("-p")
        .arg(format!("{}", port));

    if !password.is_empty() {
        ready_for_exec = ready_for_exec.arg("-z").arg(password);
    }

    let process = ready_for_exec.current_dir(executable_dir).spawn();

    match process {
        Ok(p) => {
            inject_dll(p.id(), dll_path, 0, false)?;
            info!("[run_samp] omp_file.is_empty(): {}", omp_file.is_empty());
            if !omp_file.is_empty() {
                inject_dll(p.id(), omp_file, 0, false)
            } else {
                Ok(())
            }
        }
        Err(e) => {
            info!("[injector.rs] Process creation failed: {}", e);

            match e.raw_os_error() {
                Some(ERROR_ELEVATION_REQUIRED) => Err(LauncherError::AccessDenied(
                    "Unable to open game process".to_string(),
                )),
                Some(ERROR_ACCESS_DENIED) => Err(LauncherError::AccessDenied(
                    "Unable to open game process".to_string(),
                )),
                _ => Err(LauncherError::Process(format!(
                    "Failed to spawn process: {}",
                    e
                ))),
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub fn inject_dll(child: u32, dll_path: &str, times: u32, waiting_for_vorbis: bool) -> Result<()> {
    use winapi::{
        shared::minwindef::{FALSE, HMODULE},
        um::{
            processthreadsapi::OpenProcess,
            psapi::{EnumProcessModulesEx, GetModuleFileNameExA},
            winnt::PROCESS_ALL_ACCESS,
        },
    };

    match OwnedProcess::from_pid(child) {
        Ok(p) => {
            if waiting_for_vorbis {
                unsafe {
                    let handle = OpenProcess(PROCESS_ALL_ACCESS, FALSE, child);
                    let mut module_handles: [HMODULE; PROCESS_MODULE_BUFFER_SIZE] =
                        [0 as *mut _; PROCESS_MODULE_BUFFER_SIZE];
                    let mut found = 0;

                    EnumProcessModulesEx(
                        handle,
                        module_handles.as_mut_ptr(),
                        module_handles.len() as _,
                        &mut found,
                        0x03,
                    );

                    let mut bytes = [0i8; PROCESS_MODULE_BUFFER_SIZE];

                    if found == 0 {
                        let delay = std::time::Duration::from_millis(INJECTION_RETRY_DELAY_MS);
                        std::thread::sleep(delay);
                        return inject_dll(child, dll_path, times, true);
                    }

                    let mut found_vorbis = false;
                    for i in 0..(found / 4) {
                        if GetModuleFileNameExA(
                            handle,
                            module_handles[i as usize],
                            bytes.as_mut_ptr(),
                            PROCESS_MODULE_BUFFER_SIZE as u32,
                        ) != 0
                        {
                            let string = std::ffi::CStr::from_ptr(bytes.as_ptr());
                            if string.to_string_lossy().to_string().contains("vorbis") {
                                found_vorbis = true;
                            }
                        }
                    }

                    if !found_vorbis {
                        let delay = std::time::Duration::from_millis(INJECTION_RETRY_DELAY_MS);
                        std::thread::sleep(delay);
                        return inject_dll(child, dll_path, times, true);
                    }
                }
            }

            // create a new syringe for the target process
            let syringe = Syringe::for_process(p);

            // inject the payload into the target process
            match syringe.inject(dll_path) {
                Ok(_) => Ok(()),
                Err(e) => {
                    let delay = std::time::Duration::from_millis(INJECTION_RETRY_DELAY_MS);
                    std::thread::sleep(delay);

                    if times >= INJECTION_MAX_RETRIES {
                        info!(
                            "[injector.rs] DLL {} injection failed after {} attempts: {}",
                            dll_path, INJECTION_MAX_RETRIES, e
                        );

                        if !waiting_for_vorbis {
                            return inject_dll(child, dll_path, 0, true);
                        }
                        return Err(LauncherError::Injection(format!(
                            "DLL injection failed: {}",
                            e
                        )));
                    }

                    inject_dll(child, dll_path, times + 1, waiting_for_vorbis)
                }
            }
        }
        Err(e) => {
            info!("[injector.rs] Failed to access process: {}", e);

            match e.raw_os_error() {
                Some(ERROR_ELEVATION_REQUIRED) => Err(LauncherError::AccessDenied(
                    "Unable to open game process".to_string(),
                )),
                Some(ERROR_ACCESS_DENIED) => Err(LauncherError::AccessDenied(
                    "Unable to open game process".to_string(),
                )),
                _ => Err(LauncherError::Process(format!(
                    "Failed to access process: {}",
                    e
                ))),
            }
        }
    }
}
