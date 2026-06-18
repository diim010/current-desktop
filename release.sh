#!/bin/bash
# Build a release .dmg/.zip for Current.
# Run this on macOS, from the project root: ./release.sh [version]

set -e

cd "$(dirname "$0")"

VERSION="${1:-}"
if [ -n "$VERSION" ]; then
  npm version "$VERSION" --no-git-tag-version
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Building Current v$CURRENT_VERSION..."

# Sanity checks
command -v yt-dlp >/dev/null || echo "Warning: yt-dlp not found on PATH (only matters at runtime, not build time)"
command -v ffmpeg >/dev/null || echo "Warning: ffmpeg not found on PATH (only matters at runtime, not build time)"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

rm -rf dist

echo "Packaging..."
npm run dist

echo ""
echo "Done. Output in ./dist:"
ls -lh dist | grep -E '\.dmg|\.zip'

echo ""
echo "Unsigned build — on first launch, right-click the app and choose Open"
echo "to bypass Gatekeeper (or see README.md for code signing setup)."
