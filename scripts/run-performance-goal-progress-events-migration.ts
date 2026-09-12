/**
 * Creates performance_goal_progress_events and performance_sync_settings tables.
 * No Prisma migrate; idempotent via information_schema.
 *
 * Run: npm run db:migrate:performance-goal-progress-events
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(1) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function main() {
  const eventsTable = "performance_goal_progress_events";
  if (await tableExists(eventsTable)) {
    console.log(`[skip] ${eventsTable} already exists`);
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`${eventsTable}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`goal_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(15, 3) NOT NULL,
        \`recorded_at\` DATETIME(3) NOT NULL,
        \`source\` VARCHAR(32) NOT NULL,
        \`source_ref\` VARCHAR(191) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`perf_goal_progress_events_goal_source_idx\` (\`goal_id\`, \`source\`),
        INDEX \`perf_goal_progress_events_goal_recorded_idx\` (\`goal_id\`, \`recorded_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`perf_goal_progress_events_goal_fk\`
          FOREIGN KEY (\`goal_id\`) REFERENCES \`performance_goals\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`perf_goal_progress_events_journal_fk\`
          FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`perf_goal_progress_events_user_fk\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    console.log(`[ok] created ${eventsTable}`);
  }

  const settingsTable = "performance_sync_settings";
  if (await tableExists(settingsTable)) {
    console.log(`[skip] ${settingsTable} already exists`);
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`${settingsTable}\` (
        \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`last_login_sync_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    console.log(`[ok] created ${settingsTable}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
