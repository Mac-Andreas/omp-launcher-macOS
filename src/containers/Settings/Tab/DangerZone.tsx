import { invoke } from "@tauri-apps/api";
import { t } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import HoldToConfirmButton from "../../../components/HoldToConfirmButton";
import Text from "../../../components/Text";
import { useMessageBox } from "../../../states/messageModal";
import { useSettings } from "../../../states/settings";
import { useTheme } from "../../../states/theme";
import {
  clearSampUserCache,
  detectInstalledSampVersion,
  uninstallSelectedBottleSampFiles,
} from "../../../utils/game";
import { getSampVersionName } from "../../../utils/helpers";
import { sc } from "../../../utils/sizeScaler";
import { stateStorage } from "../../../utils/stateStorage";
import { SAMPDLLVersions } from "../../../utils/types";

interface MacosHealth {
  crossover: boolean;
  game_exe: boolean;
  rockstar_launcher: boolean;
  game_path: string;
  bottle: string;
}

type DetectedVersion = Awaited<ReturnType<typeof detectInstalledSampVersion>>;

// Settings > Danger Zone. Two destructive actions, both hold-5s-to-confirm:
//  - Uninstall SA-MP: removes samp.dll + omp-client.dll + bundled shared
//    assets from the game folder. Label adapts to the detected SA-MP version.
//  - Reset application data: wipes persisted state and reloads.
const DangerZone = () => {
  const { theme } = useTheme();
  const { bottleName } = useSettings();
  const { showMessageBox } = useMessageBox();
  const [gamePath, setGamePath] = useState<string>("");
  const [detected, setDetected] = useState<DetectedVersion>("none");
  const [working, setWorking] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const refresh = useCallback(() => {
    invoke<MacosHealth>("get_macos_health", { bottleName })
      .then(async (h) => {
        const path = h.game_exe ? h.game_path || "" : "";
        setGamePath(path);
        if (path) setDetected(await detectInstalledSampVersion(path));
        else setDetected("none");
      })
      .catch(() => {
        setGamePath("");
        setDetected("none");
      });
  }, [bottleName]);

  useEffect(() => refresh(), [refresh]);

  const installed = detected !== "none";
  const versionLabel =
    detected === "custom"
      ? t("settings_samp_custom", { defaultValue: "Custom samp.dll" })
      : detected === "none"
      ? t("settings_samp_not_installed", { defaultValue: "Not installed" })
      : getSampVersionName(detected as SAMPDLLVersions);

  const handleUninstall = async () => {
    if (!gamePath || working) return;
    try {
      setWorking(true);
      await uninstallSelectedBottleSampFiles(gamePath);
      setWorking(false);
      refresh();
    } catch (error) {
      setWorking(false);
      showMessageBox({
        title: t("samp_uninstall_failed_title"),
        description: String(error),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    }
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    try {
      setClearingCache(true);
      await clearSampUserCache();
      setClearingCache(false);
      showMessageBox({
        title: t("settings_danger_cache_done_title", {
          defaultValue: "Cache cleared",
        }),
        description: t("settings_danger_cache_done_desc", {
          defaultValue:
            "SA-MP / open.mp config, chat logs and client settings were removed.",
        }),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    } catch (error) {
      setClearingCache(false);
      showMessageBox({
        title: t("settings_danger_cache_failed_title", {
          defaultValue: "Could not clear cache",
        }),
        description: String(error),
        boxWidth: 420,
        buttons: [{ title: t("close"), onPress: () => {} }],
      });
    }
  };

  const handleReset = () => {
    stateStorage.clear();
    localStorage.clear();
    window.location.reload();
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.tiles}>
        <View style={styles.tileRow}>
        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
            },
          ]}
        >
          <View style={styles.tileHead}>
            <Text
              semibold
              size={1}
              color={`${theme.textPrimary}99`}
              style={styles.sectionLabel}
              numberOfLines={1}
            >
              {t("settings_danger_samp_label", {
                defaultValue: "SA-MP CLIENT FILES",
              })}
            </Text>
            <View
              style={[
                styles.statePill,
                {
                  backgroundColor: installed
                    ? "#3FB9501F"
                    : `${theme.textPrimary}10`,
                  borderColor: installed
                    ? "#3FB95066"
                    : `${theme.textPrimary}22`,
                },
              ]}
            >
              <Text
                size={1}
                semibold
                color={installed ? "#3FB950" : `${theme.textPrimary}AA`}
                numberOfLines={1}
              >
                {installed ? versionLabel : t("settings_samp_not_installed", { defaultValue: "Not installed" })}
              </Text>
            </View>
          </View>
          <Text
            size={1}
            color={`${theme.textPrimary}AA`}
            style={styles.help}
            numberOfLines={0}
          >
            {installed
              ? t("settings_danger_samp_help_installed_short", {
                  defaultValue:
                    "Removes the SA-MP client files this launcher added; reverts every change made to the game folder.",
                })
              : t("settings_danger_samp_help_none_short", {
                  defaultValue:
                    "No SA-MP install detected. Install from Overview first.",
                })}
          </Text>
          <HoldToConfirmButton
            label={
              installed
                ? t("settings_danger_uninstall_short", {
                    defaultValue: "Uninstall {{v}}",
                    v: versionLabel,
                  })
                : t("settings_uninstall_samp_files")
            }
            holdingLabel={t("settings_hold_to_confirm", {
              defaultValue: "Hold to confirm…",
            })}
            holdMs={3000}
            onConfirm={handleUninstall}
            danger
            disabled={!installed || !gamePath}
            busy={working}
            busyLabel={t("settings_danger_uninstalling", {
              defaultValue: "Uninstalling…",
            })}
          />
        </View>

        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
            },
          ]}
        >
          <View style={styles.tileHead}>
            <Text
              semibold
              size={1}
              color={`${theme.textPrimary}99`}
              style={styles.sectionLabel}
              numberOfLines={1}
            >
              {t("settings_danger_cache_label", {
                defaultValue: "SA-MP CACHE & LOGS",
              })}
            </Text>
          </View>
          <Text
            size={1}
            color={`${theme.textPrimary}AA`}
            style={styles.help}
            numberOfLines={0}
          >
            {t("settings_danger_cache_help_short", {
              defaultValue:
                "Deletes omp.cfg, chat logs and client settings. Save games and screenshots are kept.",
            })}
          </Text>
          <HoldToConfirmButton
            label={t("settings_danger_clear_cache_short", {
              defaultValue: "Clear cache & logs",
            })}
            holdingLabel={t("settings_hold_to_confirm", {
              defaultValue: "Hold to confirm…",
            })}
            holdMs={3000}
            onConfirm={handleClearCache}
            danger
            busy={clearingCache}
            busyLabel={t("settings_danger_clearing_cache", {
              defaultValue: "Clearing…",
            })}
          />
        </View>
        </View>

        <View
          style={[
            styles.tile,
            {
              borderColor: `${theme.textPrimary}14`,
              backgroundColor: theme.itemBackgroundColor,
            },
          ]}
        >
          <View style={styles.tileHead}>
            <Text
              semibold
              size={1}
              color={`${theme.textPrimary}99`}
              style={styles.sectionLabel}
              numberOfLines={1}
            >
              {t("settings_danger_reset_label", {
                defaultValue: "LAUNCHER DATA",
              })}
            </Text>
          </View>
          <Text
            size={1}
            color={`${theme.textPrimary}AA`}
            style={styles.help}
            numberOfLines={0}
          >
            {t("settings_danger_reset_help_short", {
              defaultValue:
                "Wipes nickname, bottle, favorites and per-server overrides, then reloads.",
            })}
          </Text>
          <HoldToConfirmButton
            label={t("settings_danger_reset_short", {
              defaultValue: "Reset launcher data",
            })}
            holdingLabel={t("settings_hold_to_confirm", {
              defaultValue: "Hold to confirm…",
            })}
            holdMs={3000}
            onConfirm={handleReset}
            danger
          />
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: sc(14),
    paddingVertical: sc(12),
  },
  tiles: {
    flexDirection: "column",
    gap: sc(8),
  },
  tileRow: {
    flexDirection: "row",
    gap: sc(8),
    alignItems: "stretch",
  },
  tile: {
    flex: 1,
    borderRadius: sc(10),
    borderWidth: 1,
    padding: sc(10),
    gap: sc(8),
  },
  tileHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sc(6),
  },
  sectionLabel: {
    letterSpacing: 1,
    flexShrink: 1,
  },
  statePill: {
    paddingVertical: sc(2),
    paddingHorizontal: sc(8),
    borderRadius: sc(999),
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  help: {
    flex: 1,
    lineHeight: sc(16),
  },
});

export default DangerZone;
