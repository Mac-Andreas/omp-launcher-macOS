import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import Text from "./Text";

interface HoldToConfirmButtonProps {
  label: string;
  holdingLabel?: string;
  holdMs?: number;
  onConfirm: () => void;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
}

const DANGER = "#A8443E";
const DANGER_FILL = "#C75A52";
const DEFAULT_HOLD_MS = 3000;

const HoldToConfirmButton = ({
  label,
  holdingLabel,
  holdMs = DEFAULT_HOLD_MS,
  onConfirm,
  danger,
  disabled,
  busy,
  busyLabel,
}: HoldToConfirmButtonProps) => {
  const { theme, themeType } = useTheme();
  const [holding, setHolding] = useState(false);
  const [buttonWidth, setButtonWidth] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const blocked = !!disabled || !!busy;
  const baseColor = danger ? DANGER : theme.primary;
  const isLight = themeType === "light";

  // Active button: solid dark-red bg + white text in light mode; tinted in dark mode
  const activeBg = danger && isLight ? DANGER : `${baseColor}22`;
  const activeText = danger && isLight ? "#FFFFFF" : baseColor;
  // Fill bar: lighter red that's still clearly visible over the solid bg
  const fillColor = danger ? DANGER_FILL : `${theme.primary}DD`;
  const disabledBg = "#888888";
  const disabledText = `${theme.textPrimary}88`;

  useEffect(
    () => () => {
      if (anim.current) anim.current.stop();
    },
    []
  );

  const startHold = () => {
    if (blocked) return;
    fired.current = false;
    setHolding(true);
    fill.setValue(0);
    anim.current = Animated.timing(fill, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished && !fired.current) {
        fired.current = true;
        setHolding(false);
        fill.setValue(0);
        onConfirm();
      }
    });
  };

  const cancelHold = () => {
    if (anim.current) anim.current.stop();
    setHolding(false);
    fill.setValue(0);
  };

  const widthInterp = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [0, buttonWidth],
  });

  const displayLabel = busy ? busyLabel || label : label;
  const overlayLabel = holding && holdingLabel ? holdingLabel : displayLabel;

  const onLayout = (e: LayoutChangeEvent) => {
    setButtonWidth(e.nativeEvent.layout.width);
  };

  // In light mode with danger active: base text is white (already visible on red bg).
  // In dark mode or non-danger: base text is the accent color, white overlay on fill.
  const needsWhiteOverlay = !(danger && isLight);

  return (
    <Pressable
      disabled={blocked}
      onPressIn={startHold}
      onPressOut={cancelHold}
      onLayout={onLayout}
      style={[
        styles.button,
        {
          backgroundColor: blocked ? disabledBg : activeBg,
          borderColor: blocked ? disabledBg : baseColor,
          opacity: blocked ? 0.65 : 1,
          // @ts-ignore
          cursor: blocked ? "not-allowed" : "pointer",
        },
      ]}
    >
      {/* Fill bar — only when active */}
      {!busy && !blocked && (
        <Animated.View
          style={[styles.fill, { backgroundColor: fillColor, width: widthInterp }]}
        />
      )}

      {/* Base label */}
      <View
        style={[styles.labelLayer, buttonWidth ? { width: buttonWidth } : {}]}
        pointerEvents="none"
      >
        {busy && (
          <ActivityIndicator
            size="small"
            color={blocked ? disabledText : activeText}
          />
        )}
        <Text
          semibold
          size={2}
          color={blocked ? disabledText : activeText}
        >
          {displayLabel}
        </Text>
      </View>

      {/* White overlay label clipped to filled region (dark mode / non-danger only) */}
      {!busy && !blocked && needsWhiteOverlay && buttonWidth > 0 && (
        <Animated.View
          style={[styles.fill, styles.clipLayer, { width: widthInterp }]}
          pointerEvents="none"
        >
          <View style={[styles.labelLayer, { width: buttonWidth }]}>
            <Text semibold size={2} color="#FFFFFF">
              {overlayLabel}
            </Text>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    height: sc(40),
    borderRadius: sc(8),
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
  },
  clipLayer: {
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  labelLayer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sc(8),
    paddingHorizontal: sc(12),
  },
});

export default HoldToConfirmButton;
