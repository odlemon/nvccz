import { prisma } from '../src/utils/database';
import { PortfolioCompanyAccountingService } from '../src/services/PortfolioCompanyAccountingService';

async function main() {
  const portfolioCompanyId = process.argv[2];
  const previousAmount = Number(process.argv[3]);
  const newAmount = Number(process.argv[4]);
  const approvedById = process.argv[5];

  if (!portfolioCompanyId || isNaN(previousAmount) || isNaN(newAmount) || !approvedById) {
    console.error('Usage: npx ts-node scripts/test-record-valuation.ts <companyId> <previousAmount> <newAmount> <approvedById>');
    process.exit(1);
  }

  const result = await PortfolioCompanyAccountingService.recordValuationAdjustment({
    portfolioCompanyId,
    previousAmount,
    newAmount,
    valuationDate: new Date(),
    approvedById,
    notes: 'Test valuation entry'
  });

  console.log('Result', result);
}

main()
  .catch(error => {
    console.error('❌', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
