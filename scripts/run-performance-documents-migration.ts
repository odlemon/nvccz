/**
 * Performance Document Vault — performance_documents table (MySQL). Idempotent.
 *
 * Company-wide performance document store (not scoped to a contract/review), organised by a
 * free-string `folder` (the vault's folder bar: Contracts, Reviews, Evidence, Policies, …) with a
 * versioned lifecycle (`version` + `status`) and an optional retention date. Shape mirrors
 * `accounting_documents` plus the performance-specific columns the vault table shows
 * (Document / Folder / Version / Owner / Status / Updated / Retention).
 *
 * Safe to re-run: creates the table when missing, otherwise back-fills any missing column,
 * index or foreign key. No prisma migrate / db push.
 *
 * Run: npm run db:migrate:performance-documents
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLE = "performance_documents";

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function constraintExists(table: string, constraintName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    table,
    constraintName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  );
  console.log(`[ok] ${table}.${column}`);
}

async function addIndexIfMissing(table: string, indexName: string, columns: string) {
  if (await indexExists(table, indexName)) {
    console.log(`[skip] index ${indexName} on ${table}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`
  );
  console.log(`[ok] index ${indexName} on ${table}`);
}

async function addForeignKeyIfMissing(
  table: string,
  constraintName: string,
  column: string,
  refTable: string,
  refColumn: string
) {
  if (await constraintExists(table, constraintName)) {
    console.log(`[skip] FK ${constraintName} on ${table}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\`
       FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`)
       ON DELETE SET NULL ON UPDATE CASCADE`
  );
  console.log(`[ok] FK ${constraintName} on ${table}`);
}

async function createTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`folder\` VARCHAR(64) NOT NULL DEFAULT 'General',
      \`category\` VARCHAR(64) NULL,
      \`version\` VARCHAR(32) NOT NULL DEFAULT 'v1',
      \`status\` VARCHAR(24) NOT NULL DEFAULT 'draft',
      \`file_url\` TEXT NOT NULL,
      \`storage_path\` VARCHAR(512) NULL,
      \`mime_type\` VARCHAR(128) NULL,
      \`file_size_bytes\` INT NULL,
      \`owner_id\` VARCHAR(191) NULL,
      \`department_id\` VARCHAR(191) NULL,
      \`retention_until\` DATETIME(3) NULL,
      \`uploaded_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`performance_documents_folder_idx\` (\`folder\`),
      INDEX \`performance_documents_status_idx\` (\`status\`),
      INDEX \`performance_documents_owner_id_idx\` (\`owner_id\`),
      INDEX \`performance_documents_department_id_idx\` (\`department_id\`),
      INDEX \`performance_documents_uploaded_by_id_idx\` (\`uploaded_by_id\`),
      CONSTRAINT \`performance_documents_owner_id_fkey\`
        FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT \`performance_documents_department_id_fkey\`
        FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT \`performance_documents_uploaded_by_id_fkey\`
        FOREIGN KEY (\`uploaded_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(`[ok] created ${TABLE}`);
}

/** Back-fill path for a table that already exists in a partial state. */
async function reconcileTable() {
  console.log(`[skip] ${TABLE} exists — reconciling columns / indexes / FKs`);

  await addColumnIfMissing(TABLE, "name", "VARCHAR(255) NOT NULL");
  await addColumnIfMissing(TABLE, "folder", "VARCHAR(64) NOT NULL DEFAULT 'General'");
  await addColumnIfMissing(TABLE, "category", "VARCHAR(64) NULL");
  await addColumnIfMissing(TABLE, "version", "VARCHAR(32) NOT NULL DEFAULT 'v1'");
  await addColumnIfMissing(TABLE, "status", "VARCHAR(24) NOT NULL DEFAULT 'draft'");
  await addColumnIfMissing(TABLE, "file_url", "TEXT NOT NULL");
  await addColumnIfMissing(TABLE, "storage_path", "VARCHAR(512) NULL");
  await addColumnIfMissing(TABLE, "mime_type", "VARCHAR(128) NULL");
  await addColumnIfMissing(TABLE, "file_size_bytes", "INT NULL");
  await addColumnIfMissing(TABLE, "owner_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(TABLE, "department_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(TABLE, "retention_until", "DATETIME(3) NULL");
  await addColumnIfMissing(TABLE, "uploaded_by_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(
    TABLE,
    "created_at",
    "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)"
  );
  await addColumnIfMissing(
    TABLE,
    "updated_at",
    "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)"
  );

  await addIndexIfMissing(TABLE, "performance_documents_folder_idx", "`folder`");
  await addIndexIfMissing(TABLE, "performance_documents_status_idx", "`status`");
  await addIndexIfMissing(TABLE, "performance_documents_owner_id_idx", "`owner_id`");
  await addIndexIfMissing(TABLE, "performance_documents_department_id_idx", "`department_id`");
  await addIndexIfMissing(TABLE, "performance_documents_uploaded_by_id_idx", "`uploaded_by_id`");

  await addForeignKeyIfMissing(
    TABLE,
    "performance_documents_owner_id_fkey",
    "owner_id",
    "users",
    "id"
  );
  await addForeignKeyIfMissing(
    TABLE,
    "performance_documents_department_id_fkey",
    "department_id",
    "departments",
    "id"
  );
  await addForeignKeyIfMissing(
    TABLE,
    "performance_documents_uploaded_by_id_fkey",
    "uploaded_by_id",
    "users",
    "id"
  );
}

async function main() {
  if (await tableExists(TABLE)) {
    await reconcileTable();
  } else {
    await createTable();
  }

  console.log("\nPerformance documents migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
