import { prisma } from "../src/utils/database";
import { PerformanceGoalService } from "../src/services/PerformanceGoalService";

async function main() {
  const baseId = "cmnee5j090001un5gud5rlh16";
  const base = await prisma.performanceGoal.findUnique({
    where: { id: baseId }
  });
  if (!base) throw new Error("Base goal not found");
  if (!base.parentGoalId) throw new Error("Base goal has no parentGoalId");

  const userId = base.createdById;

  // Ensure we have exactly 3 siblings for C.03 validation.
  const existingSiblings = await prisma.performanceGoal.findMany({
    where: { parentGoalId: base.parentGoalId, type: "department" },
    orderBy: { createdAt: "asc" }
  });

  let c03Siblings = existingSiblings.filter(
    (g) => g.title.includes("C03 UAT Dept")
  );

  while (c03Siblings.length < 2) {
    const idx = c03Siblings.length + 2;
    const created = await prisma.performanceGoal.create({
      data: {
        title: `C03 UAT Dept ${idx}`,
        description: "C.03 weighted math validation sibling",
        type: "department",
        scorecardPillar: base.scorecardPillar,
        parentGoalId: base.parentGoalId,
        priority: base.priority,
        startDate: base.startDate,
        endDate: base.endDate,
        targetValue: base.targetValue,
        targetUnit: base.targetUnit,
        targetOperator: base.targetOperator,
        isReverseKpi: base.isReverseKpi,
        createdById: base.createdById,
        kpiId: base.kpiId
      }
    });
    c03Siblings.push(created);
  }

  const childA = baseId;
  const childB = c03Siblings[0].id;
  const childC = c03Siblings[1].id;

  // Set deterministic baseline.
  await PerformanceGoalService.updatePerformanceGoal(childA, { currentValue: 0, contributionWeightPercent: 10 });
  await PerformanceGoalService.updatePerformanceGoal(childB, { currentValue: 0, contributionWeightPercent: 20 });
  await PerformanceGoalService.updatePerformanceGoal(childC, { currentValue: 0, contributionWeightPercent: 70 });

  // Apply progress increments -> achievements 10%, 20%, 70%.
  const t = Number(base.targetValue || 0);
  await PerformanceGoalService.updateGoalProgress(childA, t * 0.1, userId);
  await PerformanceGoalService.updateGoalProgress(childB, t * 0.2, userId);
  await PerformanceGoalService.updateGoalProgress(childC, t * 0.7, userId);

  // Parent rollup is async after child updates; force final recompute for deterministic UAT.
  await PerformanceGoalService.updateParentGoalProgress(base.parentGoalId);

  const parent = await prisma.performanceGoal.findUnique({
    where: { id: base.parentGoalId },
    select: { id: true, title: true, progressPercentage: true, currentValue: true, targetValue: true, updatedAt: true }
  });

  const children = await prisma.performanceGoal.findMany({
    where: { id: { in: [childA, childB, childC] } },
    select: { id: true, title: true, currentValue: true, targetValue: true, progressPercentage: true, activities: true },
    orderBy: { createdAt: "asc" }
  });

  const expectedParentPct = 10 * 0.1 + 20 * 0.2 + 70 * 0.7; // 54
  const expectedParentCurrent = (Number(parent?.targetValue || 0) * expectedParentPct) / 100;
  const observedParentPct = Number(parent?.progressPercentage || 0);
  const observedParentCurrent = Number(parent?.currentValue || 0);
  const pass =
    Math.abs(observedParentPct - expectedParentPct) < 0.0001 &&
    Math.abs(observedParentCurrent - expectedParentCurrent) < 0.0001;

  console.log(
    JSON.stringify(
      {
        success: true,
        uat: "C.03",
        setup: {
          parentGoalId: base.parentGoalId,
          childIds: { childA, childB, childC },
          targetPerChild: t,
          weights: [10, 20, 70],
          achievedPercents: [10, 20, 70]
        },
        observed: {
          parent,
          children
        },
        expected: {
          parentProgressPercentage: expectedParentPct,
          parentCurrentValue: expectedParentCurrent
        },
        pass
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("C03_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

