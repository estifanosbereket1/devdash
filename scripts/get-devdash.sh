#!/usr/bin/env sh
# Downloads and installs the latest devdash .deb release.
# Usage: curl -fsSL https://raw.githubusercontent.com/estifanosbereket1/devdash/main/scripts/get-devdash.sh | sh
#
# Uses GitHub's stable "latest release" redirect URL rather than the API, since
# the unauthenticated API is capped at 60 requests/hour *per IP* (shared across
# everyone on the same network) and 403s easily. The redirect URL needs a fixed,
# version-agnostic asset name — see scripts/README or the release process for
# how devdash_amd64.deb gets (re-)uploaded alongside the versioned filename.
set -e

REPO="estifanosbereket1/devdash"
DEB_URL="https://github.com/$REPO/releases/latest/download/devdash_amd64.deb"

if ! command -v dpkg >/dev/null 2>&1; then
  echo "devdash's installer currently only supports Debian/Ubuntu-based systems (needs dpkg)." >&2
  exit 1
fi

TMP_DEB="$(mktemp --suffix=.deb)"
echo "==> Downloading latest devdash release"
curl -fsSL "$DEB_URL" -o "$TMP_DEB"

echo "==> Installing (needs sudo)"
sudo dpkg -i "$TMP_DEB" || sudo apt-get install -f -y
rm -f "$TMP_DEB"

echo "==> devdash installed. Launch it from your app launcher, or run: devdash"
