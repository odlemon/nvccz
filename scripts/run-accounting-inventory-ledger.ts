/**
 * Accounting sweep A8 (data): brings the stock sub-ledger and the ledger together after InventoryLedgerService.
 *  1. The accounts stock postings need, where missing: 5005 Cost of Sales, 5095 Inventory Count Variance,
 *     3900 Opening Balance Equity.
 *  2. Each item's quantity on hand set to what its movements add up to (creating an item with an opening quantity
 *     used to count it twice).
 *  3. For each inventory account whose ledger balance differs from the value of its stock (movements were never posted),
 *     one posted journal for the difference against 3900 Opening Balance Equity, reference INV-OPEN-<account>-<day>.
 * Idempotent: a second run finds nothing to do. --check reports without changing anything.
 *
 *   npx ts-node scripts/run-accounting-inventory-ledger.ts --by=<email of the user the journal is recorded by> [--check]
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { assignNextAuditIdAndCreateJournal } from "../src/services/AuditTrailSequenceService";
import InventoryLedgerService from "../src/services/InventoryLedgerService";
import AuditService from "../src/services/AuditService";

const CHECK = process.argv.includes("--check");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const r2 = (x: number) => Math.round(x * 100) / 100;
const ACCOUNTS = [
  { accountNo: "5005", accountName: "Cost of Sales", accountType: "Expense", financialStatement: "Income Statement", notes: "Cost of stock sold (perpetual inventory)" },
  { accountNo: "5095", accountName: "Inventory Count Variance", accountType: "Expense", financialStatement: "Income Statement", notes: "Stock found or missing on a count" },
  { accountNo: "3900", accountName: "Opening Balance Equity", accountType: "Equity", financialStatement: "Balance Sheet", notes: "Opening balances brought onto the ledger" },
];

async function main() {
  const by = arg("by");
  const user = by ? await prisma.user.findUnique({ where: { email: by }, select: { id: true } }) : null;
  if (!CHECK && !user) throw new Error("--by=<email> of an existing user is required (the journal is recorded by them)");

  for (const a of ACCOUNTS) {
    const has = await prisma.chartOfAccounts.findUnique({ where: { accountNo: a.accountNo } });
    if (has) { console.log(`account ${a.accountNo} exists (${has.accountName})`); continue; }
    console.log(`account ${a.accountNo} ${a.accountName}: ${CHECK ? "missing" : "added"}`);
    if (!CHECK) {
      const c = await prisma.chartOfAccounts.create({ data: { ...a, isActive: true } });
      await AuditService.log({ userId: user!.id, action: "CREATE", entityType: "ChartOfAccounts", entityId: c.id, newValues: { ...a, reason: "Accounts stock postings need (A8)" } }).catch(() => null);
    }
  }

  const items = await prisma.inventoryItem.findMany({ include: { stockMovements: true } });
  for (const i of items) {
    const moved = r2(i.stockMovements.reduce((s, m) => s + (m.movementType === "OUT" ? -Math.abs(Number(m.quantity)) : m.movementType === "IN" ? Math.abs(Number(m.quantity)) : Number(m.quantity)), 0));
    if (moved === Number(i.quantityOnHand)) continue;
    console.log(`${i.skuNumber}: on hand ${Number(i.quantityOnHand)}, movements add up to ${moved}${CHECK ? "" : " — corrected"}`);
    if (!CHECK) {
      await prisma.inventoryItem.update({ where: { id: i.id }, data: { quantityOnHand: new Decimal(moved) } });
      await AuditService.log({ userId: user!.id, action: "UPDATE", entityType: "InventoryItem", entityId: i.id, oldValues: { quantityOnHand: Number(i.quantityOnHand) }, newValues: { quantityOnHand: moved, reason: "Quantity set to what its movements add up to (an opening quantity had been counted twice) (A8)" } }).catch(() => null);
    }
  }

  const rows = await InventoryLedgerService.tieOut();
  const obe = await prisma.chartOfAccounts.findUnique({ where: { accountNo: "3900" } });
  for (const r of rows) {
    if (Math.abs(r.difference) < 0.005) { console.log(`${r.account}: ledger ${r.ledgerBalance} = stock ${r.stockValue}`); continue; }
    const need = r2(r.stockValue - r.ledgerBalance);
    console.log(`${r.account}: ledger ${r.ledgerBalance}, stock ${r.stockValue} — ${CHECK ? "would post" : "posting"} ${need} against 3900`);
    if (CHECK) continue;
    if (!obe) throw new Error("3900 Opening Balance Equity is missing");
    const date = await InventoryLedgerService.tenantToday();
    const currencyId = await InventoryLedgerService.baseCurrencyId();
    const acc = await prisma.chartOfAccounts.findUnique({ where: { id: r.accountId }, select: { accountNo: true } });
    const ref = `INV-OPEN-${acc?.accountNo}-${date.toISOString().slice(0, 10)}`;
    await prisma.$transaction(async (tx) => {
      const je = await assignNextAuditIdAndCreateJournal(tx, { transactionDate: date, referenceNumber: ref, currencyId, status: "POSTED", createdById: user!.id, totalAmount: new Decimal(Math.abs(need)), description: "Stock brought onto the ledger: movements recorded before stock posted to the ledger" }, { source: "SYSTEM" });
      const into = need > 0;
      await tx.journalEntryLine.createMany({ data: [
        { journalEntryId: je.id, chartOfAccountId: into ? r.accountId : obe.id, debitAmount: new Decimal(Math.abs(need)), creditAmount: new Decimal(0), description: "Stock brought onto the ledger" },
        { journalEntryId: je.id, chartOfAccountId: into ? obe.id : r.accountId, debitAmount: new Decimal(0), creditAmount: new Decimal(Math.abs(need)), description: "Stock brought onto the ledger" },
      ] });
      console.log(`  posted ${ref}`);
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
