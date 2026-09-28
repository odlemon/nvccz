/**
 * Accounting sweep A5 (data): the bank lines missing from the cashbook. Journals raised by fixed assets (ASSET-,
 * DISPOSAL-) and short-term investments (STI-PLC-, STI-SET-) debited or credited a bank's ledger account without a
 * cashbook line, so the cashbook and the ledger disagreed and those movements could not be reconciled. New ones get their
 * line from CashbookJournalLinkService; this adds the line for each existing one (posted or draft, not void), linked to
 * its journal. Idempotent (a journal that already has a line is skipped). `--check` lists without writing.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/run-accounting-bank-lines-backfill.ts [--check]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK = process.argv.includes("--check");
const PREFIXES = ["ASSET-", "DISPOSAL-", "STI-PLC-", "STI-SET-"];

async function main() {
  const banks = await prisma.bank.findMany({ where: { glAccountId: { not: null } }, select: { id: true, name: true, glAccountId: true } });
  const bankByGl = new Map(banks.map((b) => [b.glAccountId as string, b]));
  const journals = await prisma.journalEntry.findMany({
    where: { status: { in: ["POSTED", "PENDING"] }, OR: PREFIXES.map((p) => ({ referenceNumber: { startsWith: p } })), cashbookEntries: { none: {} } },
    select: { id: true, referenceNumber: true, description: true, transactionDate: true, status: true, createdById: true, journalEntryLines: { select: { chartOfAccountId: true, debitAmount: true, creditAmount: true } } },
  });
  let added = 0, skipped = 0;
  for (const je of journals) {
    const bankLines = je.journalEntryLines.filter((l) => bankByGl.has(l.chartOfAccountId));
    if (bankLines.length !== 1) { skipped++; continue; } // no bank leg (e.g. a credit to a clearing account), or ambiguous
    const l = bankLines[0];
    const bank = bankByGl.get(l.chartOfAccountId)!;
    const dr = Number(l.debitAmount), cr = Number(l.creditAmount);
    const type = dr > 0 ? "RECEIPT" : "PAYMENT";
    const amount = dr > 0 ? dr : cr;
    const contra = je.journalEntryLines.find((x) => x.chartOfAccountId !== l.chartOfAccountId);
    console.log(`${CHECK ? "[would add]" : "[add]"} ${je.referenceNumber} ${type} ${amount.toFixed(2)} on ${bank.name} (${je.status})`);
    if (CHECK) { added++; continue; }
    await prisma.cashbookEntry.create({
      data: {
        bankId: bank.id, transactionDate: je.transactionDate, type, amount: amount.toFixed(2), reference: je.referenceNumber.slice(0, 50),
        description: je.description.slice(0, 190), status: je.status === "POSTED" ? "POSTED" : "PENDING", counterpartyType: "GL",
        glAccountId: contra ? contra.chartOfAccountId : null, journalEntryId: je.id, createdById: je.createdById,
        ...(je.status === "POSTED" ? { postedAt: new Date(), postedById: je.createdById } : {}),
      },
    });
    added++;
  }
  console.log(`${CHECK ? "would add" : "added"} ${added}; skipped ${skipped} (no single bank leg)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
