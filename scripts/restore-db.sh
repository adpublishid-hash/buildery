#!/usr/bin/env bash
# Buildery — PostgreSQL restore.
#
#   ./scripts/restore-db.sh /var/backups/buildery/buildery-20260101T030000Z.dump
#
# DESTRUCTIVE: this drops and recreates objects in the target database.
# It asks you to type the database name to confirm before proceeding.
#
# Env overrides:
#   APP_DIR  path to the app (default: script's parent dir)

set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup-file.dump>" >&2
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "ERROR: backup file not found: $FILE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"

if [ -f "$APP_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not found (checked $APP_DIR/.env)" >&2
  exit 1
fi

# Extract the database name (last path segment, minus any ?query).
DB_NAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"

echo "About to RESTORE:"
echo "  from : $FILE"
echo "  into : database \"$DB_NAME\""
echo
echo "This OVERWRITES existing data. Stop the app first (pm2 stop buildery)."
echo "Type the database name to confirm:"
read -r CONFIRM
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "Aborted — confirmation did not match."
  exit 1
fi

pg_restore \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname "$DATABASE_URL" \
  "$FILE"

echo "Restore complete. Restart the app:  pm2 restart buildery"
