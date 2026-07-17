/**
 * Model Planning: materialVariancePct on model_planning_cycles (Stage 3 / Stage 5 gate).
 * Idempotent. Run: npm run db:migrate:model-planning-material-variance
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

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[model-planning-material-variance] database=${db}`);

  const table = "model_planning_cycles";
  if (!(await tableExists(table))) {
    console.log(`[skip] ${table} missing — run db:migrate:model-planning-cycle first`);
    return;
  }
  if (await columnExists(table, "material_variance_pct")) {
    console.log(`[skip] ${table}.material_variance_pct already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD COLUMN \`material_variance_pct\` DECIMAL(8,4) NOT NULL DEFAULT 5.0000 AFTER \`planning_horizon\``
  );
  console.log(`[ok] Added ${table}.material_variance_pct DEFAULT 5`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
