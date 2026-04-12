/**
 * Opens BANK + GL module locks (and legacy period_lockouts / accounting_periods) for a calendar month.
 * Cashbook payments require both modules open for the transaction date.
 *
 * Usage: npx ts-node scripts/unlock-fiscal-month-bank-gl.ts [YYYY-MM]
 * Default period: 2026-04
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const MODULES = ["BANK", "GL"] as const;

async function main() {
  const periodArg = (process.argv[2] || "2026-04").trim();
  const parsed = /^(\d{4})-(\d{2})$/.exec(periodArg);
  if (!parsed) {
    console.error("Usage: npx ts-node scripts/unlock-fiscal-month-bank-gl.ts [YYYY-MM]");
    process.exit(1);
  }
  const year = parseInt(parsed[1], 10);
  const month = parseInt(parsed[2], 10);
  const probe = new Date(Date.UTC(year, month - 1, 15));

  const fp = await prisma.fiscalPeriod.findFirst({
    where: { startDate: { lte: probe }, endDate: { gte: probe } },
    include: { fiscalYear: true },
  });

  if (!fp) {
    console.error(
      `No fiscal_period contains ${periodArg} (probe ${probe.toISOString()}). Check fiscal calendar / fiscal years.`
    );
    process.exit(1);
  }

  console.log(`Fiscal period: ${fp.name} (${fp.id}) — shell was: ${fp.status}`);

  if (fp.status === "LOCKED" || fp.status === "CLOSED") {
    await prisma.fiscalPeriod.update({
      where: { id: fp.id },
      data: { status: "OPEN" },
    });
    console.log("Updated fiscal_periods.status → OPEN");
  }

  for (const mod of MODULES) {
    const row = await prisma.modulePeriodLock.upsert({
      where: {
        moduleCode_fiscalPeriodId: {
          moduleCode: mod,
          fiscalPeriodId: fp.id,
        },
      },
      create: {
        moduleCode: mod,
        fiscalPeriodId: fp.id,
        lockStatus: "OPEN",
        reason: null,
      },
      update: {
        lockStatus: "OPEN",
        reason: "Unlocked via scripts/unlock-fiscal-month-bank-gl.ts",
      },
    });
    console.log(`module_period_locks ${mod} → ${row.lockStatus}`);
  }

  const po = await prisma.periodLockout.updateMany({
    where: { year, month, isLocked: true },
    data: { isLocked: false, lockedAt: null, lockedBy: null },
  });
  console.log(`period_lockouts unlocked rows: ${po.count}`);

  const ap = await prisma.accountingPeriod.updateMany({
    where: { period: periodArg },
    data: { isLocked: false, lockedAt: null, lockedBy: null, reason: null },
  });
  console.log(`accounting_periods unlocked rows: ${ap.count}`);

  try {
    await prisma.companyAccountingPolicy.update({
      where: { id: "default" },
      data: { lockConfigVersion: { increment: 1 } },
    });
    console.log("company_accounting_policies.lockConfigVersion incremented");
  } catch {
    console.log("(skip lockConfigVersion — no default policy row)");
  }

  console.log(`Done. ${periodArg} should allow BANK + GL posting for dates in that fiscal period.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
