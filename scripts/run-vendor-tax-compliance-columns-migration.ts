/**
 * Adds ZIMRA ITF263 / tax compliance columns on vendors (MySQL). Idempotent.
 * Run: npm run db:migrate:vendor-tax-compliance
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
  const table = "vendors";

  if (!(await columnExists(table, "tax_compliance_status"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`vendors\`
      ADD COLUMN \`tax_compliance_status\` VARCHAR(191) NOT NULL DEFAULT 'PENDING'
    `);
    console.log("[ok] added tax_compliance_status");
  } else {
    console.log("[skip] tax_compliance_status exists");
  }

  if (!(await columnExists(table, "tax_clearance_expiry_date"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`vendors\`
      ADD COLUMN \`tax_clearance_expiry_date\` DATETIME(3) NULL
    `);
    console.log("[ok] added tax_clearance_expiry_date");
  } else {
    console.log("[skip] tax_clearance_expiry_date exists");
  }

  if (!(await columnExists(table, "tax_revalidation_alert_due_at"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`vendors\`
      ADD COLUMN \`tax_revalidation_alert_due_at\` DATETIME(3) NULL
    `);
    console.log("[ok] added tax_revalidation_alert_due_at");
  } else {
    console.log("[skip] tax_revalidation_alert_due_at exists");
  }

  if (!(await columnExists(table, "tax_revalidation_alert_notified_at"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`vendors\`
      ADD COLUMN \`tax_revalidation_alert_notified_at\` DATETIME(3) NULL
    `);
    console.log("[ok] added tax_revalidation_alert_notified_at");
  } else {
    console.log("[skip] tax_revalidation_alert_notified_at exists");
  }

  console.log("\nVendor tax compliance columns migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
