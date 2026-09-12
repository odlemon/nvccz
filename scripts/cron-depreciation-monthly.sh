#!/usr/bin/env bash
#
# Copy this file to your Ubuntu server, e.g.:
#   sudo cp cron-depreciation-monthly.sh /opt/nvccz/cron-depreciation-monthly.sh
#   sudo chmod 700 /opt/nvccz/cron-depreciation-monthly.sh
#
# -----------------------------------------------------------------------------
# WHAT IT CALLS (no JWT; API must have DEPRECIATION_CRON_SECRET in PM2/env)
# -----------------------------------------------------------------------------
#   The API records depreciation/journals as createdBy the user whose firstName
#   is "admin" (case-insensitive). Ensure that user exists.
#
#   POST {API_BASE_URL}/cron/depreciation/monthly
#   Headers: Content-Type: application/json
#            X-Depreciation-Cron-Secret: <same value as on the API server>
#   Body: {}
#
# Examples of full URL:
#   Dev:  https://dev-api.arcus.co.zw/api/cron/depreciation/monthly
#   Prod: https://YOUR-PROD-HOST/api/cron/depreciation/monthly
#
# (Legacy same handler: .../api/accounting/assets/depreciation/cron/monthly)
#
# -----------------------------------------------------------------------------
# SECRET ON THE SERVER (do not paste the secret into this script)
# -----------------------------------------------------------------------------
#   sudo mkdir -p /etc/nvccz
#   sudo nano /etc/nvccz/cron.env
#   Put one line:
#     export DEPRECIATION_CRON_SECRET='your-long-random-secret'
#   sudo chmod 600 /etc/nvccz/cron.env
#
# -----------------------------------------------------------------------------
# CRONTAB EXAMPLES (sudo crontab -e)
# -----------------------------------------------------------------------------
# Every 5 minutes (testing):
#   */5 * * * * . /etc/nvccz/cron.env && /opt/nvccz/cron-depreciation-monthly.sh >> /var/log/depreciation-cron.log 2>&1
#
# Once a month, 02:15 on the 1st (adjust after testing):
#   15 2 1 * * . /etc/nvccz/cron.env && /opt/nvccz/cron-depreciation-monthly.sh >> /var/log/depreciation-cron.log 2>&1
#
# -----------------------------------------------------------------------------

set -euo pipefail

# Default dev API base (includes /api). Override when you run or in cron.env:
#   export API_BASE_URL='https://your-prod-host/api'
: "${API_BASE_URL:=https://dev-api.arcus.co.zw/api}"

if [[ -z "${DEPRECIATION_CRON_SECRET:-}" ]]; then
  echo "error: DEPRECIATION_CRON_SECRET is not set (source /etc/nvccz/cron.env first)" >&2
  exit 1
fi

ENDPOINT="${API_BASE_URL%/}/cron/depreciation/monthly"

curl -sS -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Depreciation-Cron-Secret: ${DEPRECIATION_CRON_SECRET}" \
  -d '{}'

echo " $(date -Is)"
