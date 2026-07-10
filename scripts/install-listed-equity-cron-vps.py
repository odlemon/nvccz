#!/usr/bin/env python3
"""Install production-style arcus-listed-equity cron (market hours + open/close)."""
import os
import re
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRED = os.path.join(ROOT, ".cursor", "deploy-vps.credentials.local")


def load_creds():
    creds = {}
    with open(CRED, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"([A-Z_]+)=(.*)", line)
            if m:
                creds[m.group(1)] = m.group(2)
    return creds


def run(client, cmd: str) -> str:
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    stdout.channel.recv_exit_status()
    return out + (("\n" + err) if err.strip() else "")


def main() -> int:
    creds = load_creds()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        creds["VPS_HOST"],
        username=creds["VPS_USER"],
        password=creds["VPS_PASSWORD"],
        timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )

    out = run(
        client,
        "cd /var/www/projects/nts; grep -E '^(MARKET_DATA_CRON_SECRET|TRADE_ROUTER_CRON_SECRET|CRON_SECRET)=' .env",
    )
    secrets = {}
    for line in out.splitlines():
        if "=" in line and not line.startswith("grep"):
            k, v = line.split("=", 1)
            secrets[k.strip()] = v.strip().strip('"').strip("'")
    market = secrets.get("MARKET_DATA_CRON_SECRET") or secrets.get("CRON_SECRET")
    trade = secrets.get("TRADE_ROUTER_CRON_SECRET") or secrets.get("CRON_SECRET")
    if not market or not trade:
        print("Missing cron secrets in nts .env")
        client.close()
        return 1

    # UTC host: CAT = UTC+2 → 09:00 CAT = 07:00 UTC, 16:00 CAT = 14:00 UTC
    # Intraday: every 15 min 07:00–14:00 UTC weekdays
    cron_body = f"""# Arcus listed-equity market data + trade routing (production schedule)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

MARKET_SECRET={market}
TRADE_SECRET={trade}
API=https://dev-api.arcus.co.zw/api

# 09:00 CAT open scrape
0 7 * * 1-5 root curl -fsS -X POST "$API/investments/market-data/cron/scrape-domestic" -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-scrape.log 2>&1

# Intraday every 15 minutes during market hours (09:00–16:00 CAT / 07:00–14:00 UTC)
*/15 7-13 * * 1-5 root curl -fsS -X POST "$API/investments/market-data/cron/scrape-domestic" -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-scrape.log 2>&1

# 16:00 CAT close scrape
0 14 * * 1-5 root curl -fsS -X POST "$API/investments/market-data/cron/scrape-domestic" -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-scrape.log 2>&1

# Retry failed ingest every 15 minutes
*/15 * * * * root curl -fsS -X POST "$API/investments/market-data/cron/retry-failed-ingest" -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-retry.log 2>&1

# Retry failed trade routing every 15 minutes
*/15 * * * * root curl -fsS -X POST "$API/investments/trades/cron/retry-failed-routing" -H "X-Trade-Router-Cron-Secret: $TRADE_SECRET" >> /var/log/arcus-trade-retry.log 2>&1
"""

    sftp = client.open_sftp()
    with sftp.file("/etc/cron.d/arcus-listed-equity", "w") as f:
        f.write(cron_body)
    sftp.close()
    run(client, "chmod 644 /etc/cron.d/arcus-listed-equity")
    print(run(client, "cat /etc/cron.d/arcus-listed-equity | sed 's/Secret: .*/Secret: ***/'"))
    print("=== verify scrape ===")
    print(
        run(
            client,
            f'curl -sS -w "\\nHTTP:%{{http_code}}\\n" -X POST "https://dev-api.arcus.co.zw/api/investments/market-data/cron/scrape-domestic" '
            f'-H "X-Market-Data-Cron-Secret: {market}"',
        )[:1500]
    )
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
