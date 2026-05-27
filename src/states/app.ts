import { OsType } from "@tauri-apps/api/os";
import { create } from "zustand";
import { BUILD_VERSION } from "../constants/app";

export interface UpdateInfo {
  version: string;
  download: string;
  changelog: string;
  ompPluginChecksum: string;
  ompPluginDownload: string;
  versions: {
    [version: string]: {
      download: string;
      ompPluginChecksum: string;
      ompPluginDownload: string;
    };
  };
}

interface AppState {
  version: string;
  updateInfo: UpdateInfo | undefined;
  skippedUpdateVersion: string;
  nativeAppVersion: string;
  // Raw api.open.mp/launcher "version" (the upstream build number, e.g. "6"),
  // captured before fetchUpdateInfo overwrites updateInfo.version with the
  // macOS fork's GitHub release tag.
  upstreamLauncherVersion: string;
  hostOS: OsType;
  setUpdateInfo: (data: UpdateInfo) => void;
  setNativeAppVersionValue: (data: string) => void;
  setUpstreamLauncherVersionValue: (data: string) => void;
  setHostOSValue: (data: OsType) => void;
  skipUpdate: (version: string) => void;
}

const useAppState = create<AppState>()((set) => ({
  version: BUILD_VERSION,
  updateInfo: undefined,
  skippedUpdateVersion: "",
  nativeAppVersion: "",
  upstreamLauncherVersion: "",
  hostOS: "" as OsType,
  listType: "favorites",
  setUpdateInfo: (data: UpdateInfo) => set(() => ({ updateInfo: data })),
  setNativeAppVersionValue: (data: string) =>
    set(() => ({ nativeAppVersion: data })),
  setUpstreamLauncherVersionValue: (data: string) =>
    set(() => ({ upstreamLauncherVersion: data })),
  setHostOSValue: (data: OsType) => set(() => ({ hostOS: data })),
  skipUpdate: (version) => set(() => ({ skippedUpdateVersion: version })),
}));

export { useAppState };
