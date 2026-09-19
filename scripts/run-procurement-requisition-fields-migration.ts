/**
 * SRD §11 "Purchase Requisitions" lists Required Date, Budget Code and Delivery Location as
 * minimum fields the requisition must capture. `purchase_requisitions` had none of the three, so
 * the creation form could not collect them and the RFQ/vendor-portal quotation built from a
 * requisition always showed "Delivery required by: Not set" / "Deliver to: To be confirmed".
 *
 * Adds, all nullable (existing rows are unaffected):
 *   - required_date      DATE          — SRD "Required Date"
 *   - delivery_location   VARCHAR(255)  — SRD "Delivery Location"
 *   - budget_code         VARCHAR(100)  — SRD "Budget Code" (free-text; no budget-code register exists yet)
 *
 * Idempotent: skips columns that already exist.
 *
 * Run: npm run db:migrate:procurement-requisition-fields
 * Then: npx prisma generate
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

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
  comment?: string
) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  const sql = comment
    ? `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} COMMENT '${comment.replace(/'/g, "''")}'`
    : `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`[ok] added ${table}.${column}`);
}

async function main() {
  const table = "purchase_requisitions";

  await addColumnIfMissing(
    table,
    "required_date",
    "DATE NULL",
    "SRD Sec11 Required Date - when the requester needs the goods/services by"
  );
  await addColumnIfMissing(
    table,
    "delivery_location",
    "VARCHAR(255) NULL",
    "SRD Sec11 Delivery Location - where the goods/services must be delivered"
  );
  await addColumnIfMissing(
    table,
    "budget_code",
    "VARCHAR(100) NULL",
    "SRD Sec11 Budget Code - free text; no budget-code register exists on this backend yet"
  );

  for (const col of ["required_date", "delivery_location", "budget_code"]) {
    if (!(await columnExists(table, col))) {
      throw new Error(`Missing column after migration: ${table}.${col}`);
    }
    console.log(`[verify OK] ${table}.${col}`);
  }

  console.log("\nProcurement requisition fields migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
