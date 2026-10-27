import { invoke } from "@tauri-apps/api";
import { t } from "i18next";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import IOSSwitch from "../../../components/IOSSwitch";
import Text from "../../../components/Text";
import { useMessageBox } from "../../../states/messageModal";
import { useSettings } from "../../../states/settings";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";

// A labelled row with an iOS-style switch on the right and help text below.
// `nested` indents the row and draws a branch glyph (Detailed debug hangs off
// Debug logging). `trailing` renders before the switch (the Show logs button).
const ToggleRow = ({
  label,
  help,
  value,
  onChange,
  disabled,
  nested,
  trailing,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  nested?: boolean;
  trailing?: React.ReactNode;
}) => {
  const { theme } = useTheme();
  return (
    <View style={[{ opacity: disabled ? 0.5 : 1 }, nested && styles.nestedRow]}>
      <View style={styles.toggleHead}>
        {nested && (
          <Text size={2} color={`${theme.textPrimary}66`} style={styles.branch}>
            {"↳"}
          </Text>
        )}
        <Text
          semibold
          size={2}
          color={theme.textPrimary}
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {trailing}
        <IOSSwitch value={value} onChange={onChange} disabled={disabled} />
      </View>
      <Text
        size={1}
        color={`${theme.textPrimary}88`}
        style={[styles.sectionSub, nested && styles.nestedSub]}
        numberOfLines={2}
      >
        {help}
      </Text>
    </View>
  );
};

// Settings → Beta. Experimental / diagnostic toggles: debug logging and the
// macOS audio crash fix. Kept apart from Advanced because they change launch
// behaviour and can produce large logs.
const Beta = () => {
  const { theme } = useTheme();
  const { showMessageBox } = useMessageBox();
  const {
    gtasaPath,
    debugMode,
    setDebugMode,
    debugDetailed,
    setDebugDetailed,
    audioFix,
    setAudioFix,
    renderFix,
    setRenderFix,
  } = useSettings();

  const revealLogs = () => {
    invoke("open_in_finder", { path: `${gtasaPath}/omp-logs` }).catch(() =>
      showMessageBox({
        title: t("settings_debug_no_logs_title", { defaultValue: "No logs yet" }),
        description: t("settings_debug_no_logs_desc", {
          defaultValue:
            "Enable debug logging and launch the game once to generate logs.",
        }),
        boxWidth: 380,
        buttons: [{ title: t("close"), onPress: () => {} }],
      })
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text
        size={1}
        color={`${theme.textPrimary}88`}
        style={styles.sectionSub}
        numberOfLines={0}
      >
        {t("settings_beta_intro", {
          defaultValue:
            "Experimental tools. They change how the game launches and may affect performance — leave the defaults unless you're troubleshooting.",
        })}
      </Text>

      <View
        style={[styles.divider, { backgroundColor: `${theme.textPrimary}14` }]}
      />

      <ToggleRow
        label={t("settings_debug_label", { defaultValue: "Debug logging" })}
        help={t("settings_debug_help", {
          defaultValue:
            "Logs each launch to <game>/omp-logs/, one file per session.",
        })}
        value={debugMode}
        onChange={setDebugMode}
        trailing={
          debugMode && gtasaPath ? (
            <Pressable
              onPress={revealLogs}
              style={({ hovered }: any) => [
                styles.showLogsBtn,
                {
                  borderColor: `${theme.primary}55`,
                  backgroundColor: hovered
                    ? `${theme.primary}22`
                    : `${theme.primary}12`,
                },
              ]}
            >
              <Text size={1} semibold color={theme.primary}>
                {t("settings_debug_show_logs", { defaultValue: "Show logs" })}
              </Text>
            </Pressable>
          ) : null
        }
      />

      {debugMode && (
        <ToggleRow
          nested
          label={t("settings_debug_detailed_label", {
            defaultValue: "Detailed debug",
          })}
          help={t("settings_debug_detailed_help", {
            defaultValue:
              "Traces everything — large files, slower game. For hard crashes only.",
          })}
          value={debugDetailed}
          onChange={setDebugDetailed}
        />
      )}

      <View
        style={[styles.divider, { backgroundColor: `${theme.textPrimary}14` }]}
      />

      <ToggleRow
        label={t("settings_audio_fix_label", { defaultValue: "Audio fix" })}
        help={t("settings_audio_fix_help", {
          defaultValue:
            "Pins a safe audio format and, on launch, explains how to dodge the macOS/CrossOver audio crash (switch output device or lower in-game audio). Off reverts to Wine default.",
        })}
        value={audioFix}
        onChange={setAudioFix}
      />

      <View
        style={[styles.divider, { backgroundColor: `${theme.textPrimary}14` }]}
      />

      <ToggleRow
        label={t("settings_render_fix_label", { defaultValue: "Render fix" })}
        help={t("settings_render_fix_help", {
          defaultValue:
            "Steers GTA's renderer off the CrossOver texture-crash path (backbuffer offscreen mode, no command-stream threading). Disable only if you see graphical glitches. Off reverts to Wine default.",
        })}
        value={renderFix}
        onChange={setRenderFix}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: sc(14),
    paddingTop: sc(16),
    paddingBottom: sc(12),
    gap: sc(8),
  },
  sectionSub: {
    lineHeight: sc(16),
  },
  toggleHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(12),
  },
  nestedRow: {
    marginLeft: sc(14),
  },
  branch: {
    marginRight: sc(2),
  },
  nestedSub: {
    marginLeft: sc(18),
  },
  showLogsBtn: {
    paddingVertical: sc(4),
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
  divider: {
    height: 1,
    marginVertical: sc(6),
  },
});

export default Beta;
