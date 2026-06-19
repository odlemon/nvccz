// @ts-nocheck
/**
 * Run every npm `db:migrate:*` script in package.json order (idempotent).
 * Usage: npx ts-node scripts/run-all-db-migrations.ts
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const scripts = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith("db:migrate:") && k !== "db:migrate:all")
  .sort();

const failures: string[] = [];
const skipped: string[] = [];

console.log(`Running ${scripts.length} migration script(s)...\n`);

for (const name of scripts) {
  process.stdout.write(`=== ${name} ===\n`);
  try {
    execSync(`npm run ${name}`, { cwd: root, stdio: "inherit", env: process.env });
    process.stdout.write(`[done] ${name}\n\n`);
  } catch (error) {
    failures.push(name);
    process.stdout.write(`[FAILED] ${name}\n\n`);
  }
}

console.log("\n--- summary ---");
console.log(`ok: ${scripts.length - failures.length}`);
console.log(`failed: ${failures.length}`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
