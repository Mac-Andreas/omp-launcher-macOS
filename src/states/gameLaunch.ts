import { create } from "zustand";

interface GameLaunchState {
  // True while a game launch is in progress (Play clicked → game spawned).
  launching: boolean;
  setLaunching: (value: boolean) => void;
  // True while SA-MP/open.mp client files are being written to the game
  // folder, from anywhere (Settings > Game, or a server connect). Lets the
  // UI show "Installing…" instead of a stale "installed" state.
  sampInstalling: boolean;
  setSampInstalling: (value: boolean) => void;
}

export const useGameLaunch = create<GameLaunchState>((set) => ({
  launching: false,
  setLaunching: (value) => set({ launching: value }),
  sampInstalling: false,
  setSampInstalling: (value) => set({ sampInstalling: value }),
}));
