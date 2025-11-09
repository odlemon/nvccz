import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function columnExists(columnName: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tasks'
        AND COLUMN_NAME = ?
    `,
    columnName
  );

  return result.length > 0;
}

async function constraintExists(constraintName: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tasks'
        AND CONSTRAINT_NAME = ?
    `,
    constraintName
  );

  return result.length > 0;
}

async function addDueDiligenceColumns() {
  if (!(await columnExists('applicationId'))) {
    console.log('Adding applicationId column to tasks table...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tasks
      ADD COLUMN applicationId VARCHAR(191) NULL
    `);
  } else {
    console.log('applicationId column already exists, skipping.');
  }

  if (!(await columnExists('fromDueDiligence'))) {
    console.log('Adding fromDueDiligence column to tasks table...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tasks
      ADD COLUMN fromDueDiligence BOOLEAN NOT NULL DEFAULT FALSE
    `);
  } else {
    console.log('fromDueDiligence column already exists, skipping.');
  }

  const fkName = 'tasks_applicationId_fk';
  if (!(await constraintExists(fkName))) {
    console.log('Adding foreign key constraint on applicationId...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tasks
      ADD CONSTRAINT ${fkName}
      FOREIGN KEY (applicationId) REFERENCES applications(id)
      ON DELETE SET NULL ON UPDATE CASCADE
    `);
  } else {
    console.log('Foreign key constraint already exists, skipping.');
  }

  console.log('Schema update complete.');
}

addDueDiligenceColumns()
  .catch((error) => {
    console.error('Schema update failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

