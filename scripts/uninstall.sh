#!/usr/bin/env bash
# Removes everything scripts/install.sh put in place: the binary, icons,
# launcher entry, and autostart entry. Safe to run even if some/none of
# these exist. Does NOT touch your app data (settings, notes, tasks, etc.)
# in ~/.local/share/com.estifanos.devdash — that's left alone on purpose.
set -euo pipefail

APP_ID="com.estifanos.devdash"

BIN_DIR="$HOME/.local/bin"
ICON_DIR_128="$HOME/.local/share/icons/hicolor/128x128/apps"
ICON_DIR_256="$HOME/.local/share/icons/hicolor/256x256/apps"
APPS_DIR="$HOME/.local/share/applications"
AUTOSTART_DIR="$HOME/.config/autostart"

if pgrep -x devdash >/dev/null 2>&1; then
  echo "Note: devdash looks like it's currently running — quit it manually if you want"
  echo "the removal to take full effect immediately (the running process itself is untouched)."
fi

echo "==> Removing installed files"
rm -f "$BIN_DIR/devdash"
rm -f "$ICON_DIR_128/devdash.png"
rm -f "$ICON_DIR_256/devdash.png"
rm -f "$APPS_DIR/$APP_ID.desktop"
rm -f "$AUTOSTART_DIR/$APP_ID.desktop"

echo "==> Refreshing desktop/icon caches"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true

echo "==> Uninstalled. Your app data (settings/notes/tasks/etc.) was left in place."
