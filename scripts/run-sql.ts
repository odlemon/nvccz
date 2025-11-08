// @ts-nocheck
import path from 'path';
import fs from 'fs';
import { prisma } from '../src/utils/database';

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: ts-node scripts/run-sql.ts <path-to-sql-file>');
    process.exit(1);
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`SQL file not found: ${absolutePath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(absolutePath, 'utf8');

  const statements = sqlContent
    .split(/;\s*\n/)
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);

  console.log(`Executing ${statements.length} SQL statement(s) from ${absolutePath}`);

  for (const statement of statements) {
    console.log(`\n➡️  Executing:\n${statement}`);
    await prisma.$executeRawUnsafe(statement);
  }

  console.log('\n✅ SQL script executed successfully');
}

main()
  .catch(error => {
    console.error('❌ Failed to execute SQL script:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
