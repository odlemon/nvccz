import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  const applicationColumn = await prisma.$queryRawUnsafe<Array<any>>(
    "SHOW COLUMNS FROM tasks LIKE 'applicationId'"
  );
  const fromDueColumn = await prisma.$queryRawUnsafe<Array<any>>(
    "SHOW COLUMNS FROM tasks LIKE 'fromDueDiligence'"
  );

  const counts = await prisma.$queryRawUnsafe<Array<{ total: number; withFlags: number }>>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN fromDueDiligence = 1 THEN 1 ELSE 0 END) AS withFlags
    FROM tasks
  `);

  console.log('applicationId column:', applicationColumn.length ? 'present' : 'missing');
  console.log('fromDueDiligence column:', fromDueColumn.length ? 'present' : 'missing');
  console.log('Task counts:', counts[0]);
}

verify()
  .catch((error) => {
    console.error('Verification failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

