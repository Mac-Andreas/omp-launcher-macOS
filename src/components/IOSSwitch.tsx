import { Pressable, StyleSheet, View } from "react-native";
import { sc } from "../utils/sizeScaler";

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  color?: string;
}

const IOSSwitch = ({ value, onChange, disabled, color = "#3FB950" }: Props) => {
  const trackWidth = sc(40);
  const trackHeight = sc(22);
  const knob = sc(18);
  const padding = (trackHeight - knob) / 2;
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      style={[
        styles.track,
        {
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: value ? color : "#39393D",
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.knob,
          {
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            transform: [
              { translateX: value ? trackWidth - knob - padding : padding },
            ],
          },
        ]}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  track: {
    justifyContent: "center",
    padding: 0,
  },
  knob: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
  },
});

export default IOSSwitch;
