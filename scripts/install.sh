#!/usr/bin/env bash
# Builds devdash and installs it as a user-level desktop app (no sudo needed):
# binary in ~/.local/bin, icon in the user icon theme, a launcher entry, and
# an autostart entry so it starts on login. Safe to re-run to update.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="com.estifanos.devdash"

BIN_DIR="$HOME/.local/bin"
ICON_DIR_128="$HOME/.local/share/icons/hicolor/128x128/apps"
ICON_DIR_256="$HOME/.local/share/icons/hicolor/256x256/apps"
APPS_DIR="$HOME/.local/share/applications"
AUTOSTART_DIR="$HOME/.config/autostart"

echo "==> Building frontend"
cd "$REPO_DIR"
npx vite build

echo "==> Building release binary (this takes a while)"
cargo build --release --manifest-path src-tauri/Cargo.toml

echo "==> Installing files"
mkdir -p "$BIN_DIR" "$ICON_DIR_128" "$ICON_DIR_256" "$APPS_DIR" "$AUTOSTART_DIR"

cp "$REPO_DIR/src-tauri/target/release/devdash" "$BIN_DIR/devdash"
cp "$REPO_DIR/src-tauri/icons/128x128.png" "$ICON_DIR_128/devdash.png"
cp "$REPO_DIR/src-tauri/icons/128x128@2x.png" "$ICON_DIR_256/devdash.png"

desktop_entry() {
  cat <<EOF
[Desktop Entry]
Type=Application
Name=devdash
Comment=Floating developer dashboard
Exec=$BIN_DIR/devdash
Icon=devdash
Terminal=false
Categories=Development;
StartupWMClass=$APP_ID
EOF
}

desktop_entry > "$APPS_DIR/$APP_ID.desktop"
{ desktop_entry; echo "X-GNOME-Autostart-enabled=true"; } > "$AUTOSTART_DIR/$APP_ID.desktop"

echo "==> Refreshing desktop/icon caches"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true

echo "==> Done. Launch devdash from your app launcher, or run: $BIN_DIR/devdash"
echo "    It will also start automatically on your next login."
echo "    To remove it later: scripts/uninstall.sh"
