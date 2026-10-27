import { invoke } from "@tauri-apps/api";
import { getVersion } from "@tauri-apps/api/app";
import { t } from "i18next";
import {
  appWindow,
  LogicalPosition,
  LogicalSize,
  type PhysicalSize,
} from "@tauri-apps/api/window";
import {
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { DEBUG_MODE, IN_GAME, IN_GAME_PROCESS_ID } from "./constants/app";
import LaunchOverlay from "./containers/LaunchOverlay";
import LoadingScreen from "./containers/LoadingScreen";
import WindowTitleBar from "./containers/WindowTitleBar";
import { changeLanguage } from "./locales";
import { useFeedback } from "./states/feedback";
import { useGenericPersistentState } from "./states/genericStates";
import { useMessageBox } from "./states/messageModal";
import { useNotification } from "./states/notification";
import { usePersistentServers } from "./states/servers";
import { useSettings } from "./states/settings";
import { useTheme } from "./states/theme";
import { throttle } from "./utils/debounce";
import {
  getSelectedBottleGamePath,
  prepareSelectedBottleSampFiles,
} from "./utils/game";
import {
  checkIfProcessAlive,
  fetchServers,
  fetchUpdateInfo,
  generateLanguageFilters,
} from "./utils/helpers";
import PerformanceMonitor from "./utils/performance";
import { PING_TIMEOUT_VALUE } from "./utils/query";
import { sc } from "./utils/sizeScaler";
import {
  telemetrySessionStart,
  telemetrySessionEnd,
  telemetryDailyTick,
  telemetryReportListSize,
} from "./utils/telemetry";

const MainView = lazy(() => import("./containers/MainBody"));
const NavBar = lazy(() => import("./containers/NavBar"));
const AddThirdPartyServerModal = lazy(
  () => import("./containers/AddThirdPartyServer")
);
const ExternalServerHandler = lazy(
  () => import("./containers/ExternalServerHandler")
);
const JoinServerPrompt = lazy(() => import("./containers/JoinServerPrompt"));
const MessageBox = lazy(() => import("./containers/MessageBox"));
const Notification = lazy(() => import("./containers/Notification"));
const ContextMenu = lazy(() => import("./containers/ServerContextMenu"));
const SettingsModal = lazy(() => import("./containers/Settings"));
const FeedbackPrompt = lazy(() => import("./containers/FeedbackPrompt"));

const App = memo(() => {
  const [loading, setLoading] = useState(!IN_GAME);
  const { theme } = useTheme();
  const { language } = useGenericPersistentState();
  const windowSize = useRef<PhysicalSize>();
  const mainWindowSize = useRef<LogicalSize>();
  const processCheckInterval = useRef<NodeJS.Timeout>();

  const windowResizeListener = useCallback(
    throttle(async ({ payload }: { payload: PhysicalSize }) => {
      const endTimer = PerformanceMonitor.time("window-resize");

      try {
        const hasChanged =
          payload.width !== windowSize.current?.width ||
          payload.height !== windowSize.current?.height;

        if (hasChanged) {
          windowSize.current = payload;
          // AppKit snaps the traffic lights back to their default position on
          // every titlebar relayout — re-apply our vertical nudge.
          if (!IN_GAME) {
            invoke("realign_traffic_lights").catch(() => {});
          }
        }
      } finally {
        endTimer();
      }
    }, 100),
    []
  );

  const initializeApp = useCallback(async () => {
    const endTimer = PerformanceMonitor.time("app-initialization");

    try {
      const [innerSize, scaleFactor] = await Promise.all([
        appWindow.innerSize(),
        appWindow.scaleFactor(),
      ]);

      mainWindowSize.current = innerSize.toLogical(scaleFactor);

      // Set window attributes for loading screen. Decorations stay ON the
      // whole time — toggling them at runtime drops the native Overlay
      // titlebar style and leaves a doubled-up standard titlebar.
      // Rust hides the traffic lights in setup() for first launch, but a
      // webview reload (e.g. Danger Zone → Reset) re-runs JS without
      // re-running setup, so re-hide them here too.
      //
      // Rust centers the window at its full 1000x700 frame before showing it,
      // but here we shrink it to the small splash size. center() must run
      // AFTER the resize settles, not alongside it — on macOS Tauri 1.x a
      // concurrent center() reads the pre-resize frame and leaves the splash
      // anchored at the old top-left (off-centre). Same hazard the main-window
      // open path guards against below.
      await Promise.all([
        appWindow.setSize(new LogicalSize(250, 300)),
        appWindow.setResizable(false),
        invoke("set_traffic_lights", { visible: false }),
      ]);
      await appWindow.center();
      requestAnimationFrame(() => {
        appWindow.center();
      });

      const { favorites, updateInFavoritesList } =
        usePersistentServers.getState();
      if (Array.isArray(favorites) && favorites.length > 0) {
        favorites.forEach((server) => {
          server.ping = PING_TIMEOUT_VALUE;
          server.playerCount = 0;
          server.players = [];
          server.rules = {} as typeof server.rules;
          server.hasPassword = false;
          updateInFavoritesList(server);
        });
      }

      await Promise.all([
        fetchServers(),
        fetchUpdateInfo(),
        generateLanguageFilters(),
      ]);
    } finally {
      endTimer();
    }
  }, []);

  useEffect(() => {
    changeLanguage(language as any);
  }, [language]);

  // Check once on launch whether the server has an active feedback campaign
  // for this build. Nothing feedback-related renders until this resolves with
  // a non-null campaign, so an empty/unreachable server shows no UI at all.
  useEffect(() => {
    if (IN_GAME) return;
    useFeedback.getState().fetchCampaign();
  }, []);

  // Anonymous launch ping + session tracking. Only fires for users who have
  // already granted consent for this build; a fresh install/update starts with
  // consent unset, so nothing is sent here until they opt in via the startup
  // gate (which then kicks off app_launched/session itself). Guards against
  // leaking an event before the user decides — including old opt-out-era users
  // upgrading, who still get re-asked.
  useEffect(() => {
    if (IN_GAME) return;
    // Opt-out telemetry: on unless the user disabled it in Settings → Privacy.
    // No consent prompt. Pushes yesterday's aggregated summary (if any) and
    // counts this launch — usage accumulates locally until the daily tick.
    if (!useSettings.getState().telemetryEnabled) return;
    telemetryReportListSize(usePersistentServers.getState().favorites.length);
    telemetryDailyTick();
    telemetrySessionStart("server_list");
    return () => {
      telemetrySessionEnd();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      const targetSize = mainWindowSize.current || new LogicalSize(1000, 700);

      // macOS Tauri 1.x: center() before the resize has settled lands the
      // window in the previous (loading-screen) frame, leaving the real frame
      // hanging off the top edge. Sequence: set resizable -> resize -> center
      // -> nudge again on the next paint to catch the post-resize position.
      (async () => {
        await appWindow.setResizable(true);
        await appWindow.setSize(targetSize);
        if (!IN_GAME) {
          await invoke("set_traffic_lights", { visible: true });
          await appWindow.center();
          requestAnimationFrame(() => {
            appWindow.center();
          });
        }
      })();
    }
  }, [loading]);

  useEffect(() => {
    if (loading || IN_GAME) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const {
        sampSetupPromptShown,
        setSampSetupPromptShown,
        bottleName,
        gtasaPath,
        telemetryConsentVersion,
      } = useSettings.getState();

      const appVersion = await getVersion().catch(() => "");
      // Don't stack on top of the privacy gate — wait until it's resolved.
      const consentPending =
        !!appVersion && telemetryConsentVersion !== appVersion;

      if (
        sampSetupPromptShown ||
        bottleName ||
        gtasaPath ||
        consentPending ||
        useMessageBox.getState().visible
      ) {
        return;
      }

      const gamePath = await getSelectedBottleGamePath();
      if (cancelled || !gamePath) {
        return;
      }

      const { showMessageBox } = useMessageBox.getState();
      const { showNotification } = useNotification.getState();

      showMessageBox({
        title: t("samp_setup_first_run_title"),
        description: t("samp_setup_first_run_description"),
        boxWidth: 440,
        buttonWidth: 150,
        buttons: [
          {
            title: t("samp_setup_skip"),
            onPress: () => setSampSetupPromptShown(true),
          },
          {
            title: t("samp_setup_install"),
            onPress: () => {
              showNotification(
                t("samp_setup_installing_title"),
                t("samp_setup_installing_description")
              );
              prepareSelectedBottleSampFiles(gamePath)
                .then(() =>
                  showNotification(
                    t("samp_setup_success_title"),
                    t("samp_setup_success_description")
                  )
                )
                .catch((error) =>
                  showNotification(
                    t("samp_setup_failed_title"),
                    String(error)
                  )
                );
            },
          },
        ],
      });
      // Longer than the consent gate's timer so, on a fresh install where both
      // could fire, the privacy opt-in is shown first and this one defers (its
      // consentPending guard skips it while the gate is up).
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loading]);

  useEffect(() => {
    let killResizeListener: (() => void) | null = null;

    const setupListeners = async () => {
      if (!DEBUG_MODE) {
        const handleContextMenu = (event: Event) => {
          event.preventDefault();
        };
        document.addEventListener("contextmenu", handleContextMenu, {
          passive: false,
        });
      }

      killResizeListener = await appWindow.onResized(windowResizeListener);
    };

    const setupGameMonitoring = () => {
      if (IN_GAME) {
        processCheckInterval.current = setInterval(async () => {
          try {
            const isAlive = await checkIfProcessAlive(IN_GAME_PROCESS_ID);
            if (!isAlive) {
              await invoke("send_message_to_game", {
                id: IN_GAME_PROCESS_ID,
                message: "close_overlay",
              });
              setTimeout(() => appWindow.close(), 300);
            }
          } catch (error) {
            console.error("Game process check failed:", error);
          }
        }, 1000);
      }
    };

    setupListeners();
    initializeApp();
    setupGameMonitoring();

    if (IN_GAME) {
      setInterval(async () => {
        appWindow.setPosition(new LogicalPosition(-15000, -15000));

        const visible = await appWindow.isVisible();
        if (!visible) {
          appWindow.show();
        }
      }, 100);
    }

    return () => {
      killResizeListener?.();
      if (processCheckInterval.current) {
        clearInterval(processCheckInterval.current);
      }
    };
  }, [windowResizeListener, initializeApp]);

  const handleLoadingEnd = useCallback(async () => {
    const endTimer = PerformanceMonitor.time("loading-end");
    setLoading(false);
    endTimer();
  }, []);

  const appStyle = useMemo(() => styles.app, []);

  const appViewStyle = useMemo(
    () => [
      styles.appView,
      {
        backgroundColor: theme.secondary,
        // The native macOS window (decorations + titleBarStyle: Overlay) draws
        // and clips the rounded corners now, so content stays square — a
        // self-drawn radius would leave a transparent sliver at each corner.
        borderRadius: 0,
      },
    ],
    [theme.secondary]
  );

  if (loading) {
    return <LoadingScreen onEnd={handleLoadingEnd} />;
  }

  return (
    <View style={appStyle} key={language}>
      <View style={appViewStyle}>
        <WindowTitleBar />
        <View style={styles.appBody}>
          <NavBar />
          <MainView />
          <ContextMenu />
          <JoinServerPrompt />
          <SettingsModal />
          <AddThirdPartyServerModal />
          <ExternalServerHandler />
          <Notification />
          <MessageBox />
          <FeedbackPrompt />
          <LaunchOverlay />
        </View>
      </View>
    </View>
  );
});

App.displayName = "App";

const styles = StyleSheet.create({
  app: {
    // @ts-ignore
    height: "100vh",
    // @ts-ignore
    width: "100vw",
  },
  appView: {
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  appBody: {
    flex: 1,
    width: "100%",
    paddingHorizontal: sc(15),
    paddingBottom: sc(15),
    paddingTop: sc(12),
  },
});

export default App;
