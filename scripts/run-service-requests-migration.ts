/**
 * Creates service_requests table (MySQL). Idempotent.
 * Employee self-service requests (leave, expense, IT, travel, facilities, training) — the Home
 * hub's Services page. No pre-existing model covers this; see the doc comment on
 * ServiceRequest in schema.prisma.
 * Run: npm run db:migrate:service-requests
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
  const existed = await tableExists("service_requests");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`service_requests\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`type\` VARCHAR(32) NOT NULL,
      \`summary\` VARCHAR(255) NOT NULL,
      \`amount\` DECIMAL(15,2) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'pending',
      \`next_action\` VARCHAR(255) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`service_requests_user_id_created_at\` (\`user_id\`, \`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] service_requests table already present" : "[ok] created table service_requests");

  console.log("\nService requests migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
