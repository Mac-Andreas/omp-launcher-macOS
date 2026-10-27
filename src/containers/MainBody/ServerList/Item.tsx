import { t } from "i18next";
import { memo, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import { images } from "../../../constants/images";
import { useDraggableItem } from "../../../hooks/draggable";
import { useContextMenu } from "../../../states/contextMenu";
import { useJoinServerPrompt } from "../../../states/joinServerPrompt";
import { useTheme } from "../../../states/theme";
import { useGenericTempState } from "../../../states/genericStates";
import { pingColor } from "../../../utils/pingColor";
import { PING_TIMEOUT_VALUE } from "../../../utils/query";
import { sc } from "../../../utils/sizeScaler";
import { Server } from "../../../utils/types";
import {
  CELL_PADDING_LEFT,
  LOCKED_COLOR,
  NAME_MIN_WIDTH,
  ROW_BORDER,
  ROW_PADDING_RIGHT,
  unlockedColor,
  useColumnLayout,
} from "./columns";

const DOUBLE_PRESS_MS = 500;

interface IProps {
  server: Server;
  index: number;
  isSelected?: boolean;
  onSelect?: (server: Server) => void;
  isDraggable?: boolean;
  isBeingDragged?: boolean;
}

const ServerItem = memo((props: IProps) => {
  const { server, index, isDraggable = false, isBeingDragged = false } = props;
  const { theme, themeType } = useTheme();
  const lastPressTime = useRef(0);
  const pendingDeselect = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showPrompt, setServer } = useJoinServerPrompt();
  const { show: showContextMenu } = useContextMenu();
  const columns = useColumnLayout();

  const { attributes, listeners, setNodeRef, isDragging, style } =
    useDraggableItem(`${server.ip}:${server.port}`, isDraggable);

  useEffect(
    () => () => {
      if (pendingDeselect.current) clearTimeout(pendingDeselect.current);
    },
    []
  );

  // Opens the join prompt; the row stays selected behind it.
  const onDoublePress = () => {
    setServer(server);
    showPrompt(true);
  };

  const onPress = () => {
    if (isDragging) return;

    const delta = Date.now() - lastPressTime.current;

    if (delta < DOUBLE_PRESS_MS) {
      lastPressTime.current = 0;
      if (pendingDeselect.current) {
        clearTimeout(pendingDeselect.current);
        pendingDeselect.current = null;
      }
      onDoublePress();
    } else {
      lastPressTime.current = Date.now();
      if (props.isSelected) {
        // A click on the selected row deselects it (the tab's onSelect
        // toggles), but only once the double-click window has passed, so a
        // double-click opens the prompt without dropping the selection.
        pendingDeselect.current = setTimeout(() => {
          pendingDeselect.current = null;
          props.onSelect?.(server);
        }, DOUBLE_PRESS_MS);
      } else {
        props.onSelect?.(server);
      }
    }
  };

  // Lock box: red locked / green open, each on a tint (dropped on the
  // selected row so it doesn't clash with the selection colour); an offline
  // or not-yet-queried server just shows a plain "?".
  const getServerStatusInfo = (hasPassword: boolean, ping: number) => {
    if (hasPassword) {
      return {
        color: LOCKED_COLOR,
        backgroundColor: `${LOCKED_COLOR}3A`,
        title: t("locked"),
        icon: images.icons.locked,
      };
    } else if (ping < PING_TIMEOUT_VALUE) {
      const green = unlockedColor(themeType);
      return {
        color: green,
        backgroundColor: `${green}1A`,
        title: t("unlocked"),
        icon: images.icons.unlocked,
      };
    } else {
      return {
        // Brighter than textSecondary, which is too faint in dark mode.
        color: `${theme.textPrimary}99`,
        backgroundColor: "transparent",
        title: t("offline"),
        icon: images.icons.unknown,
      };
    }
  };

  const statusInfo = getServerStatusInfo(server.hasPassword, server.ping);

  // Ping is coloured by its band only while the list is sorted by ping.
  const sortPing = useGenericTempState((s) => s.searchData.sortPing);
  const pingTextColor =
    sortPing !== "none" && server.ping < PING_TIMEOUT_VALUE
      ? pingColor(server.ping, themeType) ?? theme.textSecondary
      : theme.textSecondary;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        opacity: isDragging || isBeingDragged ? 0.7 : 1,
        zIndex: isDragging ? 1000 : 1,
      }}
      {...(isDraggable ? listeners : {})}
      {...(isDraggable ? attributes : {})}
    >
      <View
        style={[
          styles.pressableContainer,
          {
            marginTop: 0,
          },
        ]}
      >
        <Pressable
          key={"server-item-" + index}
          style={[
            styles.pressableContainer,
            {
              // @ts-ignore
              cursor: isDragging ? "grabbing" : "default",
            },
          ]}
          onPress={() => onPress()}
          // @ts-ignore
          onContextMenu={(e) => {
            e.preventDefault();
            showContextMenu({ x: e.clientX, y: e.clientY }, server);
            return e;
          }}
        >
          {/* The whole row, lock included, carries the hover (main.css, via
              the id) and selection colours. */}
          <View
            id={
              !props.isSelected
                ? themeType === "dark"
                  ? "server-list-item-dark"
                  : "server-list-item-light"
                : undefined
            }
            style={[
              styles.serverContainer,
              {
                borderColor: props.isSelected ? "transparent" : undefined,
                backgroundColor: props.isSelected
                  ? theme.primary + "7D"
                  : undefined,
              },
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: props.isSelected
                    ? "transparent"
                    : statusInfo.backgroundColor,
                  // @ts-ignore
                  userSelect: "none",
                },
              ]}
            >
              <Icon
                svg
                title={statusInfo.title}
                image={statusInfo.icon}
                size={sc(20)}
                color={statusInfo.color}
              />
            </View>
            {/* Name takes the remaining width; the other columns use the
                shared layout (columns.ts) so they line up with the header. */}
            <View style={styles.nameArea}>
              {server.usingOmp && (
                <div
                  style={{
                    filter: `drop-shadow(0 0 8px ${theme.primary}CC)`,
                  }}
                >
                  <View
                    style={[styles.iconContainer, { marginHorizontal: sc(3) }]}
                  >
                    <Icon
                      title={t("openmp_server")}
                      image={images.icons.omp}
                      size={sc(23)}
                    />
                  </View>
                </div>
              )}
              <View
                style={[
                  styles.commonFieldContainer,
                  styles.hostNameContainer,
                  { paddingLeft: server.usingOmp ? 0 : sc(10) },
                ]}
              >
                <Text style={{ fontSize: sc(17) }} color={theme.textPrimary}>
                  {server.hostname}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.commonFieldContainer,
                styles.playersFieldContainer,
                { width: columns.playersWidth },
              ]}
            >
              <Text style={{ fontSize: sc(17) }} color={theme.textPrimary}>
                {server.playerCount}
                <Text
                  style={{ fontSize: sc(17) }}
                  color={theme.textPrimary + "AA"}
                >
                  /{server.maxPlayers}
                </Text>
              </Text>
            </View>
            <View
              style={[
                styles.commonFieldContainer,
                styles.gameModeContainer,
                { width: columns.modeWidth },
              ]}
            >
              {/* Centred when it fits; capped at the column width, a longer
                  mode fills it from the left edge and ends in "…". */}
              <Text style={styles.cellText} color={theme.textPrimary}>
                {server.gameMode}
              </Text>
            </View>
            <View
              style={[
                styles.commonFieldContainer,
                styles.pingFieldContainer,
                { width: columns.pingWidth },
              ]}
            >
              <Text style={styles.cellText} color={pingTextColor}>
                {server.ping === PING_TIMEOUT_VALUE ? "-" : server.ping}
              </Text>
            </View>
          </View>
        </Pressable>
      </View>
    </div>
  );
});

const styles = StyleSheet.create({
  pressableContainer: {
    // With the row's 2px of border below, rows stay sc(39) tall (List's
    // ITEM_HEIGHT).
    marginTop: sc(7) - 2,
  },
  serverContainer: {
    height: sc(32) + 2,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingRight: ROW_PADDING_RIGHT,
    borderRadius: sc(5),
    // Always 1px so hover (main.css) doesn't shift the row. The hover colour
    // comes from the id selector, so only the selected row (which has no id)
    // sets a colour inline.
    borderWidth: ROW_BORDER,
  },
  nameArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    minWidth: NAME_MIN_WIDTH,
  },
  iconContainer: {
    height: sc(32),
    width: sc(32),
    marginRight: sc(10),
    borderRadius: sc(5),
    justifyContent: "center",
    alignItems: "center",
  },
  commonFieldContainer: {
    justifyContent: "center",
  },
  hostNameContainer: {
    flex: 1,
    paddingRight: sc(10),
  },
  playersFieldContainer: {
    paddingLeft: CELL_PADDING_LEFT,
    alignItems: "flex-start",
  },
  pingFieldContainer: {
    paddingHorizontal: CELL_PADDING_LEFT / 2,
    alignItems: "center",
  },
  gameModeContainer: {
    paddingHorizontal: CELL_PADDING_LEFT / 2,
    alignItems: "center",
  },
  cellText: {
    fontSize: sc(17),
    maxWidth: "100%",
  },
});

export default ServerItem;
