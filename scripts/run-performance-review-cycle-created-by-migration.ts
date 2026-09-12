/**
 * Adds optional `performance_review_cycles.created_by_id` (FK to users.id).
 * Idempotent. Run: npm run db:migrate:performance-review-cycle-created-by
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    tableName,
    columnName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, columnSql: string) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[skip] ${tableName}.${columnName} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`);
  console.log(`[ok] added ${tableName}.${columnName}`);
}

async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    tableName,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  await addColumnIfMissing(
    "performance_review_cycles",
    "created_by_id",
    "`created_by_id` VARCHAR(191) NULL"
  );

  if (!(await indexExists("performance_review_cycles", "performance_review_cycles_created_by_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`performance_review_cycles\` ADD INDEX \`performance_review_cycles_created_by_id_idx\` (\`created_by_id\`)`
    );
    console.log("[ok] added index performance_review_cycles_created_by_id_idx");
  } else {
    console.log("[skip] index performance_review_cycles_created_by_id_idx already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
