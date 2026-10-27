import { invoke, path, shell } from "@tauri-apps/api";
import { t } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import ThemedDropdown from "../../../components/ThemedDropdown";
import { images } from "../../../constants/images";
import { useAppState } from "../../../states/app";
import { useGameLaunch } from "../../../states/gameLaunch";
import { useMessageBox } from "../../../states/messageModal";
import { useSettings } from "../../../states/settings";
import { ThemeColors } from "../../../constants/theme";
import { useTheme } from "../../../states/theme";
import {
  clearSampUserCache,
  detectInstalledSampVersion,
  prepareSelectedBottleSampFiles,
  uninstallSelectedBottleSampFiles,
} from "../../../utils/game";
import {
  fetchUpdateInfo,
  getSampVersionFromName,
  getSampVersionName,
} from "../../../utils/helpers";
import {
  buildSampVersionDropdownItems,
  LATEST_SAMP_VERSION,
} from "../../../utils/sampVersionMeta";
import { sc } from "../../../utils/sizeScaler";
import { stateStorage } from "../../../utils/stateStorage";
import { SAMPDLLVersions } from "../../../utils/types";

type DetectedVersion = Awaited<ReturnType<typeof detectInstalledSampVersion>>;

interface MacosHealth {
  crossover: boolean;
  game_exe: boolean;
  rockstar_launcher: boolean;
  game_path: string;
  bottle: string;
}

const CROSSOVER_URL = "https://www.codeweavers.com/crossover";
const DONE_DISPLAY_MS = 3000;
// How long the Re-check result stays up; the button is unclickable meanwhile
// so it can't be spammed.
const RECHECK_COOLDOWN_MS = 5000;

const STATUS_GREEN = "#3FB950";
const STATUS_ORANGE = "#E8912B";
// Shared height for the tile-header controls: status pills, Show in Finder,
// Get CrossOver and Re-check.
const CHIP_HEIGHT = sc(30);

type RecheckPhase = "idle" | "checking" | "result";

// Toned-down solid action colours (the neon #3FB950 / #E5534B read too bright).
const ACTION_GREEN = "#3C9A54";
const ACTION_RED = "#C24B43";

const parseArmVersion = (v: string): number[] | null => {
  // beta < arm < plain stable, so a beta tag never out-ranks the matching stable arm tag
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-arm(-beta)?\.(\d+))?$/);
  if (!m) return null;
  const channel = m[5] === undefined ? 2 : m[4] ? 0 : 1;
  return [+m[1], +m[2], +m[3], channel, m[5] ? +m[5] : 0];
};
const isNewer = (remote: string, local: string): boolean => {
  const r = parseArmVersion(remote);
  const l = parseArmVersion(local);
  if (!r || !l) return false;
  for (let i = 0; i < r.length; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
};

const BetaInfoButton = ({ theme }: { theme: ThemeColors }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "flex", alignItems: "center" }}
      // @ts-ignore
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <View style={styles.betaInfoBtn}>
        <Text size={1} color="#FF9800" semibold>?</Text>
      </View>
      {visible && (
        <div
          style={{
            position: "absolute",
            // Open above the icon, anchored to its left edge so the box grows
            // rightward into the panel. `right: 0` grew it leftward off-screen
            // (the icon sits near the panel's left edge), which clipped it to
            // the window edge.
            bottom: sc(24),
            left: 0,
            borderRadius: sc(6),
            border: `1px solid ${theme.textPrimary}22`,
            backgroundColor: theme.itemBackgroundColor,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            padding: `${sc(9)}px ${sc(12)}px`,
            zIndex: 9999,
            width: sc(250),
            boxSizing: "border-box" as const,
            pointerEvents: "none",
            whiteSpace: "normal" as const,
            fontSize: sc(13),
            lineHeight: `${sc(18)}px`,
            color: theme.textPrimary as string,
            fontFamily: "Proxima Nova Regular",
          }}
        >
          Beta builds may contain bugs or incomplete features.
        </div>
      )}
    </div>
  );
};

const Overview = () => {
  const { theme } = useTheme();
  const { bottleName, setBottleName, sampVersion, setSampVersion } =
    useSettings();
  const { showMessageBox } = useMessageBox();
  const { updateInfo, nativeAppVersion, upstreamLauncherVersion } =
    useAppState();
  const sampInstalling = useGameLaunch((s) => s.sampInstalling);

  const [health, setHealth] = useState<MacosHealth | undefined>(undefined);
  const [bottles, setBottles] = useState<string[]>([]);
  const [autoBottle, setAutoBottle] = useState("");
  const [sampDetected, setSampDetected] = useState<DetectedVersion | undefined>(
    undefined
  );
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [recheckPhase, setRecheckPhase] = useState<RecheckPhase>("idle");
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recheckResultTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const refresh = useCallback(() => {
    return invoke<MacosHealth>("get_macos_health", { bottleName })
      .then(async (h) => {
        setHealth(h);
        if (h.game_exe && h.game_path) {
          try {
            setSampDetected(await detectInstalledSampVersion(h.game_path));
          } catch {
            setSampDetected("none");
          }
        } else {
          setSampDetected("none");
        }
      })
      .catch(() => {
        setHealth(undefined);
        setSampDetected(undefined);
      });
  }, [bottleName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (sampVersion !== "custom") return;
    if (
      sampDetected &&
      sampDetected !== "none" &&
      sampDetected !== "custom"
    ) {
      setSampVersion(sampDetected as SAMPDLLVersions);
    } else if (sampDetected === undefined || sampDetected === "none") {
      setSampVersion(LATEST_SAMP_VERSION);
    }
  }, [sampVersion, sampDetected, setSampVersion]);

  useEffect(() => {
    invoke<string[]>("list_bottles")
      .then(setBottles)
      .catch(() => setBottles([]));
    invoke<MacosHealth>("get_macos_health", { bottleName: "" })
      .then((h) => setAutoBottle(h.bottle))
      .catch(() => setAutoBottle(""));
  }, []);

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
      if (recheckResultTimer.current) clearTimeout(recheckResultTimer.current);
    },
    []
  );

  // Re-check reruns setup detection plus a quiet launcher update check, then
  // shows the outcome on the button for RECHECK_COOLDOWN_MS before it can be
  // pressed again.
  const handleRecheck = async () => {
    if (recheckPhase !== "idle") return;
    setRecheckPhase("checking");
    await Promise.all([refresh(), fetchUpdateInfo(false).catch(() => {})]);
    setRecheckPhase("result");
    recheckResultTimer.current = setTimeout(
      () => setRecheckPhase("idle"),
      RECHECK_COOLDOWN_MS
    );
  };

  const crossoverOk = !!health?.crossover;
  const gamePath = health?.game_exe ? health.game_path || "" : "";
  const activeBottle = bottleName || health?.bottle || "";
  const bottleOk = crossoverOk && !!gamePath;
  const installed =
    sampDetected !== undefined && sampDetected !== "none";

  const autoLabel = autoBottle
    ? `${t("settings_bottle_auto_short", { defaultValue: "Auto" })} · ${autoBottle}`
    : t("settings_bottle_auto_detect");
  const visibleBottles = bottles.filter(
    (b) => b !== autoBottle || b === bottleName
  );

  const updateAvailable =
    updateInfo &&
    updateInfo.version &&
    isNewer(updateInfo.version, nativeAppVersion);
  const armMatch = nativeAppVersion.match(/^(.+?)-(arm(?:-beta)?\.\d+)$/);
  const macosVersion = armMatch ? armMatch[1] : nativeAppVersion;
  const armBuildTag = armMatch ? armMatch[2] : null;
  const isBetaBuild = !!armBuildTag && armBuildTag.includes("beta");
  const upstreamVersion = upstreamLauncherVersion || "—";

  const openBottleInFinder = async () => {
    if (!activeBottle) return;
    try {
      const home = await path.homeDir();
      await invoke("open_in_finder", {
        path: `${home}Library/Application Support/CrossOver/Bottles/${activeBottle}`,
      });
    } catch (error) {
      showMessageBox({
        title: t("settings_open_bottle_in_finder"),
        description: String(error),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    }
  };

  const finishInstall = () => {
    setJustDone(true);
    doneTimer.current = setTimeout(() => {
      setJustDone(false);
      refresh();
    }, DONE_DISPLAY_MS);
  };

  const installSamp = async () => {
    if (!gamePath || busy || justDone || sampInstalling) return;
    try {
      setBusy(true);
      const startedAt = Date.now();
      await prepareSelectedBottleSampFiles(gamePath);
      // Don't flip to "Installed" the instant the copy returns — keep the
      // spinner until the samp.dll is actually detectable on disk. Poll a few
      // times (fs writes can lag a moment) before trusting it.
      let v: DetectedVersion = "none";
      for (let i = 0; i < 12 && v === "none"; i++) {
        try {
          v = await detectInstalledSampVersion(gamePath);
        } catch {
          v = "none";
        }
        if (v === "none") await new Promise((r) => setTimeout(r, 300));
      }
      // Hold spinner for a minimum visible window — copy can return near-
      // instantly and a 50ms flicker reads as "did nothing happen?".
      const MIN_INSTALL_MS = 4000;
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_INSTALL_MS) {
        await new Promise((r) => setTimeout(r, MIN_INSTALL_MS - elapsed));
      }
      setSampDetected(v);
      setBusy(false);
      if (v !== "none") {
        finishInstall();
      } else {
        showMessageBox({
          title: t("samp_setup_failed_title"),
          description: t("settings_samp_verify_failed", {
            defaultValue:
              "Files were copied but no SA-MP version could be detected afterwards.",
          }),
          boxWidth: 420,
          buttons: [{ title: t("close"), onPress: () => {} }],
        });
      }
    } catch (error) {
      setBusy(false);
      refresh();
      showMessageBox({
        title: t("samp_setup_failed_title"),
        description: String(error),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    }
  };

  const handleUninstall = () => {
    if (!gamePath || uninstalling) return;
    showMessageBox({
      title: t("settings_danger_uninstall_confirm_title", {
        defaultValue: "Uninstall SA-MP?",
      }),
      description: t("settings_danger_uninstall_confirm_desc", {
        defaultValue:
          "Removes the SA-MP client files this launcher added and reverts changes to the game folder.",
      }),
      boxWidth: 420,
      buttons: [
        {
          title: t("settings_uninstall_confirm_btn", { defaultValue: "Uninstall" }),
          onPress: async () => {
            try {
              setUninstalling(true);
              await uninstallSelectedBottleSampFiles(gamePath);
            } catch (error) {
              showMessageBox({
                title: t("samp_uninstall_failed_title"),
                description: String(error),
                boxWidth: 420,
                buttons: [{ title: t("close"), onPress: () => {} }],
              });
            } finally {
              setUninstalling(false);
              refresh();
            }
          },
        },
        { title: t("cancel"), onPress: () => {} },
      ],
    });
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    try {
      setClearingCache(true);
      await clearSampUserCache();
      showMessageBox({
        title: t("settings_danger_cache_done_title", {
          defaultValue: "Cache cleared",
        }),
        description: t("settings_danger_cache_done_desc", {
          defaultValue:
            "SA-MP / open.mp config, chat logs, client settings and debug logs were removed.",
        }),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    } catch (error) {
      showMessageBox({
        title: t("settings_danger_cache_failed_title", {
          defaultValue: "Could not clear cache",
        }),
        description: String(error),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    } finally {
      setClearingCache(false);
    }
  };

  const handleReset = () => {
    showMessageBox({
      title: t("settings_danger_reset_confirm_title", {
        defaultValue: "Reset launcher?",
      }),
      description: t("settings_danger_reset_help_short", {
        defaultValue:
          "Wipes nickname, bottle, favorites and per-server overrides, then reloads.",
      }),
      boxWidth: 420,
      buttons: [
        {
          title: t("settings_danger_reset_confirm_btn", {
            defaultValue: "Reset",
          }),
          onPress: () => {
            stateStorage.clear();
            localStorage.clear();
            window.location.reload();
          },
        },
        { title: t("cancel"), onPress: () => {} },
      ],
    });
  };

  const detectedLabel =
    sampDetected === undefined
      ? "…"
      : sampDetected === "none"
      ? t("settings_status_samp_not_found", { defaultValue: "Not found" })
      : sampDetected === "custom"
      ? t("settings_samp_custom", { defaultValue: "Custom samp.dll" })
      : getSampVersionName(sampDetected as SAMPDLLVersions);

  // Pointing the dropdown at the version already in the game folder turns the
  // button into a disabled green "Already installed" chip rather than offering
  // a redundant reinstall.
  const selectedMatchesInstalled =
    installed &&
    sampDetected !== "custom" &&
    sampVersion !== "custom" &&
    sampVersion === sampDetected;

  const renderSampAction = () => {
    const running = busy || sampInstalling;

    if (running) {
      return (
        <View style={[styles.sampButton, { backgroundColor: ACTION_GREEN }]}>
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text semibold color="#FFFFFF" size={1}>
              {t("settings_installing_samp_files", {
                defaultValue: "Installing…",
              })}
            </Text>
          </View>
        </View>
      );
    }

    if (justDone) {
      return (
        <View style={[styles.sampButton, { backgroundColor: "#4A4A4F" }]}>
          <Text semibold color="#FFFFFF" size={1}>
            {`✓  ${t("settings_samp_installed_done", { defaultValue: "Done" })}`}
          </Text>
        </View>
      );
    }

    // The picked version is already on disk → the slot becomes Uninstall
    // (no redundant disabled "Installed" button).
    if (selectedMatchesInstalled) {
      return (
        <TouchableOpacity
          disabled={uninstalling}
          onPress={handleUninstall}
          style={[styles.sampButton, { backgroundColor: ACTION_RED }]}
        >
          {uninstalling ? (
            <View style={styles.btnRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text semibold color="#FFFFFF" size={1}>
                {t("settings_danger_uninstalling", {
                  defaultValue: "Uninstalling…",
                })}
              </Text>
            </View>
          ) : (
            <View style={styles.btnRow}>
              <Icon svg image={images.icons.trash} size={sc(13)} color="#FFFFFF" />
              <Text semibold color="#FFFFFF" size={1}>
                {t("settings_uninstall_samp_files", { defaultValue: "Uninstall" })}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // Clean slot → Install; different version picked → Reinstall.
    return (
      <TouchableOpacity
        disabled={!gamePath}
        onPress={installSamp}
        style={[
          styles.sampButton,
          { backgroundColor: !gamePath ? "#666666" : ACTION_GREEN, opacity: !gamePath ? 0.65 : 1 },
        ]}
      >
        <Text semibold color="#FFFFFF" size={1}>
          {installed
            ? t("settings_reinstall_samp_files", { defaultValue: "Reinstall" })
            : t("settings_install_samp_files", { defaultValue: "Install" })}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderRecheckButton = () => {
    if (recheckPhase === "result") {
      const tone = updateAvailable ? STATUS_ORANGE : STATUS_GREEN;
      return (
        <View
          style={[
            styles.statusChip,
            styles.chipRow,
            { backgroundColor: `${tone}1F`, borderColor: `${tone}66` },
          ]}
        >
          {updateAvailable ? (
            <>
              <Text size={1} semibold color={tone}>
                {t("settings_recheck_update", { defaultValue: "Update" })}
              </Text>
              <div
                title={t("settings_recheck_update_hint", {
                  defaultValue: "v{{v}} is available",
                  v: updateInfo?.version,
                })}
              >
                <View
                  style={[
                    styles.helpMarker,
                    { borderColor: `${tone}66`, backgroundColor: `${tone}20` },
                  ]}
                >
                  <Text size={1} semibold color={tone}>
                    ?
                  </Text>
                </View>
              </div>
            </>
          ) : (
            <>
              <Icon svg image={images.icons.check} size={sc(13)} color={tone} />
              <Text size={1} semibold color={tone}>
                {t("settings_recheck_up_to_date", {
                  defaultValue: "Up to date",
                })}
              </Text>
            </>
          )}
        </View>
      );
    }

    const checking = recheckPhase === "checking";
    return (
      <TouchableOpacity
        disabled={checking}
        onPress={handleRecheck}
        style={[
          styles.statusChip,
          styles.chipRow,
          {
            borderColor: `${theme.textPrimary}24`,
            opacity: checking ? 0.7 : 1,
          },
        ]}
      >
        {checking ? (
          <ActivityIndicator size="small" color={theme.textPrimary} />
        ) : (
          <Icon
            svg
            image={images.icons.recheck}
            size={sc(13)}
            color={theme.textPrimary}
          />
        )}
        <Text size={1} semibold color={theme.textPrimary}>
          {checking
            ? t("settings_recheck_checking", { defaultValue: "Checking…" })
            : t("settings_health_recheck")}
        </Text>
      </TouchableOpacity>
    );
  };

  const dotColor = (ok: boolean, pending: boolean) =>
    pending ? "#888" : ok ? STATUS_GREEN : STATUS_ORANGE;

  const sampMeta = (() => {
    const installedSamp =
      sampDetected !== undefined &&
      sampDetected !== "none" &&
      sampDetected !== "custom"
        ? (sampDetected as SAMPDLLVersions)
        : undefined;
    return buildSampVersionDropdownItems(installedSamp);
  })();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHeaderRow}>
        <Text semibold size={2} color={theme.textPrimary}>
          {t("settings_overview_status_title", { defaultValue: "Setup status" })}
        </Text>
        {renderRecheckButton()}
      </View>
      <View style={styles.tiles}>
        {/* ── CrossOver ───────────────────────────────────────────── */}
        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
              zIndex: 10,
            },
          ]}
        >
          <View style={styles.tileHead}>
            <View style={styles.tileHeadLeft}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotColor(crossoverOk, health === undefined) },
                ]}
              />
              <Text semibold size={2} color={theme.textPrimary}>
                {t("settings_status_crossover", { defaultValue: "CrossOver" })}
              </Text>
            </View>
            {crossoverOk ? (
              <View
                style={[
                  styles.pill,
                  { backgroundColor: "#3FB9501F", borderColor: "#3FB95066" },
                ]}
              >
                <Text size={1} semibold color="#3FB950">
                  {t("settings_status_crossover_detected", {
                    defaultValue: "Detected",
                  })}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => shell.open(CROSSOVER_URL)}
                style={[
                  styles.actionButton,
                  { backgroundColor: "#E8912B1F", borderColor: "#E8912B66" },
                ]}
              >
                <Text size={1} semibold color="#E8912B">
                  {t("settings_get_crossover", {
                    defaultValue: "Get CrossOver",
                  })}
                </Text>
                <Icon
                  svg
                  image={images.icons.external}
                  size={sc(10)}
                  color="#E8912B"
                />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.tileSpacer} />
        </View>

        {/* ── Bottle ──────────────────────────────────────────────── */}
        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
              zIndex: 30,
            },
          ]}
        >
          <View style={styles.tileHead}>
            <View style={styles.tileHeadLeft}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotColor(bottleOk, health === undefined) },
                ]}
              />
              <Text semibold size={2} color={theme.textPrimary}>
                {t("settings_status_bottle", { defaultValue: "Bottle" })}
              </Text>
            </View>
            {crossoverOk && (
              <View style={styles.tileHeadRight}>
                <TouchableOpacity
                  disabled={!activeBottle}
                  onPress={openBottleInFinder}
                  style={[
                    styles.finderButton,
                    {
                      backgroundColor: activeBottle
                        ? `${theme.primary}1F`
                        : `${theme.textPrimary}10`,
                      borderColor: activeBottle
                        ? `${theme.primary}66`
                        : `${theme.textPrimary}22`,
                      opacity: activeBottle ? 1 : 0.6,
                    },
                  ]}
                >
                  <Text
                    size={1}
                    semibold
                    color={activeBottle ? theme.primary : `${theme.textPrimary}88`}
                    numberOfLines={1}
                  >
                    {t("settings_show_in_finder", {
                      defaultValue: "Show in Finder",
                    })}
                  </Text>
                </TouchableOpacity>
                <View
                  style={[
                    styles.pill,
                    gamePath
                      ? { backgroundColor: "#3FB9501F", borderColor: "#3FB95066" }
                      : { backgroundColor: "#E8912B1F", borderColor: "#E8912B66" },
                  ]}
                >
                  <Text
                    size={1}
                    semibold
                    color={gamePath ? "#3FB950" : "#E8912B"}
                    numberOfLines={1}
                  >
                    {gamePath
                      ? health?.rockstar_launcher
                        ? t("settings_status_rgl_detected", {
                            defaultValue: "Rockstar Launcher detected",
                          })
                        : t("settings_status_game_detected", {
                            defaultValue: "GTA: SA detected",
                          })
                      : t("settings_status_game_not_found", {
                          defaultValue: "Game not found",
                        })}
                  </Text>
                </View>
              </View>
            )}
          </View>
          {!crossoverOk && (
            <Text
              size={1}
              color={`${theme.textPrimary}88`}
              numberOfLines={2}
              selectable
              style={styles.tileSub}
            >
              {t("settings_bottle_need_crossover", {
                defaultValue: "Install CrossOver first.",
              })}
            </Text>
          )}
          {crossoverOk && (
            <View style={styles.tileBottom}>
              <ThemedDropdown
                value={bottleName.length === 0 ? autoLabel : bottleName}
                items={[autoLabel, ...visibleBottles]}
                onChange={(v) => setBottleName(v === autoLabel ? "" : v)}
                maxVisibleItems={4}
              />
            </View>
          )}
        </View>

        {/* ── SA-MP ───────────────────────────────────────────────── */}
        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
              zIndex: 20,
            },
          ]}
        >
          <View style={styles.tileHead}>
            <View style={styles.tileHeadLeft}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: dotColor(
                      installed,
                      sampDetected === undefined
                    ),
                  },
                ]}
              />
              <Text semibold size={2} color={theme.textPrimary}>
                {t("settings_status_samp", { defaultValue: "SA-MP" })}
              </Text>
            </View>
            {installed ? (
              <View
                style={[
                  styles.pill,
                  { backgroundColor: "#3FB9501F", borderColor: "#3FB95066" },
                ]}
              >
                <Text size={1} semibold color="#3FB950">
                  {t("settings_samp_detected_pill", {
                    defaultValue: "{{v}} detected",
                    v: detectedLabel,
                  })}
                </Text>
              </View>
            ) : sampDetected !== undefined ? (
              <View
                style={[
                  styles.pill,
                  { backgroundColor: "#E8912B1F", borderColor: "#E8912B66" },
                ]}
              >
                <Text size={1} semibold color="#E8912B">
                  {t("settings_status_samp_not_found", {
                    defaultValue: "Not found",
                  })}
                </Text>
              </View>
            ) : null}
          </View>
          {!installed && !gamePath && (
            <Text
              size={1}
              color={`${theme.textPrimary}88`}
              numberOfLines={2}
              style={styles.tileSub}
            >
              {t("settings_samp_need_bottle", {
                defaultValue: "Link a bottle with GTA: SA first.",
              })}
            </Text>
          )}
          {gamePath && (
            <View style={[styles.tileBottom, styles.tileBottomRow]}>
              <View style={styles.tileBottomDropdown}>
                <ThemedDropdown
                  value={getSampVersionName(
                    sampVersion === "custom"
                      ? LATEST_SAMP_VERSION
                      : sampVersion
                  )}
                  items={sampMeta.items}
                  itemMeta={sampMeta.meta}
                  onChange={(name) =>
                    setSampVersion(getSampVersionFromName(name))
                  }
                  maxVisibleItems={5}
                />
              </View>
              {installed && (
                <TouchableOpacity
                  disabled={clearingCache}
                  onPress={handleClearCache}
                  // Same red as Uninstall beside it: both remove files.
                  style={[styles.sampButton, { backgroundColor: ACTION_RED }]}
                >
                  <View style={styles.btnRow}>
                    {clearingCache ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Icon
                        svg
                        image={images.icons.broom}
                        size={sc(13)}
                        color="#FFFFFF"
                      />
                    )}
                    <Text size={1} semibold color="#FFFFFF">
                      {clearingCache
                        ? t("settings_danger_clearing_cache", {
                            defaultValue: "Clearing…",
                          })
                        : t("settings_danger_clear_cache_btn", {
                            defaultValue: "Clear cache",
                          })}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {renderSampAction()}
            </View>
          )}
        </View>

        {/* ── open.mp Launcher (reset) ────────────────────────────── */}
        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
            },
          ]}
        >
          {/* Title + description on the left, button centred on the right. */}
          <View style={styles.tileHead}>
            <View style={styles.resetText}>
              <Text semibold size={2} color={theme.textPrimary}>
                {t("settings_reset_launcher_title", {
                  defaultValue: "open.mp Launcher",
                })}
              </Text>
              <Text
                size={1}
                color={`${theme.textPrimary}88`}
                numberOfLines={2}
                style={styles.resetSub}
              >
                {t("settings_danger_reset_help_short", {
                  defaultValue:
                    "Wipes nickname, bottle, favorites and per-server overrides, then reloads.",
                })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.sampButton, { backgroundColor: ACTION_RED }]}
            >
              <View style={styles.btnRow}>
                <Icon
                  svg
                  image={images.icons.reset}
                  size={sc(13)}
                  color="#FFFFFF"
                />
                <Text size={1} semibold color="#FFFFFF">
                  {t("settings_danger_reset_short", {
                    defaultValue: "Reset launcher data",
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {updateAvailable && (
        <View
          style={[
            styles.updateBox,
            {
              borderColor: `${theme.primary}66`,
              backgroundColor: `${theme.primary}14`,
            },
          ]}
        >
          <View style={styles.updateText}>
            <Text semibold size={2} color={theme.primary}>
              {t("settings_overview_update_title", {
                defaultValue: "Update available",
              })}
            </Text>
            <Text
              size={1}
              color={`${theme.textPrimary}AA`}
              style={styles.updateSub}
            >
              {t("settings_overview_update_current", {
                defaultValue: "You: v{{cur}}  →  Latest: v{{next}}",
                cur: nativeAppVersion,
                next: updateInfo?.version,
              })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => updateInfo && shell.open(updateInfo.download)}
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          >
            <Text semibold size={2} color="#FFFFFF">
              {t("download")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.sectionDivider,
          { backgroundColor: `${theme.textPrimary}14` },
        ]}
      />

      <Text semibold size={2} color={theme.textPrimary}>
        {t("settings_overview_about_title", { defaultValue: "About" })}
      </Text>
      <View style={styles.aboutGrid}>
        <View style={styles.aboutCell}>
          <Text size={1} color={`${theme.textPrimary}88`}>
            {t("settings_overview_macos_version", {
              defaultValue: "macOS version",
            })}
          </Text>
          <View style={styles.aboutPillRow}>
            <View
              style={[
                styles.aboutPill,
                {
                  backgroundColor: `${theme.textPrimary}10`,
                  borderColor: `${theme.textPrimary}22`,
                },
              ]}
            >
              <Text size={1} semibold color={theme.textPrimary}>
                v{macosVersion}
              </Text>
            </View>
            {armBuildTag && (
              <View style={styles.betaPillRow}>
                <View
                  style={[
                    styles.aboutPill,
                    isBetaBuild
                      ? {
                          backgroundColor: "#FF980020",
                          borderColor: "#FF980066",
                        }
                      : {
                          backgroundColor: `${theme.textPrimary}10`,
                          borderColor: `${theme.textPrimary}22`,
                        },
                  ]}
                >
                  <Text
                    size={1}
                    semibold
                    color={isBetaBuild ? "#FF9800" : theme.textPrimary}
                  >
                    {armBuildTag}
                  </Text>
                </View>
                {isBetaBuild && <BetaInfoButton theme={theme} />}
              </View>
            )}
          </View>
        </View>
        <View style={styles.aboutCell}>
          <Text size={1} color={`${theme.textPrimary}88`}>
            {t("settings_overview_upstream_version", {
              defaultValue: "Upstream version",
            })}
          </Text>
          <View style={styles.aboutPillRow}>
            <View
              style={[
                styles.aboutPill,
                {
                  backgroundColor: `${theme.textPrimary}10`,
                  borderColor: `${theme.textPrimary}22`,
                },
              ]}
            >
              <Text size={1} semibold color={theme.textPrimary}>
                {upstreamVersion}
              </Text>
            </View>
            {updateAvailable && updateInfo?.version ? (
              <View
                style={[
                  styles.aboutPill,
                  {
                    backgroundColor: `${theme.primary}1F`,
                    borderColor: `${theme.primary}66`,
                  },
                ]}
              >
                <Text size={1} semibold color={theme.primary}>
                  {t("settings_overview_latest_label", {
                    defaultValue: "latest v{{v}}",
                    v: updateInfo.version,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: sc(14),
    paddingVertical: sc(12),
    gap: sc(8),
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionSub: {
    marginBottom: sc(2),
  },
  // Re-check button / result. Same box as the status pills and Show in Finder.
  statusChip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  chipRow: {
    flexDirection: "row",
    gap: sc(6),
  },
  helpMarker: {
    width: sc(16),
    height: sc(16),
    borderRadius: sc(8),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: {
    flexDirection: "column",
    gap: sc(8),
    zIndex: 100,
  },
  tile: {
    borderRadius: sc(10),
    borderWidth: 1,
    padding: sc(10),
  },
  tileHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sc(6),
  },
  tileHeadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(7),
    flexShrink: 1,
  },
  dot: {
    width: sc(8),
    height: sc(8),
    borderRadius: sc(4),
  },
  tileSpacer: {
    flex: 1,
  },
  tileSub: {
    flex: 1,
    marginTop: sc(8),
    lineHeight: sc(15),
  },
  tileBottom: {
    marginTop: sc(8),
    zIndex: 40,
  },
  tileBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
  },
  tileBottomDropdown: {
    flex: 1,
    minWidth: 0,
  },
  resetText: {
    flex: 1,
    minWidth: 0,
  },
  resetSub: {
    marginTop: sc(4),
    lineHeight: sc(15),
  },
  tileHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
    flexShrink: 1,
  },
  finderButton: {
    height: CHIP_HEIGHT,
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  // Status pills match the Show in Finder button: same height and radius.
  pill: {
    height: CHIP_HEIGHT,
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    justifyContent: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(5),
    height: CHIP_HEIGHT,
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
  sampButton: {
    height: sc(34),
    borderRadius: sc(7),
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: sc(10),
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
  },
  updateBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(12),
    paddingVertical: sc(10),
    paddingHorizontal: sc(12),
    borderRadius: sc(10),
    borderWidth: 1,
  },
  updateText: {
    flex: 1,
  },
  updateSub: {
    marginTop: sc(2),
  },
  primaryButton: {
    height: sc(34),
    paddingHorizontal: sc(14),
    borderRadius: sc(8),
    justifyContent: "center",
    alignItems: "center",
  },
  sectionDivider: {
    height: 1,
    marginVertical: sc(4),
  },
  aboutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sc(10),
  },
  aboutCell: {
    flexGrow: 1,
    flexBasis: sc(120),
    minWidth: sc(120),
    paddingVertical: sc(6),
    gap: sc(4),
  },
  aboutPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sc(6),
  },
  aboutPill: {
    paddingVertical: sc(3),
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  betaPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(4),
  },
  betaInfoBtn: {
    width: sc(16),
    height: sc(16),
    borderRadius: sc(8),
    borderWidth: 1,
    borderColor: "#FF980066",
    backgroundColor: "#FF980020",
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "default",
  },
});

export default Overview;
