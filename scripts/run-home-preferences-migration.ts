/**
 * Creates home_preferences table (MySQL). Idempotent.
 * One row per employee — backs Daily Cover (theme/wallpaper) now, and is reserved for the
 * Settings modal later (see the model's doc comment in schema.prisma).
 * Run: npm run db:migrate:home-preferences
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
  const existed = await tableExists("home_preferences");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`home_preferences\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`cover_theme\` VARCHAR(64) NOT NULL DEFAULT 'Porcelain',
      \`cover_wallpaper\` VARCHAR(64) NOT NULL DEFAULT 'auto',
      \`settings\` JSON NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`home_preferences_user_id_key\` (\`user_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] home_preferences table already present" : "[ok] created table home_preferences");

  console.log("\nHome preferences migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
