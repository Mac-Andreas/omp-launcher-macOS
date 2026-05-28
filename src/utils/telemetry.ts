// Anonymous usage telemetry — posts events to a Supabase Edge Function that
// holds the DB credential server-side. This binary never contains a Supabase
// key; it only knows the public function URL. Nothing identifying is sent —
// only a random per-install id and anonymised usage data.
import { getVersion } from "@tauri-apps/api/app";
import { arch, locale, platform, version as osVersion } from "@tauri-apps/api/os";
import { useSettings } from "../states/settings";

const TELEMETRY_ENDPOINT =
  "https://tmenljjfshefocoqnwgi.supabase.co/functions/v1/telemetry";
const TELEMETRY_SOURCE = "macandreas";
const ANON_ID_KEY      = "telemetry-anonymous-id";
const SESSION_ID_KEY   = "telemetry-session-id";

// ── Identity ──────────────────────────────────────────────────────────────────

const getAnonymousId = (): string => {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
};

// Per-launch session UUID — rotated on every app_launched event.
let _sessionId: string = crypto.randomUUID?.() ?? `sess-${Date.now()}`;
export const getSessionId = () => _sessionId;
export const rotateSessionId = () => {
  _sessionId = crypto.randomUUID?.() ?? `sess-${Date.now()}`;
  sessionStorage.setItem(SESSION_ID_KEY, _sessionId);
  return _sessionId;
};

export const resetAnonymousId = () => localStorage.removeItem(ANON_ID_KEY);

// ── Baseline ──────────────────────────────────────────────────────────────────

let baselineCache: Record<string, string> | null = null;
const getBaseline = async () => {
  if (baselineCache) return baselineCache;
  const [osVer, cpuArch, loc, appVer] = await Promise.all([
    osVersion().catch(() => ""),
    arch().catch(() => ""),
    locale().catch(() => null),
    getVersion().catch(() => ""),
    platform().catch(() => "darwin"),
  ]);
  baselineCache = {
    os_name:      "macOS",
    os_version:   osVer,
    architecture: cpuArch,
    locale:       loc ?? "",
    platform:     "macos",
    app_version:  appVer,
    source:       TELEMETRY_SOURCE,
  };
  return baselineCache;
};

// ── Core sender ───────────────────────────────────────────────────────────────
// Fire-and-forget. Silent on failure — telemetry must never affect UX.
export const sendTelemetry = async (
  eventName: string,
  properties: Record<string, unknown> = {}
) => {
  try {
    if (!useSettings.getState().telemetryEnabled) return;
    const base = await getBaseline();
    await fetch(TELEMETRY_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        anonymous_id:     getAnonymousId(),
        event_name:       eventName,
        ...base,
        extended:         false,
        timestamp_utc:    new Date().toISOString(),
        session_id:       _sessionId,
        event_properties: properties,
      }),
    });
  } catch {
    // ignore
  }
};

// ── Session tracking ──────────────────────────────────────────────────────────

let _sessionStart = 0;
let _activeWindow = "unknown";

// Window focus time tracking: map of window name → cumulative ms
const _windowTime: Record<string, number> = {};
let _windowStart = 0;

export const telemetrySessionStart = (window = "main") => {
  _sessionStart  = Date.now();
  _activeWindow  = window;
  _windowStart   = Date.now();
  rotateSessionId();
  sendTelemetry("session_start", { session_id: _sessionId, window });
};

export const telemetrySessionEnd = () => {
  if (!_sessionStart) return;
  flushWindowTime();
  const duration = Math.round((Date.now() - _sessionStart) / 1000);
  sendTelemetry("session_end", {
    session_id:       _sessionId,
    duration_seconds: duration,
    window_counts:    Object.fromEntries(
      Object.entries(_windowTime).map(([k, ms]) => [k, Math.round(ms / 1000)])
    ),
  });
  _sessionStart = 0;
};

// Call when the user navigates to a different screen/window.
export const telemetryWindowFocus = (windowName: string) => {
  if (windowName === _activeWindow) return;
  flushWindowTime();
  const prev    = _activeWindow;
  _activeWindow = windowName;
  _windowStart  = Date.now();
  sendTelemetry("window_focus", { session_id: _sessionId, window: windowName, prev_window: prev });
};

const flushWindowTime = () => {
  if (_activeWindow && _windowStart) {
    _windowTime[_activeWindow] = (_windowTime[_activeWindow] ?? 0) + (Date.now() - _windowStart);
    _windowStart = Date.now();
  }
};

// Heartbeat every 60s while app is in the foreground.
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
export const startHeartbeat = () => {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => {
    if (!_sessionStart) return;
    flushWindowTime();
    sendTelemetry("heartbeat", {
      session_id:      _sessionId,
      window:          _activeWindow,
      elapsed_seconds: Math.round((Date.now() - _sessionStart) / 1000),
    });
  }, 60_000);
};
export const stopHeartbeat = () => {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
};

// ── Convenience wrappers for common omp Launcher events ───────────────────────

export const telemetryGameJoin = (serverIp: string, serverName: string, usingOmp: boolean) =>
  sendTelemetry("game_join", { server_ip: serverIp, server_name: serverName.slice(0, 60), using_omp: usingOmp });

export const telemetryGameLeave = (serverIp: string, timeOnServerSeconds: number) =>
  sendTelemetry("game_leave", { server_ip: serverIp, time_on_server_seconds: timeOnServerSeconds });

export const telemetryServerBrowse = (filterUsed: string) =>
  sendTelemetry("server_browse", { filter_used: filterUsed });

export const telemetryServerFav = (serverIp: string) =>
  sendTelemetry("server_add_fav", { server_ip: serverIp });

export const telemetrySettingsChange = (key: string, value: string) =>
  sendTelemetry("settings_change", { key, value });

// ── Backend reachability check ────────────────────────────────────────────────
export const checkTelemetryBackend = async (): Promise<boolean> => {
  try {
    const res = await fetch(TELEMETRY_ENDPOINT, { method: "OPTIONS" });
    return res.ok;
  } catch {
    return false;
  }
};
