/**
 * Speeds up GROUP BY / latest-REQUEST lookups on reporting_notification_logs. Idempotent.
 *
 * Run: npm run db:migrate:reporting-notification-logs-performance-index
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "reporting_notification_logs";
  const idx = "reporting_notif_period_evt_created_idx";
  if (!(await indexExists(table, idx))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`${idx}\` ON \`${table}\` (\`reporting_period\`, \`event_type\`, \`created_at\`)`
    );
    console.log(`[ok] created index ${idx}`);
  } else {
    console.log(`[skip] index ${idx} exists`);
  }
  console.log("\nReporting notification logs performance index finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
