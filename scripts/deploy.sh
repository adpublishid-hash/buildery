#!/usr/bin/env bash
# Buildery — deploy / update an existing install.
#
# Pulls the latest code, installs deps, runs migrations, rebuilds, and
# reloads PM2. Run it from the app directory on the VPS:
#
#   cd /var/www/buildery && ./scripts/deploy.sh
#
# First-time setup is in DEPLOYMENT.md — this script is for updates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

echo "==> Buildery deploy  ($(date -u))"

# 1. Safety: back up the database before touching anything.
if [ -x "$SCRIPT_DIR/backup-db.sh" ]; then
  echo "==> Backing up database first"
  "$SCRIPT_DIR/backup-db.sh" || echo "WARN: backup failed — continuing"
fi

# 2. Pull latest code (skip if you deploy by uploading a build).
if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
fi

# 3. Install dependencies (frozen lockfile = reproducible).
echo "==> pnpm install"
pnpm install --frozen-lockfile --prod=false

# 4. Apply database migrations (safe, additive — never resets).
echo "==> prisma migrate deploy"
pnpm exec prisma migrate deploy
pnpm exec prisma generate

# 5. Production build.
echo "==> next build"
pnpm build

# 6. Reload the PM2 process (zero-downtime if in cluster mode).
echo "==> pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> Done. Check:  pm2 logs buildery"
