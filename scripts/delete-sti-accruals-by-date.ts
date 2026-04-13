/**
 * Deletes all short_term_investment_accruals for a calendar date and removes their linked
 * journal_entries (accrual + reversal JEs when present). Lines cascade from journal delete.
 *
 * Usage: npx ts-node --transpile-only scripts/delete-sti-accruals-by-date.ts [YYYY-MM-DD]
 * Default: 2026-04-13
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const iso = (process.argv[2] || "2026-04-13").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    console.error("Usage: npx ts-node scripts/delete-sti-accruals-by-date.ts [YYYY-MM-DD]");
    process.exit(1);
  }

  const day = new Date(`${iso}T00:00:00.000Z`);

  const rows = await prisma.shortTermInvestmentAccrual.findMany({
    where: { accrualDate: day },
    select: { id: true, instrumentId: true, journalEntryId: true, reversalJournalEntryId: true },
  });

  const jeIds = new Set<string>();
  for (const r of rows) {
    if (r.journalEntryId) jeIds.add(r.journalEntryId);
    if (r.reversalJournalEntryId) jeIds.add(r.reversalJournalEntryId);
  }

  const delAcc = await prisma.shortTermInvestmentAccrual.deleteMany({
    where: { accrualDate: day },
  });

  let delJe = 0;
  if (jeIds.size > 0) {
    const res = await prisma.journalEntry.deleteMany({
      where: { id: { in: [...jeIds] } },
    });
    delJe = res.count;
  }

  console.log(
    JSON.stringify(
      {
        accrualDate: iso,
        accrualRowsFound: rows.length,
        journalEntryIdsCollected: jeIds.size,
        deletedAccrualRows: delAcc.count,
        deletedJournalEntries: delJe,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
