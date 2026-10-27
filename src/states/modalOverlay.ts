import { create } from "zustand";

// How many StaticModals are mounted. StaticModal's backdrop only covers the app
// body, so the title bar reads this to dim itself too while any modal is open
// (leaving just the native traffic lights usable).
interface ModalOverlayState {
  openCount: number;
  open: () => void;
  close: () => void;
}

export const useModalOverlay = create<ModalOverlayState>()((set) => ({
  openCount: 0,
  open: () => set((s) => ({ openCount: s.openCount + 1 })),
  close: () => set((s) => ({ openCount: Math.max(0, s.openCount - 1) })),
}));
