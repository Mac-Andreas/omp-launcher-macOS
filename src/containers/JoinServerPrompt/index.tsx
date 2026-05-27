import { Clipboard } from "@react-native-clipboard/clipboard/dist/Clipboard.web";
import { fs, shell } from "@tauri-apps/api";
import { t } from "i18next";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
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
import { detectInstalledSampVersion, startGame } from "../../utils/game";
import { getSampVersionName } from "../../utils/helpers";
import { sc } from "../../utils/sizeScaler";
import { SAMPDLLVersions } from "../../utils/types";

const CARD_WIDTH = 400;
const BANNER_HEIGHT = 120;
const AVATAR_SIZE = 64;
const COPY_RESET_MS = 1500;

// Best-effort: pull the first http(s) URL from rules.weburl / rules.website /
// the server hostname so a "Website" link can be offered when present.
const extractWebsite = (
  rules: Record<string, string>,
  hostname: string
): string => {
  const candidates = [rules?.weburl, rules?.website, rules?.url, hostname];
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/https?:\/\/\S+/i);
    if (m) return m[0].replace(/[\s|,;]+$/, "");
  }
  return "";
};

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
  const [perServerVersion, setPerServerVersion] = useState<
    SAMPDLLVersions | undefined
  >();
  const [perServerNickname, setPerServerNickname] = useState("");
  const [copied, setCopied] = useState(false);
  const [installedSamp, setInstalledSamp] = useState<SAMPDLLVersions | undefined>(
    undefined
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { nickName, gtasaPath, sampVersion, setSampVersion } = useSettings();

  const settings = useMemo(() => {
    if (server) return getServerSettings(server);
    return undefined;
  }, [server, perServerSettings]);

  useEffect(() => {
    if (!settings?.sampVersion) {
      if (visible) setInitialSampVersion();
    } else if (perServerVersion) {
      setSampVersion(perServerVersion);
    }
  }, [visible, perServerVersion, settings?.sampVersion]);

  useEffect(() => {
    if (settings) {
      if (settings.nickname !== undefined) setPerServerNickname(settings.nickname);
      if (settings.sampVersion !== undefined) setPerServerVersion(settings.sampVersion);
    } else {
      setPerServerNickname("");
      setPerServerVersion(undefined);
    }
  }, [settings]);

  useEffect(() => {
    setPassword(server && server.password ? server.password : "");
  }, [server]);

  // Detect the SA-MP DLL actually sitting in the game folder so the dropdown
  // can show an "INSTALLED" badge against the matching entry and default to
  // it (instead of the generic "From GTASA Folder" placeholder) when neither
  // a per-server nor global preference is set.
  useEffect(() => {
    let cancelled = false;
    if (!visible || !gtasaPath) {
      setInstalledSamp(undefined);
      return;
    }
    detectInstalledSampVersion(gtasaPath)
      .then((d) => {
        if (cancelled) return;
        if (d === "none" || d === "custom") setInstalledSamp(undefined);
        else setInstalledSamp(d as SAMPDLLVersions);
      })
      .catch(() => {
        if (!cancelled) setInstalledSamp(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, gtasaPath]);

  // Clear pending copy reset on unmount / server change.
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  // Esc closes the prompt, matching the backdrop click / close button.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") showPrompt(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, showPrompt]);

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
  }, [server, themeType]);

  const logoUrl = useMemo(() => {
    if (server && server.omp && server.omp.logo && server.omp.logo.length) {
      return server.omp.logo;
    }
    return "";
  }, [server]);

  const discordUrl = server?.omp?.discordInvite || "";
  const websiteUrl = useMemo(
    () => (server ? extractWebsite(server.rules || {}, server.hostname) : ""),
    [server]
  );
  const hasPassword = !!server?.hasPassword;
  const CARD_HEIGHT = hasPassword ? 530 : 460;

  const dynamicStyles = useMemo(
    () => ({
      container: {
        top: height / 2 - CARD_HEIGHT / 2 - 25,
        left: width / 2 - CARD_WIDTH / 2,
        height: CARD_HEIGHT,
        width: CARD_WIDTH,
        backgroundColor: theme.secondary,
      },
      banner: {
        backgroundColor: theme.itemBackgroundColor,
      },
      avatarRing: {
        backgroundColor: theme.secondary,
        borderColor: theme.secondary,
      },
      avatarFill: {
        backgroundColor: theme.itemBackgroundColor,
      },
      divider: {
        backgroundColor: `${theme.textPrimary}1A`,
      },
      input: {
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
      pillNeutral: {
        backgroundColor: `${theme.textPrimary}14`,
      },
      pillPrimary: {
        backgroundColor: `${theme.primary}26`,
        borderColor: `${theme.primary}80`,
      },
      copyButton: {
        backgroundColor: copied ? `${theme.primary}26` : `${theme.textPrimary}10`,
        borderColor: copied ? `${theme.primary}AA` : `${theme.textPrimary}24`,
      },
      linkButton: {
        backgroundColor: `${theme.textPrimary}10`,
        borderColor: `${theme.textPrimary}1F`,
      },
    }),
    [height, width, CARD_HEIGHT, theme, perServerNickname.length, copied]
  );

  const setInitialSampVersion = useCallback(async () => {
    if (await fs.exists(`${gtasaPath}/samp.dll`)) {
      setPerServerVersion("custom");
    } else if (
      (server && server.version.includes("0.3.7")) ||
      (server && server.rules["artwork"] == undefined)
    ) {
      setPerServerVersion("037R5_samp.dll");
    } else if (
      server &&
      server.rules["artwork"] &&
      server.rules["artwork"] === "Yes"
    ) {
      setPerServerVersion("03DL_samp.dll");
    } else if (
      server &&
      server.rules["allowed_clients"] &&
      server.rules["allowed_clients"].includes("0.3.DL")
    ) {
      setPerServerVersion("03DL_samp.dll");
    } else {
      setPerServerVersion("037R5_samp.dll");
    }
  }, [gtasaPath, server]);

  const handleNicknameChange = useCallback(
    (text: string) => {
      if (!server) return;
      setServerSettings(server, text, settings?.sampVersion);
    },
    [server, settings, setServerSettings]
  );

  const handleCopyIp = useCallback(() => {
    if (!server) return;
    Clipboard.setString(`${server.ip}:${server.port}`);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
  }, [server]);

  const handleConnect = useCallback(() => {
    if (!server) return;
    if (server.hasPassword && password.length) {
      const srvCpy = { ...server, password };
      updateServer(srvCpy);
      updateInFavoritesList(srvCpy);
      updateInRecentlyJoinedList(srvCpy);
    }

    // The dropdown drives perServerVersion, but startGame reads the global
    // sampVersion (default "custom"). Without this the chosen version never
    // reaches startGame, so a machine with no samp.dll in the game folder
    // (typical on macOS) loops on the "Can't find SA-MP" modal.
    const effectiveVersion = perServerVersion ? perServerVersion : sampVersion;
    setSampVersion(effectiveVersion);

    startGame(
      server,
      perServerNickname.length ? perServerNickname : nickName,
      gtasaPath,
      server.hasPassword ? password : ""
    );
    showPrompt(false);
  }, [
    server,
    password,
    perServerNickname,
    nickName,
    gtasaPath,
    perServerVersion,
    sampVersion,
    setSampVersion,
    updateServer,
    updateInFavoritesList,
    updateInRecentlyJoinedList,
    showPrompt,
  ]);

  if (!visible) return null;

  // Resolution order for the dropdown's current value:
  //   1. explicit per-server pick
  //   2. global setting if user has changed it from "custom"
  //   3. the actually installed samp.dll version (if we managed to detect one)
  // When the result is still "custom" (a samp.dll we can't pin to a known
  // release), show the auto-detected version instead of "From GTASA Folder";
  // if detection found nothing, show "Not detected".
  const resolvedVersion: SAMPDLLVersions =
    perServerVersion ??
    (sampVersion !== "custom" ? sampVersion : installedSamp ?? sampVersion);
  const displayVersion: SAMPDLLVersions =
    resolvedVersion === "custom" ? installedSamp ?? "custom" : resolvedVersion;
  const currentVersionName =
    displayVersion === "custom"
      ? t("samp_version_not_detected", { defaultValue: "Not detected" })
      : getSampVersionName(displayVersion);

  return (
    <StaticModal onDismiss={() => showPrompt(false)}>
      <View style={[styles.container, dynamicStyles.container]}>
        <View style={[styles.banner, dynamicStyles.banner]}>
          {bannerUrl.length > 0 ? (
            <Image
              source={{ uri: bannerUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          ) : server?.partner || server?.usingOmp ? (
            <View style={styles.bannerFallback}>
              <Image
                source={{ uri: "logo-dark-trans.svg" }}
                style={styles.bannerFallbackLogo}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.bannerFallback}>
              <Text
                semibold
                color={`${theme.textPrimary}88`}
                style={styles.bannerUnknown}
              >
                ?
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => showPrompt(false)}
          >
            <Icon image={images.icons.close} size={sc(14)} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={[styles.avatarWrap, dynamicStyles.avatarRing]}>
          <View style={[styles.avatarFill, dynamicStyles.avatarFill]}>
            {logoUrl.length > 0 ? (
              <Image
                source={{ uri: logoUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : server?.partner || server?.usingOmp ? (
              <Image
                source={{
                  uri: themeType === "dark" ? images.icons.omp : images.icons.ompLight,
                }}
                style={styles.avatarOmp}
                resizeMode="contain"
              />
            ) : (
              <Text
                semibold
                size={4}
                color={`${theme.textPrimary}AA`}
                style={styles.avatarUnknown}
              >
                ?
              </Text>
            )}
          </View>
        </View>

        {/* Beside-avatar row: partner pill + player-count pill + Discord/Website
            buttons, right-aligned. Avatar is absolute-positioned (left), so
            this row starts past the avatar with paddingLeft. */}
        <View style={styles.besideAvatar}>
          <View style={styles.pillsRow}>
            {/* Order: open.mp, Partner/Internet, player count. Discord +
                Website live on the IP row below. Player count is always
                last. */}
            {server?.usingOmp && (
              <Tooltip
                text={t("server_join_prompt_omp_tooltip", {
                  defaultValue: "Runs the open.mp server software.",
                })}
              >
                <View
                  style={[
                    styles.pill,
                    styles.pillBordered,
                    dynamicStyles.pillPrimary,
                  ]}
                >
                  <Icon image={images.icons.omp} size={sc(12)} />
                  <Text
                    size={1}
                    semibold
                    color={theme.primary}
                    style={styles.pillText}
                  >
                    open.mp
                  </Text>
                </View>
              </Tooltip>
            )}
            {server?.partner ? (
              <Tooltip
                text={t("server_join_prompt_partner_tooltip", {
                  defaultValue: "Verified partner server of open.mp.",
                })}
              >
                <View
                  style={[
                    styles.pill,
                    styles.pillBordered,
                    dynamicStyles.pillPrimary,
                  ]}
                >
                  <Icon
                    svg
                    image={images.icons.partner}
                    size={sc(11)}
                    color={theme.primary}
                  />
                  <Text
                    size={1}
                    semibold
                    color={theme.primary}
                    style={styles.pillText}
                  >
                    {t("server_join_prompt_partner_label", {
                      defaultValue: "Partner",
                    })}
                  </Text>
                </View>
              </Tooltip>
            ) : (
              <Tooltip
                text={t("server_join_prompt_internet_tooltip", {
                  defaultValue: "Public server from the internet list.",
                })}
              >
                <View
                  style={[
                    styles.pill,
                    styles.pillBordered,
                    dynamicStyles.pillNeutral,
                    { borderColor: `${theme.textPrimary}24` },
                  ]}
                >
                  <Icon
                    svg
                    image={images.icons.internet}
                    size={sc(11)}
                    color={`${theme.textPrimary}AA`}
                  />
                  <Text
                    size={1}
                    semibold
                    color={theme.textPrimary}
                    style={styles.pillText}
                  >
                    {t("server_join_prompt_internet_label", {
                      defaultValue: "Internet",
                    })}
                  </Text>
                </View>
              </Tooltip>
            )}
            <View style={[styles.pill, dynamicStyles.pillNeutral]}>
              <Icon
                svg
                image={images.icons.nickname}
                size={sc(11)}
                color={themeType === "dark" ? "#FFFFFF" : `${theme.textPrimary}CC`}
              />
              <Text
                size={1}
                semibold
                color={theme.textPrimary}
                style={styles.pillText}
              >
                {server?.playerCount ?? 0}/{server?.maxPlayers ?? 0}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerBlock}>
          <Text
            semibold
            color={theme.textPrimary}
            size={3}
            numberOfLines={1}
            style={styles.serverName}
          >
            {server?.hostname || "—"}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
              <Text
                color={`${theme.textPrimary}99`}
                size={1}
                style={styles.serverIp}
                selectable
              >
                {server?.ip}:{server?.port}
              </Text>
              <Tooltip
                text={
                  copied
                    ? (t("copiedToClipboard", {
                        defaultValue: "Copied",
                      }) as string)
                    : (t("copy", { defaultValue: "Copy" }) as string)
                }
              >
                <Pressable
                  onPress={handleCopyIp}
                  style={[styles.copyButton, dynamicStyles.copyButton]}
                >
                  <Text
                    size={1}
                    semibold
                    color={copied ? theme.primary : `${theme.textPrimary}AA`}
                    style={styles.copyGlyph}
                  >
                    {copied ? "✓" : "⎘"}
                  </Text>
                </Pressable>
              </Tooltip>
            </View>
            {/* Discord + Website, right-aligned. Always shown — greyed and
                disabled when the server exposes no link. */}
            <View style={styles.metaLinks}>
              {(() => {
                const hasDiscord = discordUrl.length > 0;
                return (
                  <Tooltip
                    text={
                      hasDiscord
                        ? (t("server_join_prompt_discord_open", {
                            defaultValue: "Open the server's Discord",
                          }) as string)
                        : (t("server_join_prompt_discord_none", {
                            defaultValue: "No Discord link available",
                          }) as string)
                    }
                  >
                    <Pressable
                      disabled={!hasDiscord}
                      onPress={() => hasDiscord && shell.open(discordUrl)}
                      style={[
                        styles.linkButton,
                        dynamicStyles.linkButton,
                        !hasDiscord && styles.linkButtonDisabled,
                      ]}
                    >
                      <Icon
                        svg
                        image={images.icons.discord}
                        size={sc(13)}
                        color={`${theme.textPrimary}CC`}
                      />
                      <Text
                        size={1}
                        semibold
                        color={theme.textPrimary}
                        style={styles.linkText}
                      >
                        Discord
                      </Text>
                      {hasDiscord && (
                        <Icon
                          svg
                          image={images.icons.external}
                          size={sc(9)}
                          color={`${theme.textPrimary}99`}
                        />
                      )}
                    </Pressable>
                  </Tooltip>
                );
              })()}
              {(() => {
                const hasWebsite = websiteUrl.length > 0;
                return (
                  <Tooltip
                    text={
                      hasWebsite
                        ? (t("server_join_prompt_website_open", {
                            defaultValue: "Open the server's website",
                          }) as string)
                        : (t("server_join_prompt_website_none", {
                            defaultValue: "No website available",
                          }) as string)
                    }
                  >
                    <Pressable
                      disabled={!hasWebsite}
                      onPress={() => hasWebsite && shell.open(websiteUrl)}
                      style={[
                        styles.linkButton,
                        dynamicStyles.linkButton,
                        !hasWebsite && styles.linkButtonDisabled,
                      ]}
                    >
                      <Icon
                        svg
                        image={images.icons.link}
                        size={sc(13)}
                        color={`${theme.textPrimary}CC`}
                      />
                      <Text
                        size={1}
                        semibold
                        color={theme.textPrimary}
                        style={styles.linkText}
                      >
                        Website
                      </Text>
                    </Pressable>
                  </Tooltip>
                );
              })()}
            </View>
          </View>
        </View>

        <View style={[styles.divider, dynamicStyles.divider]} />

        <View style={styles.section}>
          <Text
            semibold
            size={1}
            color={`${theme.textPrimary}99`}
            style={styles.sectionTitle}
          >
            {t("server_join_prompt_personalise", { defaultValue: "PERSONALISE" })}
          </Text>

          {hasPassword && (
            <View style={styles.field}>
              <Text semibold color={theme.textPrimary} size={2}>
                {t("server_join_prompt_enter_password")}
              </Text>
              <TextInput
                placeholderTextColor={theme.textPlaceholder}
                placeholder={t(
                  "server_join_prompt_enter_password_input_placeholder"
                )}
                value={password}
                onChangeText={setPassword}
                style={[styles.textInput, dynamicStyles.input]}
                secureTextEntry
              />
            </View>
          )}

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text semibold color={theme.textPrimary} size={2}>
                {t("server_join_prompt_your_nickname", {
                  defaultValue: "Your Nickname",
                })}
              </Text>
              <Tooltip
                text={
                  t("server_join_prompt_nickname_tooltip", {
                    defaultValue:
                      "Personal nickname for this server. Overrides your global nickname only here.",
                  }) as string
                }
              >
                <View
                  style={[
                    styles.helpTip,
                    { borderColor: `${theme.textPrimary}40` },
                  ]}
                >
                  <Text size={1} semibold color={`${theme.textPrimary}99`}>
                    ?
                  </Text>
                </View>
              </Tooltip>
            </View>
            <TextInput
              placeholderTextColor={theme.textPlaceholder}
              placeholder={nickName}
              value={perServerNickname}
              onChangeText={handleNicknameChange}
              // @ts-ignore — RN-Web extends TextInput
              style={[styles.textInput, dynamicStyles.nicknameInput]}
            />
          </View>

          <View
            style={[
              styles.divider,
              dynamicStyles.divider,
              styles.innerDivider,
            ]}
          />

          <View style={styles.field}>
            <Text semibold color={theme.textPrimary} size={2}>
              {t("samp_version")}
            </Text>
            <View
              style={[
                styles.sampPill,
                styles.pillBordered,
                dynamicStyles.pillPrimary,
              ]}
            >
              <Icon
                svg
                image={images.icons.game}
                size={sc(13)}
                color={theme.primary}
              />
              <Text semibold color={theme.primary} size={1}>
                {currentVersionName}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.connectButton, dynamicStyles.connectButton]}
          onPress={handleConnect}
        >
          <Icon
            svg
            image={images.icons.play}
            size={sc(15)}
            color="#FFFFFF"
          />
          <Text semibold color={"#FFFFFF"} size={2} style={styles.connectLabel}>
            {t("connect")}
          </Text>
        </TouchableOpacity>

        {IN_GAME && <FeatureDisabledOverlay style={styles.overlay} />}
      </View>
    </StaticModal>
  );
};

// Themed hover tooltip. Renders a small bubble above the wrapped element on
// pointer-hover. RN-Web's onHoverIn / onHoverOut on Pressable drive it, so this
// works without depending on the OS's native title= behavior.
const Tooltip = ({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) => {
  const [hover, setHover] = useState(false);
  const { theme } = useTheme();
  return (
    <View style={tooltipStyles.wrap}>
      <Pressable
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        // @ts-ignore — RN-Web also forwards mouse events
        onPointerLeave={() => setHover(false)}
      >
        {children}
      </Pressable>
      {hover && text.length > 0 && (
        <View
          style={[
            tooltipStyles.bubble,
            {
              backgroundColor: theme.itemBackgroundColor,
              borderColor: `${theme.textPrimary}26`,
            },
          ]}
          pointerEvents="none"
        >
          <Text
            size={1}
            color={theme.textPrimary}
            style={tooltipStyles.bubbleText}
            numberOfLines={0}
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    borderRadius: sc(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  banner: {
    height: BANNER_HEIGHT,
    width: "100%",
    overflow: "hidden",
    borderTopLeftRadius: sc(14),
    borderTopRightRadius: sc(14),
  },
  bannerImage: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    width: "100%",
  },
  bannerFallback: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.32,
  },
  bannerFallbackLogo: {
    height: "65%",
    width: "65%",
  },
  closeButton: {
    position: "absolute",
    top: sc(8),
    right: sc(8),
    height: sc(26),
    width: sc(26),
    borderRadius: sc(13),
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3,
  },
  avatarWrap: {
    position: "absolute",
    top: BANNER_HEIGHT - AVATAR_SIZE / 2,
    left: sc(16),
    width: AVATAR_SIZE + sc(6),
    height: AVATAR_SIZE + sc(6),
    borderRadius: (AVATAR_SIZE + sc(6)) / 2,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 4,
  },
  avatarFill: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  besideAvatar: {
    paddingLeft: sc(16) + AVATAR_SIZE + sc(12),
    paddingRight: sc(16),
    marginTop: sc(8),
    gap: sc(6),
    minHeight: AVATAR_SIZE / 2 + sc(8),
  },
  headerBlock: {
    paddingHorizontal: sc(16),
    marginTop: sc(3),
  },
  serverName: {
    fontSize: sc(17),
    lineHeight: sc(22),
  },
  metaRow: {
    marginTop: sc(6),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sc(8),
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
    flexShrink: 1,
  },
  metaLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
  },
  serverIp: {
    // @ts-ignore
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  copyButton: {
    width: sc(22),
    height: sc(22),
    borderRadius: sc(6),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  copyGlyph: {
    fontSize: sc(13),
    lineHeight: sc(15),
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: sc(6),
  },
  avatarOmp: {
    height: "70%",
    width: "70%",
  },
  avatarUnknown: {
    fontSize: sc(34),
    lineHeight: sc(38),
  },
  bannerUnknown: {
    fontSize: sc(64),
    lineHeight: sc(72),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(4),
    paddingVertical: sc(3),
    paddingHorizontal: sc(8),
    borderRadius: sc(999),
    // @ts-ignore
    cursor: "default",
  },
  pillBordered: {
    borderWidth: 1,
  },
  pillText: {
    marginLeft: sc(2),
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(5),
    paddingVertical: sc(4),
    paddingHorizontal: sc(8),
    borderRadius: sc(6),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
  linkButtonDisabled: {
    opacity: 0.4,
    // @ts-ignore
    cursor: "default",
  },
  linkText: {
    fontSize: sc(12),
  },
  divider: {
    height: 1,
    width: "100%",
    marginTop: sc(14),
  },
  innerDivider: {
    marginTop: sc(14),
    marginBottom: sc(4),
  },
  section: {
    paddingHorizontal: sc(16),
    marginTop: sc(12),
    zIndex: 50,
  },
  sectionTitle: {
    letterSpacing: 1,
    marginBottom: sc(4),
  },
  field: {
    marginTop: sc(10),
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
  },
  helpTip: {
    width: sc(16),
    height: sc(16),
    borderRadius: sc(8),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore
    cursor: "help",
  },
  textInput: {
    fontFamily: "Proxima Nova Regular",
    fontSize: sc(15),
    paddingHorizontal: sc(10),
    width: "100%",
    marginTop: sc(6),
    height: sc(36),
    borderRadius: sc(6),
    // @ts-ignore
    outlineStyle: "none",
  },
  sampPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: sc(5),
    marginTop: sc(8),
    paddingVertical: sc(5),
    paddingHorizontal: sc(12),
    borderRadius: sc(999),
  },
  connectButton: {
    position: "absolute",
    bottom: sc(16),
    left: sc(16),
    right: sc(16),
    height: sc(42),
    borderRadius: sc(8),
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: sc(7),
    zIndex: 1,
  },
  connectLabel: {
    marginLeft: sc(1),
  },
  overlay: {
    top: BANNER_HEIGHT,
    bottom: 0,
  },
});

const tooltipStyles = StyleSheet.create({
  wrap: {
    position: "relative",
    // @ts-ignore
    display: "inline-flex",
  },
  bubble: {
    position: "absolute",
    bottom: "100%",
    left: "50%",
    transform: [{ translateX: "-50%" } as any],
    marginBottom: sc(8),
    paddingVertical: sc(9),
    paddingHorizontal: sc(14),
    borderRadius: sc(8),
    borderWidth: 1,
    // `max-content` lets the bubble grow to the text's natural one-line width
    // (so short tooltips like "Verified partner server of open.mp" stay one
    // line) while maxWidth caps it for long copy. Without an explicit width the
    // absolute element collapses to its parent's tiny inline-flex width and
    // wraps to one word per line.
    // @ts-ignore — RN-Web passes CSS values through
    width: "max-content",
    maxWidth: sc(320),
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  bubbleText: {
    fontSize: sc(15),
    lineHeight: sc(21),
    textAlign: "center",
  },
});

export default JoinServerPrompt;
