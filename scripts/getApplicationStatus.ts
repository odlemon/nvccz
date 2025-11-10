//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';

async function main() {
  const emailArg = process.argv[2];

  if (!emailArg) {
    console.error('❌ Usage: npx ts-node scripts/getApplicationStatus.ts applicant@example.com');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();

  const applications = await prisma.application.findMany({
    where: { applicantEmail: email },
    select: {
      id: true,
      businessName: true,
      currentStage: true,
      screeningOutcome: true,
      submittedAt: true,
      updatedAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  if (applications.length === 0) {
    console.log(`ℹ️  No applications found for ${email}`);
    return;
  }

  console.log(`📄 Applications for ${email}:`);
  for (const app of applications) {
    console.log(JSON.stringify(app, null, 2));
  }
}

main()
  .catch(error => {
    console.error('❌ Failed to fetch application status:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


