import { create } from "zustand";

interface GameLaunchState {
  // True while a game launch is in progress (Play clicked → game spawned).
  launching: boolean;
  setLaunching: (value: boolean) => void;
  // True while the launch overlay is shown but the launch is held behind a
  // pre-launch prompt (e.g. the macOS audio-crash warning). The overlay shows a
  // paused/amber state instead of the animated "in progress" bar.
  paused: boolean;
  setPaused: (value: boolean) => void;
  // True while the macOS audio-crash gate MessageBox is the visible popup. The
  // launch overlay then renders only its dim backdrop (no competing card) so the
  // gate reads as a single popup instead of two stacked dialogs.
  gateOpen: boolean;
  setGateOpen: (value: boolean) => void;
  // True while SA-MP/open.mp client files are being written to the game
  // folder, from anywhere (Settings > Game, or a server connect). Lets the
  // UI show "Installing…" instead of a stale "installed" state.
  sampInstalling: boolean;
  setSampInstalling: (value: boolean) => void;
  // Auto-retry after a crash: which attempt this is (0 = the first launch, no
  // retry yet) and how many retries there are in all. The launch overlay shows
  // "Auto-retrying to open the game after a crash" while it's above 0.
  retryAttempt: number;
  retryMax: number;
  setRetry: (attempt: number, max: number) => void;
}

export const useGameLaunch = create<GameLaunchState>((set) => ({
  launching: false,
  setLaunching: (value) => set({ launching: value }),
  paused: false,
  setPaused: (value) => set({ paused: value }),
  gateOpen: false,
  setGateOpen: (value) => set({ gateOpen: value }),
  sampInstalling: false,
  setSampInstalling: (value) => set({ sampInstalling: value }),
  retryAttempt: 0,
  retryMax: 0,
  setRetry: (attempt, max) => set({ retryAttempt: attempt, retryMax: max }),
}));
