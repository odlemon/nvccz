/**
 * Accounting sweep A7 (data): scheduled-job run times written before the UTC fix were stamped with the database
 * server's local time (CURRENT_TIMESTAMP) and read back as UTC, so they show late by the server's offset. Shifts the
 * rows started before --before (UTC, when the fix went live) back by that offset, once (each shifted row is marked).
 * No-op where the database runs on UTC.
 *
 *   npx ts-node scripts/run-accounting-job-runs-utc.ts --before=2026-09-27T23:45:00Z [--check]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

async function main() {
  const before = arg("before");
  if (!before || Number.isNaN(Date.parse(before))) throw new Error("--before=<UTC time the fix went live> is required");
  const [{ m }] = await prisma.$queryRawUnsafe<any[]>("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS m");
  const offset = Number(m);
  console.log(`database offset from UTC: ${offset} min`);
  if (!offset) return console.log("nothing to do");
  // a pre-fix row holds local time, so it compares against the cut-off shifted into local time
  const cutoffLocal = new Date(Date.parse(before) + offset * 60000);
  // shifted rows are marked (summary.utcFixed) so a second run leaves them alone
  const NOT_DONE = "(summary IS NULL OR JSON_EXTRACT(summary, '$.utcFixed') IS NULL)";
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS n FROM accounting_job_runs WHERE started_at <= ? AND ${NOT_DONE}`, cutoffLocal);
  console.log(`rows stamped in local time: ${Number(rows[0].n)}`);
  if (process.argv.includes("--check")) return;
  const n = await prisma.$executeRawUnsafe(
    `UPDATE accounting_job_runs SET started_at = started_at - INTERVAL ? MINUTE, finished_at = finished_at - INTERVAL ? MINUTE, summary = JSON_SET(COALESCE(summary, JSON_OBJECT()), '$.utcFixed', true) WHERE started_at <= ? AND ${NOT_DONE}`,
    offset, offset, cutoffLocal
  );
  console.log(`shifted ${n} row(s) to UTC`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
