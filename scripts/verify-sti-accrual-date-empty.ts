/**
 * Verifies no short_term_investment_accruals exist for a calendar date.
 * Usage: npx ts-node --transpile-only scripts/verify-sti-accrual-date-empty.ts [YYYY-MM-DD]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const iso = (process.argv[2] || "2026-04-13").trim().slice(0, 10);
  const day = new Date(`${iso}T00:00:00.000Z`);
  const dayEnd = new Date(`${iso}T23:59:59.999Z`);

  const accrualCount = await prisma.shortTermInvestmentAccrual.count({
    where: { accrualDate: day },
  });

  const stiJeCount = await prisma.journalEntry.count({
    where: {
      referenceNumber: { startsWith: "STI-" },
      transactionDate: { gte: day, lte: dayEnd },
    },
  });

  const stiJes =
    stiJeCount > 0
      ? await prisma.journalEntry.findMany({
          where: {
            referenceNumber: { startsWith: "STI-" },
            transactionDate: { gte: day, lte: dayEnd },
          },
          select: { id: true, referenceNumber: true, description: true, status: true },
        })
      : [];

  console.log(
    JSON.stringify(
      {
        date: iso,
        shortTermInvestmentAccrualCount: accrualCount,
        journalEntriesStiPrefixSameDay: stiJeCount,
        stiJournalEntriesDetail: stiJes,
        okForRetest: accrualCount === 0,
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
