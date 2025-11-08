import { prisma } from '../src/utils/database';

async function main() {
  const companies = await prisma.portfolioCompany.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      fundingStage: true,
      fundId: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userDepartment: true,
          roleCode: true,
          role: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (companies.length === 0) {
    console.log('No portfolio companies found.');
    return;
  }

  console.log('✅ Portfolio companies with user accounts');
  for (const company of companies) {
    console.log('------------------------------------------------------------');
    console.log(`Company ID     : ${company.id}`);
    console.log(`Name           : ${company.name}`);
    console.log(`Status         : ${company.status}`);
    console.log(`Funding Stage  : ${company.fundingStage ?? 'N/A'}`);
    console.log(`Fund ID        : ${company.fundId ?? 'N/A'}`);
    if (company.user) {
      console.log(`User ID        : ${company.user.id}`);
      console.log(`Email          : ${company.user.email}`);
      console.log(`Name           : ${company.user.firstName ?? ''} ${company.user.lastName ?? ''}`.trim());
      console.log(`Department     : ${company.user.userDepartment ?? 'N/A'}`);
      console.log(`Role Code      : ${company.user.roleCode ?? 'N/A'}`);
      console.log(`Role Name      : ${company.user.role?.name ?? 'N/A'}`);
    } else {
      console.log('⚠️  No user linked to this company');
    }
  }
}

main()
  .catch(error => {
    console.error('❌ Failed to list portfolio companies', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
