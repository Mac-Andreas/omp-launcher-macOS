// Anonymous usage telemetry — posts a single aggregated summary to a Supabase
// Edge Function that holds the DB credential server-side. This binary never
// contains a Supabase key; it only knows the public function URL. Nothing
// identifying is sent — only a random per-install id and anonymised counts.
//
// Reporting model (changed): NO live firehose. There is no heartbeat, no live
// session/window/game streaming. Instead the launcher accumulates usage
// locally (counts + time totals) and pushes ONE `daily_summary` event at most
// once per UTC day, on app launch. Averages are computed from those totals on
// the server. Per-day deltas: after a successful push the local bucket resets,
// so each summary describes a single day's activity.
import { getVersion } from "@tauri-apps/api/app";
import { arch, locale, platform, version as osVersion } from "@tauri-apps/api/os";
import { useSettings } from "../states/settings";

const TELEMETRY_ENDPOINT =
  "https://tmenljjfshefocoqnwgi.supabase.co/functions/v1/telemetry";
const TELEMETRY_SOURCE = "macandreas";
const ANON_ID_KEY      = "telemetry-anonymous-id";
const SESSION_ID_KEY   = "telemetry-session-id";
const BUCKET_KEY       = "telemetry-daily-bucket";
const LAST_PUSH_KEY    = "telemetry-last-push-date"; // UTC YYYY-MM-DD

// A game session shorter than this is treated as "short-lived" — i.e. it
// crashed/aborted right after launch (the audio/connect abort) rather than
// being a real play session. Counted, not averaged.
const SHORT_LIVED_GAME_SECONDS = 45;

// ── Identity ──────────────────────────────────────────────────────────────────

const getAnonymousId = (): string => {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
};

// Per-launch session UUID — rotated on every session start.
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

// ── Local daily accumulator ─────────────────────────────────────────────────
// Everything that used to be a live event becomes a counter or time total here.
// Persisted to localStorage so it survives restarts and accumulates across the
// many app launches that can happen within one UTC day until the daily push.

interface DailyBucket {
  launches:               number;            // app launches counted this day
  sessions:               number;            // completed sessions this day
  session_seconds_total:  number;            // Σ session durations (→ avg session)
  online_seconds_total:   number;            // Σ foreground time across windows
  window_seconds:         Record<string, number>; // per-window foreground seconds
  games_joined:           number;
  games_joined_omp:       number;            // subset launched against open.mp
  game_seconds_total:     number;            // Σ time-on-server (→ avg online/game)
  games_completed:        number;            // game sessions that ran past the crash threshold
  games_completed_seconds:number;            // Σ time for non-crashed sessions (→ avg play time)
  games_short_lived:      number;            // launches that died right after start (crashes)
  features:               Record<string, number>; // generic feature-use counters
}

const emptyBucket = (): DailyBucket => ({
  launches:              0,
  sessions:              0,
  session_seconds_total: 0,
  online_seconds_total:  0,
  window_seconds:        {},
  games_joined:          0,
  games_joined_omp:      0,
  game_seconds_total:    0,
  games_completed:       0,
  games_completed_seconds:0,
  games_short_lived:     0,
  features:              {},
});

let _bucket: DailyBucket | null = null;

const loadBucket = (): DailyBucket => {
  if (_bucket) return _bucket;
  let next: DailyBucket;
  try {
    const raw = localStorage.getItem(BUCKET_KEY);
    next = raw ? { ...emptyBucket(), ...JSON.parse(raw) } : emptyBucket();
  } catch {
    next = emptyBucket();
  }
  _bucket = next;
  return next;
};

const saveBucket = () => {
  try {
    localStorage.setItem(BUCKET_KEY, JSON.stringify(loadBucket()));
  } catch {
    // ignore quota / serialization issues — telemetry must never throw
  }
};

const resetBucket = () => {
  _bucket = emptyBucket();
  try { localStorage.removeItem(BUCKET_KEY); } catch { /* ignore */ }
};

// Bump a named feature counter (window views, favourites, settings, etc.).
const bumpFeature = (name: string, by = 1) => {
  const b = loadBucket();
  b.features[name] = (b.features[name] ?? 0) + by;
  saveBucket();
};

const utcDate = (d = new Date()) => d.toISOString().slice(0, 10);

// Snapshot of how many servers the user keeps in their list (favorites). Set
// by the app whenever the favorites list changes; reported in the daily
// summary so the dashboard can show the average list size across users.
let _serversInList = 0;
export const telemetryReportListSize = (count: number) => {
  _serversInList = Math.max(0, count | 0);
};

// ── Daily push ───────────────────────────────────────────────────────────────
// Called on app launch. Sends at most one summary per UTC day, then resets the
// bucket so the next day starts clean (per-day deltas). The current launch is
// counted into *today's* bucket after the (previous day's) flush.
export const telemetryDailyTick = async () => {
  if (!useSettings.getState().telemetryEnabled) return;

  const today    = utcDate();
  const lastPush = localStorage.getItem(LAST_PUSH_KEY);
  const b        = loadBucket();

  // New UTC day (or first ever) and we have something accumulated → push it.
  if (lastPush !== today && hasActivity(b)) {
    await sendDailySummary(b);
    localStorage.setItem(LAST_PUSH_KEY, today);
    resetBucket();
  } else if (!lastPush) {
    // First run with nothing buffered yet: stamp the day so we don't push an
    // empty summary, but let activity accrue for tomorrow's report.
    localStorage.setItem(LAST_PUSH_KEY, today);
  }

  // Count this launch into the (now-current) day's bucket.
  const cur = loadBucket();
  cur.launches += 1;
  saveBucket();
};

const hasActivity = (b: DailyBucket) =>
  b.launches > 0 || b.sessions > 0 || b.games_joined > 0 ||
  b.online_seconds_total > 0 || Object.keys(b.features).length > 0;

// Build and send the aggregated row. Averages are included for convenience but
// totals + counts are sent too so the server can re-aggregate across devices.
const sendDailySummary = async (b: DailyBucket) => {
  const avg = (total: number, n: number) => (n > 0 ? Math.round(total / n) : 0);
  await sendTelemetry("daily_summary", {
    launches:               b.launches,
    sessions:               b.sessions,
    avg_session_seconds:    avg(b.session_seconds_total, b.sessions),
    total_online_seconds:   b.online_seconds_total,
    window_seconds:         b.window_seconds,
    games_joined:           b.games_joined,
    games_joined_omp:       b.games_joined_omp,
    avg_game_seconds:       avg(b.game_seconds_total, b.games_joined),
    total_game_seconds:     b.game_seconds_total,
    // Average play time of real sessions (excludes short-lived crashes), plus
    // a raw count of short-lived launches so crash rate is visible.
    games_completed:        b.games_completed,
    avg_play_seconds:       avg(b.games_completed_seconds, b.games_completed),
    games_short_lived:      b.games_short_lived,
    servers_in_list:        _serversInList,
    features:               b.features,
  });
};

// ── Session tracking (local only — no live sends) ────────────────────────────
// We still measure session/window/online time, but it now feeds the local
// bucket instead of streaming events.

let _sessionStart = 0;
let _activeWindow = "unknown";
let _windowStart  = 0;

export const telemetrySessionStart = (window = "main") => {
  _sessionStart = Date.now();
  _activeWindow = window;
  _windowStart  = Date.now();
  rotateSessionId();
  // First window view of the session counts toward the feature radar.
  bumpFeature(`view_${window}`);
};

export const telemetrySessionEnd = () => {
  if (!_sessionStart) return;
  flushWindowTime();
  const seconds = Math.round((Date.now() - _sessionStart) / 1000);
  const b = loadBucket();
  b.sessions += 1;
  b.session_seconds_total += seconds;
  saveBucket();
  _sessionStart = 0;
};

// Call when the user navigates to a different screen/window.
export const telemetryWindowFocus = (windowName: string) => {
  if (windowName === _activeWindow) return;
  flushWindowTime();
  _activeWindow = windowName;
  _windowStart  = Date.now();
  bumpFeature(`view_${windowName}`);
};

const flushWindowTime = () => {
  if (_activeWindow && _windowStart) {
    const seconds = Math.round((Date.now() - _windowStart) / 1000);
    if (seconds > 0) {
      const b = loadBucket();
      b.window_seconds[_activeWindow] =
        (b.window_seconds[_activeWindow] ?? 0) + seconds;
      b.online_seconds_total += seconds;
      saveBucket();
    }
    _windowStart = Date.now();
  }
};

// ── Convenience wrappers for common omp Launcher events ───────────────────────
// These no longer hit the network — they record into the daily bucket.

export const telemetryGameJoin = (
  _serverIp: string,
  _serverName: string,
  usingOmp: boolean
) => {
  const b = loadBucket();
  b.games_joined += 1;
  if (usingOmp) b.games_joined_omp += 1;
  saveBucket();
  bumpFeature("game_join");
};

export const telemetryGameLeave = (
  _serverIp: string,
  timeOnServerSeconds: number
) => {
  const secs = Math.max(0, timeOnServerSeconds);
  const b = loadBucket();
  b.game_seconds_total += secs;
  if (secs < SHORT_LIVED_GAME_SECONDS) {
    // Crashed/aborted right after launch — count it, don't average it in.
    b.games_short_lived += 1;
  } else {
    b.games_completed += 1;
    b.games_completed_seconds += secs;
  }
  saveBucket();
};

export const telemetryServerBrowse = (filterUsed: string) =>
  bumpFeature(filterUsed ? `browse_${filterUsed}` : "server_browse");

export const telemetryServerFav = (_serverIp: string) =>
  bumpFeature("server_add_fav");

export const telemetrySettingsChange = (key: string, _value: string) =>
  bumpFeature(`settings_${key}`);

// ── Backend reachability check ────────────────────────────────────────────────
export const checkTelemetryBackend = async (): Promise<boolean> => {
  try {
    const res = await fetch(TELEMETRY_ENDPOINT, { method: "OPTIONS" });
    return res.ok;
  } catch {
    return false;
  }
};
