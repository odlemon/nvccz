import { prisma } from '../src/utils/database';

async function main() {
  const implementations = await prisma.investmentImplementation.findMany({
    select: {
      id: true,
      status: true,
      fundsDisbursed: true,
      applicationId: true,
      application: {
        select: {
          id: true,
          businessName: true,
          applicantEmail: true,
          currentStage: true
        }
      },
      portfolioCompany: {
        select: {
          id: true,
          name: true
        }
      },
      fundDisbursements: {
        select: {
          id: true,
          status: true,
          amount: true
        }
      }
    }
  });

  console.log(JSON.stringify(implementations, null, 2));
}

main()
  .catch(error => {
    console.error('❌ Failed to list implementations', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
