import { createContext, useContext } from "react";
import { sc } from "../../../utils/sizeScaler";

// Layout and colours shared by the server list header (ListHeader), its rows
// (Item) and the list box (List).

// Horizontal padding inside the server list box. The right side is wider so
// the overlay scrollbar sits in the gutter instead of on top of the rows.
export const LIST_PADDING_LEFT = sc(8);
export const LIST_PADDING_RIGHT = sc(12);

// Row geometry outside the columns: the lock box (+ its margin), the row's
// right padding and its 1px border on each side.
export const LOCK_AREA_WIDTH = sc(32) + sc(10);
export const ROW_PADDING_RIGHT = sc(5);
export const ROW_BORDER = 1;

// Left padding of the Players / Mode / Ping cells, in the header and rows.
export const CELL_PADDING_LEFT = 8;
// Space a header cell keeps from each column divider. The gap around every
// divider belongs to no header button, so hovering or grabbing a divider never
// triggers a sort. Equal to CELL_PADDING_LEFT so header labels still line up
// with the row values.
export const COLUMN_GUTTER = CELL_PADDING_LEFT;
export const HEADER_ICON_SIZE = sc(14);
export const HEADER_GAP = sc(5);

// Name is the flexible column; this is its floor so Mode can't squeeze it.
export const NAME_MIN_WIDTH = 150;

// Lock status colours, for the rows' lock icons and the header's lock sort
// button. The mint unlocked green washes out on the light theme, so that one
// is darker.
export const LOCKED_COLOR = "#eb4034";
export const unlockedColor = (themeType: "light" | "dark") =>
  themeType === "dark" ? "#7AF1AA" : "#1F883D";

let measureContext: CanvasRenderingContext2D | null = null;

// Rendered width of a label. Rows use Proxima Nova Regular at sc(17), the
// header its Semibold weight.
export const measureText = (text: string, semibold = false) => {
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return 0;
  measureContext.font = `${sc(17)}px "Proxima Nova ${
    semibold ? "Semibold" : "Regular"
  }"`;
  return measureContext.measureText(text).width;
};

// Width a header column needs for its icon, label and sort arrow, plus the
// divider gutters on both sides.
export const headerCellWidth = (label: string) =>
  2 * COLUMN_GUTTER +
  HEADER_ICON_SIZE +
  HEADER_GAP +
  measureText(label, true) +
  HEADER_GAP +
  sc(12) +
  6;

export interface ColumnLayout {
  playersWidth: number;
  modeWidth: number;
  pingWidth: number;
  // Bounds for dragging the Mode resizer.
  modeMinWidth: number;
  modeMaxWidth: number;
}

// Computed once per list (List) and read by the header and every row, so they
// always use identical widths.
export const ColumnLayoutContext = createContext<ColumnLayout>({
  playersWidth: 100,
  modeWidth: 200,
  pingWidth: 75,
  modeMinWidth: 100,
  modeMaxWidth: 400,
});

export const useColumnLayout = () => useContext(ColumnLayoutContext);

// Players and Ping fit their header (icon + label + arrow) and their widest
// value; Mode is the stored width, kept between its header's width and what
// leaves Name its minimum.
export const computeColumnLayout = (
  listWidth: number,
  storedModeWidth: number,
  labels: { players: string; mode: string; ping: string }
): ColumnLayout => {
  const playersWidth = Math.ceil(
    Math.max(
      headerCellWidth(labels.players),
      CELL_PADDING_LEFT + measureText("1000/1000") + 6
    )
  );
  const pingWidth = Math.ceil(
    Math.max(
      headerCellWidth(labels.ping),
      CELL_PADDING_LEFT + measureText("9999") + 6
    )
  );
  const modeMinWidth = Math.ceil(headerCellWidth(labels.mode));
  const flexible =
    listWidth -
    2 * ROW_BORDER -
    LIST_PADDING_LEFT -
    LIST_PADDING_RIGHT -
    2 * ROW_BORDER -
    ROW_PADDING_RIGHT -
    LOCK_AREA_WIDTH -
    playersWidth -
    pingWidth;
  const modeMaxWidth = Math.max(modeMinWidth, flexible - NAME_MIN_WIDTH);
  const modeWidth = Math.round(
    Math.min(modeMaxWidth, Math.max(modeMinWidth, storedModeWidth))
  );
  return { playersWidth, modeWidth, pingWidth, modeMinWidth, modeMaxWidth };
};
