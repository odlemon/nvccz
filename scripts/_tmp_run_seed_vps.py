#!/usr/bin/env python3
import os, re, paramiko
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
creds = {}
with open(os.path.join(ROOT, ".cursor", "deploy-vps.credentials.local"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"([A-Z_]+)=(.*)", line)
        if m:
            creds[m.group(1)] = m.group(2)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(creds["VPS_HOST"], username=creds["VPS_USER"], password=creds["VPS_PASSWORD"], timeout=30, look_for_keys=False, allow_agent=False)
stdin, stdout, stderr = c.exec_command(
    "cd /var/www/projects/nts; npm run db:seed:investment-ops-demo",
    get_pty=True,
)
print(stdout.read().decode())
print(stderr.read().decode())
print("exit", stdout.channel.recv_exit_status())
c.close()
