import { prisma } from '../src/utils/database';

async function main() {
  const implementations = await prisma.investmentImplementation.findMany({
    where: {
      OR: [
        { status: 'COMPLETED' },
        { fundsDisbursed: true }
      ]
    },
    select: {
      id: true,
      status: true,
      fundsDisbursed: true,
      application: {
        select: {
          id: true,
          businessName: true,
          applicantName: true,
          applicantEmail: true,
          currentStage: true
        }
      },
      portfolioCompany: {
        select: {
          id: true,
          name: true,
          status: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });

  if (implementations.length === 0) {
    console.log('No investment implementations with disbursed funds or completed status found.');
    return;
  }

  console.log('✅ Found invested applicants:');
  for (const implementation of implementations) {
    console.log('------------------------------------------------------------');
    console.log(`Implementation ID : ${implementation.id}`);
    console.log(`Status            : ${implementation.status}`);
    console.log(`Funds Disbursed   : ${implementation.fundsDisbursed}`);
    const app = implementation.application;
    if (app) {
      console.log(`Application ID    : ${app.id}`);
      console.log(`Business Name     : ${app.businessName}`);
      console.log(`Applicant Name    : ${app.applicantName}`);
      console.log(`Applicant Email   : ${app.applicantEmail}`);
      console.log(`Stage             : ${app.currentStage}`);
    }
    const company = implementation.portfolioCompany;
    if (company) {
      console.log(`Portfolio Company : ${company.name} (${company.id}) - status ${company.status}`);
      if (company.user) {
        console.log(`Login Email       : ${company.user.email}`);
        console.log(`User Name         : ${company.user.firstName ?? ''} ${company.user.lastName ?? ''}`.trim());
      }
    }
  }
}

main()
  .catch(error => {
    console.error('❌ Failed to fetch invested applicants', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
