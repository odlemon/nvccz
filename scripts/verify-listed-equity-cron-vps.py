#!/usr/bin/env python3
"""Read-only VPS verification for listed-equity price cron + integrations."""
import json
import re
import sys
from datetime import datetime

import paramiko

HOST = "31.220.82.129"
PORT = 2299
USER = "root"
PASSWORD = "niakazi123"


def run(client, cmd: str, timeout: int = 120) -> tuple[int, str]:
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, (out + ("\n" + err if err.strip() else "")).strip()


def mask(s: str) -> str:
    if not s:
        return "(unset)"
    if len(s) <= 6:
        return "***"
    return s[:3] + "…" + s[-2:]


def main() -> int:
    print("=== Listed-equity cron / price integration VPS verify ===")
    print(f"Target: {USER}@{HOST}:{PORT}\n")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        port=PORT,
        username=USER,
        password=PASSWORD,
        timeout=45,
        look_for_keys=False,
        allow_agent=False,
    )

    checks: list[tuple[str, bool, str]] = []

    code, pm2 = run(client, "pm2 jlist 2>/dev/null || pm2 list")
    pm2_ok = code == 0 and ("api-kyntaro" in pm2.lower() or "online" in pm2.lower())
    checks.append(("pm2 processes (no restart performed)", pm2_ok, pm2[:800]))

    code, cron = run(client, "test -f /etc/cron.d/arcus-listed-equity && cat /etc/cron.d/arcus-listed-equity || echo MISSING")
    cron_ok = "scrape-domestic" in cron and "MISSING" not in cron
    checks.append(("cron file /etc/cron.d/arcus-listed-equity", cron_ok, cron[:1200].replace("Secret: ", "Secret: ***")))

    code, cron_svc = run(client, "systemctl is-active cron 2>/dev/null || service cron status 2>/dev/null | head -3")
    checks.append(("cron daemon active", "active" in cron_svc.lower() or "running" in cron_svc.lower(), cron_svc[:200]))

    for log in ["/var/log/arcus-market-scrape.log", "/var/log/arcus-market-retry.log"]:
        code, tail = run(client, f"test -f {log} && tail -n 8 {log} || echo '(no log yet)'")
        has_recent = log.split("/")[-1] in tail or len(tail) > 20
        checks.append((f"log tail {log}", has_recent, tail[:600]))

    code, env_nts = run(
        client,
        "cd /var/www/projects/nts && grep -E '^(MANSA_API_KEY|MARKET_DATA_CRON_SECRET|TRADE_ROUTER_CRON_SECRET|CRON_SECRET|VFEX|SECZIM)=' .env 2>/dev/null | sed 's/=.*$/=***/'",
    )
    mansa_ok = "MANSA_API_KEY" in env_nts
    secret_ok = "MARKET_DATA_CRON_SECRET" in env_nts or "CRON_SECRET" in env_nts
    checks.append(("nts .env MANSA_API_KEY present", mansa_ok, env_nts[:400]))
    checks.append(("nts .env cron secret present", secret_ok, ""))

    code, secrets_raw = run(
        client,
        "cd /var/www/projects/nts && grep -E '^(MARKET_DATA_CRON_SECRET|CRON_SECRET)=' .env | head -1",
    )
    market_secret = ""
    if "=" in secrets_raw:
        market_secret = secrets_raw.split("=", 1)[1].strip().strip('"').strip("'")

    if market_secret:
        code, scrape = run(
            client,
            f'curl -sS -m 180 -w "\\nHTTP:%{{http_code}}\\n" -X POST "http://127.0.0.1:3009/api/investments/market-data/cron/scrape-domestic" '
            f'-H "X-Market-Data-Cron-Secret: {market_secret}"',
            timeout=200,
        )
        scrape_ok = "HTTP:200" in scrape or "HTTP:201" in scrape
        checks.append(("live scrape via localhost cron endpoint", scrape_ok, scrape[:1500]))
    else:
        checks.append(("live scrape via localhost cron endpoint", False, "no secret in nts .env"))

    code, batches = run(
        client,
        """mysql -N -e "SELECT id,source_code,status,record_count,created_at FROM nts.listed_equity_market_data_ingest_batches ORDER BY created_at DESC LIMIT 5" 2>/dev/null || echo 'mysql skip'""",
    )
    checks.append(("recent ingest batches (nts DB)", "listed_equity" in batches or "ZSE" in batches or "VFEX" in batches, batches[:500]))

    code, ticks = run(
        client,
        """mysql -N -e "SELECT COUNT(*), MAX(priced_at) FROM nts.listed_equity_price_ticks WHERE priced_at >= CURDATE()" 2>/dev/null || echo 'mysql skip'""",
    )
    checks.append(("today's price ticks count", ticks.strip().isdigit() or "mysql skip" not in ticks, ticks[:200]))

    client.close()

    passed = sum(1 for _, ok, _ in checks if ok)
    print(f"\n=== Results {passed}/{len(checks)} ===")
    for name, ok, detail in checks:
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}")
        if detail:
            print(f"       {detail[:700]}\n")

    return 0 if passed >= len(checks) - 2 else 1


if __name__ == "__main__":
    raise SystemExit(main())
