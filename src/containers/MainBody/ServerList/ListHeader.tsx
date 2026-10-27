import { t } from "i18next";
import { ReactNode, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import Icon from "../../../components/Icon";
import Text from "../../../components/Text";
import { images } from "../../../constants/images";
import {
  DEFAULT_MODE_WIDTH,
  useGenericPersistentState,
  useGenericTempState,
} from "../../../states/genericStates";
import { useTheme } from "../../../states/theme";
import { sc } from "../../../utils/sizeScaler";
import { Server } from "../../../utils/types";
import {
  CELL_PADDING_LEFT,
  COLUMN_GUTTER,
  HEADER_GAP,
  HEADER_ICON_SIZE,
  LIST_PADDING_LEFT,
  LIST_PADDING_RIGHT,
  LOCKED_COLOR,
  NAME_MIN_WIDTH,
  ROW_BORDER,
  ROW_PADDING_RIGHT,
  measureText,
  unlockedColor,
  useColumnLayout,
} from "./columns";

// Matches the rows' gap between the lock box and the name area.
const LOCK_GAP = sc(10);
const HEADER_HEIGHT = sc(34);
const CELL_HEIGHT = sc(26);

// Space a row's name cell needs besides the hostname text (open.mp icon or
// left padding, right padding, slack), for double-click auto-fit. Mirrors Item.
const OMP_ICON_SPACE = sc(32) + sc(3) * 2;
const NAME_CELL_PADDING = sc(10) + 4;

type SortKey = "sortName" | "sortPlayer" | "sortMode" | "sortPing" | "sortLock";

const SORT_KEYS: SortKey[] = [
  "sortName",
  "sortPlayer",
  "sortMode",
  "sortPing",
  "sortLock",
];

// Current sort for a column plus a toggle that cycles none -> descending ->
// ascending and clears every other column's sort.
const useColumnSort = (sortKey: SortKey) => {
  const { searchData, setSearchData } = useGenericTempState();
  const sort = searchData[sortKey];

  const toggle = () => {
    SORT_KEYS.forEach((key) => {
      if (key !== sortKey) setSearchData(key, "none");
    });
    if (sort === "none") {
      setSearchData(sortKey, "descending");
    } else if (sort === "descending") {
      setSearchData(sortKey, "ascending");
    } else {
      setSearchData(sortKey, "none");
    }
  };

  return [sort, toggle] as const;
};

interface HeaderColumnProps {
  label: string;
  icon: string;
  sortKey: SortKey;
  // Width / flex of the column, matching the list's column.
  columnStyle: StyleProp<ViewStyle>;
  // Placement of the clickable cell inside the column (gutters, alignment).
  cellStyle: StyleProp<ViewStyle>;
  // The divider on the column's left edge, if any.
  divider?: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}

// A sortable column header: icon, label and sort arrow. The arrow's space is
// always reserved so sorting never shifts the label or overflows the cell.
// Hover brightens the label. The column the list is sorted by is highlighted in
// the theme colour across the column's full width, matching the list column;
// the clickable cell itself stays inside the divider gutters.
const HeaderColumn = ({
  label,
  icon,
  sortKey,
  columnStyle,
  cellStyle,
  divider,
  onLayout,
}: HeaderColumnProps) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [sort, onPress] = useColumnSort(sortKey);
  const sorted = sort !== "none";
  const color = sorted
    ? theme.primary
    : hovered
    ? theme.textPrimary
    : theme.textSecondary;

  return (
    <View style={[styles.column, columnStyle]} onLayout={onLayout}>
      {sorted && (
        <View
          pointerEvents="none"
          style={[styles.sortTint, { backgroundColor: `${theme.primary}1F` }]}
        />
      )}
      <Pressable
        style={[styles.headerCell, cellStyle]}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
      >
        <Icon svg image={icon} size={HEADER_ICON_SIZE} color={color} />
        <Text semibold style={styles.headerLabel} color={color}>
          {label}
        </Text>
        <Text
          bold
          size={4}
          color={theme.primary}
          style={[styles.sortArrow, { opacity: sorted ? 1 : 0 }]}
        >
          {sort === "ascending" ? "↓" : "↑"}
        </Text>
      </Pressable>
      {divider}
    </View>
  );
};

// The lock column header. Clicking cycles open servers first (green unlocked
// icon) -> passworded first (red locked icon) -> unsorted (grey).
const LockHeaderCell = () => {
  const { theme, themeType } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [sort, onPress] = useColumnSort("sortLock");

  const color =
    sort === "descending"
      ? unlockedColor(themeType)
      : sort === "ascending"
      ? LOCKED_COLOR
      : hovered
      ? theme.textPrimary
      : theme.textSecondary;

  return (
    <Pressable
      style={[
        styles.lockCell,
        { backgroundColor: sort === "none" ? "transparent" : `${color}1A` },
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Icon
        svg
        image={
          sort === "descending" ? images.icons.unlocked : images.icons.locked
        }
        size={sc(20)}
        color={color}
      />
    </Pressable>
  );
};

interface ColumnDividerProps {
  // Omitted for a fixed boundary: the divider is then just a line.
  onResizeStart?: (clientX: number) => void;
  onAutoFit?: () => void;
  // Where the line sits, from the parent's left edge (default: on it).
  offset?: number;
}

// Vertical divider, by default on its parent column's left edge. It spans the
// gutter on both sides of that edge, which no header button covers, so the
// space around every divider is safe to hover. A resizable one takes a drag
// there (and a double-click to auto-fit) and highlights on hover / drag.
const ColumnDivider = ({
  onResizeStart,
  onAutoFit,
  offset = 0,
}: ColumnDividerProps) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const resizable = !!onResizeStart;
  const highlighted = resizable && (hovered || dragging);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!onResizeStart) return;
    // Stops text selection and keeps the press off the header's sort.
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    // Keep the resize cursor while the pointer is off the thin handle.
    document.body.style.cursor = "col-resize";
    const onUp = () => {
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      setDragging(false);
    };
    window.addEventListener("mouseup", onUp);
    onResizeStart(e.clientX);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onAutoFit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: offset - COLUMN_GUTTER,
        width: 2 * COLUMN_GUTTER,
        zIndex: 2,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: resizable ? "col-resize" : "default",
        pointerEvents: resizable ? "auto" : "none",
      }}
    >
      <div
        style={{
          width: highlighted ? 2 : 1,
          height: "60%",
          borderRadius: 1,
          backgroundColor: highlighted
            ? `${theme.textPrimary}80`
            : `${theme.textPrimary}33`,
        }}
      />
    </div>
  );
};

interface ListHeaderProps {
  // The full list currently shown, for double-click auto-fit.
  servers: Server[];
}

const ListHeader = ({ servers }: ListHeaderProps) => {
  const { theme } = useTheme();
  const layout = useColumnLayout();
  const setModeWidth = useGenericPersistentState((s) => s.setModeColumnWidth);
  const latest = useRef({ layout, servers });
  latest.current = { layout, servers };

  const nameWidth = useRef(0);

  const clampMode = (width: number) => {
    const { modeMinWidth, modeMaxWidth } = latest.current.layout;
    return Math.round(Math.min(modeMaxWidth, Math.max(modeMinWidth, width)));
  };

  // Two dividers resize: Mode's right edge sets Mode's width directly, and
  // Name's right edge trades width between Name and Mode (Players, fixed,
  // slides along). Name, the flexible column, absorbs the difference either
  // way. `direction` is +1 for Mode's edge and -1 for Name's.
  const startResize = (startX: number, direction: 1 | -1) => {
    const startWidth = latest.current.layout.modeWidth;
    const onMove = (e: MouseEvent) => {
      setModeWidth(clampMode(startWidth + direction * (e.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Double-click fits Mode to its longest entry in the whole list;
  // double-clicking an already-fitted column resets it to the default width.
  const autoFitMode = () => {
    const longest = latest.current.servers.reduce(
      (max, s) => Math.max(max, measureText(s.gameMode)),
      0
    );
    const fitted = clampMode(longest + CELL_PADDING_LEFT * 2 + 6);
    const current = latest.current.layout.modeWidth;
    setModeWidth(
      Math.abs(current - fitted) <= 1 ? DEFAULT_MODE_WIDTH : fitted
    );
  };

  // Same for Name: fit it to its longest hostname by giving Mode the rest.
  const autoFitName = () => {
    const longest = latest.current.servers.reduce(
      (max, s) =>
        Math.max(
          max,
          measureText(s.hostname) +
            (s.usingOmp ? OMP_ICON_SPACE : sc(10)) +
            NAME_CELL_PADDING
        ),
      0
    );
    const { modeWidth } = latest.current.layout;
    const fitted = clampMode(nameWidth.current + modeWidth - longest);
    setModeWidth(
      Math.abs(modeWidth - fitted) <= 1 ? DEFAULT_MODE_WIDTH : fitted
    );
  };

  return (
    <View
      style={[
        styles.serverContainer,
        {
          backgroundColor: `${theme.textPrimary}08`,
          borderBottomColor: `${theme.textPrimary}1F`,
        },
      ]}
    >
      <LockHeaderCell />
      <View style={styles.lockGap}>
        <ColumnDivider offset={LOCK_GAP / 2} />
      </View>
      <HeaderColumn
        label={t("name")}
        icon={images.icons.server}
        sortKey="sortName"
        columnStyle={styles.nameColumn}
        cellStyle={styles.nameCell}
        onLayout={(e) => {
          nameWidth.current = e.nativeEvent.layout.width;
        }}
      />
      <HeaderColumn
        label={t("players")}
        icon={images.icons.players}
        sortKey="sortPlayer"
        columnStyle={{ width: layout.playersWidth }}
        cellStyle={styles.playersCell}
        divider={
          <ColumnDivider
            onResizeStart={(x) => startResize(x, -1)}
            onAutoFit={autoFitName}
          />
        }
      />
      <HeaderColumn
        label={t("mode")}
        icon={images.icons.mode}
        sortKey="sortMode"
        columnStyle={{ width: layout.modeWidth }}
        cellStyle={styles.centeredCell}
        divider={<ColumnDivider />}
      />
      <HeaderColumn
        label={t("ping")}
        icon={images.icons.ping}
        sortKey="sortPing"
        columnStyle={{ width: layout.pingWidth }}
        cellStyle={styles.centeredCell}
        divider={
          <ColumnDivider
            onResizeStart={(x) => startResize(x, 1)}
            onAutoFit={autoFitMode}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // The header row of the server list table (List wraps it in the bordered
  // box, like the side panel's Player/Score and Rule/Value tables). Padded to
  // match the rows exactly: list padding plus the rows' border and right
  // padding.
  serverContainer: {
    height: HEADER_HEIGHT,
    paddingLeft: LIST_PADDING_LEFT + ROW_BORDER,
    paddingRight: LIST_PADDING_RIGHT + ROW_PADDING_RIGHT + ROW_BORDER,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  lockCell: {
    height: sc(32),
    width: sc(32),
    borderRadius: sc(5),
    justifyContent: "center",
    alignItems: "center",
    // @ts-ignore
    cursor: "pointer",
  },
  // The rows' gap between the lock box and the name, holding a divider.
  lockGap: {
    width: LOCK_GAP,
    height: "100%",
  },
  column: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  nameColumn: {
    flex: 1,
    minWidth: NAME_MIN_WIDTH,
  },
  // Sorted-column highlight: the column's full width, at the cell's height.
  sortTint: {
    position: "absolute",
    left: 0,
    right: 0,
    top: (HEADER_HEIGHT - CELL_HEIGHT) / 2,
    height: CELL_HEIGHT,
    borderRadius: sc(5),
  },
  headerCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: HEADER_GAP,
    height: CELL_HEIGHT,
    minWidth: 0,
    overflow: "hidden",
    // @ts-ignore
    cursor: "pointer",
  },
  headerLabel: {
    fontSize: sc(17),
    // Truncates inside its cell rather than running into the next column.
    flexShrink: 1,
    minWidth: 0,
  },
  sortArrow: {
    top: -1,
  },
  nameCell: {
    flex: 1,
    marginRight: COLUMN_GUTTER,
    // Lines the label up with the hostname in the rows.
    paddingLeft: sc(10),
    justifyContent: "flex-start",
  },
  // Gutters on both sides keep the cell clear of the dividers; the left one
  // also lines the label up with the row values (CELL_PADDING_LEFT).
  playersCell: {
    flex: 1,
    marginHorizontal: COLUMN_GUTTER,
    justifyContent: "flex-start",
  },
  centeredCell: {
    flex: 1,
    marginHorizontal: COLUMN_GUTTER,
    justifyContent: "center",
  },
});

export default ListHeader;
