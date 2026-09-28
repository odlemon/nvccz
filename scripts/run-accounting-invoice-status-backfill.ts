/**
 * Accounting sweep A9 (data): an invoice whose journal was posted from the journal register (before AQ-02 stopped it)
 * stayed DRAFT while its amount sat in receivables. Such invoices are marked SENT — what posting its journal means —
 * with an audit entry. Idempotent; --check lists without changing anything.
 *
 *   npx ts-node scripts/run-accounting-invoice-status-backfill.ts --by=<email> [--check]
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import AuditService from "../src/services/AuditService";

const CHECK = process.argv.includes("--check");
const by = process.argv.find((a) => a.startsWith("--by="))?.split("=")[1];

async function main() {
  const user = by ? await prisma.user.findUnique({ where: { email: by }, select: { id: true } }) : null;
  if (!CHECK && !user) throw new Error("--by=<email> of an existing user is required");
  const rows = await prisma.invoice.findMany({ where: { status: "DRAFT", journalEntry: { status: "POSTED" } }, select: { id: true, invoiceNumber: true, totalAmount: true, journalEntry: { select: { referenceNumber: true } } } });
  for (const i of rows) {
    console.log(`${i.invoiceNumber} (${Number(i.totalAmount)}): journal ${i.journalEntry?.referenceNumber} posted, invoice DRAFT${CHECK ? "" : " -> SENT"}`);
    if (CHECK) continue;
    await prisma.invoice.update({ where: { id: i.id }, data: { status: "SENT" } });
    await AuditService.log({ userId: user!.id, action: "UPDATE", entityType: "Invoice", entityId: i.id, oldValues: { status: "DRAFT" }, newValues: { status: "SENT", reason: "Its journal had been posted from the register; the invoice follows its ledger (A9)" } }).catch(() => null);
  }
  if (!rows.length) console.log("nothing to do");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
