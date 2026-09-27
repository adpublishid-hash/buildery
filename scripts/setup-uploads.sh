#!/usr/bin/env bash
# Buildery — prepare the local upload directory.
#
# The app writes product/blog/course images to public/uploads/<workspaceId>/.
# This ensures the directory exists and is writable by the user that runs
# the Node process (the PM2 user).
#
#   sudo ./scripts/setup-uploads.sh           # owner defaults to current user
#   sudo APP_USER=buildery ./scripts/setup-uploads.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
UPLOAD_DIR="$APP_DIR/public/uploads"
APP_USER="${APP_USER:-$(id -un)}"

mkdir -p "$UPLOAD_DIR"

# The Node process must own (or at least be able to write to) this tree.
chown -R "$APP_USER":"$APP_USER" "$UPLOAD_DIR"

# Directories: rwxr-xr-x   Files: rw-r--r--
find "$UPLOAD_DIR" -type d -exec chmod 755 {} +
find "$UPLOAD_DIR" -type f -exec chmod 644 {} + 2>/dev/null || true

echo "Upload directory ready:"
echo "  path  : $UPLOAD_DIR"
echo "  owner : $APP_USER"
echo
echo "Note: keep uploads inside the repo's public/ folder so Next.js serves"
echo "them at /uploads/*. They survive 'pnpm build' but NOT a fresh git clone"
echo "to a new directory — back them up alongside the database."
