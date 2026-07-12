/**
 * FP&A budget cycle polish — setup fields + cell record_version.
 * Idempotent. Run: npm run db:migrate:fpa-budget-cycle-polish
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

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  const cycle = "planning_budget_cycles";
  await addColumnIfMissing(cycle, "planning_type", "VARCHAR(64) NOT NULL DEFAULT 'ANNUAL_BUDGET'");
  await addColumnIfMissing(cycle, "actuals_cutoff_date", "DATE NULL");
  await addColumnIfMissing(cycle, "forecast_start_period", "DATE NULL");
  await addColumnIfMissing(cycle, "submission_deadline", "DATE NULL");
  await addColumnIfMissing(cycle, "base_currency", "VARCHAR(3) NULL");
  await addColumnIfMissing(cycle, "cycle_owner_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(cycle, "entity_ids_json", "JSON NULL");
  await addColumnIfMissing(cycle, "baseline_mode", "VARCHAR(32) NULL");
  await addColumnIfMissing(cycle, "baseline_source_version_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(cycle, "load_prior_actuals_on_open", "BOOLEAN NOT NULL DEFAULT TRUE");
  await addColumnIfMissing(cycle, "load_baseline_on_open", "BOOLEAN NOT NULL DEFAULT TRUE");

  await addColumnIfMissing("planning_cells", "record_version", "BIGINT NOT NULL DEFAULT 1");

  console.log("FP&A budget cycle polish migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
