#!/usr/bin/env bash
# Buildery — PostgreSQL backup.
#
# Creates a timestamped, compressed pg_dump and prunes old backups.
# Intended to run from cron, e.g. daily at 03:00:
#
#   0 3 * * * /var/www/buildery/scripts/backup-db.sh >> /var/log/buildery-backup.log 2>&1
#
# Env overrides:
#   APP_DIR     path to the app (default: script's parent dir)
#   BACKUP_DIR  where dumps are written (default: /var/backups/buildery)
#   KEEP        how many recent dumps to retain  (default: 14)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/buildery}"
KEEP="${KEEP:-14}"

# Load DATABASE_URL from the app's .env (only that line, no code execution).
if [ -f "$APP_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] ERROR: DATABASE_URL not found (checked $APP_DIR/.env)" >&2
  exit 1
fi

# `schema` is a Prisma-only URL parameter; pg_dump rejects it. Preserve any
# other PostgreSQL connection options while removing this one.
DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*(&|$)/\1/; s/[?&]$//; s/\?&/?/')"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
OUT="$BACKUP_DIR/buildery-${STAMP}.dump"

echo "[backup] $(date -u) → $OUT"
# Custom format (-Fc): compressed, restorable with pg_restore.
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] done — ${SIZE}"

# Prune: keep only the newest $KEEP dumps.
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/buildery-*.dump 2>/dev/null | tail -n "+$((KEEP + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  printf '%s\n' "${OLD[@]}" | xargs -r rm --
  echo "[backup] pruned ${#OLD[@]} old dump(s), keeping $KEEP"
fi
