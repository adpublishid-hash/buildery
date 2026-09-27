#!/usr/bin/env bash
#
# Release gate. Everything that must be true before a build may reach a server.
#
# This exists because two separate failures reached production on 12 Sep 2026:
# an incomplete build was activated (the build process died with its SSH
# session, leaving .next without a BUILD_ID), and a schema change shipped that
# had never been type-checked. Both are caught below.
#
# Usage:
#   ./scripts/verify-release.sh            # checks only
#   ./scripts/verify-release.sh --build    # checks plus a real production build
#
# Exits non-zero on the first failure. Deploy scripts must not proceed past it.

set -uo pipefail
cd "$(dirname "$0")/.."

WITH_BUILD=0
[ "${1:-}" = "--build" ] && WITH_BUILD=1

FAILED=()
step() {
  local name="$1"; shift
  printf '\n\033[1m── %s\033[0m\n' "$name"
  if "$@"; then
    printf '\033[32m   ok\033[0m\n'
  else
    printf '\033[31m   GAGAL\033[0m\n'
    FAILED+=("$name")
  fi
}

step "TypeScript" npx tsc --noEmit
step "Lint" pnpm lint
step "Unit tests" pnpm test

# A schema that has drifted from the migrations is the failure mode that is
# easiest to miss: `migrate status` reports "up to date" as long as every
# migration file has run, even when the schema has moved on since.
check_schema_drift() {
  local url
  url=$(grep -E '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')
  if [ -z "$url" ]; then
    echo "   DATABASE_URL kosong — dilewati"
    return 0
  fi
  local diff
  diff=$(npx prisma migrate diff \
           --from-url "$url" \
           --to-schema-datamodel prisma/schema.prisma \
           --script 2>&1)
  # A connection failure prints an error and no SQL, which would otherwise
  # read as zero drift. Treat it as the failure it is.
  if echo "$diff" | grep -qiE "P1001|can't reach|Error:"; then
    echo "   tidak bisa terhubung ke database untuk mengecek drift"
    return 1
  fi
  diff=$(echo "$diff" | grep -cvE '^--|^$')
  # The legacy objects that used to account for drift are now declared in the
  # schema (migration 20260913090000_declare_legacy_whatsapp_objects), so any
  # difference at all is new and unexplained.
  local allowed=0
  if [ "$diff" -gt "$allowed" ]; then
    echo "   skema menyimpang dari database: $diff statement (ambang $allowed)"
    echo "   jalankan: npx prisma migrate diff --from-url \"\$DATABASE_URL\" --to-schema-datamodel prisma/schema.prisma --script"
    return 1
  fi
  echo "   drift $diff statement (dalam ambang $allowed)"
  return 0
}
step "Schema vs database" check_schema_drift

if [ "$WITH_BUILD" -eq 1 ]; then
  step "Production build" pnpm build
  # The specific failure that took production down: a .next directory that
  # exists but has no BUILD_ID is not a usable build.
  step "BUILD_ID ada" test -f .next/BUILD_ID
fi

printf '\n'
if [ ${#FAILED[@]} -gt 0 ]; then
  printf '\033[31mRELEASE DITOLAK\033[0m — gagal: %s\n' "${FAILED[*]}"
  exit 1
fi
printf '\033[32mRELEASE LOLOS\033[0m\n'
