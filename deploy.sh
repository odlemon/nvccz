#!/usr/bin/env bash
set -e

APP_DIR="/root/projects/nvccz-server"
BRANCH="master"

cd $APP_DIR
echo ">>> Pulling latest code..."
git fetch origin
git reset --hard origin/$BRANCH

echo ">>> Installing dependencies..."
npm ci --production

echo ">>> Generating Prisma client..."
npx prisma generate

echo ">>> Running database migrations..."
npx prisma migrate deploy

echo ">>> Building application..."
npm run build

echo ">>> Checking environment variables..."
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    exit 1
fi

echo ">>> Restarting application..."
pm2 reload ecosystem.config.js --update-env

echo ">>> Deployment completed successfully!"
