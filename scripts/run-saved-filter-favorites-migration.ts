/**
 * Creates saved_filter_favorites table (MySQL). Idempotent.
 * Run: npm run db:migrate:saved-filter-favorites
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const existed = await tableExists("saved_filter_favorites");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`saved_filter_favorites\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`route_key\` VARCHAR(191) NOT NULL,
      \`filters\` JSON NOT NULL,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`saved_filter_favorites_user_name\` (\`user_id\`, \`name\`),
      KEY \`saved_filter_favorites_user_route\` (\`user_id\`, \`route_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] saved_filter_favorites table already present" : "[ok] created table saved_filter_favorites");

  console.log("\nSaved filter favorites migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
