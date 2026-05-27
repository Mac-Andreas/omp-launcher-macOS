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
import { useTheme } from "../../../states/theme";
import {
  detectInstalledSampVersion,
  prepareSelectedBottleSampFiles,
} from "../../../utils/game";
import {
  getSampVersionFromName,
  getSampVersionName,
} from "../../../utils/helpers";
import {
  buildSampVersionDropdownItems,
  LATEST_SAMP_VERSION,
} from "../../../utils/sampVersionMeta";
import { sc } from "../../../utils/sizeScaler";
import { SAMPDLLVersions } from "../../../utils/types";

type DetectedVersion = Awaited<ReturnType<typeof detectInstalledSampVersion>>;

interface MacosHealth {
  crossover: boolean;
  game_exe: boolean;
  rockstar_launcher: boolean;
  game_path: string;
  bottle: string;
}

// CrossOver is the Windows compatibility layer GTA: SA runs inside. When it's
// missing there's nothing the launcher can do but point the user at the
// vendor's download page.
const CROSSOVER_URL = "https://www.codeweavers.com/crossover";
const DONE_DISPLAY_MS = 3000;

const parseArmVersion = (v: string): number[] | null => {
  // Accepts plain "1.6.3", stable arm "1.6.3-arm.N", and pre-release
  // "1.6.3-arm-beta.N". Channel orders releases so beta < arm < plain, i.e. a
  // beta tag never out-ranks the matching stable arm tag.
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
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    invoke<MacosHealth>("get_macos_health", { bottleName })
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

  useEffect(() => refresh(), [refresh]);

  // Replace the "From GTASA Folder" (sampVersion === "custom") placeholder
  // with a real pick so the dropdown never shows it: mirror the detected
  // version when one's installed, otherwise default to the latest release the
  // launcher can install.
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
    },
    []
  );

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
  // Split the native app version into its base (e.g. "1.6.3") and the arm
  // channel build (e.g. "arm-beta.1" or "arm.2"). Matches both the stable
  // "-arm.N" tags and the pre-release "-arm-beta.N" tags.
  const armMatch = nativeAppVersion.match(/^(.+?)-(arm(?:-beta)?\.\d+)$/);
  const macosVersion = armMatch ? armMatch[1] : nativeAppVersion;
  // Upstream version = latest openmultiplayer/launcher GitHub release tag
  // (e.g. "v1.6.1"), fetched in fetchUpdateInfo.
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
      // times (the proxy/loader can lag a moment) before trusting it.
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
    // Grey when the current selection is already on disk — nothing to do.
    // Green for both Install (clean slot) and Reinstall (different version
    // picked), so the button is unmistakeably the call to action.
    const blocked =
      !gamePath || running || justDone || selectedMatchesInstalled;
    const label = installed
      ? t("settings_reinstall_samp_files", { defaultValue: "Reinstall" })
      : t("settings_install_samp_files", { defaultValue: "Install" });
    const bg = !gamePath
      ? "#666666"
      : selectedMatchesInstalled
      ? "#4A4A4F"
      : "#3FB950";
    return (
      <TouchableOpacity
        disabled={blocked}
        onPress={installSamp}
        style={[
          styles.sampButton,
          {
            backgroundColor: bg,
            opacity: !gamePath ? 0.65 : 1,
          },
        ]}
      >
        {running ? (
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text semibold color="#FFFFFF" size={1}>
              {t("settings_installing_samp_files", {
                defaultValue: "Installing…",
              })}
            </Text>
          </View>
        ) : (
          <Text semibold color="#FFFFFF" size={1}>
            {selectedMatchesInstalled
              ? t("settings_samp_already_installed", {
                  defaultValue: "Installed",
                })
              : justDone
              ? `✓  ${t("settings_samp_installed_done", {
                  defaultValue: "Done",
                })}`
              : label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const dotColor = (ok: boolean, pending: boolean) =>
    pending ? "#888" : ok ? "#3FB950" : "#E8912B";

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
        <TouchableOpacity
          onPress={refresh}
          style={[styles.refreshChip, { borderColor: `${theme.textPrimary}24` }]}
        >
          <Icon
            svg
            image={images.icons.recheck}
            size={sc(13)}
            color={theme.textPrimary}
          />
          <Text size={1} semibold color={theme.textPrimary}>
            {t("settings_health_recheck")}
          </Text>
        </TouchableOpacity>
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
                maxVisibleItems={6}
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
            {installed && (
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
            )}
          </View>
          {!installed && (
            <Text
              size={1}
              color={`${theme.textPrimary}88`}
              numberOfLines={2}
              style={styles.tileSub}
            >
              {!gamePath
                ? t("settings_samp_need_bottle", {
                    defaultValue: "Link a bottle with GTA: SA first.",
                  })
                : detectedLabel}
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
                  maxVisibleItems={7}
                />
              </View>
              {renderSampAction()}
            </View>
          )}
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
  refreshChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
    paddingVertical: sc(4),
    paddingHorizontal: sc(10),
    borderRadius: sc(999),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
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
  tileHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
    flexShrink: 1,
  },
  finderButton: {
    paddingVertical: sc(5),
    paddingHorizontal: sc(8),
    borderRadius: sc(6),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  pill: {
    paddingVertical: sc(3),
    paddingHorizontal: sc(10),
    borderRadius: sc(999),
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(5),
    paddingVertical: sc(5),
    paddingHorizontal: sc(10),
    borderRadius: sc(999),
    borderWidth: 1,
    alignSelf: "flex-start",
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
    borderRadius: sc(999),
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});

export default Overview;
