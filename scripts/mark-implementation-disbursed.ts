import { prisma } from '../src/utils/database';

async function main() {
  const implementations = await prisma.investmentImplementation.findMany({
    select: {
      id: true,
      applicationId: true,
      portfolioCompanyId: true,
      status: true,
      fundsDisbursed: true,
      fundDisbursements: {
        select: { status: true }
      }
    }
  });

  for (const implementation of implementations) {
    const allDisbursed = implementation.fundDisbursements.length > 0 && implementation.fundDisbursements.every(d => d.status === 'DISBURSED');
    if (allDisbursed && (implementation.status !== 'COMPLETED' || !implementation.fundsDisbursed)) {
      console.log(`Updating implementation ${implementation.id} to COMPLETED/DISBURSED`);
      await prisma.investmentImplementation.update({
        where: { id: implementation.id },
        data: {
          status: 'COMPLETED',
          fundsDisbursed: true,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });
      if (implementation.applicationId) {
        await prisma.application.update({
          where: { id: implementation.applicationId },
          data: {
            currentStage: 'DISBURSED',
            updatedAt: new Date()
          }
        });
      }
    }
  }

  console.log('✅ Sync complete');
}

main()
  .catch(error => {
    console.error('❌ Failed to mark implementations as disbursed', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
