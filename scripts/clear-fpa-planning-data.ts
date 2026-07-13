/**
 * Wipe all FP&A planning_* tables for the current DATABASE_URL.
 * Does NOT touch users, departments, funds, COA.
 *
 * Run: npm run db:clear:fpa
 * Safety: refuses client1_db unless ALLOW_CLIENT1_FPA_WIPE=1
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Leaf → hub order (safe even if FKs appear later). */
const PLANNING_TABLES = [
  "planning_formula_dependencies",
  "planning_line_item_mappings",
  "planning_source_fields",
  "planning_data_sources",
  "planning_approvals",
  "planning_attachments",
  "planning_comments",
  "planning_budget_cycle_owners",
  "planning_tasks",
  "planning_budget_cycles",
  "planning_workflows",
  "planning_variance_results",
  "planning_actuals_snapshots",
  "planning_cells",
  "planning_drivers",
  "planning_formulas",
  "planning_locks",
  "planning_ai_forecasts",
  "planning_import_jobs",
  "planning_export_jobs",
  "planning_audit_logs",
  "planning_line_items",
  "planning_modules",
  "planning_model_dimension_members",
  "planning_model_dimensions",
  "planning_model_entities",
  "planning_model_departments",
  "planning_model_accounts",
  "planning_versions",
  "planning_scenarios",
  "planning_models",
  "planning_dimension_members",
  "planning_dimensions",
];

function assertSafeDatabaseUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("client1_db") && process.env.ALLOW_CLIENT1_FPA_WIPE !== "1") {
    throw new Error(
      "Refusing to wipe client1_db. Set ALLOW_CLIENT1_FPA_WIPE=1 only if intentional."
    );
  }
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!url) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseUrl(url);

  const dbName = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]
    ?.d;
  console.log(`[clear-fpa] database=${dbName}`);

  await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=0`);

  let wiped = 0;
  for (const table of PLANNING_TABLES) {
    if (!(await tableExists(table))) {
      console.log(`[skip] missing ${table}`);
      continue;
    }
    const before = await countRows(table);
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    console.log(`[ok] ${table}: ${before} → 0`);
    wiped += before;
  }

  await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=1`);
  console.log(`[clear-fpa] done. rows deleted≈${wiped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
