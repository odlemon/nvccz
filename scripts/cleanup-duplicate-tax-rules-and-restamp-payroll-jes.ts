/**
 * 1. Hard-delete duplicate TaxRules that are still hanging around as `isActive = false`
 *    (they were deactivated by `dedupe-tax-rules-and-rebuild-payroll-runs.ts`).
 *    A "duplicate" = same currencyId + type + rate + threshold + ceiling AND there is at
 *    least one ACTIVE rule with the same bracket signature. Inactive rules with no active
 *    sibling are kept (they may be valid historical archives).
 * 2. Re-stamp existing payroll gross-pay accrual JournalEntry rows whose transactionDate
 *    is in the future (relative to now) — clamp to NOW so they show up in the current GL
 *    viewer. This matches the new clamp logic in PayrollService.createPayrollJournalEntry.
 *
 * Idempotent: re-running it is safe (no-ops once everything is clean).
 *
 * Usage:
 *   npm run db:cleanup:duplicate-tax-rules-and-restamp-payroll-jes
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function deleteDuplicateInactiveTaxRules() {
  const all = await prisma.taxRules.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      rate: true,
      threshold: true,
      ceiling: true,
      currencyId: true,
      effectiveDate: true,
      endDate: true,
      isActive: true,
      createdAt: true,
    },
  });

  const bracketKey = (r: typeof all[number]) =>
    [
      r.currencyId || "",
      String(r.type || "").trim().toUpperCase(),
      r.rate?.toString() || "",
      r.threshold?.toString() ?? "",
      r.ceiling?.toString() ?? "",
    ].join("|");

  const groups = new Map<string, typeof all>();
  for (const r of all) {
    const k = bracketKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  let deletedCount = 0;
  const deletedIds: string[] = [];

  for (const [, members] of groups) {
    const hasActive = members.some((m) => m.isActive);
    if (!hasActive) continue;
    const losers = members.filter((m) => !m.isActive);
    for (const loser of losers) {
      try {
        await prisma.taxRules.delete({ where: { id: loser.id } });
        deletedIds.push(loser.id);
        deletedCount += 1;
        console.log(
          `  deleted dup TaxRule ${loser.id} (${loser.type} ${loser.name})`
        );
      } catch (e) {
        console.warn(
          `  [warn] could not delete TaxRule ${loser.id}:`,
          (e as Error).message
        );
      }
    }
  }

  return { deletedCount, deletedIds };
}

async function restampFuturePayrollAccrualJes() {
  const now = new Date();
  const candidates = await prisma.journalEntry.findMany({
    where: {
      AND: [
        {
          OR: [
            { referenceNumber: { startsWith: "PAYROLL-" } },
            { description: { startsWith: "Payroll Journal - Gross Pay:" } },
          ],
        },
        { transactionDate: { gt: now } },
      ],
    },
    select: { id: true, referenceNumber: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });

  let updated = 0;
  for (const je of candidates) {
    await prisma.journalEntry.update({
      where: { id: je.id },
      data: { transactionDate: now },
    });
    console.log(
      `  restamped ${je.referenceNumber}: ${je.transactionDate.toISOString()} -> ${now.toISOString()}`
    );
    updated += 1;
  }
  return { updated, candidates: candidates.length };
}

async function main() {
  console.log("== Hard-delete duplicate inactive TaxRules ==");
  const ruleStats = await deleteDuplicateInactiveTaxRules();
  console.log(`  deletedCount=${ruleStats.deletedCount}`);

  console.log("\n== Re-stamp future-dated payroll accrual JournalEntries ==");
  const jeStats = await restampFuturePayrollAccrualJes();
  console.log(`  updated=${jeStats.updated} (candidates=${jeStats.candidates})`);

  // Final visibility check: any active rules left with bracket-key duplicates?
  const remainingActive = await prisma.taxRules.findMany({
    where: { isActive: true },
    select: {
      id: true,
      type: true,
      name: true,
      rate: true,
      threshold: true,
      ceiling: true,
      currencyId: true,
    },
  });
  const sigCount: Record<string, number> = {};
  for (const r of remainingActive) {
    const k = [
      r.currencyId || "",
      String(r.type).toUpperCase(),
      r.rate?.toString(),
      r.threshold?.toString() ?? "",
      r.ceiling?.toString() ?? "",
    ].join("|");
    sigCount[k] = (sigCount[k] || 0) + 1;
  }
  const stillDup = Object.entries(sigCount).filter(([, n]) => n > 1);
  console.log(
    `\nRemaining active TaxRules: ${remainingActive.length}; still-duplicated bracket signatures: ${stillDup.length}`
  );
  if (stillDup.length) {
    for (const [k, n] of stillDup) console.log(`  signature=${k} count=${n}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
