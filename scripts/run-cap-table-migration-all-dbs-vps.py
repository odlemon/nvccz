#!/usr/bin/env python3
"""Run cap-table migration on dev, prod, demo DBs via VPS (localhost MySQL)."""
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

URLS = [
    ("dev nts", "mysql://nts_user:StrongPass123!@127.0.0.1:3306/nts?ssl-mode=DISABLED"),
    ("prod client1", "mysql://client1_user:Client1Pass!2025@127.0.0.1:3306/client1_db?ssl-mode=DISABLED"),
    ("demo demo_env", "mysql://nts_user:StrongPass123!@127.0.0.1:3306/demo_env?ssl-mode=DISABLED"),
]


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
    creds = load_creds(CRED_PATH)
    host = creds.get("VPS_HOST", "")
    user = creds.get("VPS_USER", "root")
    password = creds.get("VPS_PASSWORD", "")
    if not host or not password:
        print("Missing VPS credentials", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {user}@{host}...")
    client.connect(host, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)

    exit_code = 0
    for label, url in URLS:
        print(f"\n=== {label} ===")
        cmd = f'cd /var/www/projects/nts && DATABASE_URL="{url}" npm run db:migrate:cap-table-management'
        stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
        out = stdout.read().decode("utf-8", errors="replace")
        print(out)
        err = stderr.read().decode("utf-8", errors="replace")
        if err.strip():
            print(err, file=sys.stderr)
        code = stdout.channel.recv_exit_status()
        if code != 0:
            exit_code = code

    client.close()
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
