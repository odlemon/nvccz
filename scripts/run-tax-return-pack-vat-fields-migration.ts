/**
 * Tax Return Pack — VAT regime columns.
 * Adds `vat_output_tax`, `vat_input_tax`, `vat_net_payable` to `tax_return_packs` (all nullable,
 * additive only) so a ZIMRA_VAT pack can store its liability alongside the CIT-only fields
 * (accounting_profit, taxable_income, cit_liability, cgt_liability) which don't semantically fit VAT.
 * Idempotent: skips columns that already exist.
 *
 * Run: npm run db:migrate:tax-return-pack-vat-fields
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
  const table = "tax_return_packs";

  await addColumnIfMissing(
    table,
    "vat_output_tax",
    "DECIMAL(15,2) NULL",
    "ZIMRA_VAT pack: output VAT (payable) aggregated from VATReportService for the pack period"
  );
  await addColumnIfMissing(
    table,
    "vat_input_tax",
    "DECIMAL(15,2) NULL",
    "ZIMRA_VAT pack: input VAT (claimable) aggregated from VATReportService for the pack period"
  );
  await addColumnIfMissing(
    table,
    "vat_net_payable",
    "DECIMAL(15,2) NULL",
    "ZIMRA_VAT pack: net VAT payable (positive) or refundable (negative) = output - input"
  );

  for (const col of ["vat_output_tax", "vat_input_tax", "vat_net_payable"]) {
    if (!(await columnExists(table, col))) {
      throw new Error(`Missing column after migration: ${table}.${col}`);
    }
    console.log(`[verify OK] ${table}.${col}`);
  }

  console.log("\nTax return pack VAT-fields migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
