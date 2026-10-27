import { t } from "i18next";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import IOSSwitch from "../../../components/IOSSwitch";
import Text from "../../../components/Text";
import { useSettings } from "../../../states/settings";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
import { checkTelemetryBackend } from "../../../utils/telemetry";

// Settings → Privacy. Anonymous-usage opt-out, mirroring the open.mp Server
// Launcher's privacy pane (backend-reachable status dot + a single toggle).
const Privacy = () => {
  const { theme } = useTheme();
  const { telemetryEnabled, setTelemetryEnabled } = useSettings();

  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  useEffect(() => {
    checkTelemetryBackend().then(setBackendReachable);
  }, []);

  // Opt-out: telemetry is on by default. Turning this off stops all sends
  // immediately (sendTelemetry early-returns when telemetryEnabled is false).
  const onToggle = (enabled: boolean) => {
    setTelemetryEnabled(enabled);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.card,
          {
            borderColor: `${theme.textPrimary}14`,
            backgroundColor: theme.itemBackgroundColor,
          },
        ]}
      >
        <View style={styles.head}>
          <Text semibold size={2} color={theme.textPrimary} style={{ flex: 1 }}>
            {t("settings_privacy_title", { defaultValue: "Anonymous usage data" })}
          </Text>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  backendReachable === true
                    ? "#3FB950"
                    : backendReachable === false
                    ? "#E5534B"
                    : `${theme.textPrimary}44`,
              },
            ]}
          />
        </View>
        <Text
          size={1}
          color={`${theme.textPrimary}AA`}
          style={styles.help}
          numberOfLines={0}
        >
          {t("settings_privacy_subtitle", {
            defaultValue:
              "Helps us prioritise fixes. Nothing identifying you, your servers or configs is ever sent — only a random per-install id counts unique users without revealing who they are.",
          })}
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text semibold size={2} color={theme.textPrimary}>
              {t("settings_privacy_toggle_label", {
                defaultValue: "Share anonymous usage data",
              })}
            </Text>
            <Text size={1} color={`${theme.textPrimary}88`}>
              {t("settings_privacy_toggle_sub", {
                defaultValue: "Toggle anytime; takes effect immediately.",
              })}
            </Text>
          </View>
          <IOSSwitch value={telemetryEnabled} onChange={onToggle} />
        </View>
      </View>
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
  card: {
    borderRadius: sc(10),
    borderWidth: 1,
    padding: sc(12),
    gap: sc(10),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
  },
  statusDot: {
    width: sc(9),
    height: sc(9),
    borderRadius: sc(5),
  },
  help: {
    lineHeight: sc(16),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(12),
  },
});

export default Privacy;
