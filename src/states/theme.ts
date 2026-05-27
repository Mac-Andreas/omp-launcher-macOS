import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  ThemeColors,
  darkThemeColors,
  lightThemeColors,
} from "../constants/theme";
import { stateStorage } from "../utils/stateStorage";

type Mode = "dark" | "light" | "system";

const systemPrefersDark = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const resolve = (mode: Mode): "dark" | "light" =>
  mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

interface ThemePersistentState {
  theme: ThemeColors;
  themeType: "light" | "dark";
  themeMode: Mode;
  setTheme: (mode: Mode) => void;
}

const useTheme = create<ThemePersistentState>()(
  persist(
    (set) => {
      const initialMode: Mode = "system";
      const resolved = resolve(initialMode);

      // Re-resolve when the OS appearance flips while in "system" mode.
      if (
        typeof window !== "undefined" &&
        window.matchMedia &&
        typeof window.matchMedia("(prefers-color-scheme: dark)").addEventListener ===
          "function"
      ) {
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", () => {
            const state = useTheme.getState();
            if (state.themeMode !== "system") return;
            const next = systemPrefersDark() ? "dark" : "light";
            set({
              themeType: next,
              theme: next === "dark" ? darkThemeColors : lightThemeColors,
            });
          });
      }

      return {
        theme: resolved === "dark" ? darkThemeColors : lightThemeColors,
        themeType: resolved,
        themeMode: initialMode,
        setTheme: (mode: Mode) => {
          const next = resolve(mode);
          set({
            themeMode: mode,
            themeType: next,
            theme: next === "dark" ? darkThemeColors : lightThemeColors,
          });
        },
      };
    },
    {
      name: "theme-storage",
      storage: createJSONStorage(() => stateStorage),
      // Older persisted state stored only `themeType`. Coerce to themeMode and
      // re-derive theme colors from the OS when migrating in "system" users.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!("themeMode" in state) || !state.themeMode) {
          (state as any).themeMode = state.themeType ?? "dark";
        }
        const resolved = resolve((state as any).themeMode);
        state.themeType = resolved;
        state.theme = resolved === "dark" ? darkThemeColors : lightThemeColors;
      },
    }
  )
);

export { useTheme };
