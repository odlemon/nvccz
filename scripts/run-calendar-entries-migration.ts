/**
 * Creates calendar_entries table (MySQL). Idempotent.
 * Personal calendar entries (meetings, focus blocks, reminders) for the Home hub's Calendar
 * page — deliberately separate from the real `Event` model, see the doc comment on
 * CalendarEntry in schema.prisma for why.
 * Run: npm run db:migrate:calendar-entries
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
  const existed = await tableExists("calendar_entries");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`calendar_entries\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`description\` TEXT NULL,
      \`start_date\` DATETIME(3) NOT NULL,
      \`end_date\` DATETIME(3) NOT NULL,
      \`location\` VARCHAR(255) NULL,
      \`entry_type\` VARCHAR(32) NOT NULL DEFAULT 'meeting',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`calendar_entries_user_id_start_date\` (\`user_id\`, \`start_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] calendar_entries table already present" : "[ok] created table calendar_entries");

  console.log("\nCalendar entries migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
