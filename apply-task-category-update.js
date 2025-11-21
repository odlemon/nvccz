const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('🚧 Applying manual Task.category update...');

    const existing = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tasks' AND COLUMN_NAME = 'category'`
    );

    if (existing.length > 0) {
      console.log('ℹ️ Column task.category already exists, skipping ALTER TABLE.');
    } else {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE tasks
        ADD COLUMN category VARCHAR(255) NULL COMMENT 'Optional classification such as Market Research, Financial Assessment, Legal Compliance, Management Review';
      `);
      console.log('✅ Column added.');
    }
  } catch (err) {
    console.error('❌ Update failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();

