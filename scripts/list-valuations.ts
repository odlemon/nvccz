import { prisma } from '../src/utils/database';

async function main() {
  const portfolioCompanyId = process.argv[2];
  if (!portfolioCompanyId) {
    console.error('Usage: npx ts-node scripts/list-valuations.ts <portfolioCompanyId>');
    process.exit(1);
  }

  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, previousAmount, newAmount, difference, valuationDate, notes, createdAt
       FROM portfolio_company_valuations
      WHERE portfolioCompanyId = ?
      ORDER BY createdAt DESC`,
    portfolioCompanyId
  );

  console.table(rows);
}

main()
  .catch(error => {
    console.error('❌ Failed to list valuations', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
