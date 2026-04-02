/**
 * C.10 Reverse KPI Logic
 * - Create a disposable "cost" goal (lower is better).
 * - Verify progress increases when actual decreases toward target.
 */
import { prisma } from "../src/utils/database";
import { computeGoalProgress } from "../src/services/performanceScorecardSupport";

async function main() {
  const template = await prisma.performanceGoal.findFirst({
    where: { departmentName: "Finance" }
  });
  if (!template) {
    throw new Error("C.10: no Finance goal found for template");
  }

  const target = 100;
  const startActual = 150;
  const improvedActual = 90;
  const title = `C.10 reverse KPI cost goal ${Date.now()}`;

  let goalId: string | undefined;
  try {
    const goal = await prisma.performanceGoal.create({
      data: {
        title,
        description: "C.10 disposable reverse KPI goal (lower cost is better)",
        type: "department",
        category: template.category,
        parentGoalId: null,
        departmentName: "Finance",
        startDate: template.startDate,
        endDate: template.endDate,
        targetValue: target,
        targetUnit: "USD",
        currentValue: startActual,
        preciseCurrentValue: String(startActual),
        targetOperator: "<=",
        isReverseKpi: true,
        createdById: template.createdById,
        status: "active",
        stage: "in_progress",
        kpiId: template.kpiId
      }
    });
    goalId = goal.id;

    const before = computeGoalProgress({
      actualValue: startActual,
      targetValue: target,
      isReverseKpi: true,
      stretchScoringEnabled: false
    }).progressPct;

    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: improvedActual,
        preciseCurrentValue: String(improvedActual),
        updatedAt: new Date()
      }
    });

    const after = computeGoalProgress({
      actualValue: improvedActual,
      targetValue: target,
      isReverseKpi: true,
      stretchScoringEnabled: false
    }).progressPct;

    const pass = before < after && after === 100;

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "C.10",
          goalId: goal.id,
          scenario: {
            reverse: true,
            target,
            actualBefore: startActual,
            actualAfter: improvedActual
          },
          observed: {
            progressBeforePct: before,
            progressAfterPct: after
          },
          pass
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("C.10 assertions failed");
    }
  } finally {
    if (goalId) {
      await prisma.performanceGoal.delete({ where: { id: goalId } }).catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error("C10_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

