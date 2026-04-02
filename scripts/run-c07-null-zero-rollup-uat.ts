/**
 * C.07 Null / zero handling: parent roll-up when one child has 0 progress.
 * Creates a new company goal (no sub-goals), then two department children only
 * (no individual goals). One child at 0% achievement, one partial; parent roll-up must be finite.
 */
import { prisma } from "../src/utils/database";
import { PerformanceGoalService } from "../src/services/PerformanceGoalService";

function assertFinite(label: string, value: unknown): void {
  const n = typeof value === "object" && value != null && "toNumber" in value
    ? (value as { toNumber: () => number }).toNumber()
    : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`C.07 FAIL: ${label} is not finite (${String(value)})`);
  }
}

async function main() {
  const template = await prisma.performanceGoal.findFirst({
    where: { kpiId: { not: null } }
  });
  if (!template || !template.kpiId) {
    throw new Error("C.07: no goal with kpiId found to use as template");
  }

  const parentTarget = 1_000_000;
  const childTarget = 500_000;
  const titlePrefix = `C.07 zero-roll-up ${Date.now()}`;

  let parentId: string | undefined;
  const childIds: string[] = [];

  try {
    const parent = await prisma.performanceGoal.create({
      data: {
        title: `${titlePrefix} parent`,
        description: "C.07 disposable company goal (leaf at creation)",
        type: "company",
        category: template.category,
        parentGoalId: null,
        departmentName: null,
        startDate: template.startDate,
        endDate: template.endDate,
        targetValue: parentTarget,
        targetUnit: "USD",
        currentValue: 0,
        preciseCurrentValue: "0",
        progressPercentage: 0,
        targetOperator: ">=",
        isReverseKpi: false,
        createdById: template.createdById,
        status: "active",
        stage: "planning",
        kpiId: template.kpiId
      }
    });
    parentId = parent.id;

    const childZero = await prisma.performanceGoal.create({
      data: {
        title: `${titlePrefix} dept A (0 progress)`,
        description: "C.07 child with 0 current",
        type: "department",
        category: template.category,
        parentGoalId: parent.id,
        departmentName: "Finance",
        startDate: template.startDate,
        endDate: template.endDate,
        targetValue: childTarget,
        targetUnit: "USD",
        currentValue: 0,
        preciseCurrentValue: "0",
        progressPercentage: 0,
        targetOperator: ">=",
        isReverseKpi: false,
        createdById: template.createdById,
        status: "active",
        stage: "planning",
        kpiId: template.kpiId,
        activities: { contributionWeightPercent: 50 }
      }
    });
    childIds.push(childZero.id);

    const childPartial = await prisma.performanceGoal.create({
      data: {
        title: `${titlePrefix} dept B (50%)`,
        description: "C.07 child partial",
        type: "department",
        category: template.category,
        parentGoalId: parent.id,
        departmentName: "Sales",
        startDate: template.startDate,
        endDate: template.endDate,
        targetValue: childTarget,
        targetUnit: "USD",
        currentValue: 250_000,
        preciseCurrentValue: "250000",
        progressPercentage: 50,
        targetOperator: ">=",
        isReverseKpi: false,
        createdById: template.createdById,
        status: "active",
        stage: "in_progress",
        kpiId: template.kpiId,
        activities: { contributionWeightPercent: 50 }
      }
    });
    childIds.push(childPartial.id);

    await PerformanceGoalService.updateParentGoalProgress(parent.id);

    const updated = await prisma.performanceGoal.findUnique({
      where: { id: parent.id }
    });
    if (!updated) {
      throw new Error("C.07: parent missing after roll-up");
    }

    assertFinite("progressPercentage", updated.progressPercentage);
    assertFinite("currentValue", updated.currentValue);
    assertFinite("preciseCurrentValue", updated.preciseCurrentValue);

    const progressPct = Number(updated.progressPercentage);
    const expectedRollup = 25;
    const tol = 0.05;
    const rollupOk = Math.abs(progressPct - expectedRollup) <= tol;

    const pass = rollupOk && Number(updated.currentValue) >= 0;

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "C.07",
          goalIds: { parent: parent.id, childZero: childZero.id, childPartial: childPartial.id },
          expectedWeightedProgressPct: expectedRollup,
          observed: {
            progressPercentage: progressPct,
            currentValue: Number(updated.currentValue),
            preciseCurrentValue: String(updated.preciseCurrentValue)
          },
          pass
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("C.07 assertions failed");
    }
  } finally {
    for (const id of [...childIds].reverse()) {
      await prisma.performanceGoal.delete({ where: { id } }).catch(() => {});
    }
    if (parentId) {
      await prisma.performanceGoal.delete({ where: { id: parentId } }).catch(() => {});
    }
  }
}

main()
  .catch((e) => {
    console.error("C07_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
