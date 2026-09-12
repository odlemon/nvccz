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
cmd = r"""
cd /var/www/projects/dev
echo '=== local HEAD ==='
git log -1 --format='%H%n%ci%n%an%n%s%n%b'
echo '=== remote origin/dev (ls-remote) ==='
git ls-remote origin refs/heads/dev refs/heads/main 2>&1
echo '=== fetch dry info ==='
GIT_TERMINAL_PROMPT=0 git fetch origin dev main --dry-run 2>&1 | head -20
echo '=== after fetch tips ==='
GIT_TERMINAL_PROMPT=0 git fetch origin 2>&1 | tail -20
git rev-parse origin/dev 2>/dev/null; git log -1 --format='%h | %ci | %s' origin/dev 2>/dev/null
git rev-parse origin/main 2>/dev/null; git log -1 --format='%h | %ci | %s' origin/main 2>/dev/null
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(creds["VPS_HOST"], username=creds["VPS_USER"], password=creds["VPS_PASSWORD"], timeout=30, look_for_keys=False, allow_agent=False)
stdin, stdout, stderr = c.exec_command(cmd, get_pty=True, timeout=90)
out = stdout.read().decode("utf-8", errors="replace")
open(os.path.join(ROOT, "tmp-fe-git-last.txt"), "w", encoding="utf-8", errors="replace").write(out)
print(out.encode("ascii", "replace").decode())
c.close()
