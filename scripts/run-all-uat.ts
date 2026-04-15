// @ts-nocheck
/**
 * Runs accounting / UAT npm scripts in sequence. Stops on first failure.
 *
 *   npm run test:uat:all
 *
 * Scripts after `test:accounting:core` require a reachable MySQL `DATABASE_URL`.
 * Preflight checks connectivity and prints a short message instead of a long Prisma stack trace.
 */
import { execSync } from "child_process";
import { resolve } from "path";

const root = resolve(__dirname, "..");

const SCRIPTS = [
  "test:accounting:core",
  "test:invoice-lifecycle",
  "test:uat:usd-zar-cross",
  "test:uat:vat-zig-invoice",
  "test:uat:fx-realized-usd-zwl",
  "test:uat:partial-pay-zwl",
  "test:uat:creditors-rent",
  "test:uat:debtors-age",
  "test:uat:debtors-control-zig-invoice",
  "test:uat:cashbook-revenue-zig",
  "test:uat:cashbook-expense-zig",
  "test:uat:credit-note-zig",
  "test:uat:asset-acquisition-zig",
  "test:uat:depreciation-scrap-floor",
  "test:uat:depreciation-je-mapping",
  "test:uat:asset-disposal-zig",
  "test:uat:revenue-zig-double-entry",
  "test:rounding-variance-zig",
  "test:reconciliation-unreconciled",
  "test:cashbook-complex-search",
  "test:internal-fund-transfer",
  "test:uat:staff-reimbursement-vendor",
  "test:uat:procurement-po",
  "test:uat:commitment-zig",
  "test:uat:three-way-variance",
  "test:journal-security-audit",
  "test:audit-trail-sequential",
  "check:audit-trail-all",
];

/** First script index that talks to the real database (Jest tests use mocks). */
const FIRST_DB_SCRIPT_INDEX = SCRIPTS.indexOf("test:invoice-lifecycle");

async function assertMysqlReachable(): Promise<void> {
  if (process.env.UAT_SKIP_DB_PREFLIGHT === "1") {
    console.log(
      "\n[UAT] UAT_SKIP_DB_PREFLIGHT=1 — skipping MySQL connectivity check (use with care).\n"
    );
    return;
  }
  const { checkDatabaseConnection } = await import("../src/utils/database");
  const ok = await checkDatabaseConnection();
  if (!ok) {
    console.error(
      "\n[UAT] MySQL is not reachable using DATABASE_URL. The suite cannot run DB-backed scripts",
      "(everything after test:accounting:core).\n" +
        "    • Confirm the server is running and network/VPN allows the host:port in .env\n" +
        "    • Optional: UAT_SKIP_DB_PREFLIGHT=1 only if you intentionally bypass this check\n"
    );
    process.exit(1);
  }
  console.log("\n[UAT] MySQL preflight OK — continuing with DB-backed scripts.\n");
}

async function main() {
  const start = Date.now();
  let failed: string | null = null;
  let dbPreflightDone = false;

  for (let i = 0; i < SCRIPTS.length; i++) {
    const name = SCRIPTS[i];
    if (!dbPreflightDone && FIRST_DB_SCRIPT_INDEX >= 0 && i >= FIRST_DB_SCRIPT_INDEX) {
      await assertMysqlReachable();
      dbPreflightDone = true;
    }

    console.log(`\n${"=".repeat(72)}\n  ${name}\n${"=".repeat(72)}\n`);
    try {
      const env = { ...process.env } as NodeJS.ProcessEnv;
      // After invoice-lifecycle, DB has USD/ZWG snapshots; allows UATs to continue if Zimrate returns 401.
      if (env.UAT_ZIMRATE_FALLBACK === undefined) {
        env.UAT_ZIMRATE_FALLBACK = "1";
      }
      execSync(`npm run ${name}`, {
        cwd: root,
        stdio: "inherit",
        env,
      });
      // Jest can exit abruptly; a short pause reduces flaky "connection pool timeout" on the first DB script.
      if (name === "test:accounting:core") {
        const ms = Math.min(
          30_000,
          Math.max(0, Number(process.env.UAT_AFTER_ACCOUNTING_CORE_MS ?? 2500) || 2500)
        );
        if (ms > 0) {
          await new Promise((r) => setTimeout(r, ms));
        }
      }
    } catch {
      failed = name;
      break;
    }
  }

  const sec = ((Date.now() - start) / 1000).toFixed(1);
  if (failed) {
    console.error(`\nUAT suite FAILED at: ${failed} (after ${sec}s)\n`);
    process.exit(1);
  }
  console.log(`\nUAT suite completed successfully in ${sec}s.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
