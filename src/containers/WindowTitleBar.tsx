import { invoke } from "@tauri-apps/api";
import {
  appWindow,
  currentMonitor,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { memo, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { ColorValue, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import Icon from "../components/Icon";
import Text from "../components/Text";
import { IN_GAME, IN_GAME_PROCESS_ID } from "../constants/app";
import { images } from "../constants/images";
import { useSettingsModal } from "../states/settingsModal";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import { useGameLaunch } from "../states/gameLaunch";

const SUPABASE_URL  = "https://tmenljjfshefocoqnwgi.supabase.co";
const SUPABASE_ANON = "sb_publishable_waBEtV1eAdoXRMET_ZRxpw_ANZUgZBw";

// Fetch the active feedback campaign (if any) for this device's source
async function fetchActiveCampaign(source: string) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feedback_campaigns?select=*&status=eq.active&order=activated_at.desc&limit=1`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const campaign = rows?.find(
      (c: any) => !c.target_source || c.target_source === source
    );
    return campaign ?? null;
  } catch { return null; }
}

async function submitFeedback(campaignId: number, anonymousId: string, source: string, answers: Record<number, string | number>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/feedback_responses`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ campaign_id: campaignId, anonymous_id: anonymousId, source, answers }),
    });
  } catch { /* silent */ }
}

// Inline feedback popup component
const FeedbackPopup = memo(({ onClose }: { onClose: () => void }) => {
  const { theme } = useTheme();
  const [campaign, setCampaign] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Get anonymous_id from localStorage (same key as telemetry.ts)
  const anonId = typeof localStorage !== "undefined"
    ? (localStorage.getItem("telemetry-anonymous-id") ?? "unknown")
    : "unknown";

  useEffect(() => {
    fetchActiveCampaign("macandreas").then(c => {
      setCampaign(c);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!campaign) return;
    await submitFeedback(campaign.id, anonId, "macandreas", answers);
    setSubmitted(true);
  };

  const overlayStyle = useMemo(() => ({
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }), []);

  const modalStyle = useMemo(() => ({
    background: theme.secondary,
    border: `1px solid ${theme.textPrimary}22`,
    borderRadius: sc(12),
    width: Math.min(420, window.innerWidth - 40),
    maxHeight: "80vh",
    overflow: "hidden" as const,
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
  }), [theme]);

  // Pure HTML rendering — this popup lives in a WebView so CSS strings work fine
  const btnBase: React.CSSProperties = {
    flex: 1, padding: `${sc(9)}px`, borderRadius: sc(8),
    textAlign: "center", cursor: "pointer", fontWeight: 600,
    fontSize: sc(13), border: "none",
  };

  if (loading) return (
    <div style={overlayStyle}>
      <div style={{...modalStyle, padding: sc(24), textAlign: "center"}}>
        <span style={{color: theme.textSecondary, fontSize: sc(14)}}>Loading…</span>
      </div>
    </div>
  );

  if (!campaign) return (
    <div style={overlayStyle}>
      <div style={{...modalStyle, padding: sc(24)}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:sc(16)}}>
          <span style={{color:theme.textPrimary,fontWeight:600,fontSize:sc(15)}}>💬 Feedback</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:theme.textSecondary,fontSize:sc(18),cursor:"pointer",padding:sc(4)}}>✕</button>
        </div>
        <p style={{color:theme.textSecondary,fontSize:sc(13),margin:`0 0 ${sc(16)}px`}}>No active feedback campaigns at this time. Check back later!</p>
        <button onClick={onClose} style={{...btnBase,backgroundColor:theme.primary,color:"#fff",width:"100%"}}>Close</button>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={overlayStyle}>
      <div style={{...modalStyle, padding: sc(24), textAlign: "center"}}>
        <div style={{fontSize:sc(32),marginBottom:sc(8)}}>🎉</div>
        <div style={{color:theme.textPrimary,fontWeight:600,fontSize:sc(16),marginBottom:sc(8)}}>Thank you!</div>
        <p style={{color:theme.textSecondary,fontSize:sc(13),marginBottom:sc(20)}}>Your feedback has been submitted.</p>
        <button onClick={onClose} style={{...btnBase,backgroundColor:theme.primary,color:"#fff",width:"100%"}}>Close</button>
      </div>
    </div>
  );

  const questions: any[] = campaign.questions || [];

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{padding:`${sc(14)}px ${sc(16)}px`,borderBottom:`1px solid ${theme.textPrimary}1F`,display:"flex",alignItems:"center"}}>
          <span style={{color:theme.textPrimary,fontWeight:600,fontSize:sc(15),flex:1}}>💬 {campaign.title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:theme.textSecondary,fontSize:sc(18),cursor:"pointer",padding:sc(4)}}>✕</button>
        </div>

        {/* Questions — scrollable */}
        <div style={{flex:1,overflowY:"auto",padding:`${sc(16)}px`}}>
          {campaign.description && (
            <p style={{color:theme.textSecondary,fontSize:sc(12),marginBottom:sc(14)}}>{campaign.description}</p>
          )}
          {questions.map((q: any, i: number) => (
            <div key={i} style={{marginBottom:sc(16)}}>
              <div style={{color:theme.textPrimary,fontWeight:600,fontSize:sc(13),marginBottom:sc(8)}}>
                {i+1}. {q.text}
              </div>
              {q.type === "likert" ? (
                <div style={{display:"flex",gap:sc(6)}}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setAnswers(a=>({...a,[i]:n}))}
                      style={{flex:1,padding:sc(8),borderRadius:sc(6),cursor:"pointer",
                        backgroundColor: answers[i]===n ? theme.primary : theme.itemBackgroundColor,
                        border:`1px solid ${answers[i]===n ? theme.primary : theme.textPrimary+'44'}`,
                        color: answers[i]===n ? "#fff" : theme.textPrimary, fontSize:sc(13), fontWeight:600}}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : q.type === "mcq" ? (
                <div style={{display:"flex",flexDirection:"column",gap:sc(6)}}>
                  {(q.options||[]).map((opt: string, oi: number) => (
                    <button key={oi} onClick={() => setAnswers(a=>({...a,[i]:opt}))}
                      style={{padding:`${sc(8)}px ${sc(10)}px`,borderRadius:sc(6),cursor:"pointer",textAlign:"left",
                        backgroundColor: answers[i]===opt ? `${theme.primary}22` : theme.itemBackgroundColor,
                        border:`1px solid ${answers[i]===opt ? theme.primary : theme.textPrimary+'44'}`,
                        color: answers[i]===opt ? theme.primary : theme.textPrimary, fontSize:sc(13)}}>
                      ○ {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={String(answers[i] ?? "")}
                  onChange={(e) => setAnswers(a=>({...a,[i]:e.target.value}))}
                  placeholder="Your answer…"
                  style={{width:"100%",backgroundColor:theme.itemBackgroundColor,
                    border:`1px solid ${theme.textPrimary}44`,borderRadius:sc(6),
                    padding:sc(8),color:theme.textPrimary,fontSize:sc(13),minHeight:sc(60),
                    resize:"vertical",outline:"none",fontFamily:"inherit"}}
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{padding:`${sc(12)}px ${sc(16)}px`,borderTop:`1px solid ${theme.textPrimary}1F`,display:"flex",gap:sc(8)}}>
          <button onClick={onClose}
            style={{...btnBase,backgroundColor:theme.itemBackgroundColor,color:theme.textSecondary,
              border:`1px solid ${theme.textPrimary}22`}}>
            Skip
          </button>
          <button onClick={handleSubmit}
            style={{...btnBase,backgroundColor:theme.primary,color:"#fff"}}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
});

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
      }),
      [size, marginRight, backgroundColor, borderColor]
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
  const { theme, setTheme } = useTheme();
  const themeMode = useTheme((s) => s.themeMode);
  const { show: showSettings } = useSettingsModal();
  const { launching } = useGameLaunch();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [hasCampaign, setHasCampaign] = useState(false);

  // Check once on mount whether there's an active campaign (for dot indicator)
  useEffect(() => {
    if (IN_GAME) return;
    fetchActiveCampaign("macandreas").then(c => setHasCampaign(!!c));
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
          Open Multiplayer
        </Text>
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
        {/* Feedback button — hidden during gameplay, only shown when a campaign is active */}
        {!IN_GAME && !launching && (
          <div style={{ position: "relative", marginRight: sc(8) }}>
            <Pressable
              onPress={() => setFeedbackOpen(true)}
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
            {/* Dot indicator when an active campaign exists */}
            {hasCampaign && (
              <div style={{
                position: "absolute", top: sc(-2), right: sc(-2),
                width: sc(7), height: sc(7), borderRadius: sc(4),
                backgroundColor: "#1DB954",
                boxShadow: "0 0 6px #1DB954",
              }} />
            )}
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
        {!IN_GAME && (
          <CustomWindowTitleBarButtons
            title={buttonTitles.settings}
            image={images.icons.settings}
            color={theme.textPrimary}
            backgroundColor={theme.itemBackgroundColor}
            borderColor={`${theme.textPrimary}40`}
            onPress={showSettings}
          />
        )}
        {/* Feedback popup — rendered outside normal flow with backdrop blur */}
        {feedbackOpen && (
          <FeedbackPopup onClose={() => setFeedbackOpen(false)} />
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
