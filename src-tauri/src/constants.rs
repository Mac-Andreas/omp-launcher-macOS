pub const IPC_PORT: u16 = 45791;

pub const MAX_HOSTNAME_LENGTH: u32 = 63;
pub const MAX_GAMEMODE_LENGTH: u32 = 39;
pub const MAX_LANGUAGE_LENGTH: u32 = 39;
pub const MAX_DISCORD_LINK_LENGTH: u32 = 50;
pub const MAX_BANNER_URL_LENGTH: u32 = 160;
pub const MAX_LOGO_URL_LENGTH: u32 = 160;
pub const MAX_PLAYER_NAME_LENGTH: u8 = 32;
pub const MAX_RULE_NAME_LENGTH: u8 = 32;
pub const MAX_RULE_VALUE_LENGTH: u8 = 70;

pub const MAX_PLAYER_COUNT: u16 = 1000;
pub const MAX_RULE_COUNT: u16 = 20;

pub const QUERY_TIMEOUT_SECS: u64 = 2;
pub const QUERY_RATE_LIMIT_MS: u64 = 1000;
pub const OMP_EXTRA_INFO_UPDATE_COOLDOWN_SECS: u64 = 3;

// DLL injection is Windows-only; macOS/Linux load the client via the
// vorbisFile.dll proxy instead, so these are not used off Windows.
#[cfg(target_os = "windows")]
pub const INJECTION_MAX_RETRIES: u32 = 5;
#[cfg(target_os = "windows")]
pub const INJECTION_RETRY_DELAY_MS: u64 = 500;

pub const UDP_BUFFER_SIZE: usize = 1500;
#[cfg(target_os = "windows")]
pub const PROCESS_MODULE_BUFFER_SIZE: usize = 1024;

pub const SAMP_PACKET_HEADER: &[u8] = b"SAMP";

pub const QUERY_TYPE_INFO: char = 'i';
pub const QUERY_TYPE_PLAYERS: char = 'c';
pub const QUERY_TYPE_RULES: char = 'r';
pub const QUERY_TYPE_EXTRA_INFO: char = 'o';
pub const QUERY_TYPE_PING: char = 'p';

pub const PING_TIMEOUT: u32 = 9999;

pub const LOG_FILE_NAME: &str = "omp-launcher.log";
pub const DATA_DIR_NAME: &str = "mp.open.launcher";

pub const GTA_SA_EXECUTABLE: &str = "gta_sa.exe";
pub const SAMP_DLL: &str = "samp.dll";
pub const OMP_CLIENT_DLL: &str = "omp-client.dll";

// On macOS the game runs inside a CrossOver/Wine bottle. The Rockstar
// re-release ships as "gta-sa.exe"; the SA-MP-compatible 1.0 downgrade is
// "gta_sa.exe". Detection/launch tries customGameExe, then these in order.
#[cfg(not(target_os = "windows"))]
pub const GTA_SA_EXECUTABLE_ALT: &str = "gta-sa.exe";

// CrossOver's bundled Wine entry points (preferred launch path on macOS).
#[cfg(not(target_os = "windows"))]
pub const CROSSOVER_CXSTART: &str =
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxstart";
#[cfg(not(target_os = "windows"))]
pub const CROSSOVER_WINE_BIN: &str =
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine";
#[cfg(not(target_os = "windows"))]
pub const CROSSOVER_WINE_HOSTED: &str =
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/CrossOver-Hosted Application/wine";

// Relative game-dir locations probed inside each CrossOver bottle's drive_c.
#[cfg(not(target_os = "windows"))]
pub const BOTTLE_GAME_SUBPATHS: &[&str] = &[
    "drive_c/Program Files/Rockstar Games/Grand Theft Auto San Andreas",
    "drive_c/Program Files (x86)/Rockstar Games/Grand Theft Auto San Andreas",
    "drive_c/Program Files (x86)/Steam/steamapps/common/Grand Theft Auto San Andreas",
    "drive_c/Program Files/Rockstar Games/GTA San Andreas",
    "drive_c/Games/GTA San Andreas",
];

// Deeplink registration only runs on Windows (see main.rs `#[cfg(windows)]`).
#[cfg(target_os = "windows")]
pub const DEEPLINK_SCHEME_OMP: &str = "omp";
#[cfg(target_os = "windows")]
pub const DEEPLINK_SCHEME_SAMP: &str = "samp";
#[cfg(target_os = "windows")]
pub const DEEPLINK_IDENTIFIER: &str = "mp.open.launcher";

pub const WINDOW_MIN_WIDTH: u32 = 1000;
pub const WINDOW_MIN_HEIGHT: u32 = 700;

#[cfg(target_os = "windows")]
pub const SAMP_REGISTRY_KEY: &str = r"Software\SAMP";

#[cfg(target_os = "windows")]
pub const SAMP_USERDATA_PATH: &str = r"\GTA San Andreas User Files\SAMP\USERDATA.DAT";

// Raw Windows error codes, only matched by the Windows DLL injector.
// Cross-platform file code (helpers.rs) matches std::io::ErrorKind instead.
#[cfg(target_os = "windows")]
pub const ERROR_ACCESS_DENIED: i32 = 5;
#[cfg(target_os = "windows")]
pub const ERROR_ELEVATION_REQUIRED: i32 = 740;
