/**
 * Adds receipt attachment columns on cashbook_entries (MySQL). Idempotent.
 * Run: npm run db:migrate:cashbook-receipt-attachment
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const cols: Array<{ name: string; ddl: string }> = [
    {
      name: "receipt_attachment_url",
      ddl: "ADD COLUMN `receipt_attachment_url` TEXT NULL",
    },
    {
      name: "receipt_attachment_path",
      ddl: "ADD COLUMN `receipt_attachment_path` VARCHAR(512) NULL",
    },
    {
      name: "receipt_attachment_file_name",
      ddl: "ADD COLUMN `receipt_attachment_file_name` VARCHAR(255) NULL",
    },
    {
      name: "receipt_attachment_mime_type",
      ddl: "ADD COLUMN `receipt_attachment_mime_type` VARCHAR(128) NULL",
    },
  ];

  for (const col of cols) {
    if (await columnExists("cashbook_entries", col.name)) {
      console.log(`[skip] cashbook_entries.${col.name} exists`);
    } else {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`cashbook_entries\` ${col.ddl}`);
      console.log(`[ok] added cashbook_entries.${col.name}`);
    }
  }

  console.log("\nCashbook receipt attachment columns migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
