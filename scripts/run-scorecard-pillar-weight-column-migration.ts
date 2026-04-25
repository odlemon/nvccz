/**
 * Add scorecard_pillars.weight and backfill from the latest ACTIVE strategy's pillar_weights JSON.
 * Idempotent: skips if column exists.
 */
import { PrismaClient } from "@prisma/client";
import { HARD_CODED_BSC_PILLARS, asNumber } from "../src/services/performanceBackendSupport";
import { ORG_BSC_CANONICAL_TO_PILLAR_ID } from "../src/services/performanceScorecardSupport";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    table,
    column
  );
  return rows.length > 0;
}

async function main() {
  console.log("[scorecard-pillar-weights] starting");

  if (!(await columnExists("scorecard_pillars", "weight"))) {
    await prisma.$executeRawUnsafe(`
ALTER TABLE \`scorecard_pillars\`
  ADD COLUMN \`weight\` DECIMAL(5,2) NULL
  AFTER \`description\`
    `);
    console.log("[ok] added scorecard_pillars.weight");
  } else {
    console.log("[skip] scorecard_pillars.weight already exists");
  }

  const strategy = await prisma.performanceStrategy.findFirst({
    where: { status: "ACTIVE", archivedAt: null },
    orderBy: { periodStart: "desc" },
  });
  const j = (strategy?.pillarWeights as Record<string, number> | null) || {};

  for (const name of HARD_CODED_BSC_PILLARS) {
    const id = ORG_BSC_CANONICAL_TO_PILLAR_ID[name];
    if (!id) continue;
    const w = asNumber(j[name], 25);
    await prisma.scorecardPillar.update({
      where: { id },
      data: { weight: w } as any,
    }).catch(() => {});
  }
  console.log("[ok] backfilled pillar weights from active strategy (or 25% default)");
  console.log("[scorecard-pillar-weights] done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
