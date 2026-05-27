import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
  // Milliseconds the user must hold to fire `onConfirm`. Defaults to 3000.
  holdMs?: number;
  onConfirm: () => void;
  // Use the destructive (red) palette. Otherwise uses theme.primary.
  danger?: boolean;
  disabled?: boolean;
  // When true, shows a spinner + busyLabel and blocks interaction.
  busy?: boolean;
  busyLabel?: string;
}

const DANGER = "#A8443E";
const DEFAULT_HOLD_MS = 3000;

// Hold-to-confirm button. Press and hold for `holdMs` to fire `onConfirm`.
// Releasing before the timer completes cancels with no side effect. The
// progress fill grows left-to-right while the press is active.
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
  const { theme } = useTheme();
  const [holding, setHolding] = useState(false);
  const fill = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const blocked = !!disabled || !!busy;
  const baseColor = danger ? DANGER : theme.primary;
  const fillColor = danger ? "#C75A52" : `${theme.primary}DD`;

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
    outputRange: ["0%", "100%"],
  });

  return (
    <Pressable
      disabled={blocked}
      onPressIn={startHold}
      onPressOut={cancelHold}
      style={[
        styles.button,
        {
          backgroundColor: blocked ? "#666666" : `${baseColor}33`,
          borderColor: blocked ? "#666666" : baseColor,
          opacity: blocked ? 0.6 : 1,
          // @ts-ignore
          cursor: blocked ? "not-allowed" : "pointer",
        },
      ]}
    >
      {!busy && (
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: fillColor,
              width: widthInterp,
            },
          ]}
        />
      )}
      <View style={[styles.labelWrap, styles.labelRow]}>
        {busy && <ActivityIndicator size="small" color="#FFFFFF" />}
        <Text semibold size={2} color="#FFFFFF">
          {busy
            ? busyLabel || label
            : holding && holdingLabel
            ? holdingLabel
            : label}
        </Text>
      </View>
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
  labelWrap: {
    paddingHorizontal: sc(12),
    zIndex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
  },
});

export default HoldToConfirmButton;
