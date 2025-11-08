// @ts-nocheck
import { prisma } from '../src/utils/database';

async function main() {
  const tableName = process.argv[2];
  if (!tableName) {
    console.error('Usage: ts-node scripts/show-table.ts <table-name>');
    process.exit(1);
  }

  const [createTable] = await prisma.$queryRawUnsafe<any[]>(`SHOW CREATE TABLE ${tableName}`);
  const columns = await prisma.$queryRawUnsafe<any[]>(`DESCRIBE ${tableName}`);

  console.log(`\n🔍 SHOW CREATE TABLE ${tableName}:\n`);
  console.log(createTable['Create Table'] || JSON.stringify(createTable, null, 2));

  console.log(`\n🔍 DESCRIBE ${tableName}:\n`);
  console.table(columns);
}

main()
  .catch(error => {
    console.error('❌ Failed to inspect table:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
