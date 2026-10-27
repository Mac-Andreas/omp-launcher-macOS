import { emit, listen } from "@tauri-apps/api/event";
import { appWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { stateStorage } from "../utils/stateStorage";
import { SAMPDLLVersions } from "../utils/types";

interface SettingsPersistentState {
  nickName: string;
  gtasaPath: string;
  customGameExe: string;
  sampVersion: SAMPDLLVersions;
  dataMerged: boolean;
  sampSetupPromptShown: boolean;
  // macOS: override the CrossOver bottle name if it is not the default
  // "Rockstar Games Launcher".
  bottleName: string;
  // macOS: last downloaded omp-wine-injector version tag (e.g. "1.0.0").
  // Compared against the latest GitHub release at startup to decide whether
  // to re-download injector.exe.
  injectorVersion: string;
  // When true, the launcher writes Wine / injector / game stdio into
  // <gtasaPath>/omp-logs/ on every launch. Cleared by the "Clear cache" button.
  debugMode: boolean;
  // Only meaningful while debugMode is on. false = standard (error-level) logs;
  // true = detailed logs that trace everything (large files, slower game).
  debugDetailed: boolean;
  // macOS audio crash fix (DirectSound emulation + fixed 48kHz/16-bit format).
  // On by default; turning it off reverts to Wine's default audio negotiation.
  audioFix: boolean;
  // macOS render crash fix (wined3d backbuffer offscreen mode, csmt off, pinned
  // GL version). On by default; steers GTA's D3D8 off the wined3d texture-lock
  // path that faults under CrossOver. Off reverts to Wine's defaults.
  renderFix: boolean;
  // Anonymous usage telemetry. Opt-out: on by default, no startup prompt. Only
  // a once-per-day aggregated summary is sent (counts + time averages), never
  // anything identifying — just a random per-install id. Users can turn it off
  // in Settings → Privacy, which stops all sends immediately.
  telemetryEnabled: boolean;
  // Retained for migration only — the consent prompt was removed when telemetry
  // moved to opt-out. No longer gates sending.
  telemetryConsentVersion: string;
  setNickName: (name: string) => void;
  setGTASAPath: (path: string) => void;
  setCustomGameExe: (fileName: string) => void;
  setSampVersion: (version: SAMPDLLVersions) => void;
  setBottleName: (name: string) => void;
  setSampSetupPromptShown: (shown: boolean) => void;
  setInjectorVersion: (version: string) => void;
  setDebugMode: (enabled: boolean) => void;
  setDebugDetailed: (enabled: boolean) => void;
  setAudioFix: (enabled: boolean) => void;
  setRenderFix: (enabled: boolean) => void;
  setTelemetryEnabled: (enabled: boolean) => void;
  setTelemetryConsentVersion: (version: string) => void;
}

const emitWithDelay = (event: string, payload: any) =>
  setTimeout(() => emit(event, payload), 200);

const useSettings = create<SettingsPersistentState>()(
  persist(
    (set) => ({
      nickName: "",
      gtasaPath: "",
      customGameExe: "",
      sampVersion: "custom",
      dataMerged: false,
      sampSetupPromptShown: false,
      bottleName: "",
      injectorVersion: "",
      debugMode: false,
      debugDetailed: false,
      audioFix: true,
      renderFix: true,
      telemetryEnabled: true,
      telemetryConsentVersion: "",
      setNickName: (name) =>
        set(() => {
          emitWithDelay("setNickName", name);
          return { nickName: name };
        }),
      setGTASAPath: (path) => set({ gtasaPath: path }),
      setCustomGameExe: (fileName) => set({ customGameExe: fileName }),
      setSampVersion: (version) => set({ sampVersion: version }),
      setBottleName: (name) => set({ bottleName: name }),
      setSampSetupPromptShown: (shown) => set({ sampSetupPromptShown: shown }),
      setInjectorVersion: (version) => set({ injectorVersion: version }),
      setDebugMode: (enabled) => set({ debugMode: enabled }),
      setDebugDetailed: (enabled) => set({ debugDetailed: enabled }),
      setAudioFix: (enabled) => set({ audioFix: enabled }),
      setRenderFix: (enabled) => set({ renderFix: enabled }),
      setTelemetryEnabled: (enabled) => set({ telemetryEnabled: enabled }),
      setTelemetryConsentVersion: (version) =>
        set({ telemetryConsentVersion: version }),
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => stateStorage),
    }
  )
);

["setNickName"].forEach((event) =>
  listen(event, (ev) => {
    if (ev.windowLabel !== appWindow.label) {
      useSettings.persist.rehydrate();
    }
  })
);

export { useSettings };
