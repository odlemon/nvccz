/**
 * Automatic approval of supplier invoices that match exactly (MySQL). Idempotent; safe on every environment.
 *
 *   procurement_settings.auto_approve_matched_invoices   whether an exact three-way match is approved without a person
 *                                                         (off until an administrator or the CFO switches it on)
 *   procurement_settings.auto_approve_invoice_limit       the largest invoice total approved that way; NULL for none
 *   procurement_invoices.approval_source                 MANUAL or AUTOMATIC, so the register can say which
 *
 * The settings table is created if an environment never had it, with the columns its other code reads.
 *
 * Run: npm run db:migrate:procurement-invoice-auto-approval
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function ensureColumn(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] added ${table}.${column}`);
}

async function main() {
  if (!(await tableExists("procurement_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`procurement_settings\` (
        \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`over_delivery_tolerance_pct\` DECIMAL(5,2) NOT NULL DEFAULT 5.00,
        \`po_validity_grace_days\` INT NOT NULL DEFAULT 30,
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log("[ok] created procurement_settings");
  }
  await ensureColumn("procurement_settings", "auto_approve_matched_invoices", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("procurement_settings", "auto_approve_invoice_limit", "DECIMAL(15,2) NULL");

  if (await tableExists("procurement_invoices")) {
    await ensureColumn("procurement_invoices", "approval_source", "VARCHAR(16) NULL");
    // Invoices approved before this column existed were approved by a person.
    const n = await prisma.$executeRawUnsafe(
      `UPDATE \`procurement_invoices\` SET \`approval_source\` = 'MANUAL' WHERE \`approval_source\` IS NULL AND \`approvedAt\` IS NOT NULL`
    );
    console.log(`[ok] ${n} earlier approval(s) marked MANUAL`);
  } else {
    console.log("[skip] procurement_invoices not found");
  }
}

main()
  .then(() => console.log("Procurement invoice auto-approval migration finished."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
