import { Clipboard } from "@react-native-clipboard/clipboard/dist/Clipboard.web";
import { shell } from "@tauri-apps/api";
import { t } from "i18next";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import Icon from "../../components/Icon";
import Text from "../../components/Text";
import { images } from "../../constants/images";
import { usePersistentServers, useServers } from "../../states/servers";
import { useTheme } from "../../states/theme";
import { sc } from "../../utils/sizeScaler";
import { validateWebUrl } from "../../utils/validation";
import Chart from "../PingChart";
import {
  FAV_ADD_COLOR,
  FAV_REMOVE_COLOR,
} from "./ServerList/SearchBar";

const COPIED_DISPLAY_MS = 1500;

interface PropInfoProps {
  glow?: boolean;
  text: ReactNode;
  icon: string;
  iconSize: number;
  iconTitle: string;
  // When set, the row copies this to the clipboard on click, with a
  // "Click to copy" tooltip on hover.
  copyValue?: string;
}

const PropInfo = ({
  glow,
  text,
  icon,
  iconSize,
  iconTitle,
  copyValue,
}: PropInfoProps) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  const iconComponent = glow ? (
    <div style={{ filter: `drop-shadow(0 0 8px ${theme.primary}AA)` }}>
      <Icon title={iconTitle} image={icon} size={iconSize} />
    </div>
  ) : (
    <Icon
      title={iconTitle}
      image={icon}
      size={iconSize}
      color={`${theme.textPrimary}99`}
    />
  );

  const content = (
    <>
      <View
        style={[
          styles.iconWrapper,
          {
            backgroundColor: theme.itemBackgroundColor,
            borderWidth: 1,
            borderColor: `${theme.textPrimary}26`,
          },
        ]}
      >
        {iconComponent}
      </View>
      <Text semibold color={theme.textPrimary} style={styles.propInfoText}>
        {text}
      </Text>
    </>
  );

  if (!copyValue) {
    return <View style={styles.propInfoContainer}>{content}</View>;
  }

  const copy = () => {
    Clipboard.setString(copyValue);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_DISPLAY_MS);
  };

  return (
    <Pressable
      style={[styles.propInfoContainer, styles.copyRow]}
      onPress={copy}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {content}
      {(hovered || copied) && (
        <View
          pointerEvents="none"
          style={[
            styles.copyTip,
            {
              backgroundColor: theme.secondary,
              borderColor: `${theme.textPrimary}26`,
            },
          ]}
        >
          <Text size={1} semibold color={copied ? theme.primary : theme.textPrimary}>
            {copied
              ? t("copiedToClipboard", { defaultValue: "Copied" })
              : t("click_to_copy", { defaultValue: "Click to copy" })}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const BottomBar = () => {
  const { selected: server } = useServers();
  const { favorites, addToFavorites, removeFromFavorites } =
    usePersistentServers();
  const { theme } = useTheme();

  const favorited = useMemo(() => {
    const find = favorites.find(
      (fav) => server && fav.ip === server.ip && fav.port == server.port
    );
    return find !== undefined;
  }, [server, favorites]);

  const discordInvite = useMemo(() => {
    if (server && server.omp && server.omp.discordInvite) {
      if (validateWebUrl(server.omp.discordInvite)) {
        return server.omp.discordInvite;
      }
    }
    return "";
  }, [server]);

  // Bordered box like the list and side-panel tables. Always shown; with no
  // server selected it holds a hint instead of the details.
  const boxStyle = [
    styles.box,
    {
      backgroundColor: theme.itemBackgroundColor,
      borderColor: `${theme.textPrimary}1F`,
    },
  ];

  if (!server) {
    return (
      <View style={boxStyle}>
        <View style={[styles.serverProperties, styles.placeholder]}>
          <Icon
            svg
            image={images.icons.server}
            size={sc(16)}
            color={`${theme.textPrimary}66`}
          />
          <Text size={2} color={`${theme.textPrimary}88`}>
            {t("bottom_bar_select_server", {
              defaultValue: "Select a server from the list to view its details.",
            })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={boxStyle}>
      <View style={[styles.serverProperties]}>
        <View style={styles.mainContent}>
          <View style={styles.leftColumn}>
            <PropInfo
              iconTitle={server.usingOmp ? t("openmp_server") : ""}
              icon={server.usingOmp ? images.icons.omp : images.icons.internet}
              iconSize={server.usingOmp ? sc(20) : sc(16)}
              text={server.hostname}
              glow={server.usingOmp}
              copyValue={server.hostname}
            />
            <PropInfo
              iconTitle=""
              icon={images.icons.ip}
              iconSize={sc(14)}
              text={`${server.ip}:${server.port}`}
              copyValue={`${server.ip}:${server.port}`}
            />
            {/* Same style as the list: current count, then a muted "/max". */}
            <PropInfo
              iconTitle=""
              icon={images.icons.nickname}
              iconSize={sc(15)}
              text={
                <>
                  {server.playerCount}
                  <Text semibold color={`${theme.textPrimary}AA`}>
                    /{server.maxPlayers}
                  </Text>
                </>
              }
            />
          </View>
          <View style={styles.rightColumn}>
            <PropInfo
              iconTitle=""
              icon={images.icons.language}
              iconSize={sc(17)}
              text={server.language}
            />
            {discordInvite.length ? (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#5865F2" }]}
                onPress={() => shell.open(discordInvite)}
              >
                <View style={styles.actionIcon}>
                  <Icon
                    svg
                    image={images.icons.discord}
                    size={sc(16)}
                    color="#FFFFFF"
                  />
                </View>
                <Text semibold color="#FFFFFF" style={styles.actionButtonText}>
                  {t("join_discord")}
                </Text>
                <Icon
                  svg
                  image={images.icons.external}
                  size={sc(11)}
                  color="#FFFFFF"
                  style={{ marginLeft: sc(5) }}
                />
              </TouchableOpacity>
            ) : (
              <PropInfo
                iconTitle=""
                icon={images.icons.mode}
                iconSize={sc(17)}
                text={server.gameMode}
              />
            )}
            <TouchableOpacity
              style={[
                styles.actionButton,
                // Same colours as the toolbar's favourite button.
                { backgroundColor: favorited ? FAV_REMOVE_COLOR : FAV_ADD_COLOR },
              ]}
              onPress={() => {
                if (favorited) {
                  removeFromFavorites(server);
                } else {
                  addToFavorites(server);
                }
              }}
            >
              <View style={styles.actionIcon}>
                <Icon
                  svg
                  image={favorited ? images.icons.favRemove : images.icons.favAdd}
                  size={sc(16)}
                  color="#FFFFFF"
                />
              </View>
              <Text semibold color="#FFFFFF" style={styles.actionButtonText}>
                {favorited ? t("remove_from_favorites") : t("add_to_favorites")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Chart containerStyle={styles.chartContainer} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    marginTop: sc(8),
    paddingHorizontal: sc(10),
    paddingVertical: sc(6),
    borderWidth: 1,
    borderRadius: sc(6),
  },
  serverProperties: {
    width: "100%",
    height: sc(95),
    flexDirection: "row",
    justifyContent: "space-between",
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    gap: sc(8),
  },
  // Fills the box height; Chart.js sizes the chart to its container.
  chartContainer: {
    width: "40%",
    height: "100%",
  },
  propInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  iconWrapper: {
    height: sc(28),
    width: sc(28),
    borderRadius: sc(5),
    justifyContent: "center",
    alignItems: "center",
  },
  propInfoText: {
    fontSize: sc(15),
    marginLeft: sc(8),
  },
  // Click-to-copy rows size to their content so only the text is the target.
  copyRow: {
    width: "auto",
    alignSelf: "flex-start",
    // @ts-ignore
    cursor: "pointer",
  },
  copyTip: {
    position: "absolute",
    left: sc(36),
    bottom: "100%",
    marginBottom: sc(3),
    paddingHorizontal: sc(8),
    paddingVertical: sc(4),
    borderRadius: sc(5),
    borderWidth: 1,
    zIndex: 10,
  },
  leftColumn: {
    flex: 0.6,
    justifyContent: "space-between",
  },
  rightColumn: {
    flex: 0.4,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
  },
  actionButton: {
    height: sc(28),
    // No left padding: the icon box below is as wide as PropInfo's icon box,
    // so icons and labels line up with the rows above.
    paddingRight: sc(10),
    borderRadius: sc(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: sc(15),
    marginLeft: sc(8),
  },
  actionIcon: {
    width: sc(28),
    height: sc(28),
    justifyContent: "center",
    alignItems: "center",
  },
});

export default BottomBar;
