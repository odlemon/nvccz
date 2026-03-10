// @ts-nocheck
/**
 * Data Scalability – Trial Balance spanning 12 months with 10,000 entries
 *
 * Requirement: Run a Trial Balance spanning 12 months with 10,000 entries.
 * Expected: Report generates in under 5 seconds without timing out.
 *
 * Run: npx ts-node scripts/test-trial-balance-scalability.ts
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { TrialBalanceService } from "../src/services/TrialBalanceService";

const TARGET_ENTRIES = 10000;
const MAX_GENERATION_MS = 5000;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function ensure10kEntriesOver12Months() {
  const end = new Date();
  const start = new Date(end.getFullYear() - 1, end.getMonth(), 1, 0, 0, 0, 0);

  const existing = await prisma.journalEntryLine.count({
    where: {
      journalEntry: {
        transactionDate: { gte: start, lte: end },
        status: "POSTED",
        AND: [
          { referenceNumber: { not: { startsWith: "VR-" } } },
          { referenceNumber: { not: { startsWith: "REV-" } } }
        ]
      }
    }
  });

  if (existing >= TARGET_ENTRIES) {
    console.log(`  Found ${existing} journal entry lines in 12-month window; no seed needed.`);
    return { start, end };
  }

  const user = await prisma.user.findFirst({ select: { id: true } });
  const currency = await prisma.currency.findFirst({ where: { isActive: true }, select: { id: true } });
  const accounts = await prisma.chartOfAccounts.findMany({
    where: { isActive: true },
    take: 2,
    orderBy: { accountNo: "asc" },
    select: { id: true }
  });
  if (!user || !currency || accounts.length < 2) {
    throw new Error("Need user, currency, and at least 2 COA accounts for seed.");
  }

  const toCreate = TARGET_ENTRIES - existing;
  const linesPerJe = 2;
  const jeCount = Math.ceil(toCreate / linesPerJe);
  const BATCH = 100;
  console.log(`  Seeding ${jeCount} journal entries (${jeCount * linesPerJe} lines) to reach ~10k entries...`);

  for (let b = 0; b < jeCount; b += BATCH) {
    const batchSize = Math.min(BATCH, jeCount - b);
    const refBase = `TB-SCALE-${Date.now()}-${b}-`;
    for (let i = 0; i < batchSize; i++) {
      const idx = b + i;
      const monthOffset = idx % 12;
      const txDate = new Date(end.getFullYear() - 1, end.getMonth() + monthOffset, 1 + (idx % 28), 12, 0, 0, 0);
      const je = await prisma.journalEntry.create({
        data: {
          transactionDate: txDate,
          referenceNumber: `${refBase}${i}`,
          description: `Scalability test entry ${idx}`,
          totalAmount: new Decimal(100),
          currencyId: currency.id,
          status: "POSTED",
          createdById: user.id
        }
      });
      await prisma.journalEntryLine.createMany({
        data: [
          {
            journalEntryId: je.id,
            chartOfAccountId: accounts[0].id,
            debitAmount: new Decimal(100),
            creditAmount: new Decimal(0),
            description: "Dr"
          },
          {
            journalEntryId: je.id,
            chartOfAccountId: accounts[1].id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(100),
            description: "Cr"
          }
        ]
      });
    }
    if ((b + batchSize) % 500 === 0 || b + batchSize >= jeCount) {
      console.log(`    Created ${Math.min(b + batchSize, jeCount)} / ${jeCount} JEs`);
    }
  }

  return { start, end };
}

async function main() {
  console.log("=== Trial Balance scalability (12 months, 10k entries, < 5s) ===\n");

  const { start, end } = await ensure10kEntriesOver12Months();
  const rangeEnd = new Date(end);
  rangeEnd.setHours(23, 59, 59, 999);

  const t0 = Date.now();
  const result = await TrialBalanceService.generateTrialBalance(
    rangeEnd,
    start,
    rangeEnd,
    false,
    false // includeTransactionDetails = false for scale
  );
  const elapsed = Date.now() - t0;

  assert(result != null && Array.isArray(result.accounts), "Trial balance must return accounts");
  assert(result.totals != null, "Trial balance must return totals");
  assert(elapsed < MAX_GENERATION_MS, `Report must generate in under 5 seconds; got ${elapsed} ms`);
  assert(!failures.some((f) => f.includes("timeout")), "Report must not time out");

  console.log("  Trial balance date range: 12 months");
  console.log("  Accounts returned:", result.accounts.length);
  console.log("  Totals - Debits:", result.totals.totalDebits, "Credits:", result.totals.totalCredits, "Balanced:", result.totals.isBalanced);
  console.log("  Generation time:", elapsed, "ms (limit", MAX_GENERATION_MS, "ms)");

  if (failures.length > 0) {
    console.error("\n❌ FAILED:");
    failures.forEach((f) => console.error("  -", f));
    process.exit(1);
  }

  console.log("\n✅ PASSED: Trial Balance spanning 12 months with 10k+ entries generated in under 5 seconds.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
