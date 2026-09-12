import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "31.220.82.129",
    port=2299,
    username="root",
    password="niakazi123",
    timeout=45,
    look_for_keys=False,
    allow_agent=False,
)


def run(cmd):
    _, stdout, _ = c.exec_command(cmd, get_pty=True, timeout=90)
    return stdout.read().decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")


print("=== projects ===")
print(run("ls -la /var/www/projects/ 2>/dev/null | head -15"))

print("=== pm2 describe app-arcus-demo (env snippet) ===")
print(run("pm2 env 16 2>/dev/null | grep -E 'MANSA|MARKET_DATA|PORT|DATABASE' | sed 's/=.*$/=***/' | head -20"))

print("=== listening 3009 ===")
print(run("ss -lntp | grep 3009 || netstat -lntp 2>/dev/null | grep 3009"))

print("=== arcus demo env mansa ===")
print(run("grep -i MANSA /var/www/projects/nts/.env /var/www/projects/*/\.env 2>/dev/null | head -5 | sed 's/=.*$/=***/'"))

print("=== last 3 scrape log lines (truncated) ===")
print(run("tail -3 /var/log/arcus-market-scrape.log | cut -c1-400"))

c.close()
