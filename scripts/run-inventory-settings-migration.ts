/**
 * Creates inventory_settings singleton table (MySQL). Idempotent.
 * Run: npm run db:migrate:inventory-settings
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
  const existed = await tableExists("inventory_settings");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`inventory_settings\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`allow_negative_stock\` TINYINT(1) NOT NULL DEFAULT 0,
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] inventory_settings table already present" : "[ok] created table inventory_settings");

  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO \`inventory_settings\` (\`id\`, \`allow_negative_stock\`)
    VALUES ('default', 0)
  `);
  console.log("[ok] ensured inventory_settings default row");

  console.log("\nInventory settings migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
