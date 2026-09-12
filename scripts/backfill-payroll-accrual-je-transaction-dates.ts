/**
 * Backfill: fix payroll accrual journal entry transaction dates.
 *
 * Why: KPI analytics / financial statements filter by journalEntry.transactionDate. Payroll accrual JEs were
 * previously posted with transactionDate = processing date, so period analytics (e.g. Jan 2026) showed 0%.
 *
 * This script finds payroll accrual journal entries by description pattern:
 *   "Payroll Journal - Gross Pay: {run.name} ({run.payPeriod})"
 * and updates their transactionDate to payrollRun.endDate.
 *
 * Safe to re-run.
 *
 * Usage:
 *   npm run db:backfill:payroll-accrual-je-dates -- --dry-run
 *   npm run db:backfill:payroll-accrual-je-dates -- --from=2026-01-01
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const i = process.argv.indexOf(hit);
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const fromStr = arg("--from");
  const fromDate = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
  if (fromStr && Number.isNaN(fromDate!.getTime())) throw new Error(`Invalid --from date: ${fromStr}`);

  const runs = await prisma.payrollRun.findMany({
    where: {
      status: "COMPLETED",
      ...(fromDate ? { endDate: { gte: fromDate } } : {}),
    },
    select: { id: true, name: true, payPeriod: true, endDate: true },
    orderBy: { endDate: "asc" },
  });

  let matched = 0;
  let updated = 0;
  const samples: any[] = [];

  for (const r of runs) {
    const desc = `Payroll Journal - Gross Pay: ${r.name} (${r.payPeriod})`;
    const jes = await prisma.journalEntry.findMany({
      where: { description: desc },
      select: { id: true, referenceNumber: true, transactionDate: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (!jes.length) continue;
    matched += jes.length;
    for (const je of jes) {
      const needs = je.transactionDate.getTime() !== r.endDate.getTime();
      if (needs && !dryRun) {
        await prisma.journalEntry.update({ where: { id: je.id }, data: { transactionDate: r.endDate } });
        updated += 1;
      } else if (needs) {
        updated += 1; // count would-be updates
      }
      if (samples.length < 20) {
        samples.push({
          payrollRunId: r.id,
          journalEntryId: je.id,
          ref: je.referenceNumber,
          before: je.transactionDate.toISOString().slice(0, 10),
          after: r.endDate.toISOString().slice(0, 10),
          needsUpdate: needs,
        });
      }
    }
  }

  console.log("backfill-payroll-accrual-je-transaction-dates:", {
    dryRun,
    runsChecked: runs.length,
    matchedJournalEntries: matched,
    updatedOrWouldUpdate: updated,
    sample: samples,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

