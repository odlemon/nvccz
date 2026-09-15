/**
 * A supplier invoice flagged for review by a person (MySQL). Idempotent; safe on every environment.
 *
 *   procurement_invoices.review_note           why the person flagged it (SRD §7 Invoice Processing: Flag for Review)
 *   procurement_invoices.review_flagged_at     when
 *   procurement_invoices.review_flagged_by_id  who
 *
 * Run: npm run db:migrate:procurement-invoice-review-flag
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function exists(sql: string, ...args: string[]): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(sql, ...args);
  return Number(rows[0]?.c ?? 0) > 0;
}
const tableExists = (t: string) => exists("SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", t);
const columnExists = (t: string, c: string) =>
  exists("SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", t, c);

async function ensureColumn(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) return console.log(`[skip] ${table}.${column} already exists`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] added ${table}.${column}`);
}

async function main() {
  if (!(await tableExists("procurement_invoices"))) return console.log("[skip] procurement_invoices not found");
  await ensureColumn("procurement_invoices", "review_note", "TEXT NULL");
  await ensureColumn("procurement_invoices", "review_flagged_at", "DATETIME(3) NULL");
  await ensureColumn("procurement_invoices", "review_flagged_by_id", "VARCHAR(191) NULL");
}

main()
  .then(() => console.log("Procurement invoice review flag migration finished."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
