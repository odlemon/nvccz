/**
 * Voids erroneous KPI Achievement journals (legacy ref KPI-{goalId}-{timestamp})
 * that inflated expense accounts (e.g. 5030 Salaries). Payroll KPI duplicates are safe to void;
 * real payroll remains on PAYROLL-* journal entries.
 *
 * Dry run (default): npx ts-node scripts/void-duplicate-kpi-achievement-journals.ts
 * Execute:        npx ts-node scripts/void-duplicate-kpi-achievement-journals.ts --execute
 * Period filter:  ... --period=2026-05  (YYYY-MM, optional)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { JournalEntryService } from "../src/services/JournalEntryService";

const prisma = new PrismaClient();

function parseArgs() {
  const execute = process.argv.includes("--execute");
  const periodArg = process.argv.find((a) => a.startsWith("--period="));
  const period = periodArg ? periodArg.split("=")[1] : null;
  return { execute, period };
}

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

async function main() {
  const { execute, period } = parseArgs();
  const dateFilter = period ? periodBounds(period) : null;

  const where: Record<string, unknown> = {
    status: "POSTED",
    referenceNumber: { startsWith: "KPI-" },
    NOT: { referenceNumber: { startsWith: "KPI-GOAL-" } },
    description: { contains: "KPI Achievement" },
  };

  if (dateFilter) {
    where.transactionDate = { gte: dateFilter.start, lte: dateFilter.end };
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    select: {
      id: true,
      referenceNumber: true,
      description: true,
      totalAmount: true,
      transactionDate: true,
    },
    orderBy: { transactionDate: "asc" },
  });

  console.log(
    `Found ${entries.length} legacy KPI Achievement journal(s) to void${period ? ` in ${period}` : ""}.`
  );
  if (entries.length === 0) {
    return;
  }

  for (const e of entries) {
    console.log(
      `  ${execute ? "[void]" : "[dry]"} ${e.referenceNumber} | ${e.transactionDate.toISOString().slice(0, 10)} | ${e.totalAmount} | ${e.description?.slice(0, 80)}`
    );
  }

  if (!execute) {
    console.log("\nRe-run with --execute to void these entries (creates VR-* reversals).");
    return;
  }

  const admin = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) {
    throw new Error("No active user found to attribute void actions.");
  }

  let voided = 0;
  for (const e of entries) {
    try {
      await JournalEntryService.voidJournalEntry(e.id, admin.id);
      voided++;
    } catch (err) {
      console.error(`Failed to void ${e.referenceNumber}:`, err);
    }
  }
  console.log(`\nVoided ${voided}/${entries.length} journal entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
