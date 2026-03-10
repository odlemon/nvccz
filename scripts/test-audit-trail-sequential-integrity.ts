// @ts-nocheck
/**
 * Sequential Integrity – Audit Trail IDs
 *
 * Requirement: Verify the Audit Trail IDs of the last 10 entries.
 * Expected: Numbers are strictly sequential (e.g. 1001, 1002, 1003) with no gaps found.
 *
 * Run: npx ts-node scripts/test-audit-trail-sequential-integrity.ts
 * (Test data is left in place; no cleanup.)
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import JournalEntryService from "../src/services/JournalEntryService";
import {
  getLastAuditTrailEntries,
  verifySequentialIntegrity,
  ensureAuditTrailSequenceExists,
} from "../src/services/AuditTrailSequenceService";

const LIMIT = 10;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function ensureTenEntriesWithAuditIds(adminId: string, currencyId: string) {
  await ensureAuditTrailSequenceExists();
  const existing = await prisma.journalEntry.count({
    where: { auditTrailSequenceNumber: { not: null } },
  });
  if (existing >= LIMIT) return;

  const bankGl = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "1100", isActive: true },
  });
  const incomeGl = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "4000", isActive: true },
  });
  if (!bankGl || !incomeGl) {
    throw new Error("Required GL accounts 1100 and 4000 not found. Run chart of accounts seed.");
  }

  const toCreate = LIMIT - existing;
  const baseRef = `SEQ-TEST-${Date.now()}-`;
  for (let i = 0; i < toCreate; i++) {
    await JournalEntryService.createManualJournalEntry({
      transactionDate: new Date(),
      referenceNumber: `${baseRef}${i}`,
      description: `Sequential integrity test entry ${i + 1}`,
      currencyId,
      journalEntryLines: [
        {
          chartOfAccountId: bankGl.id,
          debitAmount: 100,
          creditAmount: 0,
          description: "Dr Bank",
        },
        {
          chartOfAccountId: incomeGl.id,
          debitAmount: 0,
          creditAmount: 100,
          description: "Cr Income",
        },
      ],
      createdById: adminId,
    });
  }
}

async function run() {
  console.log("Sequential Integrity – Audit Trail IDs\n");

  const currency = await prisma.currency.findFirst({ where: { code: "ZIG" } });
  const zigId = currency?.id ?? (await prisma.currency.findFirst())?.id;
  if (!zigId) {
    console.error("No currency found.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst();
  const adminId = user?.id;
  if (!adminId) {
    console.error("No user found.");
    process.exit(1);
  }

  await ensureTenEntriesWithAuditIds(adminId, zigId);

  const entries = await getLastAuditTrailEntries(LIMIT);
  assert(entries.length >= LIMIT, `Expected at least ${LIMIT} entries with audit trail IDs, got ${entries.length}`);

  const result = await verifySequentialIntegrity(LIMIT);
  console.log("Last", result.entries.length, "audit trail IDs:", result.entries.map((e) => e.auditTrailSequenceNumber).join(", "));

  assert(result.isSequential, `Expected strictly sequential IDs; ${result.gaps.length} gap(s): ${JSON.stringify(result.gaps)}`);
  assert(result.gaps.length === 0, `No gaps expected; found: ${JSON.stringify(result.gaps)}`);

  for (let i = 0; i < result.entries.length - 1; i++) {
    const curr = result.entries[i].auditTrailSequenceNumber;
    const next = result.entries[i + 1].auditTrailSequenceNumber;
    assert(next === curr - 1, `Gap: expected ${curr - 1} after ${curr}, got ${next}`);
  }

  if (failures.length > 0) {
    console.error("\nFailures:");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }

  console.log("\n" + result.message);
  console.log("Sequential integrity test passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
