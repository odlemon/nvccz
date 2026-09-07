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

/**
 * Scripts this runner deliberately does not execute, with the reason.
 *
 * Before this list existed, a full run reported 9 failures that were not real:
 *
 *  - The `*:all-dbs` / `*-all-dbs` entries are Python fan-out wrappers that
 *    apply a migration across the `nts`, `client1_db` and `demo_env` databases
 *    of a multi-tenant VPS. Each has a TypeScript twin that this runner already
 *    executes against DATABASE_URL, so running both is redundant — and the API
 *    image is node-only, so they failed with `python: not found` while their
 *    twin had already done the work.
 *
 *  - bank-gl-to-cash-equivalents refuses to run by design ("legacy migration …
 *    strongly discouraged") unless ALLOW_LEGACY_BANK_GL_TO_CACE_MIGRATION=1.
 *    A guard doing its job is not a failure.
 *
 * Set MIGRATE_INCLUDE_ALL_DBS=1 to run the fan-out wrappers too (needs Python
 * and access to every target database).
 */
const isFanOut = (name: string) => /[:-]all-dbs$/.test(name);
const DELIBERATELY_SKIPPED: Record<string, string> = {
  "db:migrate:bank-gl-to-cash-equivalents":
    "legacy migration, guarded by ALLOW_LEGACY_BANK_GL_TO_CACE_MIGRATION",
};

const includeFanOut = process.env.MIGRATE_INCLUDE_ALL_DBS === "1";
const all = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith("db:migrate:") && k !== "db:migrate:all")
  .sort();

const skipped: Array<{ name: string; reason: string }> = [];
const scripts = all.filter((name) => {
  if (DELIBERATELY_SKIPPED[name]) {
    skipped.push({ name, reason: DELIBERATELY_SKIPPED[name] });
    return false;
  }
  if (isFanOut(name) && !includeFanOut) {
    skipped.push({ name, reason: "fan-out wrapper; its TypeScript twin runs instead" });
    return false;
  }
  return true;
});

const failures: string[] = [];

console.log(
  `Running ${scripts.length} migration script(s); skipping ${skipped.length}.\n`
);

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
console.log(`skipped: ${skipped.length}`);
for (const { name, reason } of skipped) {
  console.log(`  - ${name} (${reason})`);
}
if (failures.length) {
  console.log("\nfailed:");
  console.log(failures.join("\n"));
  process.exit(1);
}
