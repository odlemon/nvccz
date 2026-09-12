/**
 * Fix Prisma crash: orphan journal_entry_lines.chart_of_account_id references.
 *
 * Some environments have journal_entry_lines rows whose chartOfAccountId points to a missing ChartOfAccounts row.
 * Prisma treats JournalEntryLine.chartOfAccount as required, so any include/select that touches it throws:
 *   "Inconsistent query result: Field chartOfAccount is required to return data, got null instead."
 *
 * This script:
 * - Ensures a Suspense GL account exists (accountNo 9999)
 * - Re-points orphan journal entry lines to that suspense account
 *
 * Safe to re-run.
 *
 * Usage:
 *   npm run db:fix:orphan-journal-lines-to-suspense
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function ensureSuspenseAccount() {
  const existing = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "9999" },
    select: { id: true, accountNo: true, accountName: true },
  });
  if (existing) return existing;

  // Try to infer a reasonable accountType/financialStatement from existing rows.
  // We choose an Expense-type suspense so it doesn't pollute assets/liabilities when used as a fallback.
  const created = await prisma.chartOfAccounts.create({
    data: {
      accountNo: "9999",
      accountName: "Suspense (Orphaned Journal Lines)",
      accountType: "Expense",
      financialStatement: "Income Statement",
      naturalBalance: "DEBIT",
      notes: "Auto-created to repair orphan journal entry lines with missing chart_of_accounts references.",
      isActive: true,
    },
    select: { id: true, accountNo: true, accountName: true },
  });
  return created;
}

async function main() {
  const suspense = await ensureSuspenseAccount();

  const distinctLines = await prisma.journalEntryLine.findMany({
    distinct: ["chartOfAccountId"],
    select: { chartOfAccountId: true },
  });
  const coaIds = new Set(
    (await prisma.chartOfAccounts.findMany({ select: { id: true } })).map((c) => c.id)
  );

  const orphanIds = distinctLines.map((r) => r.chartOfAccountId).filter((id) => !coaIds.has(id));

  if (!orphanIds.length) {
    console.log("fix-orphan-journal-lines-to-suspense: no orphan journal entry lines found.");
    return;
  }

  const res = await prisma.journalEntryLine.updateMany({
    where: { chartOfAccountId: { in: orphanIds } },
    data: { chartOfAccountId: suspense.id },
  });

  console.log("fix-orphan-journal-lines-to-suspense:", {
    suspense,
    distinctOrphanAccountIds: orphanIds.length,
    updatedLines: res.count,
    orphanIdsSample: orphanIds.slice(0, 15),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

