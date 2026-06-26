#!/usr/bin/env bash
# Remote deploy steps — run ON the VPS (or via: ssh root@31.220.82.129 'bash -s' < scripts/deploy-vps-remote.sh)
set -euo pipefail

PROJECTS=/var/www/projects

deploy_app() {
  local dir="$1"
  echo "=== Deploy $dir ==="
  cd "$PROJECTS/$dir"
  git pull
  npm i
  npm run build
}

deploy_app nts
deploy_app client1
pm2 restart all
echo "=== Deploy complete ==="
