//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';

async function main() {
  const emailArg = process.argv[2];

  if (!emailArg) {
    console.error('❌ Please provide an applicant email, e.g. `npx ts-node scripts/deleteApplicationByEmail.ts user@example.com`');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();

  console.log(`🔍 Looking up applications for ${email}...`);

  const applications = await prisma.application.findMany({
    where: { applicantEmail: email },
    include: {
      documents: true,
      investmentImplementation: true,
      boardReview: true,
      dueDiligenceReview: true,
      termSheet: true
    }
  });

  if (applications.length === 0) {
    console.log('ℹ️  No applications found for this email.');
    return;
  }

  applications.forEach(app => {
    console.log(`• Application ${app.id} | stage=${app.currentStage} | submitted=${app.submittedAt}`);
  });

  console.log(`🗑️  Deleting ${applications.length} application(s) and related records...`);

  const deleteResult = await prisma.application.deleteMany({
    where: { applicantEmail: email }
  });

  console.log(`✅ Deleted ${deleteResult.count} application(s) for ${email}`);
}

main()
  .catch(error => {
    console.error('❌ Failed to delete applications:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


