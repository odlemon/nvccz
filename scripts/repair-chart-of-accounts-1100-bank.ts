// @ts-nocheck
/**
 * Repairs common CoA drift where accountNo 1100 was mistakenly used for Office Equipment.
 *
 * This script is SAFE and IDEMPOTENT:
 * - It never changes accountNo or any linked transactions.
 * - It only updates the *labels* on the existing chart_of_accounts row for accountNo = 1100
 *   when it detects "office equipment / furniture" content.
 *
 * Run:
 *   npx ts-node scripts/repair-chart-of-accounts-1100-bank.ts
 *   npm run db:repair:coa-1100-bank
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function looksLikeOfficeEquipment(row: { accountName?: string | null; notes?: string | null }): boolean {
  const name = (row.accountName ?? "").toLowerCase();
  const notes = (row.notes ?? "").toLowerCase();
  return (
    name.includes("office equipment") ||
    name.includes("equipment") ||
    name.includes("furniture") ||
    notes.includes("furniture") ||
    notes.includes("computers") ||
    notes.includes("equipment")
  );
}

async function main() {
  console.log("Repairing chart_of_accounts 1100 (Bank label) if needed...\n");

  const row = await prisma.chartOfAccounts.findUnique({
    where: { accountNo: "1100" },
    select: { id: true, accountNo: true, accountName: true, accountType: true, financialStatement: true, naturalBalance: true, isActive: true, notes: true },
  });

  if (!row) {
    console.log("No chart_of_accounts row found for accountNo 1100. Nothing to repair.\n");
    return;
  }

  const shouldRepair =
    looksLikeOfficeEquipment(row) ||
    row.accountType === "Fixed Asset" ||
    row.financialStatement === "Income Statement";

  if (!shouldRepair) {
    console.log(`OK: 1100 already looks like a bank account (${row.accountName}). No changes.\n`);
    return;
  }

  const nextName = "Bank - Operating Account";
  const nextNotes = "Main bank account for receipts and payments";

  await prisma.chartOfAccounts.update({
    where: { accountNo: "1100" },
    data: {
      accountName: nextName,
      accountType: "Current Asset",
      financialStatement: "Balance Sheet",
      naturalBalance: "DEBIT",
      isActive: true,
      notes: nextNotes,
    },
  });

  console.log("Updated 1100 to bank labels:");
  console.log(`  accountName: ${row.accountName}  ->  ${nextName}`);
  console.log(`  accountType: ${row.accountType}  ->  Current Asset`);
  console.log(`  statement : ${row.financialStatement}  ->  Balance Sheet`);
  console.log(`  notes     : ${(row.notes ?? "").slice(0, 60)}  ->  ${nextNotes}\n`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

