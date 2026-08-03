#!/usr/bin/env sh
# Downloads and installs the latest devdash .deb release.
# Usage: curl -fsSL https://raw.githubusercontent.com/estifanosbereket1/devdash/main/scripts/get-devdash.sh | sh
set -e

REPO="estifanosbereket1/devdash"

if ! command -v dpkg >/dev/null 2>&1; then
  echo "devdash's installer currently only supports Debian/Ubuntu-based systems (needs dpkg)." >&2
  exit 1
fi

echo "==> Finding latest devdash release"
DEB_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep "browser_download_url.*\.deb" \
  | cut -d '"' -f 4)

if [ -z "$DEB_URL" ]; then
  echo "Could not find a .deb asset in the latest release." >&2
  exit 1
fi

TMP_DEB="$(mktemp --suffix=.deb)"
echo "==> Downloading $DEB_URL"
curl -fsSL "$DEB_URL" -o "$TMP_DEB"

echo "==> Installing (needs sudo)"
sudo dpkg -i "$TMP_DEB" || sudo apt-get install -f -y
rm -f "$TMP_DEB"

echo "==> devdash installed. Launch it from your app launcher, or run: devdash"
