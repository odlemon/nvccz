/**
 * Accounting Document Vault — accounting_documents table (MySQL). Idempotent.
 * Company-wide document store (not fund-scoped), categorized only by a free-string `category`.
 * Run: npm run db:migrate:accounting-documents
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
  if (!(await tableExists("accounting_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`accounting_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(64) NOT NULL DEFAULT 'General',
        \`file_url\` TEXT NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`file_size_bytes\` INT NULL,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`accounting_documents_category_idx\` (\`category\`),
        CONSTRAINT \`accounting_documents_uploaded_by_id_fkey\`
          FOREIGN KEY (\`uploaded_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] accounting_documents");
  } else {
    console.log("[skip] accounting_documents exists");
  }

  console.log("\nAccounting documents migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
