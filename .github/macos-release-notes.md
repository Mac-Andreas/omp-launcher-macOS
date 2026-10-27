Native macOS build of the open.mp launcher — Apple Silicon (arm64). **Beta release.**

## Download
**{{PKG}}** — flat-distribution installer for Apple Silicon Macs.

SHA-256:
`{{SHA256}}`

## Install
1. Download the `.pkg`.
2. Double-click, accept the license, enter your password.
3. Open **Open Multiplayer** from Applications (or the Desktop alias the installer drops).

The installer handles quarantine clearing and signature application during install — no Terminal steps.

## Requirements
- Apple Silicon Mac (M1/M2/M3/M4). Intel not supported.
- [CrossOver](https://www.codeweavers.com/crossover) from CodeWeavers — runs the Windows GTA: SA on macOS.
- **Rosetta 2** — CrossOver needs it to start the game: `softwareupdate --install-rosetta --agree-to-license`.
- GTA: San Andreas **v1.0** inside a CrossOver bottle. Steam / Rockstar Launcher copies must be downgraded to v1.0 first.

## Notes
This is a **beta**. Report issues on the repo.
