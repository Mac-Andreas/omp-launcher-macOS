import { shell } from "@tauri-apps/api";
import { t } from "i18next";
import { ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import { images } from "../../../constants/images";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
// Vite ?raw import: ships the LICENSE file as a string in the bundle so the
// "Full license" section stays in sync with the repo's actual license text
// without a runtime fs read.
import licenseText from "../../../../LICENSE?raw";

interface Tile {
  icon: string;
  svg?: boolean;
  label: string;
}

type SectionId = "allow" | "deny" | "full";

const License = () => {
  const { theme } = useTheme();
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    allow: false,
    deny: false,
    full: false,
  });

  const allowTiles: Tile[] = useMemo(
    () => [
      {
        icon: images.icons.connect,
        label: t("license_allow_use", { defaultValue: "Use & play" }),
      },
      {
        icon: images.icons.game,
        svg: true,
        label: t("license_allow_commercial", { defaultValue: "Commercial use" }),
      },
      {
        icon: images.icons.mode,
        svg: true,
        label: t("license_allow_modify", { defaultValue: "Modify code" }),
      },
      {
        icon: images.icons.link,
        svg: true,
        label: t("license_allow_distribute", { defaultValue: "Redistribute" }),
      },
      {
        icon: images.icons.add,
        svg: true,
        label: t("license_allow_combine", { defaultValue: "Combine with own code" }),
      },
      {
        icon: images.icons.partner,
        svg: true,
        label: t("license_allow_patent", { defaultValue: "Patent grant" }),
      },
      {
        icon: images.icons.unfavorite,
        label: t("license_allow_private", { defaultValue: "Private use" }),
      },
      {
        icon: images.icons.info,
        label: t("license_allow_keep_notice", {
          defaultValue: "Keep license & notices",
        }),
      },
    ],
    [t]
  );

  const denyTiles: Tile[] = useMemo(
    () => [
      {
        icon: images.icons.windowClose,
        svg: true,
        label: t("license_deny_rebrand", {
          defaultValue: "Rename / rebrand",
        }),
      },
      {
        icon: images.icons.omp,
        label: t("license_deny_trademark", {
          defaultValue: "Use open.mp trademarks",
        }),
      },
      {
        icon: images.icons.favRemove,
        svg: true,
        label: t("license_deny_change_branding", {
          defaultValue: "Alter logos / icons",
        }),
      },
      {
        icon: images.icons.locked,
        svg: true,
        label: t("license_deny_sublicense_proprietary", {
          defaultValue: "Sublicense as proprietary",
        }),
      },
      {
        icon: images.icons.windowClose,
        svg: true,
        label: t("license_deny_liability", {
          defaultValue: "Hold authors liable",
        }),
      },
      {
        icon: images.icons.windowClose,
        svg: true,
        label: t("license_deny_warranty", {
          defaultValue: "Expect warranty",
        }),
      },
    ],
    [t]
  );

  const toggle = (id: SectionId) =>
    setOpen((s) => ({ ...s, [id]: !s[id] }));

  const SectionHeader = ({
    id,
    title,
    accent,
    iconColor,
  }: {
    id: SectionId;
    title: string;
    accent: string;
    iconColor?: string;
  }) => (
    <Pressable
      onPress={() => toggle(id)}
      style={({ hovered }: any) => [
        styles.sectionHeader,
        {
          backgroundColor: hovered
            ? `${theme.textPrimary}08`
            : "transparent",
          borderColor: `${theme.textPrimary}1F`,
        },
      ]}
    >
      <View style={[styles.headerDot, { backgroundColor: accent }]} />
      <Text
        semibold
        size={2}
        color={iconColor || theme.textPrimary}
        style={styles.headerTitle}
      >
        {title}
      </Text>
      <Text size={1} color={`${theme.textPrimary}88`}>
        {open[id] ? "▾" : "▸"}
      </Text>
    </Pressable>
  );

  const TileList = ({
    tiles,
    accent,
  }: {
    tiles: Tile[];
    accent: string;
  }) => (
    <View
      style={[
        styles.tileList,
        {
          borderColor: `${accent}40`,
          backgroundColor: `${accent}0D`,
        },
      ]}
    >
      {tiles.map((tile, i) => (
        <View
          key={`${tile.label}-${i}`}
          style={[
            styles.tileRow,
            i < tiles.length - 1 && {
              borderBottomWidth: 1,
              borderBottomColor: `${theme.textPrimary}12`,
            },
          ]}
        >
          <Icon
            svg={tile.svg}
            image={tile.icon}
            size={sc(15)}
            color={accent}
          />
          <Text
            size={2}
            semibold
            color={theme.textPrimary}
            style={styles.tileRowText}
            numberOfLines={1}
          >
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );

  const Collapsible = ({
    id,
    children,
  }: {
    id: SectionId;
    children: ReactNode;
  }) =>
    open[id] ? (
      <View style={styles.sectionBody}>{children}</View>
    ) : null;

  const ALLOW = "#3FB950";
  const DENY = "#E5534B";

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.acceptedBanner,
          {
            borderColor: `${theme.primary}88`,
            backgroundColor: `${theme.primary}10`,
          },
        ]}
      >
        <Icon
          svg
          image={images.icons.unlocked}
          size={sc(16)}
          color={theme.primary}
        />
        <View style={styles.acceptedText}>
          <Text semibold size={2} color={theme.primary}>
            {t("license_accepted_title", {
              defaultValue: "License accepted at install",
            })}
          </Text>
          <Text
            size={1}
            color={`${theme.textPrimary}AA`}
            style={styles.acceptedSub}
            numberOfLines={0}
          >
            {t("license_accepted_sub", {
              defaultValue:
                "You agreed to these terms when you ran the .pkg installer. Continued use of this software means you still accept them.",
            })}
          </Text>
        </View>
      </View>

      <Text size={1} color={`${theme.textPrimary}99`} style={styles.intro}>
        {t("license_intro", {
          defaultValue:
            "Licensed under MPL 2.0 with an open.mp trademark supplement. Quick view below; expand for details.",
        })}
      </Text>

      <SectionHeader
        id="allow"
        title={t("license_section_allow", {
          defaultValue: "What you can do",
        })}
        accent={ALLOW}
      />
      <Collapsible id="allow">
        <TileList tiles={allowTiles} accent={ALLOW} />
      </Collapsible>

      <SectionHeader
        id="deny"
        title={t("license_section_deny", {
          defaultValue: "What you can't do",
        })}
        accent={DENY}
      />
      <Collapsible id="deny">
        <TileList tiles={denyTiles} accent={DENY} />
      </Collapsible>

      <SectionHeader
        id="full"
        title={t("license_section_full", { defaultValue: "Full license" })}
        accent={theme.primary}
      />
      <Collapsible id="full">
        <View
          style={[
            styles.fullBox,
            {
              borderColor: `${theme.textPrimary}1F`,
              backgroundColor: theme.itemBackgroundColor,
            },
          ]}
        >
          <ScrollView
            style={styles.fullScroll}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <Text
              size={1}
              color={`${theme.textPrimary}CC`}
              style={styles.fullText}
              numberOfLines={0}
              selectable
            >
              {licenseText}
            </Text>
          </ScrollView>
          <Pressable
            onPress={() =>
              shell.open(
                "https://github.com/Mac-Andreas/omp-launcher-macOS/blob/master/LICENSE"
              )
            }
            style={[
              styles.fullLink,
              {
                borderColor: `${theme.primary}55`,
                backgroundColor: `${theme.primary}14`,
              },
            ]}
          >
            <Icon
              svg
              image={images.icons.link}
              size={sc(12)}
              color={theme.primary}
            />
            <Text size={1} semibold color={theme.primary}>
              {t("license_open_on_github", {
                defaultValue: "Open on GitHub",
              })}
            </Text>
          </Pressable>
        </View>
      </Collapsible>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: sc(14),
    paddingVertical: sc(12),
    gap: sc(8),
  },
  intro: {
    lineHeight: sc(16),
    marginBottom: sc(2),
  },
  acceptedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sc(10),
    paddingVertical: sc(10),
    paddingHorizontal: sc(12),
    borderRadius: sc(8),
    borderWidth: 1,
    // @ts-ignore - RN-web honors borderStyle "dashed"
    borderStyle: "dashed",
  },
  acceptedText: {
    flex: 1,
  },
  acceptedSub: {
    marginTop: sc(2),
    lineHeight: sc(16),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(10),
    paddingVertical: sc(10),
    paddingHorizontal: sc(12),
    borderRadius: sc(8),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
  headerDot: {
    width: sc(8),
    height: sc(8),
    borderRadius: sc(4),
  },
  headerTitle: {
    flex: 1,
  },
  sectionBody: {
    paddingTop: sc(8),
    paddingBottom: sc(4),
  },
  tileList: {
    borderWidth: 1,
    borderRadius: sc(8),
    paddingHorizontal: sc(12),
    overflow: "hidden",
  },
  tileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(10),
    paddingVertical: sc(9),
  },
  tileRowText: {
    flex: 1,
  },
  fullBox: {
    borderWidth: 1,
    borderRadius: sc(8),
    padding: sc(10),
    gap: sc(8),
  },
  fullScroll: {
    maxHeight: sc(220),
  },
  fullText: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: sc(11),
    lineHeight: sc(15),
  },
  fullLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: sc(6),
    alignSelf: "flex-start",
    paddingVertical: sc(5),
    paddingHorizontal: sc(10),
    borderRadius: sc(6),
    borderWidth: 1,
    // @ts-ignore
    cursor: "pointer",
  },
});

export default License;
