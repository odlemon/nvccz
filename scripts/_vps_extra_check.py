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
cmds = [
    "pm2 list",
    "grep -iE 'MANSA|VFEX|SECZIM' /var/www/projects/nts/.env 2>/dev/null | sed 's/=.*$/=***/'",
    "grep -iE 'MANSA|VFEX|SECZIM' /var/www/projects/client1/.env 2>/dev/null | sed 's/=.*$/=***/'",
    "ls -la /var/log/arcus-market*.log",
    "date -u; date",
    'stat -c "%y %n" /var/log/arcus-market-scrape.log 2>/dev/null || ls -l /var/log/arcus-market-scrape.log',
]
for cmd in cmds:
    print("---", cmd, "---")
    _, stdout, _ = c.exec_command(cmd, get_pty=True, timeout=60)
    text = stdout.read().decode("utf-8", "replace")[:1500]
    print(text.encode("ascii", "replace").decode("ascii"))
c.close()
