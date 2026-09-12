/**
 * Stage 4: scenario parent_scenario_id + driver confidence / spreading_method.
 * Idempotent. Run: npm run db:migrate:fpa-scenario-stage4
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
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[fpa-scenario-stage4] database=${db}`);

  if (!(await columnExists("planning_scenarios", "parent_scenario_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`planning_scenarios\` ADD COLUMN \`parent_scenario_id\` VARCHAR(191) NULL AFTER \`status\``
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`planning_scenarios_parent_idx\` ON \`planning_scenarios\` (\`parent_scenario_id\`)`
    );
    console.log(`[ok] planning_scenarios.parent_scenario_id`);
  } else {
    console.log(`[skip] planning_scenarios.parent_scenario_id`);
  }

  if (!(await columnExists("planning_drivers", "confidence"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`planning_drivers\` ADD COLUMN \`confidence\` VARCHAR(16) NULL AFTER \`requires_approval\``
    );
    console.log(`[ok] planning_drivers.confidence`);
  } else {
    console.log(`[skip] planning_drivers.confidence`);
  }

  if (!(await columnExists("planning_drivers", "spreading_method"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`planning_drivers\` ADD COLUMN \`spreading_method\` VARCHAR(32) NULL AFTER \`confidence\``
    );
    console.log(`[ok] planning_drivers.spreading_method`);
  } else {
    console.log(`[skip] planning_drivers.spreading_method`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
