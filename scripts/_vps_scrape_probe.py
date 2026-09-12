import json
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("31.220.82.129", port=2299, username="root", password="niakazi123", timeout=45, look_for_keys=False, allow_agent=False)

def run(cmd, t=120):
    _, o, _ = c.exec_command(cmd, get_pty=True, timeout=t)
    return o.read().decode("utf-8", "replace").encode("ascii", "replace").decode()

secret = "arcus-market-1783720457"
scrape = run(
    f'curl -sS -m 180 -X POST "http://127.0.0.1:3009/api/investments/market-data/cron/scrape-domestic" '
    f'-H "X-Market-Data-Cron-Secret: {secret}"',
    t=200,
)
print("=== scrape response ===")
print(scrape[:2000])

print("\n=== latest ingest payload files ===")
print(run("ls -lt /var/www/projects/nts/storage/local-upload-mock/listed-equity-ingest/ 2>/dev/null | head -8"))

print("\n=== sample batch json (sourceType/sourceStatus) ===")
print(
    run(
        "ls -t /var/www/projects/nts/storage/local-upload-mock/listed-equity-ingest/*.json 2>/dev/null | head -1 | xargs -I{} sh -c 'head -c 800 {}'"
    )
)

print("\n=== nts env keys (names only) ===")
print(run("grep -E '^[A-Z_]+=' /var/www/projects/nts/.env | cut -d= -f1 | grep -iE 'MANSA|MARKET|VFEX|SECZIM|CRON|PRICE'"))

print("\n=== pm2 api-kyntaro-dev env MANSA ===")
print(run("pm2 env 0 2>/dev/null | grep -i MANSA | sed 's/=.*$/=***/'"))

c.close()
