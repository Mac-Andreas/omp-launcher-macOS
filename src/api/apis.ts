import api from "../api/config";
import { UpdateInfo } from "../states/app";
import { mapAPIResponseServerListToAppStructure } from "../utils/helpers";
import { Log } from "../utils/logger";
import { APIResponseServer, Server } from "../utils/types";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export const getCachedList = async (): Promise<ApiResponse<Server[]>> => {
  try {
    const response = await api.get<APIResponseServer[]>("/servers/full");

    if (!Array.isArray(response.data)) {
      Log.debug("Invalid API response: expected array");
      return { success: false, data: [], error: "Invalid response format" };
    }

    const restructuredList = mapAPIResponseServerListToAppStructure(
      response.data
    );

    const { useServers } = await import("../states/servers");
    useServers.getState().setServers(restructuredList);

    return { success: true, data: restructuredList };
  } catch (error) {
    Log.debug("Failed to fetch server list:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const getUpdateInfo = async (): Promise<
  ApiResponse<UpdateInfo | undefined>
> => {
  try {
    const response = await api.get<UpdateInfo>("/launcher", { timeout: 5000 });
    return { success: true, data: response.data };
  } catch (error) {
    Log.debug("Failed to fetch update info:", error);
    return {
      success: false,
      data: undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export interface ForkRelease {
  version: string;
  download: string;
  changelog: string;
}

const FORK_RELEASES_URL =
  "https://api.github.com/repos/Mac-Andreas/omp-launcher-macOS/releases/latest";

export const getForkReleaseInfo = async (): Promise<
  ApiResponse<ForkRelease | undefined>
> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(FORK_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { success: false, data: undefined, error: `HTTP ${res.status}` };
    }
    const json: {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    } = await res.json();
    const tag = (json.tag_name || "").replace(/^v/, "");
    if (!tag) {
      return { success: false, data: undefined, error: "no tag_name" };
    }
    const dmg = (json.assets || []).find(
      (a) => a.name && /\.dmg$/i.test(a.name)
    );
    return {
      success: true,
      data: {
        version: tag,
        download: dmg?.browser_download_url || json.html_url || "",
        changelog: json.body || "",
      },
    };
  } catch (error) {
    Log.debug("Failed to fetch fork release info:", error);
    return {
      success: false,
      data: undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export interface InjectorRelease {
  version: string;
  download: string;
}

const INJECTOR_RELEASES_URL =
  "https://api.github.com/repos/Mac-Andreas/omp-wine-injector/releases/latest";

export const getInjectorRelease = async (): Promise<
  ApiResponse<InjectorRelease | undefined>
> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(INJECTOR_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { success: false, data: undefined, error: `HTTP ${res.status}` };
    }
    const json: {
      tag_name?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    } = await res.json();
    const tag = (json.tag_name || "").replace(/^v/, "");
    if (!tag) {
      return { success: false, data: undefined, error: "no tag_name" };
    }
    const asset = (json.assets || []).find(
      (a) => a.name && /^injector\.exe$/i.test(a.name)
    );
    if (!asset?.browser_download_url) {
      return { success: false, data: undefined, error: "no injector.exe asset" };
    }
    return {
      success: true,
      data: { version: tag, download: asset.browser_download_url },
    };
  } catch (error) {
    Log.debug("Failed to fetch injector release info:", error);
    return {
      success: false,
      data: undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const UPSTREAM_RELEASES_URL =
  "https://api.github.com/repos/openmultiplayer/launcher/releases/latest";

export const getUpstreamLauncherVersion = async (): Promise<
  ApiResponse<string | undefined>
> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(UPSTREAM_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { success: false, data: undefined, error: `HTTP ${res.status}` };
    }
    const json: { tag_name?: string } = await res.json();
    const tag = json.tag_name || "";
    if (!tag) {
      return { success: false, data: undefined, error: "no tag_name" };
    }
    return { success: true, data: tag };
  } catch (error) {
    Log.debug("Failed to fetch upstream launcher version:", error);
    return {
      success: false,
      data: undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
