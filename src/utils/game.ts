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
import { telemetryGameJoin } from "./telemetry";
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

  const { setLaunching } = useGameLaunch.getState();
  setLaunching(true);
  const { debugMode, debugDetailed, audioFix } = useSettings.getState();
  invoke("inject", {
    name: nickname,
    ip: await getIpAddress(server.ip),
    port: server.port,
    exe: gtasaPath,
    dll: ourSAMPDllPath,
    ompFile: await getLocalPath("omp", "omp-client.dll"),
    password,
    customGameExe,
    debug: debugMode,
    debugDetailed: debugMode && debugDetailed,
    audioFix,
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
          return;
        }
        if (Date.now() - start >= TIMEOUT_MS) {
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
