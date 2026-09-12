/**
 * Idempotent (MySQL):
 * 1) ADD kpis.scorecard_pillar (nullable VARCHAR) if missing
 * 2) Backfill all KPIs using inferKpiScorecardPillar
 * 3) DROP performance_goals.category if present (replaced by scorecardPillar on goals + KPI tagging)
 *
 * Run: npx ts-node scripts/run-kpi-scorecard-pillar-migration.ts
 * Then: npx prisma generate
 *
 * Re-run: step 1–2 are safe; step 3 skips if column already dropped.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { inferKpiScorecardPillar } from "../src/utils/inferKpiScorecardPillar";

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
  const kpiPillar = await columnExists("kpis", "scorecard_pillar");
  if (!kpiPillar) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`kpis\`
      ADD COLUMN \`scorecard_pillar\` VARCHAR(64) NULL
        COMMENT 'BSC org pillar: Financial | Customer & Market | Internal Operations | Learning, Growth & HR' AFTER \`is_financial\`
    `);
    console.log("[ok] Added kpis.scorecard_pillar");
  } else {
    console.log("[skip] kpis.scorecard_pillar already exists");
  }

  // Backfill (always refresh pillar from current KPI fields; idempotent)
  const kpis = await prisma.kPI.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      catalogDescription: true,
      accountType: true,
      catalogDepartmentName: true,
      isFinancial: true,
      unitCategory: true
    }
  });

  let updated = 0;
  for (const k of kpis) {
    const pillar = inferKpiScorecardPillar({
      name: k.name,
      code: k.code,
      catalogDescription: k.catalogDescription,
      accountType: k.accountType,
      catalogDepartmentName: k.catalogDepartmentName,
      isFinancial: k.isFinancial,
      unitCategory: k.unitCategory
    });
    await prisma.kPI.update({
      where: { id: k.id },
      data: { scorecardPillar: pillar }
    });
    updated += 1;
  }

  console.log(`[ok] Set scorecardPillar for ${updated} KPI row(s).`);

  const goalCat = await columnExists("performance_goals", "category");
  if (!goalCat) {
    console.log("[skip] performance_goals.category already dropped");
  } else {
    await prisma.$executeRawUnsafe("ALTER TABLE `performance_goals` DROP COLUMN `category`");
    console.log("[ok] Dropped performance_goals.category");
  }

  console.log("\nNext: npx prisma generate (schema must include KPI.scorecardPillar; PerformanceGoal has no category).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
