import { invoke } from "@tauri-apps/api";
import { getVersion } from "@tauri-apps/api/app";
import {
  appWindow,
  currentMonitor,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ColorValue, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import Icon from "../components/Icon";
import Text from "../components/Text";
import { IN_GAME, IN_GAME_PROCESS_ID } from "../constants/app";
import { images } from "../constants/images";
import { useFeedback } from "../states/feedback";
import { useSettingsModal } from "../states/settingsModal";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import { useGameLaunch } from "../states/gameLaunch";

// Orange accent for the BETA badge — distinct from the theme's primary so it
// reads as a "pre-release" marker rather than a normal UI element. The light
// variant is a deeper amber so the badge text/border doesn't wash out on the
// white title bar.
const BETA_COLOR_DARK = "#F5A623";
const BETA_COLOR_LIGHT = "#B86E00";

// Fallback traffic lights for the borderless in-game overlay window only.
// The main launcher window uses real macOS controls (titleBarStyle: Overlay).
const TRAFFIC_LIGHTS = [
  { key: "close", color: "#FF5F57" },
  { key: "minimize", color: "#FEBC2E" },
  { key: "maximize", color: "#28C840" },
] as const;

interface TrafficLightsProps {
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

const TrafficLights = memo<TrafficLightsProps>(
  ({ onClose, onMinimize, onMaximize }) => {
    const handlers: Record<string, () => void> = {
      close: onClose,
      minimize: onMinimize,
      maximize: onMaximize,
    };
    return (
      // @ts-ignore — zIndex keeps the lights above the drag region.
      <View style={styles.trafficLights}>
        {TRAFFIC_LIGHTS.map((light) => (
          <Pressable
            key={light.key}
            onPress={handlers[light.key]}
            style={({ pressed, hovered }: any) => [
              styles.light,
              { backgroundColor: light.color, opacity: pressed ? 0.6 : hovered ? 0.85 : 1 },
            ]}
          />
        ))}
      </View>
    );
  }
);

interface CustomButtonProps {
  size?: number;
  iconSize?: number;
  image: string;
  title?: string;
  onPress: () => void;
  marginRight?: number;
  className?: string;
  color?: ColorValue;
  backgroundColor?: string;
  borderColor?: string;
  disabled?: boolean;
}

const CustomWindowTitleBarButtons = memo<CustomButtonProps>(
  ({
    size = sc(30),
    image,
    onPress,
    iconSize = sc(20),
    title = "",
    className,
    marginRight = 0,
    color,
    backgroundColor,
    borderColor,
    disabled = false,
  }) => {
    const isSvg = useMemo(() => image.includes(".svg"), [image]);

    const containerStyle = useMemo(
      () => ({
        height: size,
        width: size,
        borderRadius: sc(6),
        marginRight,
        backgroundColor,
        border: borderColor ? `1px solid ${borderColor}` : "none",
        boxSizing: "border-box" as const,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: (disabled ? "none" : "auto") as "none" | "auto",
      }),
      [size, marginRight, backgroundColor, borderColor, disabled]
    );

    const pressableStyle = useMemo(
      () => ({
        height: "100%",
        width: "100%",
        justifyContent: "center" as const,
        alignItems: "center" as const,
      }),
      []
    );

    return (
      <div className={className} style={containerStyle}>
        {/* @ts-ignore */}
        <Pressable style={pressableStyle} onPress={onPress}>
          <Icon
            svg={isSvg}
            title={title}
            image={image}
            size={iconSize}
            color={color}
          />
        </Pressable>
      </div>
    );
  }
);

const WindowTitleBar = memo(() => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, themeType } = useTheme();
  const themeMode = useTheme((s) => s.themeMode);
  const BETA_COLOR = themeType === "light" ? BETA_COLOR_LIGHT : BETA_COLOR_DARK;
  const { show: showSettings } = useSettingsModal();
  const { launching } = useGameLaunch();
  // Single source of truth — fetched once on app launch.
  const hasCampaign = useFeedback((s) => !!s.campaign);
  const openFeedback = useFeedback((s) => s.openPopup);

  // App version for the BETA badge, read live from the Tauri bundle. The badge
  // only shows for pre-release builds (version contains "beta"), so a future
  // stable release hides it automatically with no code change.
  const [version, setVersion] = useState("");
  const [betaTooltip, setBetaTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const isBeta = useMemo(() => /beta/i.test(version), [version]);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Anchor the portalled tooltip just below the badge using its live screen
  // rect — the portal renders to <body>, so it needs absolute coordinates.
  const showBetaTooltip = useCallback(() => {
    const rect = badgeRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ top: rect.bottom + sc(6), left: rect.left });
    setBetaTooltip(true);
  }, []);

  const containerStyles = useMemo(
    () => ({
      main: {
        width: "100%",
        display: "flex",
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "center" as const,
        // Top inset so the logo/title row's vertical centre lines up with the
        // native traffic lights (which sit nudged-down on the launcher window).
        paddingTop: IN_GAME ? sc(15) : sc(10),
        paddingHorizontal: sc(15),
        paddingBottom: sc(12),
        borderBottomWidth: 1,
        borderBottomColor: `${theme.textPrimary}1F`,
      },
      leftSection: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        // Clear the native macOS traffic lights on the launcher window. The
        // borderless in-game overlay draws its own lights, so no inset there.
        paddingLeft: IN_GAME ? 0 : sc(80),
      },
      logoContainer: [
        styles.logoContainer,
        { backgroundColor: theme.itemBackgroundColor },
      ],
      titleText: {
        marginLeft: sc(12),
      },
      dragRegion: {
        position: "absolute" as const,
        top: 0,
        left: 0,
        height: sc(32),
        width: "100%",
        display: "flex",
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "center" as const,
        padding: sc(15),
      },
      rightSection: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        height: "100%",
      },
      inputs: {
        height: "100%",
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        marginRight: sc(10),
      },
      reconnectButton: {
        height: sc(35),
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: sc(20),
        borderRadius: sc(5),
        backgroundColor: theme.primary,
        // @ts-ignore
        filter: `drop-shadow(0 0 20px ${theme.primary}44)`,
      },
    }),
    [theme.itemBackgroundColor, theme.textPrimary]
  );

  const handleReconnect = useCallback(() => {
    invoke("send_message_to_game", {
      id: IN_GAME_PROCESS_ID,
      message: "reconnect",
    });
  }, []);

  // Cycle system → dark → light → system. Drives the same themeMode the
  // Preferences tab writes, so the two controls never disagree.
  const handleThemeToggle = useCallback(() => {
    setTheme(
      themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system"
    );
  }, [themeMode, setTheme]);

  const handleMinimize = useCallback(() => {
    appWindow.minimize();
  }, []);

  // Window bounds saved before maximizing, restored on un-maximize.
  const prevBounds = useRef<{ size: PhysicalSize; pos: PhysicalPosition } | null>(
    null
  );

  // Maximize by stretching the window over the entire display — including the
  // strip Tauri's own maximize leaves under the menu bar — so no gap shows.
  // This is a plain resize, not macOS fullscreen (no separate Space).
  const handleMaximize = useCallback(async () => {
    const monitor = await currentMonitor();
    if (!monitor) {
      appWindow.toggleMaximize();
      return;
    }
    const size = await appWindow.outerSize();
    const covering =
      size.width >= monitor.size.width && size.height >= monitor.size.height;

    if (covering) {
      const prev = prevBounds.current;
      if (prev) {
        await appWindow.setSize(prev.size);
        await appWindow.setPosition(prev.pos);
      } else {
        await appWindow.setSize(new LogicalSize(1000, 700));
        await appWindow.center();
      }
    } else {
      prevBounds.current = {
        size: await appWindow.outerSize(),
        pos: await appWindow.outerPosition(),
      };
      await appWindow.setPosition(
        new PhysicalPosition(monitor.position.x, monitor.position.y)
      );
      await appWindow.setSize(
        new PhysicalSize(monitor.size.width, monitor.size.height)
      );
    }
  }, []);

  const handleClose = useCallback(() => {
    if (IN_GAME) {
      invoke("send_message_to_game", {
        id: IN_GAME_PROCESS_ID,
        message: "close_overlay",
      });
    }

    setTimeout(
      () => {
        appWindow.close();
      },
      IN_GAME ? 300 : 0
    );
  }, []);

  const themeIcon = useMemo(() => {
    if (themeMode === "system") return images.icons.autoTheme;
    if (themeMode === "dark") return images.icons.darkTheme;
    return images.icons.lightTheme;
  }, [themeMode]);

  const buttonTitles = useMemo(() => {
    return {
      reconnect: t("reconnect"),
      settings: t("settings"),
    };
  }, [t, i18n.language]);

  return (
    // @ts-ignore
    <View style={containerStyles.main}>
      {/* Drag region first so the buttons rendered after it stay clickable.
          Dragging is started manually (not data-tauri-drag-region) so a
          double-click runs our gap-free maximize, not Tauri's own maximize. */}
      {!IN_GAME && (
        <div
          style={containerStyles.dragRegion}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            if (e.detail >= 2) {
              handleMaximize();
            } else {
              appWindow.startDragging();
            }
          }}
        />
      )}
      <View style={containerStyles.leftSection}>
        {IN_GAME && (
          <TrafficLights
            onClose={handleClose}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
          />
        )}
        <View style={containerStyles.logoContainer}>
          <Icon image={images.icons.omp} size={sc(22)} />
        </View>
        <Text
          semibold
          size={3}
          color={theme.textPrimary}
          style={containerStyles.titleText}
        >
          Open Multiplayer — Launcher
        </Text>
        {/* BETA badge with version + (?) tooltip. Only shown for pre-release
            builds (version contains "beta"); a stable release hides it with no
            code change. The tooltip is rendered through a body portal so it
            escapes the title bar's clipped/overlapped layout. */}
        {isBeta && (
          <div
            ref={badgeRef}
            onMouseEnter={showBetaTooltip}
            onMouseLeave={() => setBetaTooltip(false)}
            style={{
              // @ts-ignore
              position: "relative",
              zIndex: 20,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginLeft: sc(10),
              height: sc(24),
              paddingLeft: sc(10),
              paddingRight: sc(8),
              borderRadius: sc(7),
              backgroundColor: `${BETA_COLOR}22`,
              border: `1px solid ${BETA_COLOR}66`,
              gap: sc(6),
              cursor: "help",
            }}
          >
            <Text
              semibold
              size={1}
              color={BETA_COLOR}
              style={{ fontSize: sc(11), letterSpacing: 0.5 }}
            >
              BETA{version ? ` ${version}` : ""}
            </Text>
            <div
              style={{
                width: sc(16),
                height: sc(16),
                borderRadius: sc(8),
                backgroundColor: `${BETA_COLOR}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                semibold
                size={1}
                color={BETA_COLOR}
                style={{ fontSize: sc(10) }}
              >
                ?
              </Text>
            </div>
          </div>
        )}
        {betaTooltip &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: tooltipPos.top,
                left: tooltipPos.left,
                width: sc(270),
                boxSizing: "border-box",
                padding: `${sc(11)}px ${sc(13)}px`,
                borderRadius: sc(8),
                backgroundColor: theme.itemBackgroundColor,
                border: `1px solid ${theme.textPrimary}26`,
                boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                zIndex: 99999,
                pointerEvents: "none",
                fontSize: sc(13),
                lineHeight: `${sc(18)}px`,
                color: theme.textPrimary as string,
                whiteSpace: "normal",
                fontFamily: "Proxima Nova Regular",
              }}
            >
              This is a beta version — it may contain bugs, but also includes
              fixes and improvements from past releases.
            </div>,
            document.body
          )}
      </View>
      {/* @ts-ignore */}
      <View style={containerStyles.rightSection}>
        {IN_GAME && (
          // @ts-ignore
          <View style={containerStyles.inputs}>
            <TouchableOpacity
              onPress={handleReconnect}
              // @ts-ignore
              style={containerStyles.reconnectButton}
            >
              <Text style={{ fontSize: sc(18) }} color="white" semibold>
                {buttonTitles.reconnect}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Feedback button — hidden during gameplay, only rendered when the
            server has an active campaign for this build. No campaign ⇒ no
            button (and no empty popup is ever shown). */}
        {!IN_GAME && !launching && hasCampaign && (
          <div style={{ position: "relative", marginRight: sc(8) }}>
            <Pressable
              onPress={openFeedback}
              style={({ pressed, hovered }: any) => ({
                height: sc(30),
                paddingHorizontal: sc(10),
                borderRadius: sc(6),
                backgroundColor: theme.itemBackgroundColor,
                border: `1px solid ${theme.textPrimary}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : hovered ? 0.9 : 1,
                flexDirection: "row" as const,
                gap: sc(5),
              })}
            >
              <Text size={1} color={theme.textPrimary} style={{ fontSize: sc(11) }}>
                💬
              </Text>
              <Text size={1} color={theme.textPrimary} style={{ fontSize: sc(11) }}>
                Provide Feedback
              </Text>
            </Pressable>
            {/* Green attention dot — the button only renders while a campaign
                is active, so this is always shown alongside it. */}
            <div style={{
              position: "absolute", top: sc(-2), right: sc(-2),
              width: sc(7), height: sc(7), borderRadius: sc(4),
              backgroundColor: "#1DB954",
              boxShadow: "0 0 6px #1DB954",
            }} />
          </div>
        )}
        <CustomWindowTitleBarButtons
          title=""
          iconSize={sc(16)}
          image={themeIcon}
          color={theme.textPrimary}
          backgroundColor={theme.itemBackgroundColor}
          borderColor={`${theme.textPrimary}40`}
          marginRight={!IN_GAME ? sc(10) : 0}
          onPress={handleThemeToggle}
        />
        {/* Settings is blocked while a launch is in progress (including the
            audio-crash gate) — the launch overlay owns the screen, so opening
            Settings on top of the gate popup would stack two modals. */}
        {!IN_GAME && (
          <CustomWindowTitleBarButtons
            title={buttonTitles.settings}
            image={images.icons.settings}
            color={theme.textPrimary}
            backgroundColor={theme.itemBackgroundColor}
            borderColor={`${theme.textPrimary}40`}
            onPress={launching ? () => {} : showSettings}
            disabled={launching}
          />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  logoContainer: {
    height: sc(32),
    width: sc(32),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: sc(5),
  },
  trafficLights: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
    marginRight: sc(14),
    // @ts-ignore — sit above the absolute drag region so clicks land.
    zIndex: 20,
  },
  light: {
    height: sc(13),
    width: sc(13),
    borderRadius: sc(7),
  },
});

TrafficLights.displayName = "TrafficLights";
CustomWindowTitleBarButtons.displayName = "CustomWindowTitleBarButtons";
WindowTitleBar.displayName = "WindowTitleBar";

export default WindowTitleBar;
