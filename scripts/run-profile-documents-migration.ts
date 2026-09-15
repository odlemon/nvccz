/**
 * Creates profile_documents table (MySQL). Idempotent.
 * Employee's own profile documents (certifications, education records, etc.) — the Home hub's
 * My Profile "Add document" flow. No pre-existing model covers this (the generic Document model
 * is scoped to fundraising applications via a required applicationId, not a personal file store);
 * see the doc comment on ProfileDocument in schema.prisma.
 * Run: npm run db:migrate:profile-documents
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
  const existed = await tableExists("profile_documents");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`profile_documents\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`category\` VARCHAR(64) NOT NULL,
      \`url\` VARCHAR(1024) NOT NULL,
      \`size_bytes\` INT NULL,
      \`mime_type\` VARCHAR(120) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`profile_documents_user_id_created_at\` (\`user_id\`, \`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] profile_documents table already present" : "[ok] created table profile_documents");

  console.log("\nProfile documents migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
