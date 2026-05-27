import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import Icon from "./Icon";
import Text from "./Text";

interface SettingsTileProps {
  title: string;
  subtitle?: string;
  icon?: string;
  iconSvg?: boolean;
  iconColor?: string;
  tone?: "default" | "danger";
  children?: ReactNode;
}

// Grouping container used on the redesigned Settings tabs. Renders a titled
// card with an optional icon, optional subtitle, and arbitrary children
// (rows of buttons / inputs / status chips).
const SettingsTile = ({
  title,
  subtitle,
  icon,
  iconSvg,
  iconColor,
  tone = "default",
  children,
}: SettingsTileProps) => {
  const { theme } = useTheme();
  const danger = tone === "danger";
  const titleColor = danger ? "#E5534B" : theme.textPrimary;
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: theme.itemBackgroundColor,
          borderColor: danger ? `${"#E5534B"}55` : `${theme.textPrimary}10`,
        },
      ]}
    >
      <View style={styles.header}>
        {icon && (
          <Icon
            image={icon}
            svg={!!iconSvg}
            size={sc(14)}
            color={iconColor || (danger ? "#E5534B" : `${theme.textPrimary}CC`)}
          />
        )}
        <Text semibold size={2} color={titleColor} style={styles.title}>
          {title}
        </Text>
      </View>
      {subtitle && (
        <Text
          size={1}
          color={`${theme.textPrimary}88`}
          style={styles.subtitle}
        >
          {subtitle}
        </Text>
      )}
      <View style={styles.body}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: sc(10),
    borderWidth: 1,
    paddingVertical: sc(12),
    paddingHorizontal: sc(14),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
  },
  title: {
    flex: 1,
  },
  subtitle: {
    marginTop: sc(4),
    lineHeight: sc(16),
  },
  body: {
    marginTop: sc(10),
    gap: sc(8),
  },
});

export default SettingsTile;
