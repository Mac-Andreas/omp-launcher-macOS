import { ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTheme } from "../states/theme";
import { sc } from "../utils/sizeScaler";
import Text from "./Text";

export interface DropdownBadge {
  label: string;
  tone?: "primary" | "neutral" | "warning" | "accent";
}

export interface DropdownItemMeta {
  badges?: DropdownBadge[];
  // Disabled items render dimmed and cannot be selected. Useful for "context
  // only" rows like a release-history entry the launcher cannot install.
  disabled?: boolean;
}

interface ThemedDropdownProps {
  value: string;
  items: string[];
  onChange: (value: string) => void;
  leading?: ReactNode;
  maxVisibleItems?: number;
  style?: any;
  itemMeta?: Record<string, DropdownItemMeta>;
  // Open the menu upward instead of downward — use when the field sits near
  // the bottom of its container so the menu stays inside it.
  dropUp?: boolean;
}

const ThemedDropdown = ({
  value,
  items,
  onChange,
  leading,
  maxVisibleItems = 6,
  style,
  itemMeta,
  dropUp,
}: ThemedDropdownProps) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  const badgeColors = (tone: DropdownBadge["tone"]) => {
    switch (tone) {
      case "primary":
        return {
          bg: `${theme.primary}26`,
          border: `${theme.primary}80`,
          color: theme.primary,
        };
      case "warning":
        return {
          bg: "#E5534B1F",
          border: "#E5534B66",
          color: "#E5534B",
        };
      case "accent":
        return {
          bg: "#2EA0431F",
          border: "#2EA04366",
          color: "#3FB950",
        };
      default:
        return {
          bg: `${theme.textPrimary}14`,
          border: `${theme.textPrimary}24`,
          color: `${theme.textPrimary}CC`,
        };
    }
  };

  return (
    <View style={[styles.root, style]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.field,
          {
            backgroundColor: theme.textInputBackgroundColor,
            borderColor: open
              ? `${theme.primary}99`
              : `${theme.textPrimary}1A`,
          },
        ]}
      >
        <View style={styles.fieldLeft}>
          {leading}
          <Text size={2} color={theme.textPrimary} numberOfLines={1}>
            {value}
          </Text>
        </View>
        <View style={styles.fieldRight}>
          {itemMeta?.[value]?.badges?.map((b, i) => {
            const c = badgeColors(b.tone);
            return (
              <View
                key={`field-b-${i}`}
                style={[
                  styles.badge,
                  { backgroundColor: c.bg, borderColor: c.border },
                ]}
              >
                <Text size={1} semibold color={c.color} style={styles.badgeText}>
                  {b.label}
                </Text>
              </View>
            );
          })}
          <Text
            size={1}
            color={`${theme.textPrimary}AA`}
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          >
            ▼
          </Text>
        </View>
      </Pressable>
      {open && (
        <View
          style={[
            styles.menu,
            dropUp ? styles.menuUp : styles.menuDown,
            {
              backgroundColor: theme.itemBackgroundColor,
              borderColor: `${theme.textPrimary}1F`,
            },
          ]}
        >
          <ScrollView style={{ maxHeight: sc(36) * maxVisibleItems }}>
            {items.map((item) => {
              const meta = itemMeta?.[item];
              const disabled = !!meta?.disabled;
              const selected = !disabled && item === value;
              const badges = meta?.badges;
              return (
                <Pressable
                  key={item}
                  disabled={disabled}
                  onPress={() => {
                    if (disabled) return;
                    onChange(item);
                    setOpen(false);
                  }}
                  style={({ hovered }: any) => [
                    styles.menuItem,
                    {
                      backgroundColor: selected
                        ? `${theme.primary}1F`
                        : !disabled && hovered
                        ? `${theme.primary}14`
                        : "transparent",
                      borderColor: selected
                        ? `${theme.primary}99`
                        : "transparent",
                      opacity: disabled ? 0.45 : 1,
                      // @ts-ignore
                      cursor: disabled ? "not-allowed" : "pointer",
                    },
                  ]}
                >
                  <Text
                    size={2}
                    semibold={selected}
                    color={
                      disabled
                        ? `${theme.textPrimary}80`
                        : selected
                        ? theme.primary
                        : theme.textPrimary
                    }
                    style={styles.menuItemLabel}
                  >
                    {item}
                  </Text>
                  <View style={styles.menuItemRight}>
                    {badges?.map((b, i) => {
                      const c = badgeColors(b.tone);
                      return (
                        <View
                          key={`${item}-b-${i}`}
                          style={[
                            styles.badge,
                            { backgroundColor: c.bg, borderColor: c.border },
                          ]}
                        >
                          <Text size={1} semibold color={c.color} style={styles.badgeText}>
                            {b.label}
                          </Text>
                        </View>
                      );
                    })}
                    {selected && (
                      <Text size={1} semibold color={theme.primary}>
                        ✓
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "relative",
    zIndex: 50,
  },
  field: {
    height: sc(36),
    borderRadius: sc(6),
    borderWidth: 1,
    paddingHorizontal: sc(10),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // @ts-ignore
    cursor: "pointer",
  },
  fieldLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(8),
    flex: 1,
  },
  fieldRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
  },
  menu: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: sc(6),
    borderWidth: 1,
    paddingVertical: sc(4),
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  menuDown: {
    top: sc(40),
  },
  menuUp: {
    bottom: sc(40),
  },
  menuItem: {
    paddingHorizontal: sc(10),
    paddingVertical: sc(8),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sc(8),
    // @ts-ignore
    cursor: "pointer",
  },
  menuItemLabel: {
    flexShrink: 1,
  },
  menuItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
  },
  badge: {
    paddingVertical: sc(1),
    paddingHorizontal: sc(6),
    borderRadius: sc(999),
    borderWidth: 1,
  },
  badgeText: {
    fontSize: sc(10),
    lineHeight: sc(13),
    letterSpacing: 0.4,
  },
});

export default ThemedDropdown;
