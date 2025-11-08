import { prisma } from '../src/utils/database';

async function main() {
  const page = Number(process.argv[2] ?? 1);
  const limit = Number(process.argv[3] ?? 10);

  const skip = (page - 1) * limit;

  const applications = await prisma.application.findMany({
    where: {
      currentStage: {
        notIn: ['REJECTED', 'PENDING_SHORTLISTING']
      }
    },
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      businessName: true,
      applicantEmail: true,
      currentStage: true,
      createdAt: true
    }
  });

  console.log(JSON.stringify(applications, null, 2));
}

main()
  .catch(error => {
    console.error('❌ Failed to list applications', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
