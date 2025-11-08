import { prisma } from '../src/utils/database';

async function main() {
  const targetEmail = process.argv[2];
  const targetName = process.argv[3];

  const company = await prisma.portfolioCompany.findFirst({
    where: {
      OR: [
        targetName ? { name: targetName } : undefined,
        targetEmail ? { user: { email: targetEmail } } : undefined
      ].filter(Boolean) as any
    },
    select: {
      id: true,
      name: true,
      status: true,
      fundingStage: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      investmentImplementation: {
        select: {
          id: true,
          status: true,
          fundsDisbursed: true,
          fundDisbursements: {
            select: {
              id: true,
              amount: true,
              status: true,
              disbursementDate: true,
              disbursedAt: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              currentStage: true
            }
          }
        }
      }
    }
  });

  console.log(JSON.stringify(company, null, 2));
}

main()
  .catch(error => {
    console.error('❌ Error finding company', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
