import { prisma } from '../src/utils/database';

async function main() {
  const valuationId = process.argv[2];
  if (!valuationId) {
    console.error('Usage: npx ts-node scripts/get-valuation-journal.ts <valuationId>');
    process.exit(1);
  }

  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT je.id, je.description, je.transactionDate, je.status,
            jel.chartOfAccountId, jel.debitAmount, jel.creditAmount
       FROM portfolio_company_valuations pcv
       JOIN journal_entries je ON je.id = pcv.journalEntryId
       JOIN journal_entry_lines jel ON jel.journalEntryId = je.id
      WHERE pcv.id = ?`,
    valuationId
  );

  console.table(rows);
}

main()
  .catch(error => {
    console.error('❌ Failed to fetch valuation journal', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
