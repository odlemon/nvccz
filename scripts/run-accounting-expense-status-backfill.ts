/**
 * Accounting sweep A6 (data): an expense's status follows its journal. Expenses were marked POSTED the moment they were
 * saved while their journal was still a draft awaiting approval; new ones are SUBMITTED and become APPROVED when the
 * journal is posted, REJECTED if it is voided before that, VOIDED if after. This sets existing ones from their journal.
 * Idempotent; `--check` lists without writing.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/run-accounting-expense-status-backfill.ts [--check]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK = process.argv.includes("--check");

async function main() {
  const rows = await prisma.expense.findMany({ where: { journalEntryId: { not: null } }, select: { id: true, status: true, description: true, journalEntry: { select: { status: true } } } });
  let changed = 0;
  for (const e of rows) {
    const je = e.journalEntry?.status;
    const want = je === "POSTED" ? "APPROVED" : je === "PENDING" ? "SUBMITTED" : je === "VOID" ? (e.status === "APPROVED" ? "VOIDED" : "REJECTED") : e.status;
    if (want === e.status) continue;
    console.log(`${CHECK ? "[would set]" : "[set]"} ${e.id} ${e.status} → ${want} (journal ${je}) ${e.description.slice(0, 60)}`);
    if (!CHECK) await prisma.expense.update({ where: { id: e.id }, data: { status: want } });
    changed++;
  }
  console.log(`${CHECK ? "would change" : "changed"} ${changed} of ${rows.length}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
