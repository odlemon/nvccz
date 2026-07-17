// @ts-nocheck
import "dotenv/config";
import { spawnSync } from "child_process";

const ALLOWED_DATABASES = ["nts", "demo_env"] as const;

function databaseUrlFor(databaseName: string): string {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL is required.");
  const url = new URL(source);
  const current = url.pathname.replace(/^\//, "").split("/")[0]?.toLowerCase();
  if (current === "client1_db") {
    throw new Error("HARD BLOCK: refusing to derive demo reset URLs from client1_db.");
  }
  if (!ALLOWED_DATABASES.includes(databaseName as (typeof ALLOWED_DATABASES)[number])) {
    throw new Error(`Database ${databaseName} is not allowed.`);
  }
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function run(label: string, databaseUrl: string, args: string[]) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, ["-r", "ts-node/register/transpile-only", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function main() {
  for (const databaseName of ALLOWED_DATABASES) {
    const databaseUrl = databaseUrlFor(databaseName);
    run(`${databaseName}: cleanup apply`, databaseUrl, [
      "scripts/cleanup-fundraising-module-data.ts",
      "--apply",
    ]);
    run(`${databaseName}: client demo seed`, databaseUrl, [
      "scripts/seed-fundraising-client-demo.ts",
    ]);
  }
  console.log("\nFundraising demo reset completed for nts and demo_env. client1_db was not touched.");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
