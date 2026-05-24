/**
 * Push posted GL revenue / net profit onto company-level financial KPI goals.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/sync-financial-goals-from-gl.ts
 * Optional env: PERIOD_START=2026-05-01 PERIOD_END=2026-05-31 KPI_CODES=TOTAL_REVENUE,NET_PROFIT
 */
import { prisma } from "../src/utils/database";
import { PerformanceGoalService } from "../src/services/PerformanceGoalService";

async function main() {
  const periodStart = new Date(
    process.env.PERIOD_START ? `${process.env.PERIOD_START}T00:00:00.000Z` : "2026-05-01T00:00:00.000Z"
  );
  const periodEnd = new Date(
    process.env.PERIOD_END ? `${process.env.PERIOD_END}T23:59:59.999Z` : "2026-05-31T23:59:59.999Z"
  );
  const kpiCodes = process.env.KPI_CODES
    ? process.env.KPI_CODES.split(",").map((c) => c.trim()).filter(Boolean)
    : undefined;

  const actorId =
    (await prisma.user.findFirst({ select: { id: true } }))?.id ?? "";

  if (!actorId) {
    throw new Error("No user found for actorId");
  }

  console.log(
    `🔄 Syncing financial goals from GL ${periodStart.toISOString().slice(0, 10)} .. ${periodEnd.toISOString().slice(0, 10)}`
  );

  await PerformanceGoalService.refreshFinancialGoalsFromGl({
    periodStart,
    periodEnd,
    kpiCodes,
    createdById: actorId
  });

  console.log("✅ Done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
