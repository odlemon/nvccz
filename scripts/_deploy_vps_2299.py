#!/usr/bin/env python3
"""SSH deploy to VPS on port 2299 — reads .cursor/deploy-vps.credentials.local"""
import os
import re
import sys

try:
    import paramiko
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRED_PATH = os.path.join(ROOT, ".cursor", "deploy-vps.credentials.local")


def load_creds(path: str) -> dict[str, str]:
    creds: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"([A-Z_]+)=(.*)", line)
            if m:
                creds[m.group(1)] = m.group(2)
    return creds


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    creds = load_creds(CRED_PATH)
    host = creds.get("VPS_HOST", "")
    user = creds.get("VPS_USER", "root")
    password = creds.get("VPS_PASSWORD", "")
    port = int(creds.get("VPS_PORT", "2299"))
    if not host or not password:
        print("Missing VPS_HOST or VPS_PASSWORD in credentials file", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {user}@{host}:{port}...")
    client.connect(
        host,
        port=port,
        username=user,
        password=password,
        timeout=45,
        look_for_keys=False,
        allow_agent=False,
    )

    commands = (
        "set -e; "
        "cd /var/www/projects/nts && echo '=== nts ===' && git pull && npm i && npm run build && "
        "cd /var/www/projects/client1 && echo '=== client1 ===' && git pull && npm i && npm run build && "
        "pm2 restart all && echo '=== deploy complete ==='"
    )
    stdin, stdout, stderr = client.exec_command(commands, get_pty=True)
    for line in stdout:
        print(line, end="", flush=True)
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err, file=sys.stderr)
    exit_code = stdout.channel.recv_exit_status()
    client.close()
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
