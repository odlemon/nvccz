/**
 * Phase 2 — vendor_document_upload_settings + vendor_document_attachments (MySQL). Idempotent.
 * Run: npm run db:migrate:vendor-document-attachments
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_ALLOWED_FILE_TYPES = JSON.stringify([
  {
    mimeType: "application/pdf",
    extensions: ["pdf"],
    label: "PDF Document",
    enabled: true
  }
]);

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await tableExists("vendor_document_upload_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`vendor_document_upload_settings\` (
        \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`max_file_size_bytes\` INT NOT NULL DEFAULT 15728640,
        \`allowed_file_types\` JSON NOT NULL,
        \`max_attachments_per_record\` INT NOT NULL DEFAULT 5,
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO \`vendor_document_upload_settings\`
        (\`id\`, \`max_file_size_bytes\`, \`allowed_file_types\`, \`max_attachments_per_record\`, \`updated_at\`)
      VALUES ('default', 15728640, '${DEFAULT_ALLOWED_FILE_TYPES.replace(/'/g, "''")}', 5, CURRENT_TIMESTAMP(3))
    `);
    console.log("[ok] created vendor_document_upload_settings + default row");
  } else {
    console.log("[skip] vendor_document_upload_settings exists");
    const count = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM vendor_document_upload_settings WHERE id = 'default'`
    );
    if (Number(count[0]?.c ?? 0) === 0) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO \`vendor_document_upload_settings\`
          (\`id\`, \`max_file_size_bytes\`, \`allowed_file_types\`, \`max_attachments_per_record\`, \`updated_at\`)
        VALUES ('default', 15728640, '${DEFAULT_ALLOWED_FILE_TYPES.replace(/'/g, "''")}', 5, CURRENT_TIMESTAMP(3))
      `);
      console.log("[ok] seeded default vendor_document_upload_settings row");
    }
  }

  if (!(await tableExists("vendor_document_attachments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`vendor_document_attachments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`entity_type\` VARCHAR(64) NOT NULL,
        \`entity_id\` VARCHAR(191) NULL,
        \`vendor_id\` VARCHAR(191) NULL,
        \`file_name\` VARCHAR(512) NOT NULL,
        \`original_file_name\` VARCHAR(512) NOT NULL,
        \`mime_type\` VARCHAR(128) NOT NULL,
        \`file_size_bytes\` INT NOT NULL,
        \`file_url\` TEXT NOT NULL,
        \`storage_path\` TEXT NULL,
        \`sha256_checksum\` VARCHAR(64) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`version\` INT NOT NULL DEFAULT 1,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`upload_source\` VARCHAR(32) NOT NULL,
        \`portal_token_kind\` VARCHAR(64) NULL,
        \`deleted_at\` DATETIME(3) NULL,
        \`deleted_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`vendor_document_attachments_entity_type_entity_id_idx\` (\`entity_type\`, \`entity_id\`),
        INDEX \`vendor_document_attachments_vendor_id_idx\` (\`vendor_id\`),
        INDEX \`vendor_document_attachments_status_idx\` (\`status\`),
        CONSTRAINT \`vendor_document_attachments_vendor_id_fkey\`
          FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`vendor_document_attachments_uploaded_by_id_fkey\`
          FOREIGN KEY (\`uploaded_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`vendor_document_attachments_deleted_by_id_fkey\`
          FOREIGN KEY (\`deleted_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created vendor_document_attachments");
  } else {
    console.log("[skip] vendor_document_attachments exists");
  }

  console.log("\nVendor document attachment migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
