/**
 * Drops vendor_kyc_documents.file_path, file_size, mime_type (URLs + filenames only in API).
 * Idempotent: skips columns that are already absent.
 *
 * Run: npm run db:migrate:vendor-kyc-drop-file-meta-columns
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
  const table = "vendor_kyc_documents";
  const columns = ["file_path", "file_size", "mime_type"] as const;

  for (const col of columns) {
    if (await columnExists(table, col)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
      console.log(`[ok] dropped ${table}.${col}`);
    } else {
      console.log(`[skip] ${table}.${col} absent`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
