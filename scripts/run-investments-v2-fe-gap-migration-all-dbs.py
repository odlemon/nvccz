"""Apply Investments V2 FE gap DDL to nts, client1_db, demo_env."""
import os
import re
import subprocess
import sys

def load_dotenv_url():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r'\s*DATABASE_URL\s*=\s*["\']?([^"\'#\r\n]+)', line)
                if m:
                    return m.group(1).strip()
    return os.environ.get("DATABASE_URL", "")

BASE = load_dotenv_url()
if not BASE:
    print("No DATABASE_URL in .env")
    sys.exit(1)

m = re.match(r"(mysql://)([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)(\?.*)?", BASE)
if not m:
    print("Cannot parse DATABASE_URL")
    sys.exit(1)
scheme, user, password, host, port, _db, qs = m.groups()
port = port or "3306"
qs = qs or ""

DBS = [
    ("nts", user, password),
    ("client1_db", "client1_user", "Client1Pass!2025"),
    ("demo_env", user, password),
]

def build_url(db, u, p):
    return f"{scheme}{u}:{p}@{host}:{port}/{db}{qs}"

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script = os.path.join("scripts", "run-investments-v2-fe-gap-migration.ts")
    for db, u, p in DBS:
        url = build_url(db, u, p)
        print(f"\n=== Migrating {db} as {u} ===")
        env = os.environ.copy()
        env["DATABASE_URL"] = url
        r = subprocess.run(
            ["npx", "ts-node", "--transpile-only", "-r", "dotenv/config", script],
            cwd=root,
            env=env,
            shell=True,
        )
        if r.returncode != 0 and db == "client1_db":
            print("[warn] client1_user failed — retry with nts credentials")
            env["DATABASE_URL"] = build_url(db, user, password)
            r = subprocess.run(
                ["npx", "ts-node", "--transpile-only", "-r", "dotenv/config", script],
                cwd=root,
                env=env,
                shell=True,
            )
        if r.returncode != 0:
            print(f"[fail] {db}")
            sys.exit(r.returncode)
        print(f"[ok] {db}")
    print("\n[done] all three DBs migrated. Clear shell DATABASE_URL before UAT.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
