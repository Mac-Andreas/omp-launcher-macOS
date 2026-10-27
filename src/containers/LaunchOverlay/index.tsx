import { invoke } from "@tauri-apps/api";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { t } from "i18next";
import Text from "../../components/Text";
import { useGameLaunch } from "../../states/gameLaunch";
import { useTheme } from "../../states/theme";
import { sc } from "../../utils/sizeScaler";

// Full-window overlay shown while a game launch is in progress. The bar is
// indeterminate (the launch has no granular progress events) and loops
// continuously until the launch finishes or is cancelled.
// Amber used for the paused state (launch held behind a pre-launch prompt).
const PAUSED_COLOR = "#E8A317";

const LaunchOverlay = () => {
  const { launching, paused, gateOpen, setLaunching, setPaused } =
    useGameLaunch();
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Don't animate while paused — the bar sits still in the amber state.
    if (!launching || paused) return;
    anim.setValue(0);
    // Linear sweep avoids the eased "stop-and-jump" at the loop boundary
    // that read as a glitch with Easing.inOut.
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        // Web: the native driver does not loop transforms reliably.
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [launching, paused, anim]);

  if (!launching) return null;

  // The audio-crash gate is a MessageBox (StaticModal, zIndex 61) with its own
  // dimmed backdrop. While it's up we render only our backdrop (not the paused
  // card) so the user sees a single popup. Critically it must sit BELOW the
  // MessageBox, not above it: our normal overlay is zIndex 1000, which would
  // paint a second 55%-black scrim on top of the dialog and mute it. Drop to a
  // low z here so the MessageBox's own backdrop + card render on top.
  if (gateOpen) {
    return <View style={[styles.overlay, styles.gateBackdrop]} />;
  }

  const trackWidth = sc(260);
  const fillWidth = sc(90);
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-fillWidth, trackWidth],
  });

  const cancel = () => {
    // While paused the game hasn't been launched yet — nothing to kill, just
    // dismiss the held overlay. Otherwise stop the in-progress launch.
    if (!paused) invoke("kill_game").catch(() => {});
    setPaused(false);
    setLaunching(false);
  };

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: theme.secondary }]}>
        <Text semibold size={3} color={paused ? PAUSED_COLOR : theme.textPrimary}>
          {paused
            ? t("launching_game_paused", {
                defaultValue: "Launching game — Paused",
              })
            : t("launching_game")}
        </Text>
        <View
          style={[
            styles.track,
            { width: trackWidth, backgroundColor: theme.itemBackgroundColor },
          ]}
        >
          {paused ? (
            // Static amber fill while held behind the pre-launch prompt.
            <View
              style={[styles.fill, { width: fillWidth, backgroundColor: PAUSED_COLOR }]}
            />
          ) : (
            <Animated.View
              style={[
                styles.fill,
                {
                  width: fillWidth,
                  backgroundColor: theme.primary,
                  transform: [{ translateX }],
                },
              ]}
            />
          )}
        </View>
        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: `${theme.textPrimary}44` }]}
          onPress={cancel}
        >
          <Text semibold size={1} color={theme.textPrimary}>
            {t("cancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  // While the audio-crash gate (MessageBox, zIndex 61) is open, our backdrop
  // must sit beneath it — otherwise it double-dims the dialog. The MessageBox
  // draws its own scrim, so we drop our tint here too and only keep a low
  // z-index placeholder so nothing behind it shows through before the modal
  // paints.
  gateBackdrop: {
    zIndex: 60,
    backgroundColor: "transparent",
  },
  card: {
    paddingVertical: sc(26),
    paddingHorizontal: sc(34),
    borderRadius: sc(10),
    alignItems: "center",
    gap: sc(16),
  },
  track: {
    height: sc(8),
    borderRadius: sc(4),
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    // No borderRadius on the fill: the track already clips with overflow
    // hidden + radius, and rounding both leaves a 1px seam under RNW.
  },
  cancelButton: {
    marginTop: sc(4),
    paddingVertical: sc(7),
    paddingHorizontal: sc(22),
    borderRadius: sc(6),
    borderWidth: 1,
  },
});

export default LaunchOverlay;
