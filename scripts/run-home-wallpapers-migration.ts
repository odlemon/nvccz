/**
 * Creates home_wallpapers table and adds home_preferences.rotation_interval_minutes (MySQL).
 * Idempotent. Backs custom-upload Daily Cover backgrounds + configurable rotation interval.
 * Run: npm run db:migrate:home-wallpapers
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

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const tableExisted = await tableExists("home_wallpapers");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`home_wallpapers\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`url\` VARCHAR(1024) NOT NULL,
      \`label\` VARCHAR(120) NULL,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`home_wallpapers_user_id_sort_order\` (\`user_id\`, \`sort_order\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(tableExisted ? "[skip] home_wallpapers table already present" : "[ok] created table home_wallpapers");

  const columnExisted = await columnExists("home_preferences", "rotation_interval_minutes");
  if (!columnExisted) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`home_preferences\`
      ADD COLUMN \`rotation_interval_minutes\` INT NOT NULL DEFAULT 1440
    `);
    console.log("[ok] added home_preferences.rotation_interval_minutes");
  } else {
    console.log("[skip] home_preferences.rotation_interval_minutes already present");
  }

  console.log("\nHome wallpapers migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
