// @ts-nocheck
import { prisma } from '../src/utils/database';

async function main() {
  const [createTable] = await prisma.$queryRawUnsafe<any[]>(`SHOW CREATE TABLE financial_reports`);
  const columns = await prisma.$queryRawUnsafe<any[]>(`DESCRIBE financial_reports`);

  console.log('\n🔍 SHOW CREATE TABLE financial_reports:\n');
  console.log(createTable['Create Table'] || JSON.stringify(createTable, null, 2));

  console.log('\n🔍 DESCRIBE financial_reports:\n');
  console.table(columns);
}

main()
  .catch(error => {
    console.error('❌ Failed to inspect financial_reports table:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
