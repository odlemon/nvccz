import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sinceMinutes = Number(process.argv[2] || 240); // default: last 4 hours
  const needle = String(process.argv[3] || "").trim(); // optional search in description
  const since = new Date(Date.now() - sinceMinutes * 60_000);

  console.log(`Looking back ${sinceMinutes} minutes since ${since.toISOString()}`);
  if (needle) console.log(`Filter description contains: "${needle}"`);

  const whereNeedle = needle ? "AND je.description LIKE ?" : "";
  const params: any[] = [since];
  if (needle) params.push(`%${needle}%`);

  const journalEntries: any[] = await prisma.$queryRawUnsafe(
    `
    SELECT
      je.id,
      je.transactionDate,
      je.referenceNumber,
      je.description,
      je.totalAmount,
      je.status,
      je.createdById,
      je.createdAt,
      je.updatedAt
    FROM journal_entries je
    WHERE je.createdAt >= ?
      ${whereNeedle}
    ORDER BY je.createdAt DESC
    LIMIT 25
  `,
    ...params
  );

  console.log(`\nRecent journal entries: ${journalEntries.length}`);
  for (const je of journalEntries) {
    console.log(
      `- ${je.id} | ${new Date(je.createdAt).toISOString()} | ${je.status} | ${je.referenceNumber} | ${je.description}`
    );
  }

  if (journalEntries.length > 0) {
    const ids = journalEntries.map((x) => x.id);
    const placeholders = ids.map(() => "?").join(",");
    const lines: any[] = await prisma.$queryRawUnsafe(
      `
      SELECT
        jel.journalEntryId,
        coa.accountNo,
        coa.accountName,
        jel.debitAmount,
        jel.creditAmount,
        jel.description
      FROM journal_entry_lines jel
      JOIN chart_of_accounts coa ON coa.id = jel.chartOfAccountId
      WHERE jel.journalEntryId IN (${placeholders})
      ORDER BY jel.createdAt DESC
      LIMIT 200
    `,
      ...ids
    );

    console.log(`\nLines (most recent first, up to 200): ${lines.length}`);
    for (const l of lines) {
      console.log(
        `  ${l.journalEntryId} | ${l.accountNo} ${l.accountName} | DR ${l.debitAmount} CR ${l.creditAmount} | ${l.description || ""}`
      );
    }
  }

  // Also check if any valuation/dividend records were created recently
  const valuations: any[] = await prisma.$queryRawUnsafe(
    `
    SELECT id, portfolioCompanyId, previousAmount, newAmount, difference, valuationDate, approvedById, journalEntryId, createdAt
    FROM portfolio_company_valuations
    WHERE createdAt >= ?
    ORDER BY createdAt DESC
    LIMIT 25
  `,
    since
  );
  console.log(`\nRecent valuation adjustments: ${valuations.length}`);
  for (const v of valuations) {
    console.log(
      `- ${v.id} | ${new Date(v.createdAt).toISOString()} | pc=${v.portfolioCompanyId} | diff=${v.difference} | je=${v.journalEntryId || "null"}`
    );
  }

  const dividends: any[] = await prisma.$queryRawUnsafe(
    `
    SELECT id, portfolioCompanyId, amount, dividendDate, approvedById, journalEntryId, createdAt
    FROM portfolio_company_dividends
    WHERE createdAt >= ?
    ORDER BY createdAt DESC
    LIMIT 25
  `,
    since
  );
  console.log(`\nRecent dividends: ${dividends.length}`);
  for (const d of dividends) {
    console.log(
      `- ${d.id} | ${new Date(d.createdAt).toISOString()} | pc=${d.portfolioCompanyId} | amount=${d.amount} | je=${d.journalEntryId || "null"}`
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ Script failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

