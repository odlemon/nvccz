/**
 * Reporting notification logs (MySQL). Idempotent.
 *
 * Run: npm run db:migrate:reporting-notification-logs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

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
  if (!(await tableExists(table))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${table}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`portfolio_company_id\` VARCHAR(191) NOT NULL,
        \`reporting_period\` DATE NOT NULL,
        \`event_type\` VARCHAR(64) NOT NULL,
        \`channel\` VARCHAR(32) NOT NULL DEFAULT 'EMAIL',
        \`recipient_email\` VARCHAR(255) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'SENT',
        \`meta\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`reporting_notif_company_period_idx\` (\`portfolio_company_id\`, \`reporting_period\`),
        INDEX \`reporting_notif_period_type_idx\` (\`reporting_period\`, \`event_type\`),
        INDEX \`reporting_notif_created_idx\` (\`created_at\`),
        CONSTRAINT \`reporting_notif_company_fk\`
          FOREIGN KEY (\`portfolio_company_id\`) REFERENCES \`portfolio_companies\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created reporting_notification_logs");
  } else {
    console.log("[skip] reporting_notification_logs exists");
  }

  // Backfill indexes if table existed without them (defensive).
  const idx1 = "reporting_notif_company_period_idx";
  if (!(await indexExists(table, idx1))) {
    await prisma.$executeRawUnsafe(`CREATE INDEX \`${idx1}\` ON \`${table}\`(\`portfolio_company_id\`, \`reporting_period\`)`);
  }
  const idx2 = "reporting_notif_period_type_idx";
  if (!(await indexExists(table, idx2))) {
    await prisma.$executeRawUnsafe(`CREATE INDEX \`${idx2}\` ON \`${table}\`(\`reporting_period\`, \`event_type\`)`);
  }
  const idx3 = "reporting_notif_created_idx";
  if (!(await indexExists(table, idx3))) {
    await prisma.$executeRawUnsafe(`CREATE INDEX \`${idx3}\` ON \`${table}\`(\`created_at\`)`);
  }

  console.log("\nReporting notification logs migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

