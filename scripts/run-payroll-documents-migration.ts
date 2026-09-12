/**
 * Payroll Document Vault — payroll_documents table (MySQL). Idempotent.
 *
 * The Vault screen rendered a hardcoded register ("June 2026 Payroll Control Pack",
 * DOC-001, ...) straight out of the vendored runtime, because nothing existed behind
 * it to read. This creates that store.
 *
 * Company-wide rather than run-scoped, with an optional `payroll_run_id` so a control
 * pack can be traced to the run it evidences, and an optional `period_label` for
 * documents that belong to a period rather than a single run.
 *
 * Run: npm run db:migrate:payroll-documents
 *      npm run db:migrate:payroll-documents -- --check   (verify only, exit 1 if absent)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK_ONLY = process.argv.includes("--check");

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const exists = await tableExists("payroll_documents");

  if (CHECK_ONLY) {
    if (exists) {
      console.log("[ok] payroll_documents present");
      return;
    }
    // Exit non-zero rather than reporting a benign skip. A guard shipped against a
    // table that does not exist fails every request, and a verifier that prints
    // "all good" in that state is worse than no verifier — that exact pattern is
    // FINDING-001 in this engagement's own log.
    console.error("[FAIL] payroll_documents is absent — run npm run db:migrate:payroll-documents");
    process.exitCode = 1;
    return;
  }

  if (!exists) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`payroll_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(64) NOT NULL DEFAULT 'General',
        \`classification\` VARCHAR(24) NOT NULL DEFAULT 'INTERNAL',
        \`reference\` VARCHAR(64) NULL,
        \`period_label\` VARCHAR(64) NULL,
        \`payroll_run_id\` VARCHAR(191) NULL,
        \`file_url\` TEXT NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`file_size_bytes\` INT NULL,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`payroll_documents_category_idx\` (\`category\`),
        INDEX \`payroll_documents_payroll_run_id_idx\` (\`payroll_run_id\`),
        CONSTRAINT \`payroll_documents_uploaded_by_id_fkey\`
          FOREIGN KEY (\`uploaded_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`payroll_documents_payroll_run_id_fkey\`
          FOREIGN KEY (\`payroll_run_id\`) REFERENCES \`payroll_runs\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] payroll_documents created");
  } else {
    console.log("[skip] payroll_documents exists");
  }

  console.log("\nPayroll documents migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
