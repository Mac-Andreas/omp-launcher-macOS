import { fs, invoke, path, process, shell } from "@tauri-apps/api";
import { open, save } from "@tauri-apps/api/dialog";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/api/fs";
import { t } from "i18next";
import {
  IN_GAME,
  IN_GAME_PROCESS_ID,
  ResourceInfo,
  validFileChecksums,
} from "../constants/app";
import { useGameLaunch } from "../states/gameLaunch";
import { useJoinServerPrompt } from "../states/joinServerPrompt";
import { useMessageBox } from "../states/messageModal";
import { useNotification } from "../states/notification";
import { usePersistentServers, useServers } from "../states/servers";
import { useSettings } from "../states/settings";
import { useSettingsModal } from "../states/settingsModal";
import { fetchServers, getIpAddress } from "../utils/helpers";
import { Log } from "./logger";
import { PING_TIMEOUT_VALUE } from "./query";
import { sc } from "./sizeScaler";
import {
  telemetryGameJoin,
  telemetryGameLeave,
} from "./telemetry";
import { Server } from "./types";

const showOkModal = (title: string, description: string) => {
  const { showMessageBox, hideMessageBox } = useMessageBox.getState();
  showMessageBox({
    title,
    description,
    buttons: [{ title: "OK", onPress: hideMessageBox }],
  });
};

const getLocalPath = async (...segments: string[]) =>
  path.join(await path.appLocalDataDir(), ...segments);

const KNOWN_GAME_EXES = ["gta-sa.exe"];

const candidateExes = () => {
  const { customGameExe } = useSettings.getState();
  return [customGameExe, ...KNOWN_GAME_EXES].filter(
    (e, i, a) => e && a.indexOf(e) === i
  );
};

export const hasGameExe = async (dirPath: string) => {
  for (const exe of candidateExes()) {
    if (await exists(`${dirPath}/${exe}`)) return true;
  }
  return false;
};

export const autoDetectGtasaPath = async (): Promise<string> => {
  try {
    const { bottleName } = useSettings.getState();
    const detected: string = await invoke("get_gtasa_path_for_bottle", {
      bottleName,
    });
    if (detected && detected.length) {
      const norm = detected.replace(/\\/g, "/");
      if (await hasGameExe(norm)) {
        useSettings.getState().setGTASAPath(norm);
        return norm;
      }
    }
  } catch (e) {
    Log.debug("autoDetectGtasaPath failed:", e);
  }
  return "";
};

export const getSelectedBottleGamePath = async (): Promise<string> => {
  const { gtasaPath } = useSettings.getState();

  const detected = await autoDetectGtasaPath();
  if (detected) return detected;

  if (gtasaPath && (await hasGameExe(gtasaPath))) {
    return gtasaPath.replace(/\\/g, "/");
  }

  return "";
};

export const locateGameExeDir = async (): Promise<string> => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "GTA San Andreas", extensions: ["exe"] }],
  });
  if (!selected || typeof selected !== "string") return "";
  const dir = (await path.dirname(selected)).replace(/\\/g, "/");
  if (await hasGameExe(dir)) {
    useSettings.getState().setGTASAPath(dir);
    return dir;
  }
  return "";
};

export const copySharedFilesIntoGameFolder = async (targetPath?: string) => {
  const { gtasaPath } = useSettings.getState();
  const shared = await getLocalPath("samp", "shared");
  await invoke("copy_files_to_gtasa", {
    src: shared,
    gtasaDir: targetPath || gtasaPath,
  });
};

export const prepareSelectedBottleSampFiles = async (targetPath?: string) => {
  const { customGameExe, sampVersion, setGTASAPath, setSampSetupPromptShown } =
    useSettings.getState();
  const { setSampInstalling } = useGameLaunch.getState();
  setSampInstalling(true);
  try {
    const gtasaPath = targetPath || (await getSelectedBottleGamePath());

    if (!gtasaPath || !(await hasGameExe(gtasaPath))) {
      throw new Error("game_not_found");
    }

    setGTASAPath(gtasaPath);
    await copySharedFilesIntoGameFolder(gtasaPath);

    const idealSAMPDllPath = await path.join(gtasaPath, "samp.dll");
    const version =
      sampVersion === "custom" && !(await fs.exists(idealSAMPDllPath))
        ? "037R5_samp.dll"
        : sampVersion;
    const file = validFileChecksums.get(
      version !== "custom" ? version : "037R1_samp.dll"
    );
    const ourSAMPDllPath =
      version === "custom"
        ? idealSAMPDllPath
        : file
        ? await getLocalPath(file.path, file.name)
        : idealSAMPDllPath;
    const ompFile = await getLocalPath("omp", "omp-client.dll");

    if (!(await fs.exists(ourSAMPDllPath))) {
      throw new Error("samp_source_not_found");
    }
    if (!(await fs.exists(ompFile))) {
      throw new Error("omp_source_not_found");
    }

    await invoke("prepare_macos_samp_files", {
      gtasaDir: gtasaPath,
      dll: ourSAMPDllPath,
      ompFile,
      customGameExe,
    });

    setSampSetupPromptShown(true);
    return gtasaPath;
  } finally {
    setSampInstalling(false);
  }
};

export const detectInstalledSampVersion = async (
  gamePath: string
): Promise<"none" | "custom" | "037R1_samp.dll" | "037R2_samp.dll" | "037R3_samp.dll" | "037R31_samp.dll" | "037R4_samp.dll" | "037R5_samp.dll" | "03DL_samp.dll"> => {
  const sampDll = await path.join(gamePath, "samp.dll");
  if (!(await fs.exists(sampDll))) return "none";
  try {
    const checksums: string[] = await invoke("get_checksum_of_files", {
      list: [sampDll],
    });
    if (!checksums.length) return "custom";
    const [, hash] = checksums[0].split("|");
    for (const [key, info] of validFileChecksums.entries()) {
      if (key.endsWith("_samp.dll") && info.checksum === hash) {
        return key as any;
      }
    }
    return "custom";
  } catch {
    return "custom";
  }
};

export const uninstallSelectedBottleSampFiles = async (targetPath?: string) => {
  const gtasaPath = targetPath || (await getSelectedBottleGamePath());

  if (!gtasaPath || !(await hasGameExe(gtasaPath))) {
    throw new Error("game_not_found");
  }

  const files = [
    "samp.dll",
    "omp-client.dll",
    "omp-injector.exe",
    "samp_debug.exe",
    "rcon.exe",
    "imgui.ini",
  ];
  for (const file of validFileChecksums.values()) {
    if (file.requiredInGameDir) {
      files.push(`${file.path.replace("samp/shared/", "")}${file.name}`);
    }
  }

  await invoke("uninstall_macos_samp_files", { gtasaDir: gtasaPath, files });
};

export const clearSampUserCache = async () => {
  const home = await path.homeDir();
  const userFilesDir = `${home}Documents/GTA San Andreas User Files`;
  const { gtasaPath } = useSettings.getState();
  await invoke("clear_samp_user_cache", {
    userFilesDir,
    gameDir: gtasaPath || null,
  });
};

const isFileAvailableInGTASADir = async (file: ResourceInfo) => {
  const { gtasaPath } = useSettings.getState();
  const tempPath = await path.join(
    file.path.replace("samp/shared/", ""),
    file.name
  );
  return fs.exists(await path.join(gtasaPath, tempPath));
};

export const checkResourceFilesAvailability = async () => {
  const checks = Array.from(validFileChecksums.values())
    .filter((file) => file.requiredInGameDir)
    .map((file) => isFileAvailableInGTASADir(file));

  return Promise.all(checks);
};

export const startGame = async (
  server: Server,
  nickname: string,
  gtasaPath: string,
  password: string
) => {
  const { addToRecentlyJoined } = usePersistentServers.getState();
  const { showMessageBox, hideMessageBox } = useMessageBox.getState();
  const { show: showSettings } = useSettingsModal.getState();
  const { sampVersion, customGameExe } = useSettings.getState();
  const { showPrompt, setServer } = useJoinServerPrompt.getState();
  const { setSelected } = useServers.getState();

  if (IN_GAME) {
    invoke("send_message_to_game", {
      id: IN_GAME_PROCESS_ID,
      message: password.length
        ? `connect:${await getIpAddress(server.ip)}:${
            server.port
          }:${nickname}:${password}`
        : `connect:${await getIpAddress(server.ip)}:${server.port}:${nickname}`,
    });
    return;
  }

  if (!gtasaPath) {
    const detected = await autoDetectGtasaPath();
    if (detected) {
      gtasaPath = detected;
    } else {
      showMessageBox({
        title: t("gta_path_modal_path_not_set_title"),
        description: t("gta_path_modal_path_not_set_description"),
        buttons: [
          {
            title: t("browse"),
            onPress: async () => {
              const dir = await locateGameExeDir();
              hideMessageBox();
              if (dir) {
                startGame(server, nickname, dir, password);
              } else {
                showPrompt(true);
                setServer(server);
              }
            },
          },
          {
            title: t("open_settings"),
            onPress: () => {
              showPrompt(false);
              showSettings();
              hideMessageBox();
            },
          },
          {
            title: t("cancel"),
            onPress: () => {
              showPrompt(true);
              setServer(server);
              hideMessageBox();
            },
          },
        ],
      });
      return;
    }
  }

  if (!nickname || !nickname.trim()) {
    const { useNicknameAlert } = await import("../states/nicknameAlert");
    useNicknameAlert.getState().trigger();
    return;
  }

  if (!(await exists(`${gtasaPath}/samp.dll`))) {
    showMessageBox({
      title: t("samp_not_installed_title"),
      description: t("samp_not_installed_description"),
      boxWidth: 440,
      buttons: [
        {
          title: t("samp_setup_install"),
          onPress: async () => {
            hideMessageBox();
            try {
              const health = await invoke<{
                crossover: boolean;
                bottle: string;
              }>("get_macos_health", {
                bottleName: useSettings.getState().bottleName,
              });
              if (!health.crossover) {
                throw new Error(t("samp_install_need_crossover"));
              }
              if (!health.bottle) {
                throw new Error(t("samp_install_need_bottle"));
              }
              await prepareSelectedBottleSampFiles(gtasaPath);
              startGame(server, nickname, gtasaPath, password);
            } catch (e) {
              showOkModal(
                t("samp_setup_failed_title"),
                e instanceof Error ? e.message : String(e)
              );
            }
          },
        },
        {
          title: t("cancel"),
          onPress: () => {
            showPrompt(true);
            setServer(server);
            hideMessageBox();
          },
        },
      ],
    });
    return;
  }

  let foundSampInGtaFolder = true;
  const dirValidity = await checkDirectoryValidity(gtasaPath, (reason) => {
    if (reason === "samp") foundSampInGtaFolder = false;
    else {
      showPrompt(true);
      setServer(server);
    }
  });

  if (sampVersion !== "custom") {
    try {
      const checks = await checkResourceFilesAvailability();
      if (checks.includes(false)) {
        Log.debug("Missing files, copying into GTASA directory...");
        await copySharedFilesIntoGameFolder();
      }
    } catch (e) {
      if (e === "need_admin") {
        showMessageBox({
          title: t("admin_permissions_required_modal_title"),
          description: t("admin_permissions_required_modal_description"),
          boxWidth: sc(500),
          buttons: [
            {
              title: t("run_as_admin"),
              onPress: () =>
                shell
                  .open("https://assets.open.mp/run_as_admin.gif")
                  .then(() => process.exit()),
            },
            {
              title: t("cancel"),
              onPress: () => {
                showPrompt(true);
                setServer(server);
                hideMessageBox();
              },
            },
          ],
        });

        return;
      }
    }
  }

  if (sampVersion === "custom" && !foundSampInGtaFolder) {
    showMessageBox({
      title: t("gta_path_modal_cant_find_samp_title"),
      description: `${t("gta_path_modal_cant_find_samp_description", {
        path: gtasaPath,
      })}\n${t("gta_path_modal_cant_find_samp_description_2")}`,
      boxWidth: 360,
      buttonWidth: 150,
      buttons: [
        {
          title: t("change_version"),
          onPress: () => {
            hideMessageBox();
            setServer(server);
            showPrompt(true);
          },
        },
        {
          title: t("download"),
          onPress: () =>
            shell.open(
              "https://uifserver.net/download/sa-mp-0.3.7-R5-1-MP-install.exe"
            ),
        },
      ],
    });
    return;
  }

  if (!dirValidity) return;

  // Custom exe doesn't exist
  if ((await fs.exists(await path.join(gtasaPath, customGameExe))) === false) {
    showMessageBox({
      title: t("unable_to_find_custom_game_exe_title"),
      description: t("unable_to_find_custom_game_exe_description"),
      buttons: [{ title: t("close"), onPress: hideMessageBox }],
    });
    return;
  }

  const idealSAMPDllPath = await path.join(gtasaPath, "samp.dll");
  const file = validFileChecksums.get(
    sampVersion !== "custom" ? sampVersion : "037R1_samp.dll"
  );
  const ourSAMPDllPath =
    sampVersion === "custom"
      ? idealSAMPDllPath
      : file
      ? await getLocalPath(file.path, file.name)
      : idealSAMPDllPath;

  const { setLaunching, setPaused, setGateOpen } = useGameLaunch.getState();
  const { debugMode, debugDetailed, audioFix, renderFix } =
    useSettings.getState();

  // The audio route we applied for this launch (default-device switch and/or
  // our aggregate device), so we can undo it when the game exits. null = we
  // never changed the route.
  let routeToRestore: {
    previousUid: string | null;
    createdAggregate: boolean;
  } | null = null;

  // macOS audio-abort auto-retry. On Apple Silicon / CrossOver the game
  // intermittently aborts (exit 3) the instant it creates its CoreAudio render
  // unit — a non-deterministic illegal-instruction fault in Apple's audio code
  // under emulation, not something a config reliably prevents (see
  // CROSSOVER-BUG-REPORT.md). It strikes during connect/loading, so a crash
  // shows up as the game process either never appearing or appearing and dying
  // within a few seconds. Because it's a ~coin-flip per fresh audio-unit init,
  // simply relaunching usually wins. We retry the launch a few times before
  // giving up. Only meaningful on macOS; harmless elsewhere (the game rarely
  // dies this fast on a successful join).
  const MAX_AUDIO_RETRIES = 3;
  // A game that dies sooner than this after coming up (or never comes up) is
  // treated as the early audio/connect crash rather than a real play session.
  const EARLY_CRASH_MS = 20_000;
  let audioRetries = 0;

  // The actual launch. Wrapped so the macOS audio-crash gate below can hold it
  // behind a prompt and only fire it once the user chooses to continue.
  const doLaunch = async () => {
    setGateOpen(false);
    setPaused(false);
    setLaunching(true);
    const injectIp = await getIpAddress(server.ip);
    const ompFile = await getLocalPath("omp", "omp-client.dll");
    invoke("inject", {
      name: nickname,
      ip: injectIp,
      port: server.port,
      exe: gtasaPath,
      dll: ourSAMPDllPath,
      ompFile,
      password,
      customGameExe,
      debug: debugMode,
      debugDetailed: debugMode && debugDetailed,
      audioFix,
      renderFix,
    })
      .then(() => {
      addToRecentlyJoined(server);
      setSelected(undefined);
      telemetryGameJoin(`${server.ip}:${server.port}`, server.hostname, server.usingOmp);
    })
    .catch((e) => {
      if (e === "need_admin") {
        showMessageBox({
          title: t("admin_permissions_required_modal_title"),
          description: t("admin_permissions_required_modal_description"),
          buttons: [
            {
              title: t("run_as_admin"),
              onPress: () =>
                shell
                  .open("https://assets.open.mp/run_as_admin.gif")
                  .then(() => process.exit()),
            },
            { title: t("cancel"), onPress: hideMessageBox },
          ],
        });
      }
    })
    .finally(() => {
        const POLL_MS = 800;
      const TIMEOUT_MS = 30_000;
      const start = Date.now();

      // Re-fire the launch after an early audio/connect crash. Returns true if
      // a retry was started (so the caller stops handling this attempt), false
      // if the retry budget is spent.
      const retryAudioCrash = (): boolean => {
        if (audioRetries >= MAX_AUDIO_RETRIES) return false;
        // Drop any audio route we set for the dead attempt before the next try,
        // so we don't leak the device switch / aggregate across retries.
        if (routeToRestore != null) {
          invoke("restore_audio_route", {
            previousUid: routeToRestore.previousUid,
            destroyAggregate: routeToRestore.createdAggregate,
          }).catch(() => {});
          routeToRestore = null;
        }
        audioRetries += 1;
        Log.warn(
          `[audio] game crashed early on connect; auto-retry ${audioRetries}/${MAX_AUDIO_RETRIES}`
        );
        setLaunching(true);
        // Small breather so the OS reaps the dead process and releases the DLLs
        // (run_samp also kills stale game processes on entry).
        setTimeout(() => doLaunch(), 1200);
        return true;
      };

      const tick = async () => {
        // Cancelled from the overlay: stop polling.
        if (!useGameLaunch.getState().launching) return;
        let running = false;
        try {
          running = (await invoke<boolean>("is_game_running")) === true;
        } catch {
          // keep polling
        }
        if (running) {
          setLaunching(false);
          const gameStart = Date.now();
          const watchExit = async () => {
            let stillRunning = false;
            try {
              stillRunning = (await invoke<boolean>("is_game_running")) === true;
            } catch { /* keep watching */ }
            if (stillRunning) {
              setTimeout(watchExit, 5_000);
            } else {
              const elapsed = Date.now() - gameStart;
              // Came up but died almost immediately: the audio/connect abort.
              // Auto-retry instead of treating it as a real (short) session.
              if (elapsed < EARLY_CRASH_MS && retryAudioCrash()) {
                return;
              }
              const timeOnServer = Math.round(elapsed / 1000);
              telemetryGameLeave(`${server.ip}:${server.port}`, timeOnServer);
              // Undo the audio route fix (restore the previous default output
              // device and destroy our aggregate) now that the game has quit.
              if (routeToRestore != null) {
                invoke("restore_audio_route", {
                  previousUid: routeToRestore.previousUid,
                  destroyAggregate: routeToRestore.createdAggregate,
                }).catch(() => {});
                routeToRestore = null;
              }
            }
          };
          setTimeout(watchExit, 5_000);
          return;
        }
        if (Date.now() - start >= TIMEOUT_MS) {
          // Never came up within the window — also the audio abort (it can kill
          // the game before is_game_running ever sees it). Retry, else give up.
          if (retryAudioCrash()) return;
          setLaunching(false);
          showOkModal(
            t("game_failed_to_start_title"),
            t("game_failed_to_start_description")
          );
          return;
        }
        setTimeout(tick, POLL_MS);
      };
      setTimeout(tick, POLL_MS);
    });
  };

  // macOS audio-crash gate. On CrossOver/recent macOS (Tahoe) the game aborts on
  // the loading screen when Wine renders to the built-in speaker device — a
  // CoreAudio bug. Testing proved the sample rate is NOT the trigger (44.1 kHz on
  // the built-in speakers still crashes); only rendering to a *different* output
  // device avoids it. So if Audio fix is on and the default output is the
  // built-in speakers, hold the launch behind a prompt and offer to route Wine
  // to a safe device. Non-built-in default, Audio fix off, or detection failure
  // → launch straight away.
  if (audioFix) {
    let info: {
      name: string | null;
      builtIn: boolean;
      bluetooth: boolean;
      sampleRate: number | null;
    } | null = null;
    try {
      info = await invoke("get_audio_output_info");
    } catch {
      info = null;
    }

    if (info && info.builtIn) {
      // Hold the launch behind the gate (overlay in paused/amber state).
      setLaunching(true);
      setPaused(true);
      setGateOpen(true);

      // Apply the audio route fix (switch to an external device if present, else
      // our aggregate over the speakers), remember it for restore, then launch.
      const applyRouteAndLaunch = async () => {
        try {
          const route = await invoke<{
            previousUid: string | null;
            routedTo: string;
            createdAggregate: boolean;
          }>("apply_audio_route_fix");
          routeToRestore = {
            previousUid: route.previousUid,
            createdAggregate: route.createdAggregate,
          };
        } catch (e) {
          Log.warn("[audio_fix] route fix failed:", e);
          // Couldn't reroute — fall through and launch anyway; worst case it
          // crashes and the user picks the plug-in-a-device path next time.
        }
        doLaunch();
      };

      const showGate = (current: NonNullable<typeof info>) => {
        const deviceLabel =
          current.name ||
          t("audio_fix_device_generic", { defaultValue: "your output device" });

        showMessageBox({
          title: t("audio_fix_title", {
            defaultValue: "Avoiding the audio crash",
          }),
          description: [
            t("audio_fix_detected_device", {
              device: deviceLabel,
              defaultValue:
                "Your Mac's audio is set to {{device}}. On recent macOS the game crashes on the loading screen when it plays through the built-in speakers — it's a CrossOver/macOS bug, not the server. Changing the sample rate does NOT fix it; only using a different output device does.",
            }),
            t("audio_fix_route_explain", {
              defaultValue:
                "The fix below reroutes the game's audio to a safe device for this session (your speakers still work), then restores everything when you quit. Or plug in AirPods/headphones — that's the most reliable fix.",
            }),
          ].join("\n\n"),
          boxWidth: 480,
          buttonWidth: 150,
          // Long labels truncate in the horizontal row — stack them vertically.
          verticalButtons: true,
          // Dismissing the gate (X / click outside) cancels the held launch.
          // Without this the launch overlay's invisible gate backdrop stays up
          // with no dialog and no cancel path, freezing the whole UI.
          onClose: () => {
            setGateOpen(false);
            setPaused(false);
            setLaunching(false);
          },
          buttons: [
            {
              title: t("audio_fix_route_and_launch", {
                defaultValue: "Launch (experimental fix)",
              }),
              hint: t("audio_fix_route_and_launch_hint", {
                defaultValue:
                  "Reroutes the game away from the built-in speaker driver (to headphones if plugged in, otherwise through a virtual device wrapping your speakers so you still hear audio), launches, then restores your audio when you quit. Experimental.",
              }),
              onPress: () => applyRouteAndLaunch(),
            },
            {
              title: t("audio_fix_open_setup", {
                defaultValue: "Open Audio MIDI Setup",
              }),
              closeOnPress: false,
              onPress: () => {
                invoke("open_audio_midi_setup").catch(() => {});
              },
            },
            {
              title: t("audio_fix_continue_anyway", {
                defaultValue: "Launch anyway",
              }),
              onPress: () => doLaunch(),
            },
          ],
        });
      };

      showGate(info);
      return;
    }
  }

  // Non-built-in output / no gate needed: launch directly.
  doLaunch();
};

export const checkDirectoryValidity = async (
  dirPath: string,
  onFail?: (reason: "samp" | "gtasa") => void
) => {
  const { showMessageBox, hideMessageBox } = useMessageBox.getState();
  const { show: showSettings } = useSettingsModal.getState();
  const { showPrompt } = useJoinServerPrompt.getState();

  if (!(await hasGameExe(dirPath))) {
    showMessageBox({
      title: t("gta_path_modal_cant_find_game_title"),
      description: t("gta_path_modal_cant_find_game_description", {
        path: dirPath,
      }),
      boxWidth: 360,
      buttonWidth: 150,
      buttons: [
        {
          title: t("browse"),
          onPress: async () => {
            const dir = await locateGameExeDir();
            hideMessageBox();
            if (!dir) onFail?.("gtasa");
          },
        },
        {
          title: t("open_settings"),
          onPress: () => {
            showPrompt(false);
            showSettings();
            hideMessageBox();
          },
        },
        {
          title: t("cancel"),
          onPress: () => {
            onFail?.("gtasa");
            hideMessageBox();
          },
        },
      ],
    });
    return false;
  }

  if (!(await exists(`${dirPath}/samp.dll`))) {
    onFail?.("samp");
  }
  return true;
};

export const exportFavoriteListFile = async () => {
  const { favorites } = usePersistentServers.getState();
  if (!favorites.length) {
    showOkModal(t("export_failed_title"), t("export_no_servers_description"));
    return;
  }

  try {
    const exportData = {
      version: 1,
      servers: favorites.map(({ ip, port, hostname, password }) => ({
        ip,
        port,
        name: hostname,
        password: password || "",
      })),
    };

    const savePath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "omp_servers.json",
    });

    if (!savePath) return;
    await writeTextFile(savePath, JSON.stringify(exportData, null, 2));

    useNotification
      .getState()
      .showNotification(
        t("export_successful_title"),
        t("export_successful_description")
      );
  } catch (error) {
    Log.debug("Error exporting servers:", error);
    showOkModal(t("export_failed_title"), t("export_failed_description"));
  }
};

export const importFavoriteListFile = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected) return;

    const fileContent = await readTextFile(selected as string);
    const data = JSON.parse(fileContent);

    if (!Array.isArray(data.servers)) {
      throw new Error("Invalid file format: missing servers array");
    }

    const { addToFavorites } = usePersistentServers.getState();

    data.servers.forEach((srv: any) => {
      if (srv.ip && srv.port) {
        addToFavorites({
          ip: srv.ip,
          port: Number(srv.port),
          hostname: srv.name || `${srv.ip}:${srv.port}`,
          playerCount: 0,
          maxPlayers: 0,
          gameMode: "-",
          language: "-",
          hasPassword: !!srv.password,
          version: "-",
          usingOmp: false,
          partner: false,
          ping: PING_TIMEOUT_VALUE,
          players: [],
          password: srv.password || "",
          rules: {} as Server["rules"],
        });
      }
    });

    fetchServers(true);
    useNotification
      .getState()
      .showNotification(
        t("import_successful_title"),
        t("import_successful_description")
      );
  } catch (error) {
    Log.debug("Error importing servers:", error);
    showOkModal(t("import_failed_title"), t("import_failed_description"));
  }
};
