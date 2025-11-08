import { prisma } from '../src/utils/database';

async function main() {
  const portfolioCompanyId = process.argv[2];
  if (!portfolioCompanyId) {
    console.error('Usage: npx ts-node scripts/get-financial-reports.ts <portfolioCompanyId>');
    process.exit(1);
  }

  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, reportType, status, periodStart, periodEnd, title, createdAt
       FROM financial_reports
      WHERE portfolioCompanyId = ?
      ORDER BY createdAt DESC`,
    portfolioCompanyId
  );

  console.table(rows);
}

main()
  .catch(error => {
    console.error('❌ Failed to list financial reports', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
