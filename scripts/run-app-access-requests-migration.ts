/**
 * Creates app_access_requests table (MySQL). Idempotent.
 * Employee requests to access another Matanho module — the Home hub's Apps page "Request access"
 * flow. No pre-existing model covers this; see the doc comment on AppAccessRequest in schema.prisma.
 * Run: npm run db:migrate:app-access-requests
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
  const existed = await tableExists("app_access_requests");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`app_access_requests\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`app_id\` VARCHAR(64) NOT NULL,
      \`reason\` VARCHAR(500) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'pending',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`app_access_requests_user_id_created_at\` (\`user_id\`, \`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] app_access_requests table already present" : "[ok] created table app_access_requests");

  console.log("\nApp access requests migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
