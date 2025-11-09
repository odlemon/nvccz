import { prisma } from '../src/utils/database';

async function main() {
  const reportId = process.argv[2];
  if (!reportId) {
    console.error('Usage: npx ts-node scripts/get-report-details.ts <reportId>');
    process.exit(1);
  }

  const [report]: any[] = await prisma.$queryRawUnsafe(
    `SELECT fr.*, pc.name AS companyName, pc.financialKpis
       FROM financial_reports fr
       LEFT JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
      WHERE fr.id = ?
      LIMIT 1`,
    reportId
  );

  if (!report) {
    console.log('Report not found');
    return;
  }

  console.log('Report Summary');
  console.log({
    id: report.id,
    status: report.status,
    reportType: report.reportType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    portfolioCompanyId: report.portfolioCompanyId,
    companyName: report.companyName
  });

  const journalEntries: any[] = await prisma.$queryRawUnsafe(
    `SELECT je.id, je.description, je.transactionDate, je.status, je.createdAt,
            jel.chartOfAccountId, jel.debitAmount, jel.creditAmount
       FROM journal_entries je
       LEFT JOIN journal_entry_lines jel ON jel.journalEntryId = je.id
      WHERE je.description LIKE ?
      ORDER BY je.createdAt DESC`,
    `%${reportId}%`
  );

  console.log('\nRelated Journal Entries');
  console.table(journalEntries);

  console.log('\nPortfolio Company KPI Snapshot');
  console.dir(report.financialKpis, { depth: null });
}

main()
  .catch(error => {
    console.error('❌ Failed to inspect report', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
