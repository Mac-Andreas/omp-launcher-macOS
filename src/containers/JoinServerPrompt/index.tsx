import { fs } from "@tauri-apps/api";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import DropdownList from "../../components/DropdownList";
import FeatureDisabledOverlay from "../../components/FeatureDisabledOverlay";
import Icon from "../../components/Icon";
import StaticModal from "../../components/StaticModal";
import Text from "../../components/Text";
import { IN_GAME } from "../../constants/app";
import { images } from "../../constants/images";
import { useJoinServerPrompt } from "../../states/joinServerPrompt";
import { usePersistentServers, useServers } from "../../states/servers";
import { useSettings } from "../../states/settings";
import { useTheme } from "../../states/theme";
import { startGame } from "../../utils/game";
import {
  getSampVersionFromName,
  getSampVersionName,
  getSampVersions,
} from "../../utils/helpers";
import { sc } from "../../utils/sizeScaler";
import { SAMPDLLVersions } from "../../utils/types";

const JoinServerPrompt = () => {
  const { visible, server, showPrompt } = useJoinServerPrompt();
  const {
    getServerSettings,
    setServerSettings,
    updateInFavoritesList,
    updateInRecentlyJoinedList,
    perServerSettings,
  } = usePersistentServers();
  const { updateServer } = useServers();
  const { height, width } = useWindowDimensions();
  const { theme, themeType } = useTheme();
  const [password, setPassword] = useState("");
  const [detectedVersion, setDetectedVersion] = useState<{
    key: string;
    version: SAMPDLLVersions;
  }>();
  const versionRequest = useRef(0);
  const [perServerNickname, setPerServerNickname] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { nickName, gtasaPath, recentNicknames } = useSettings();

  const settings = useMemo(() => {
    if (server) {
      return getServerSettings(server);
    }
    return undefined;
  }, [server, perServerSettings]);

  const versionKey = server ? `${server.ip}:${server.port}:${gtasaPath}` : "";
  const selectedVersion =
    settings?.sampVersion ??
    (detectedVersion?.key === versionKey ? detectedVersion.version : undefined);

  useEffect(() => {
    const request = ++versionRequest.current;
    setDetectedVersion(undefined);
    if (!visible || !server || settings?.sampVersion) return;

    const detectVersion = async () => {
      const version = await getInitialSampVersion();
      if (versionRequest.current === request) {
        setDetectedVersion({ key: versionKey, version });
      }
    };
    detectVersion();

    return () => {
      versionRequest.current++;
    };
  }, [
    visible,
    versionKey,
    server?.version,
    server?.rules?.artwork,
    server?.rules?.allowed_clients,
    settings?.sampVersion,
  ]);

  useEffect(() => {
    if (settings) {
      setPerServerNickname(settings.nickname || "");
    } else {
      setPerServerNickname("");
    }
  }, [visible, server?.ip, server?.port]);

  useEffect(() => {
    setPassword(server && server.password ? server.password : "");
  }, [server]);

  const bannerUrl = useMemo(() => {
    if (server && server.omp) {
      if (themeType === "dark") {
        if (server.omp.bannerDark && server.omp.bannerDark.length)
          return server.omp.bannerDark;
      } else {
        if (server.omp.bannerLight && server.omp.bannerLight.length)
          return server.omp.bannerLight;
      }
    }
    return "";
  }, [server]);

  const logoUrl = useMemo(() => {
    if (server && server.omp) {
      if (server.omp.logo && server.omp.logo.length) return server.omp.logo;
    }
    return "";
  }, [server]);

  const bigView = bannerUrl.length || logoUrl.length;

  const HEIGHT = (server?.hasPassword ? 316 : 248) + (bigView ? 77 : 7);
  const WIDTH = 320;

  const dynamicStyles = useMemo(
    () => ({
      container: {
        top: height / 2 - HEIGHT / 2 - 25,
        left: width / 2 - WIDTH / 2,
        height: HEIGHT,
        width: WIDTH,
        backgroundColor: theme.secondary,
        paddingTop: bigView ? sc(0) : sc(11),
      },
      bannerContainer: {
        backgroundColor: theme.itemBackgroundColor,
      },
      logoContainer: {
        backgroundColor: theme.itemBackgroundColor,
        borderColor: theme.serverListItemBackgroundColor,
      },
      passwordInput: {
        color: theme.textPrimary,
        backgroundColor: theme.textInputBackgroundColor,
      },
      nicknameInput: {
        color: perServerNickname.length
          ? theme.textPrimary
          : `${theme.textPrimary}BB`,
        fontStyle: perServerNickname.length ? "normal" : "italic",
        backgroundColor: theme.textInputBackgroundColor,
      },
      connectButton: {
        backgroundColor: theme.primary,
      },
      versionDropdown: {
        backgroundColor: theme.textInputBackgroundColor,
      },
      closeButton: bigView
        ? {
            backgroundColor: theme.primary,
          }
        : {},
    }),
    [height, width, HEIGHT, WIDTH, theme, bigView, perServerNickname.length]
  );

  const getInitialSampVersion = async (): Promise<SAMPDLLVersions> => {
    try {
      if (await fs.exists(`${gtasaPath}/samp.dll`)) return "custom";
    } catch (error) {
      console.error("Could not check for samp.dll:", error);
    }

    if (server?.version.includes("0.3.7")) {
      return "037R5_samp.dll";
    } else if (server?.rules["artwork"] === "Yes") {
      return "03DL_samp.dll";
    } else if (server?.rules["allowed_clients"]?.includes("0.3.DL")) {
      return "03DL_samp.dll";
    } else {
      return "037R5_samp.dll";
    }
  };

  const handleNicknameChange = useCallback(
    (text: string) => {
      setPerServerNickname(text);

      if (server) {
        if (settings) {
          setServerSettings(server, text, settings.sampVersion);
        } else {
          setServerSettings(server, text, undefined);
        }
      }
    },
    [server, settings, setServerSettings]
  );

  const openDropdown = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setDropdownOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setDropdownOpen(false), 150);
  }, []);

  const handleRecentNicknamePress = useCallback(
    (name: string) => {
      setPerServerNickname(name);
      if (server) {
        if (settings) {
          setServerSettings(server, name, settings.sampVersion);
        } else {
          setServerSettings(server, name, undefined);
        }
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setDropdownOpen(false);
    },
    [server, settings, setServerSettings]
  );

  const handleConnect = useCallback(() => {
    if (server && selectedVersion) {
      if (server.hasPassword && password.length) {
        const srvCpy = { ...server };
        srvCpy.password = password;

        updateServer(srvCpy);
        updateInFavoritesList(srvCpy);
        updateInRecentlyJoinedList(srvCpy);
      }

      startGame(
        server,
        perServerNickname.length ? perServerNickname : nickName,
        gtasaPath,
        server.hasPassword ? password : "",
        selectedVersion
      );
      showPrompt(false);
    }
  }, [
    server,
    password,
    perServerNickname,
    nickName,
    gtasaPath,
    selectedVersion,
    updateServer,
    updateInFavoritesList,
    updateInRecentlyJoinedList,
    showPrompt,
  ]);

  const handleVersionChange = useCallback(
    async (value: string) => {
      const version = getSampVersionFromName(value);
      if (server) {
        if (settings) {
          setServerSettings(server, perServerNickname, version);
        } else {
          setServerSettings(server, perServerNickname || undefined, version);
        }
        versionRequest.current++;
        setDetectedVersion({ key: versionKey, version });
      }
    },
    [server, settings, perServerNickname, setServerSettings, versionKey]
  );

  if (!visible) {
    return null;
  }

  return (
    <StaticModal onDismiss={() => showPrompt(false)}>
      <View style={[styles.container, dynamicStyles.container]}>
        {bigView ? (
          <View style={[styles.bannerContainer, dynamicStyles.bannerContainer]}>
            <Image
              source={{ uri: bannerUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {logoUrl.length ? (
          <View style={styles.logoSection}>
            <View style={[styles.logoContainer, dynamicStyles.logoContainer]}>
              <Image
                source={{ uri: logoUrl }}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Icon
              svg
              image={
                server?.hasPassword ? images.icons.locked : images.icons.play
              }
              size={sc(30)}
              color={server?.hasPassword ? "#36363F" : theme.primary}
            />
          </View>
        ) : (
          <Icon
            style={styles.iconOnly}
            svg
            image={
              server?.hasPassword ? images.icons.locked : images.icons.play
            }
            size={sc(30)}
            color={server?.hasPassword ? "#36363F" : theme.primary}
          />
        )}

        <View style={styles.serverInfo}>
          <Text semibold color={theme.textPrimary} size={2}>
            {t("server")}:{" "}
            <Text medium color={theme.textPrimary} size={2}>
              {server?.hostname}
            </Text>
          </Text>
          <Text semibold color={theme.textPrimary} size={2}>
            {t("address")}:{" "}
            <Text medium color={theme.textPrimary} size={2}>
              {server?.ip}:{server?.port}
            </Text>
          </Text>
          <Text semibold color={theme.textPrimary} size={2}>
            {t("players")}:{" "}
            <Text medium color={theme.textPrimary} size={2}>
              {server?.playerCount}/{server?.maxPlayers}
            </Text>
          </Text>
        </View>
        {server?.hasPassword && (
          <View style={styles.passwordSection}>
            <Text semibold color={theme.textPrimary} size={2} numberOfLines={2}>
              {t("server_join_prompt_enter_password")}
            </Text>
            <TextInput
              placeholderTextColor={theme.textPlaceholder}
              placeholder={t(
                "server_join_prompt_enter_password_input_placeholder"
              )}
              value={password}
              onChangeText={setPassword}
              style={[styles.textInput, dynamicStyles.passwordInput]}
            />
          </View>
        )}
        <View>
          <View style={styles.nicknameSection}>
            <Text semibold color={theme.textPrimary} size={2}>
              {t("nickname")}:
            </Text>
            <View style={styles.nicknameInputWrapper}>
              <TextInput
                placeholderTextColor={theme.textPlaceholder}
                placeholder={nickName}
                value={perServerNickname}
                onChangeText={handleNicknameChange}
                onFocus={openDropdown}
                onBlur={closeDropdown}
                // @ts-ignore
                style={[styles.textInput, dynamicStyles.nicknameInput]}
              />
              {dropdownOpen && recentNicknames.length > 0 && (
                <View
                  style={[
                    styles.dropdown,
                    {
                      backgroundColor: theme.itemBackgroundColor,
                      borderColor: theme.textSecondary,
                    },
                  ]}
                >
                  {recentNicknames.map((name) => (
                    <Pressable
                      key={name}
                      onPress={() => handleRecentNicknamePress(name)}
                      style={styles.dropdownItem}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dropdownItemText,
                          { color: theme.textPrimary },
                        ]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.connectButton, dynamicStyles.connectButton]}
            onPress={handleConnect}
            disabled={!selectedVersion}
          >
            <Text semibold color={"#FFFFFF"} size={2}>
              {t("connect")}
            </Text>
          </TouchableOpacity>
          <View style={styles.versionSection}>
            <Text semibold color={theme.textPrimary} size={2}>
              {t("samp_version")}:
            </Text>
            <DropdownList
              style={[styles.versionDropdown, dynamicStyles.versionDropdown]}
              value={selectedVersion && getSampVersionName(selectedVersion)}
              items={getSampVersions().map((version) =>
                getSampVersionName(version)
              )}
              onChange={handleVersionChange}
            />
          </View>
          {IN_GAME && <FeatureDisabledOverlay style={styles.overlay} />}
        </View>

        <TouchableOpacity
          style={[
            bigView ? styles.closeButtonBigView : styles.closeButtonNormal,
            dynamicStyles.closeButton,
          ]}
          onPress={() => showPrompt(false)}
        >
          <Icon
            image={images.icons.close}
            size={bigView ? sc(15) : sc(20)}
            color={bigView ? "white" : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </StaticModal>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    borderRadius: sc(10),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    alignItems: "center",
    paddingVertical: sc(11),
    overflow: "visible",
  },
  bannerContainer: {
    width: "100%",
    height: 70 + sc(11),
    marginHorizontal: "5%",
    overflow: "hidden",
    borderTopLeftRadius: sc(10),
    borderTopRightRadius: sc(10),
  },
  bannerImage: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    width: "100%",
  },
  logoSection: {
    marginTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingRight: sc(20),
    paddingLeft: sc(10),
  },
  logoContainer: {
    marginTop: -40,
    marginBottom: -10,
    height: 70,
    width: 70,
    borderRadius: 1000,
    borderWidth: 2,
    overflow: "hidden",
  },
  logoImage: {
    height: "100%",
    width: "100%",
  },
  iconOnly: {
    marginTop: 7,
  },
  serverInfo: {
    width: "100%",
    paddingHorizontal: 15,
    marginTop: 10,
  },
  passwordSection: {
    marginTop: sc(15),
    width: 300,
    alignSelf: "center",
  },
  nicknameSection: {
    marginTop: sc(10),
    zIndex: 1,
  },
  nicknameInputWrapper: {
    position: "relative",
  },
  dropdown: {
    position: "absolute",
    top: sc(43),
    left: 0,
    width: 300,
    borderRadius: sc(5),
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 100,
  },
  dropdownItem: {
    paddingHorizontal: sc(8),
    paddingVertical: sc(7),
  },
  dropdownItemText: {
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(15),
  },
  textInput: {
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(17),
    paddingHorizontal: sc(10),
    width: 300,
    marginTop: sc(5),
    height: sc(38),
    borderRadius: sc(5),
    // @ts-ignore
    outlineStyle: "none",
  },
  connectButton: {
    top: sc(52),
    width: 300,
    height: sc(38),
    borderRadius: sc(5),
    justifyContent: "center",
    alignItems: "center",
  },
  versionSection: {
    top: -sc(28),
    width: 300,
    flexDirection: "row",
    alignItems: "center",
  },
  versionDropdown: {
    marginLeft: sc(10),
    height: sc(30),
    flex: 1,
  },
  overlay: {
    top: sc(80),
    bottom: sc(20),
  },
  closeButtonBigView: {
    position: "absolute",
    top: sc(5),
    right: sc(5),
    height: sc(30),
    width: sc(30),
    borderRadius: sc(3),
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  closeButtonNormal: {
    position: "absolute",
    top: sc(15),
    right: sc(15),
    height: sc(20),
    width: sc(20),
    zIndex: 0,
  },
});

export default JoinServerPrompt;
