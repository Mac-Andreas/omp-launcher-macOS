import { t } from "i18next";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import BigList from "react-native-big-list";
import {
  useGenericPersistentState,
  useGenericTempState,
} from "../../../states/genericStates";
import { useModalOverlay } from "../../../states/modalOverlay";
import { useServers } from "../../../states/servers";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
import { Server } from "../../../utils/types";
import {
  ColumnLayoutContext,
  computeColumnLayout,
  LIST_PADDING_LEFT,
  LIST_PADDING_RIGHT,
} from "./columns";
import ListHeader from "./ListHeader";

interface IProps {
  data: Server[];
  renderItem: (item: Server, index: number) => JSX.Element;
  containerStyle?: StyleProp<ViewStyle>;
  listRef?: React.RefObject<any>;
  // The tab's row-select handler; arrow-key navigation selects through it so
  // the tab's server query restarts like a click would.
  onSelect?: (server: Server) => void;
}

const ITEM_HEIGHT = sc(39);

// The server list as a bordered table, matching the side panel's Player/Score
// and Rule/Value boxes: header row inside, rows below.
const List = (props: IProps) => {
  const { theme, themeType } = useTheme();
  const bigListRef = useRef<BigList<Server>>(null);
  const { sortName, sortPlayer, sortMode, sortPing, sortLock } =
    useGenericTempState((s) => s.searchData);

  // Jump back to the top whenever a column sort changes, so the rows the new
  // order puts first are the ones in view.
  useEffect(() => {
    bigListRef.current?.scrollToTop({ animated: false });
  }, [sortName, sortPlayer, sortMode, sortPing, sortLock]);

  // Column widths for the header and every row, recomputed when the list
  // resizes, the Mode column is dragged, or the language changes the labels.
  const [listWidth, setListWidth] = useState(0);
  const modeColumnWidth = useGenericPersistentState((s) => s.modeColumnWidth);
  const language = useGenericPersistentState((s) => s.language);
  const columnLayout = useMemo(
    () =>
      computeColumnLayout(listWidth, modeColumnWidth, {
        players: t("players"),
        mode: t("mode"),
        ping: t("ping"),
      }),
    [listWidth, modeColumnWidth, language]
  );

  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const latestProps = useRef(props);
  latestProps.current = props;

  // Up/Down move the selection through the list in its current order (sort
  // and filters applied), scrolling just enough to keep the row in view. Esc
  // clears the selection (the tab's onSelect toggles off the selected server).
  // Ignored while typing in a field or while a modal is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp", "Escape"].includes(e.key)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (useModalOverlay.getState().openCount > 0) return;

      const { data, onSelect } = latestProps.current;
      const { selected } = useServers.getState();
      if (!onSelect || !selected) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onSelect(selected);
        return;
      }
      const index = data.findIndex(
        (s) => s.ip === selected.ip && s.port === selected.port
      );
      if (index === -1) return;
      const next = index + (e.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= data.length) return;

      e.preventDefault();
      onSelect(data[next]);

      const top = next * ITEM_HEIGHT;
      const bottom = top + ITEM_HEIGHT;
      if (top < scrollY.current) {
        bigListRef.current?.scrollTo({ y: top, animated: false });
      } else if (bottom > scrollY.current + viewportHeight.current) {
        bigListRef.current?.scrollTo({
          y: bottom - viewportHeight.current,
          animated: false,
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <View
      style={[
        styles.mainContainer,
        {
          backgroundColor: theme.itemBackgroundColor,
          borderColor: `${theme.textPrimary}1F`,
        },
      ]}
      ref={props.listRef}
      id="main-container"
      onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
    >
      <ColumnLayoutContext.Provider value={columnLayout}>
        <ListHeader servers={props.data} />
        <BigList
          ref={bigListRef}
          id={themeType === "dark" ? "scroll" : "scroll-light"}
          contentContainerStyle={[styles.listContent, props.containerStyle]}
          data={props.data}
          // BigList reuses a row's element for whichever server lands at its
          // position, so after a re-sort (e.g. by live ping) a row could keep
          // the previous server's selection colour or double-click timing.
          // Keying by server remounts the row instead.
          renderItem={(info) => (
            <Fragment key={`${info.item.ip}:${info.item.port}`}>
              {props.renderItem(info.item, info.index)}
            </Fragment>
          )}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          onLayout={(e) => {
            viewportHeight.current = e.nativeEvent.layout.height;
          }}
          headerHeight={0}
          itemHeight={ITEM_HEIGHT}
          renderFooter={null}
          renderHeader={null}
        />
      </ColumnLayoutContext.Provider>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    marginTop: sc(5),
    borderWidth: 1,
    borderRadius: sc(6),
    overflow: "hidden",
  },
  listContent: {
    paddingLeft: LIST_PADDING_LEFT,
    paddingRight: LIST_PADDING_RIGHT,
  },
});

export default List;
