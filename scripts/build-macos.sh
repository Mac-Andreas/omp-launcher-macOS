#!/usr/bin/env bash
#
# Build the open.mp launcher for macOS and package it as a .pkg installer.
#
# Compiles the Tauri app, ad-hoc signs it, then wraps it in a flat-distribution
# productbuild .pkg that ships a license screen, copies the app to
# /Applications, and runs a postinstall step that clears quarantine + re-signs.
#
# Usage: ./scripts/build-macos.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

APP_NAME="Open Multiplayer"
PKG_NAME="omp-launcher"
APP_ID="com.openmultiplayer.launcher"
DISPLAY_NAME="Open Multiplayer"
ALT_NAME="SAMP Launcher"
VERSION="$(node -p "require('./package.json').version")"
case "$(uname -m)" in
  x86_64) ARCH="x64" ;;
  *)      ARCH="aarch64" ;;
esac

APP_PATH="$ROOT/src-tauri/target/release/bundle/macos/$APP_NAME.app"
OUT_PKG="$ROOT/${PKG_NAME}_${VERSION}_${ARCH}.pkg"

echo "==> Building $APP_NAME $VERSION ($ARCH)"
yarn tauri build --bundles app

echo "==> Patching Info.plist (display name + Spotlight keywords)"
PLIST="$APP_PATH/Contents/Info.plist"
plutil -replace CFBundleDisplayName -string "$DISPLAY_NAME" "$PLIST"
plutil -replace CFBundleName -string "$DISPLAY_NAME" "$PLIST"
# kMDItemKeywords are picked up by Spotlight so the bundle answers searches
# like "SAMP Launcher" / "open.mp" / "San Andreas Multiplayer" alongside the
# real display name.
plutil -remove NSHumanReadableCopyright "$PLIST" 2>/dev/null || true
plutil -replace NSHumanReadableCopyright -string "© open.mp project. macOS port by Xyranaut." "$PLIST"

echo "==> Ad-hoc signing $APP_NAME.app"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --verbose=2 "$APP_PATH"

echo "==> Staging payload + scripts"
STAGE="$(mktemp -d)"
SCRIPTS_DIR="$(mktemp -d)"
RES_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$SCRIPTS_DIR" "$RES_DIR"' EXIT

# Payload root: anything inside here lands under --install-location.
cp -R "$APP_PATH" "$STAGE/"
# Strip AppleDouble (._*) resource-fork files so they don't end up in the
# payload and pollute the installed bundle.
/usr/sbin/dot_clean -m "$STAGE" 2>/dev/null || true
find "$STAGE" -name '._*' -delete 2>/dev/null || true

# Preinstall: gently quit any running copy so the new bundle's files can be
# written cleanly, then clear the legacy "omp-launcher.app" name (renamed to
# "${APP_NAME}.app") plus the alt-name symlink.
#
# NOTE: deliberately does NOT relaunch the app from postinstall — calling
# /usr/bin/open against an app in /Applications from an installer script was
# what tripped the macOS Sequoia "Installer would like to modify apps on your
# Mac" (App Management) permission prompt. pkill on the running executable is
# a process signal, not a bundle modification, and should not trigger it.
# \$2 is the destination directory chosen in the installer.
cat > "$SCRIPTS_DIR/preinstall" <<PRE
#!/bin/bash
DEST="\${2:-/Applications}"
# Match on the bundle's executable path so the Installer process itself is
# never hit. Best-effort: a missing match is fine.
/usr/bin/pkill -f "${APP_NAME}.app/Contents/MacOS/" 2>/dev/null || true
/usr/bin/pkill -f "omp-launcher.app/Contents/MacOS/" 2>/dev/null || true
sleep 1
rm -rf "\$DEST/omp-launcher.app"
rm -f "\$DEST/${ALT_NAME}.app"
exit 0
PRE
chmod +x "$SCRIPTS_DIR/preinstall"

# Postinstall: clear the quarantine xattr so Gatekeeper doesn't flag the
# bundle as "damaged" on first launch. The app keeps the ad-hoc signature
# applied at build time — no script re-sign (re-signing an installed app
# from a script trips the macOS "App Management" permission prompt).
# Also creates a "SAMP Launcher.app" symlink next to the app so Finder and
# Spotlight match the SA-MP-era name without a second bundle copy.
#
# NOTE: deliberately does NOT relaunch the app. /usr/bin/open against an app in
# /Applications from an installer script trips the macOS Sequoia App Management
# prompt. The user reopens the app themselves after install.
# \$2 is the destination directory chosen in the installer.
cat > "$SCRIPTS_DIR/postinstall" <<POST
#!/bin/bash
set -e
DEST="\${2:-/Applications}"
APP="\$DEST/${APP_NAME}.app"
ALT_LINK="\$DEST/${ALT_NAME}.app"
if [ -d "\$APP" ]; then
  /usr/bin/xattr -dr com.apple.quarantine "\$APP" 2>/dev/null || true
  rm -f "\$ALT_LINK"
  /bin/ln -s "\$APP" "\$ALT_LINK" 2>/dev/null || true
fi

# Drop a Finder alias on the logged-in user's Desktop, named just
# "${APP_NAME}" (no ".app", no "alias" suffix). Made via Finder so it's a
# real alias file — Get Info reads as a regular app shortcut, not a symlink.
USER_NAME="\$(/usr/bin/stat -f '%Su' /dev/console 2>/dev/null || echo '')"
if [ -n "\$USER_NAME" ] && [ "\$USER_NAME" != "root" ] && [ -d "\$APP" ]; then
  USER_HOME="\$(/usr/bin/dscl . -read "/Users/\$USER_NAME" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print \$2}')"
  if [ -n "\$USER_HOME" ] && [ -d "\$USER_HOME/Desktop" ]; then
    # Wipe any earlier copies from prior installs so the alias replaces
    # cleanly. Finder otherwise picks unique names like "${APP_NAME} 2".
    /bin/rm -f \
      "\$USER_HOME/Desktop/${APP_NAME}" \
      "\$USER_HOME/Desktop/${APP_NAME}.app" \
      "\$USER_HOME/Desktop/${APP_NAME} alias" \
      "\$USER_HOME/Desktop/${APP_NAME}.app alias" 2>/dev/null || true
    /usr/bin/sudo -u "\$USER_NAME" /usr/bin/osascript -e "on run argv
  set targetApp to POSIX file (item 1 of argv) as alias
  set desktopFolder to POSIX file (item 2 of argv) as alias
  set aliasName to item 3 of argv
  tell application \"Finder\"
    set newAlias to make alias file to targetApp at desktopFolder
    set name of newAlias to aliasName
  end tell
end run" "\$APP" "\$USER_HOME/Desktop" "${APP_NAME}" >/dev/null 2>&1 || true
  fi
fi
exit 0
POST
chmod +x "$SCRIPTS_DIR/postinstall"

# License screen content. Custom plain text (no decorative === / *** bars)
# renders much cleaner inside the macOS Installer license panel than the
# raw MPL preamble.
cp "$ROOT/scripts/installer-license.txt" "$RES_DIR/license.txt"

echo "==> Building component package"
COMPONENT_PKG="$(mktemp -u).pkg"

# Component plist with BundleIsRelocatable disabled. By default pkgbuild marks
# app bundles relocatable: on a re-install the installer finds the existing
# bundle by CFBundleIdentifier and drops the payload at the OLD path/name
# (e.g. a renamed bundle keeps installing into "omp-launcher.app"). Pinning it
# non-relocatable forces the install to the payload path under /Applications.
COMP_PLIST="$(mktemp -u).plist"
pkgbuild --analyze --root "$STAGE" "$COMP_PLIST" >/dev/null
plutil -replace '0.BundleIsRelocatable' -bool false "$COMP_PLIST"

pkgbuild \
  --root "$STAGE" \
  --component-plist "$COMP_PLIST" \
  --install-location /Applications \
  --identifier "$APP_ID" \
  --version "$VERSION" \
  --scripts "$SCRIPTS_DIR" \
  "$COMPONENT_PKG" >/dev/null
rm -f "$COMP_PLIST"

# Distribution.xml: gives the installer a title + license screen and pins the
# minimum macOS version. arm64 builds only run on Apple Silicon.
DIST_XML="$(mktemp -u).xml"
cat > "$DIST_XML" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>${DISPLAY_NAME}</title>
    <organization>${APP_ID}</organization>
    <license file="license.txt"/>
    <options
        customize="never"
        require-scripts="false"
        hostArchitectures="arm64,x86_64"/>
    <domains enable_localSystem="true" enable_anywhere="true" enable_currentUserHome="true"/>
    <volume-check>
        <allowed-os-versions>
            <os-version min="11.0"/>
        </allowed-os-versions>
    </volume-check>
    <choices-outline>
        <line choice="default">
            <line choice="${APP_ID}"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="${APP_ID}" visible="false">
        <pkg-ref id="${APP_ID}"/>
    </choice>
    <pkg-ref id="${APP_ID}" version="${VERSION}" onConclusion="none">$(basename "$COMPONENT_PKG")</pkg-ref>
</installer-gui-script>
XML

echo "==> Assembling distribution package"
rm -f "$OUT_PKG"
productbuild \
  --distribution "$DIST_XML" \
  --resources "$RES_DIR" \
  --package-path "$(dirname "$COMPONENT_PKG")" \
  "$OUT_PKG" >/dev/null

rm -f "$COMPONENT_PKG" "$DIST_XML"

echo
echo "==> Done: $OUT_PKG"
