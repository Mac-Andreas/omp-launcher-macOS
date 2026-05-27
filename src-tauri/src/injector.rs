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
    strict_proxy: bool,
) -> Result<()> {
    place_client_file(game_dir, dll_path, SAMP_DLL)?;
    place_client_file(game_dir, omp_file, OMP_CLIENT_DLL)?;
    install_vorbis_proxy(game_dir, strict_proxy)
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
fn install_vorbis_proxy(game_dir: &Path, strict: bool) -> Result<()> {
    const PROXY: &[u8] = include_bytes!("vorbisFile_loader.dll");
    let vf = game_dir.join("vorbisFile.dll");
    let vf_o = game_dir.join("vorbisFile_o.dll");
    let proxy_installed = vf
        .metadata()
        .map(|m| m.len() as usize == PROXY.len())
        .unwrap_or(false);

    if !vf_o.is_file() && vf.is_file() && !proxy_installed {
        // Preserve the real audio DLL exactly once.
        std::fs::rename(&vf, &vf_o).map_err(|e| {
            LauncherError::Process(format!(
                "Could not preserve real vorbisFile.dll: {}",
                e
            ))
        })?;
    }

    if vf_o.is_file() {
        std::fs::write(&vf, PROXY).map_err(|e| {
            LauncherError::Process(format!("Failed to install vorbisFile.dll proxy: {}", e))
        })?;
        info!("[run_samp] installed vorbisFile.dll open.mp/SA-MP loader proxy");
        return Ok(());
    }

    let message = "no real vorbisFile_o.dll; cannot install loader proxy";
    if strict {
        Err(LauncherError::NotFound(message.to_string()))
    } else {
        info!("[run_samp] {}; skipping proxy (single player only)", message);
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
// macOS/Linux: the game is a Windows binary inside a CrossOver/Wine bottle,
// so runtime DLL injection is not possible. The proxy load-vector DLL
// (version.dll / vorbisFile.dll) already in the game folder loads the
// client DLLs from disk, so we copy the chosen samp.dll / omp-client.dll
// next to the exe and then launch the game through CrossOver.
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
) -> Result<()> {
    let game_dir = PathBuf::from(executable_dir);
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

    // Resolve the executable: explicit override, else the macOS/CrossOver
    // 1.0 downgrade name used by this port.
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

    // Place the chosen client DLLs next to the exe. The proxy DLL needs them
    // on disk before launch; proxy installation itself happens below after
    // the bottle registry settings have been applied.
    place_client_file(&game_dir, dll_path, SAMP_DLL)?;
    place_client_file(&game_dir, omp_file, OMP_CLIENT_DLL)?;

    // The Wine prefix is the bottle root: nearest ancestor with a drive_c.
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
        let mut cmd = Command::new(wine);
        cmd.env("WINEPREFIX", &pfx)
            .arg(&exe_path)
            .args(&game_args)
            .current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        info!("[run_samp] wine fallback exe='{}'", exe_path.display());
        return cmd
            .spawn()
            .map(|_| ())
            .map_err(|e| LauncherError::Process(format!("Failed to launch via Wine: {}", e)));
    }

    // --- CrossOver path ---------------------------------------------------

    // Apply bottle registry settings before launch (best effort):
    //  * HKCU\Software\SAMP  : samp_debug.exe reads gta_sa_exe + PlayerName
    //  * Wine\DirectSound    : HW-accel "Emulation" avoids the macOS
    //    CoreAudio/mmdevapi assertion that crashes GTA SA ~17s in.
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
    if let Some(exe_win) = to_win_path(&exe_path) {
        reg("HKCU\\Software\\SAMP", "gta_sa_exe", &exe_win);
    }
    reg("HKCU\\Software\\SAMP", "PlayerName", name);
    reg(
        "HKCU\\Software\\Wine\\DirectSound",
        "HardwareAcceleration",
        "Emulation",
    );
    reg(
        "HKCU\\Software\\Wine\\DirectSound",
        "DefaultSampleRate",
        "44100",
    );
    reg(
        "HKCU\\Software\\Wine\\DirectSound",
        "DefaultBitsPerSample",
        "16",
    );
    // Remove any previously-set Wine virtual desktop so the game runs
    // normally (fullscreen) rather than inside a forced window.
    let _ = Command::new(cxstart)
        .arg("--bottle")
        .arg(&bottle)
        .args(["reg", "delete", "HKCU\\Software\\Wine\\Explorer", "/v", "Desktop", "/f"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    info!("[run_samp] removed Wine virtual desktop (fullscreen)");

    // open.mp / SA-MP injection under Wine. Native DLL injection is impossible from
    // macOS, and samp_debug.exe is localhost-only. Instead install a
    // vorbisFile.dll proxy: GTA SA imports vorbisFile.dll for audio, so the
    // proxy is auto-loaded and loads samp.dll, then omp-client.dll. The
    // client DLLs then read our -c -n -h -p args and connect to the real
    // server. The proxy writes omp-loader.log in the game directory if a DLL
    // fails to load, and forwards every export to the renamed real DLL
    // (vorbisFile_o.dll), so game audio is unaffected.
    install_vorbis_proxy(&game_dir, false)?;

    // Launch the game with the connect args; the proxy-loaded client DLLs
    // parse these and join the server automatically.
    let mut cmd = Command::new(cxstart);
    cmd.arg("--bottle")
        .arg(&bottle)
        .arg(&exe_path)
        .args(&game_args)
        .current_dir(&game_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    info!(
        "[run_samp] cxstart bottle='{}' exe='{}'",
        bottle,
        exe_path.display()
    );

    cmd.spawn()
        .map(|_| ())
        .map_err(|e| LauncherError::Process(format!("Failed to launch the game through Wine: {}", e)))
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
