import { create } from "zustand";

// Small global flag: set when something blocks a join because the user has no
// nickname set. NavBar reads it to highlight the nickname input + render an
// inline "required" chip, replacing the old modal popup.
interface NicknameAlertState {
  required: boolean;
  trigger: () => void;
  clear: () => void;
}

export const useNicknameAlert = create<NicknameAlertState>((set) => ({
  required: false,
  trigger: () => set({ required: true }),
  clear: () => set({ required: false }),
}));
