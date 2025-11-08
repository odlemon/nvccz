import { prisma } from '../src/utils/database';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node scripts/list-applications-by-email.ts <email>');
    process.exit(1);
  }

  const applications = await prisma.application.findMany({
    where: { applicantEmail: email },
    select: {
      id: true,
      businessName: true,
      currentStage: true,
      updatedAt: true,
      investmentImplementation: {
        select: {
          id: true,
          status: true,
          fundsDisbursed: true
        }
      }
    }
  });

  if (applications.length === 0) {
    console.log(`No applications found for ${email}`);
  } else {
    console.log(JSON.stringify(applications, null, 2));
  }
}

main()
  .catch(error => {
    console.error('❌ Failed to list applications', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
