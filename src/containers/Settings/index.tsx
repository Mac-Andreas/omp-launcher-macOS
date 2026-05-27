import { shell } from "@tauri-apps/api";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Icon from "../../components/Icon";
import StaticModal from "../../components/StaticModal";
import TabBar from "../../components/TabBar";
import Text from "../../components/Text";
import { images } from "../../constants/images";
import { useGenericPersistentState } from "../../states/genericStates";
import { useSettingsModal } from "../../states/settingsModal";
import { useTheme } from "../../states/theme";
import { sc } from "../../utils/sizeScaler";
import Advanced from "./Tab/Advanced";
import DangerZone from "./Tab/DangerZone";
import General from "./Tab/General";
import Languages from "./Tab/Languages";
import License from "./Tab/License";
import i18n from "../../locales";

const MODAL_MAX_WIDTH = 720;
const MODAL_MAX_HEIGHT = 540;
const TITLEBAR_HEIGHT = 25;
// Keep the modal off the window edges when the window is small / tiled.
const MODAL_MARGIN_X = 32;
const MODAL_MARGIN_Y = 56;

type TabType =
  | "general"
  | "languages"
  | "advanced"
  | "danger"
  | "license";

const SettingsModal = () => {
  const { height, width } = useWindowDimensions();
  const { theme } = useTheme();
  const { hide, visible } = useSettingsModal();
  const [selectedTab, setSelectedTab] = useState<TabType>("general");
  const { language } = useGenericPersistentState();

  const tabs = useMemo(
    () => [
      {
        label: t("settings_tab_overview", { defaultValue: "Overview" }),
        type: "general",
        icon: images.icons.game,
      },
      {
        label: t("settings_tab_preferences", { defaultValue: "Preferences" }),
        type: "languages",
        icon: images.icons.language,
      },
      {
        label: t("settings_tab_advanced", { defaultValue: "Advanced" }),
        type: "advanced",
        icon: images.icons.mode,
      },
      {
        label: t("settings_tab_danger", { defaultValue: "Danger Zone" }),
        type: "danger",
        icon: images.icons.warning,
      },
      {
        label: t("settings_tab_license", { defaultValue: "License" }),
        type: "license",
        icon: images.icons.locked,
      },
    ],
    [t, i18n.language]
  );

  const tabComponents = useMemo(
    () => ({
      general: <General />,
      languages: <Languages />,
      advanced: <Advanced />,
      license: <License />,
      danger: <DangerZone />,
    }),
    []
  );

  const handleTabChange = useCallback((type: TabType) => {
    setSelectedTab(type);
  }, []);

  const handleDismiss = useCallback(() => {
    hide();
  }, [hide]);

  const handleOpenMpPress = useCallback(() => {
    shell.open("https://open.mp/");
  }, []);

  const handleGithubPress = useCallback(() => {
    shell.open("https://github.com/Mac-Andreas/omp-launcher-macOS");
  }, []);

  const handleUpstreamPress = useCallback(() => {
    shell.open("https://github.com/openmultiplayer/launcher");
  }, []);

  const handleMacPortPress = useCallback(() => {
    shell.open(
      "https://forum.open.mp/member.php?action=profile&uid=4409"
    );
  }, []);

  // Esc closes the settings modal, matching the backdrop click / close button.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, hide]);

  if (!visible) {
    return null;
  }

  const modalWidth = Math.max(
    320,
    Math.min(MODAL_MAX_WIDTH, width - MODAL_MARGIN_X)
  );
  const modalHeight = Math.max(
    360,
    Math.min(MODAL_MAX_HEIGHT, height - MODAL_MARGIN_Y)
  );

  return (
    <StaticModal onDismiss={handleDismiss} key={"settings-" + language}>
      <View
        style={[
          styles.container,
          {
            top: Math.max(
              TITLEBAR_HEIGHT,
              height / 2 - modalHeight / 2 - TITLEBAR_HEIGHT
            ),
            left: width / 2 - modalWidth / 2,
            height: modalHeight,
            width: modalWidth,
            backgroundColor: theme.secondary,
            borderWidth: 1,
            borderColor: `${theme.textPrimary}1F`,
          },
        ]}
      >
        <TabBar
          list={tabs}
          onChange={(type) => handleTabChange(type as TabType)}
          selected={selectedTab}
          style={styles.tabBar}
        />
        <View
          style={[
            styles.tabDivider,
            { backgroundColor: `${theme.textPrimary}1F` },
          ]}
        />
        {tabComponents[selectedTab]}
        <View
          style={[
            styles.footerDivider,
            { backgroundColor: `${theme.textPrimary}14` },
          ]}
        />
        <View style={styles.appInfoContainer}>
          <View style={styles.footerLine}>
            <View style={styles.footerSegment}>
              <Text size={1} color={`${theme.textPrimary}99`}>
                {t("settings_credits_made", { defaultValue: "Made with" })}
              </Text>
              <Icon
                svg
                image={images.icons.heart}
                size={sc(13)}
                color="#E5534B"
              />
              <Text size={1} color={`${theme.textPrimary}99`}>
                {t("settings_credits_by", { defaultValue: "by" })}
              </Text>
              <Pressable style={styles.footerLink} onPress={handleOpenMpPress}>
                <Text size={1} semibold color={theme.primary}>
                  open.mp
                </Text>
                <Icon
                  svg
                  image={images.icons.external}
                  size={sc(9)}
                  color={theme.primary}
                />
              </Pressable>
            </View>
            <View
              style={[
                styles.footerDot,
                { backgroundColor: `${theme.textPrimary}33` },
              ]}
            />
            <Pressable style={styles.footerLink} onPress={handleGithubPress}>
              <Icon
                svg
                image={images.icons.github}
                size={sc(12)}
                color={theme.primary}
              />
              <Text size={1} semibold color={theme.primary}>
                {t("settings_credits_macos_source", {
                  defaultValue: "macOS source",
                })}
              </Text>
              <Icon
                svg
                image={images.icons.external}
                size={sc(9)}
                color={theme.primary}
              />
            </Pressable>
            <View
              style={[
                styles.footerDot,
                { backgroundColor: `${theme.textPrimary}33` },
              ]}
            />
            <Pressable
              style={styles.footerLink}
              onPress={handleUpstreamPress}
            >
              <Icon
                svg
                image={images.icons.github}
                size={sc(12)}
                color={theme.primary}
              />
              <Text size={1} semibold color={theme.primary}>
                {t("settings_credits_upstream_source", {
                  defaultValue: "Upstream source",
                })}
              </Text>
              <Icon
                svg
                image={images.icons.external}
                size={sc(9)}
                color={theme.primary}
              />
            </Pressable>
            <View
              style={[
                styles.footerDot,
                { backgroundColor: `${theme.textPrimary}33` },
              ]}
            />
            <View style={styles.footerSegment}>
              <Text size={1} color={`${theme.textPrimary}99`}>
                {t("settings_credits_macos_port", {
                  defaultValue: "macOS port by",
                })}
              </Text>
              <Pressable style={styles.footerLink} onPress={handleMacPortPress}>
                <Text size={1} semibold color={theme.primary}>
                  Xyranaut
                </Text>
                <Icon
                  svg
                  image={images.icons.external}
                  size={sc(9)}
                  color={theme.primary}
                />
              </Pressable>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={handleDismiss}>
          <Icon
            image={images.icons.close}
            size={sc(20)}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </StaticModal>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: sc(12),
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: sc(8),
    },
    shadowOpacity: 0.45,
    shadowRadius: sc(24),
  },
  tabBar: {
    height: sc(30),
    paddingHorizontal: sc(15),
    marginTop: sc(15),
  },
  tabDivider: {
    height: 1,
    marginTop: sc(10),
    marginHorizontal: sc(15),
    marginBottom: sc(4),
  },
  footerDivider: {
    height: 1,
    marginHorizontal: sc(15),
    marginTop: sc(2),
  },
  appInfoContainer: {
    minHeight: 30,
    paddingVertical: sc(10),
    justifyContent: "center",
    width: "100%",
    alignItems: "center",
  },
  footerLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: sc(10),
  },
  footerSegment: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(5),
  },
  footerDot: {
    width: sc(3),
    height: sc(3),
    borderRadius: sc(2),
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(4),
    // @ts-ignore
    cursor: "pointer",
  },
  closeButton: {
    position: "absolute",
    top: sc(15),
    right: sc(15),
    height: sc(20),
    width: sc(20),
  },
});

export default SettingsModal;
