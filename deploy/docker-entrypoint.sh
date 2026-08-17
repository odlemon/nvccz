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
echo "[arcus-api] prisma db push"
npx prisma db push --skip-generate
if [ "${RUN_SEED:-1}" = "1" ]; then
  echo "[arcus-api] ensuring admin user"
  node /app/deploy/ensure-admin.js
fi
echo "[arcus-api] starting"
exec "$@"
