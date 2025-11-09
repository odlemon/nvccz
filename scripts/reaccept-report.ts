import { prisma } from '../src/utils/database';
import { FinancialReportService } from '../src/services/FinancialReportService';

async function main() {
  const reportId = process.argv[2];
  const reviewerId = process.argv[3];
  if (!reportId || !reviewerId) {
    console.error('Usage: npx ts-node scripts/reaccept-report.ts <reportId> <reviewerId>');
    process.exit(1);
  }

  const report = await FinancialReportService.getReportById(reportId);
  if (!report) {
    throw new Error('Report not found');
  }

  await FinancialReportService.reviewReport({
    reportId,
    reviewerId,
    action: 'ACCEPT',
    comment: 'Re-accepted for automation test'
  });

  console.log('Report reprocessed');
}

main()
  .catch(error => {
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
