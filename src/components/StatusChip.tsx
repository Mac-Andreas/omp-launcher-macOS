import { StyleSheet, View } from "react-native";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import Text from "./Text";

type Status = "ok" | "bad" | "pending";

interface StatusChipProps {
  label: string;
  status: Status;
}

const COLORS: Record<Status, string> = {
  ok: "#3FB950",
  bad: "#E5534B",
  pending: "#888888",
};

// Compact status chip used on the Settings Dashboard row. Dot + label, tinted
// by status. Three states: green (ok), red (bad), grey (pending/unknown).
const StatusChip = ({ label, status }: StatusChipProps) => {
  const { theme } = useTheme();
  const color = COLORS[status];
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: `${color}1F`,
          borderColor: `${color}55`,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text size={1} semibold color={theme.textPrimary} style={styles.label}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
    paddingVertical: sc(4),
    paddingHorizontal: sc(8),
    borderRadius: sc(999),
    borderWidth: 1,
  },
  dot: {
    width: sc(7),
    height: sc(7),
    borderRadius: sc(4),
  },
  label: {
    fontSize: sc(11),
  },
});

export default StatusChip;
