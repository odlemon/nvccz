import { prisma } from '../src/utils/database';

async function main() {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, portfolioCompanyId, previousAmount, newAmount, difference, valuationDate, notes, createdAt
       FROM portfolio_company_valuations
      ORDER BY createdAt DESC`
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
