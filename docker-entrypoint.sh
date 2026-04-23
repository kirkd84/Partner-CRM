#!/bin/sh
# PartnerRadar runtime entrypoint. Runs on every container start.
# Pushes any pending Prisma schema changes before booting the web server
# so Kirk never has to run `pnpm db:push` manually from PowerShell again.
#
# Fail-soft on push: if the DB is momentarily unreachable we still start
# the server — users hit a 500 instead of the container crash-looping.

set -e

echo "[entrypoint] Syncing Prisma schema → Railway Postgres…"
if prisma db push --skip-generate --schema=/app/schema.prisma --accept-data-loss=false; then
  echo "[entrypoint] ✓ Schema up to date."
else
  echo "[entrypoint] ⚠ prisma db push failed — starting server anyway." >&2
fi

echo "[entrypoint] Starting Next.js standalone server on :${PORT:-3000}…"
exec node apps/web/server.js
