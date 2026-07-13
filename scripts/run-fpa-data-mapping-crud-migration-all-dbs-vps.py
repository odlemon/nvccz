#!/usr/bin/env python3
"""Run FPA data-mapping CRUD migration on nts, client1_db, demo_env via VPS."""
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


def run(client, cmd: str, title: str) -> int:
    print(f"\n=== {title} ===")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode(errors="replace")
    print(out.encode("ascii", "replace").decode("ascii"))
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"EXIT {code}", file=sys.stderr)
    return code


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    creds = load_creds(CRED_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        creds.get("VPS_HOST", ""),
        username=creds.get("VPS_USER", "root"),
        password=creds.get("VPS_PASSWORD", ""),
        timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )
    failed = 0
    if run(client, "cd /var/www/projects/nts && git pull", "git pull nts") != 0:
        failed += 1
    for label, url in URLS:
        if (
            run(
                client,
                f'cd /var/www/projects/nts && DATABASE_URL="{url}" npm run db:migrate:fpa-data-mapping-crud',
                f"migrate on {label}",
            )
            != 0
        ):
            failed += 1
        run(
            client,
            f'cd /var/www/projects/nts && DATABASE_URL="{url}" npm run db:migrate:fpa-data-mapping-crud',
            f"idempotent on {label}",
        )
    client.close()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
