#!/bin/sh
set -eu
DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
echo "[arcus-api] waiting for ${DB_HOST}:${DB_PORT}..."
i=0
until node -e "const n=require('net');const s=n.connect({host:process.env.DB_HOST||'mysql',port:Number(process.env.DB_PORT||3306)},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),4000)"; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[arcus-api] database not ready after 120s"
    exit 1
  fi
  sleep 2
done
# Schema changes are applied by the explicit SQL migration scripts in scripts/
# (npm run db:migrate:all, or an individual db:migrate:* script), never from here.
#
# `prisma db push` used to run at this point. It was removed because it derives
# the target schema solely from schema.prisma and drops anything absent there —
# and several live tables are deliberately managed outside Prisma via
# $executeRawUnsafe (financial_reports and reporting_notification_logs among
# them). A dry run against the Arcus Dev database confirmed db push wanted to
# DROP both, with live rows in each.
#
# Migrations are a deliberate deploy step, not a side effect of a restart:
#   docker exec <api-container> npm run db:migrate:all
#   docker exec <api-container> npm run db:migrate:nts-remaining   # vendor/users NTS gaps
# Arcus DEV selective --api runs db:migrate:nts-remaining after image build
# (see nvccz-new/scripts/deploy-arcus-dev-selective.py). Running all 125
# migrations on every boot would also add many minutes of downtime to what
# should be a fast restart.
echo "[arcus-api] skipping automatic schema sync (migrations are run explicitly)"
if [ "${RUN_SEED:-1}" = "1" ]; then
  echo "[arcus-api] ensuring admin user"
  node /app/deploy/ensure-admin.js
fi
echo "[arcus-api] starting"
exec "$@"
