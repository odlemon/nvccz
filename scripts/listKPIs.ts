import { prisma } from '../src/utils/database';

async function listKPIs() {
  const kpis = await prisma.kPI.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      name: 'asc'
    }
  });

  console.log(JSON.stringify(kpis, null, 2));
}

listKPIs()
  .catch((error) => {
    console.error('Failed to list KPIs', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

