import { prisma } from '../src/utils/database';

async function main() {
  const implementations = await prisma.investmentImplementation.findMany({
    where: { status: 'COMPLETED' },
    select: {
      id: true,
      fundsDisbursed: true,
      completedAt: true,
      application: {
        select: {
          id: true,
          businessName: true,
          currentStage: true
        }
      },
      portfolioCompany: {
        select: {
          id: true,
          name: true,
          user: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

  console.log(JSON.stringify(implementations, null, 2));
}

main()
  .catch(error => {
    console.error('❌ Failed to list completed implementations', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
