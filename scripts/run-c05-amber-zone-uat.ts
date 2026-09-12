/**
 * C.05 Amber zone: ~51% achievement, deadline within ~2 calendar days → AMBER ZONE.
 * Requires: npm run db:migrate:performance-goal-risk-zone && npx prisma generate
 */
import { prisma } from "../src/utils/database";
import { PerformanceGoalService } from "../src/services/PerformanceGoalService";
import { resolveGoalEscalationStatus } from "../src/services/performanceScorecardSupport";

async function main() {
  const template = await prisma.performanceGoal.findFirst({
    where: { type: "department" }
  });
  if (!template) {
    throw new Error("No department goal found to use as template for C.05");
  }

  const targetVal = 100000;
  /** Just under 2 full days so ceil(daysRemaining) stays 2 */
  const endDate = new Date(Date.now() + 2 * 86400000 - 60_000);
  const actual = Math.round(targetVal * 0.51 * 100) / 100;

  const goal = await prisma.performanceGoal.create({
    data: {
      title: "C05 Amber Zone UAT (disposable)",
      description: "C.05 automated UAT",
      type: "department",
      scorecardPillar: template.scorecardPillar,
      departmentName: template.departmentName,
      parentGoalId: null,
      startDate: template.startDate,
      endDate,
      targetValue: targetVal,
      targetUnit: "USD",
      currentValue: actual,
      preciseCurrentValue: String(actual),
      progressPercentage: 51,
      targetOperator: ">=",
      isReverseKpi: false,
      createdById: template.createdById,
      status: "active",
      stage: "in_progress",
      kpiId: template.kpiId
    }
  });

  await PerformanceGoalService.refreshPerformanceRiskZoneOnGoal(goal.id);

  const row = await prisma.performanceGoal.findUnique({ where: { id: goal.id } });
  const expected = resolveGoalEscalationStatus({
    preciseCurrentValue: row!.preciseCurrentValue,
    currentValue: row!.currentValue,
    preciseTargetValue: row!.preciseTargetValue,
    targetValue: row!.targetValue,
    allowableVariance: row!.allowableVariance,
    isReverseKpi: row!.isReverseKpi,
    endDate: row!.endDate
  });

  const pass = row!.performanceRiskZone === "AMBER ZONE" && expected === "AMBER ZONE";

  console.log(
    JSON.stringify(
      {
        success: true,
        uat: "C.05",
        goalId: goal.id,
        setup: { target: targetVal, actual, approxProgressPct: (actual / targetVal) * 100, endDate: row!.endDate },
        observed: {
          performanceRiskZone: row!.performanceRiskZone,
          performanceRiskZoneAt: row!.performanceRiskZoneAt
        },
        expectedZone: expected,
        pass
      },
      null,
      2
    )
  );

  await prisma.performanceGoal.delete({ where: { id: goal.id } });
}

main()
  .catch((e) => {
    console.error("C05_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
