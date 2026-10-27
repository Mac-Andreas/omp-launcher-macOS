import { create } from "zustand";

export interface MessageBoxArgs {
  title: string;
  description: string;
  buttons: {
    title: string;
    onPress: () => void;
    // Greyed out and non-interactive when true.
    disabled?: boolean;
    // By default a press closes the box; set false to keep it open (e.g. a
    // step that updates the same dialog in place).
    closeOnPress?: boolean;
    // Optional tooltip shown on a small (?) marker next to the button label.
    hint?: string;
  }[];
  boxWidth?: number;
  buttonWidth?: number;
  // Stack buttons in a full-width vertical column instead of a horizontal row.
  // Use when labels are long enough to truncate in the row layout.
  verticalButtons?: boolean;
  // Fired only when the box is dismissed without choosing a button (X or click
  // outside). Lets a caller treat a dismiss as a cancel (e.g. abort a held
  // launch). Not called when a button is pressed.
  onClose?: () => void;
}

interface MessageModalState {
  visible: boolean;
  args: MessageBoxArgs;
  showMessageBox: (args: MessageBoxArgs) => void;
  hideMessageBox: () => void;
}

const MESSAGE_BOX_WIDTH = 320;
const MESSAGE_BOX_BUTTON_WIDTH = 120;

const useMessageBox = create<MessageModalState>()((set) => ({
  visible: false,
  args: {
    title: "",
    description: "",
    buttons: [],
  },
  showMessageBox: (args) =>
    set(() => ({
      visible: true,
      args: {
        ...args,
        boxWidth: args.boxWidth ? args.boxWidth : MESSAGE_BOX_WIDTH,
        buttonWidth: args.buttonWidth
          ? args.buttonWidth
          : MESSAGE_BOX_BUTTON_WIDTH,
      },
    })),
  hideMessageBox: () =>
    set(() => ({
      visible: false,
      args: {
        title: "",
        description: "",
        buttons: [],
      },
    })),
}));

export { useMessageBox };
