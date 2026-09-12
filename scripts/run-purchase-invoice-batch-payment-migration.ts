/**
 * Creates purchase_invoice_payments (MySQL). Idempotent.
 * Run: npm run db:migrate:purchase-invoice-batch-payments
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
  if (await tableExists("purchase_invoice_payments")) {
    console.log("[skip] purchase_invoice_payments exists");
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`purchase_invoice_payments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`purchase_invoice_id\` VARCHAR(191) NOT NULL,
        \`cashbook_entry_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(15, 2) NOT NULL,
        \`payment_date\` DATETIME(3) NOT NULL,
        \`payment_reference\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`purchase_invoice_payments_purchase_invoice_id_idx\` (\`purchase_invoice_id\`),
        INDEX \`purchase_invoice_payments_cashbook_entry_id_idx\` (\`cashbook_entry_id\`),
        CONSTRAINT \`purchase_invoice_payments_purchase_invoice_id_fkey\`
          FOREIGN KEY (\`purchase_invoice_id\`) REFERENCES \`purchase_invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`purchase_invoice_payments_cashbook_entry_id_fkey\`
          FOREIGN KEY (\`cashbook_entry_id\`) REFERENCES \`cashbook_entries\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`purchase_invoice_payments_created_by_id_fkey\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created purchase_invoice_payments");
  }

  console.log("\nPurchase invoice batch payment table migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
