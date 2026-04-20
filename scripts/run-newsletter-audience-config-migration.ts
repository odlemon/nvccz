/**
 * Newsletter audience config table (MySQL). Idempotent.
 * Run: npm run db:migrate:newsletter-audience-config
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
  const table = "newsletter_audience_configs";
  if (!(await tableExists(table))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${table}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scope\` VARCHAR(64) NOT NULL DEFAULT 'GLOBAL',
        \`include_user_ids\` JSON NULL,
        \`exclude_user_ids\` JSON NULL,
        \`include_emails\` JSON NULL,
        \`exclude_emails\` JSON NULL,
        \`updated_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`newsletter_audience_configs_scope_key\` (\`scope\`),
        KEY \`newsletter_audience_configs_updated_by_idx\` (\`updated_by_id\`),
        CONSTRAINT \`newsletter_audience_configs_updated_by_fkey\`
          FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\` (\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created newsletter_audience_configs");
  } else {
    console.log("[skip] newsletter_audience_configs exists");
  }
  console.log("\nNewsletter audience config migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

