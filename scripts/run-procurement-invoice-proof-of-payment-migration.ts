/**
 * A separate slot for a payment's proof-of-payment document, distinct from the supplier's own
 * invoice document (MySQL). Idempotent; safe on every environment.
 *
 *   procurement_invoices.proof_of_payment_path  storage path of the uploaded proof of payment
 *   procurement_invoices.proof_of_payment_type  'PDF' | 'IMAGE'
 *
 * Before this, payProcurementInvoice wrote the proof of payment into documentPath/documentType --
 * the same two columns the supplier's captured invoice document uses -- overwriting it and making
 * the frontend's "document reading" status (keyed off documentPath/ocrData) show a stale/misleading
 * "Being read" for a file that was never going to be read (INV-3).
 *
 * Run: npm run db:migrate:procurement-invoice-proof-of-payment
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
  await ensureColumn("procurement_invoices", "proof_of_payment_path", "VARCHAR(512) NULL");
  await ensureColumn("procurement_invoices", "proof_of_payment_type", "VARCHAR(16) NULL");
}

main()
  .then(() => console.log("Procurement invoice proof-of-payment migration finished."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
