/**
 * C.08 Multi-parent KPI roll-up: same KPI on two department goals under different company parents.
 * Sync by kpiId applies one payload to both goals and rolls up each parent.
 *
 * Template: an existing Finance department goal with a KPI (fiscal alignment).
 * A short-lived KPI clone keeps the UAT from updating every goal in the DB that shares the live KPI.
 */
import { prisma } from "../src/utils/database";
import { PerformanceIntegrationService } from "../src/services/PerformanceIntegrationService";

const MOCK_PATH = "/v1/internal/c08-kpi-sync-mock";
const FIELD_PATH = "value";

async function main() {
  const template = await prisma.performanceGoal.findFirst({
    where: {
      departmentName: "Finance",
      kpiId: { not: null }
    }
  });
  if (!template?.kpiId) {
    throw new Error("C.08: need at least one Finance performance goal with a KPI as template.");
  }

  const baseKpi = await prisma.kPI.findUnique({ where: { id: template.kpiId } });
  if (!baseKpi) {
    throw new Error("C.08: template KPI not found.");
  }

  const disposableKpi = await prisma.kPI.create({
    data: {
      name: `C.08 disposable ${Date.now()}`,
      type: baseKpi.type,
      departmentId: baseKpi.departmentId,
      weightValue: baseKpi.weightValue,
      hasUnit: baseKpi.hasUnit,
      unitCategory: baseKpi.unitCategory,
      unit: baseKpi.unit,
      unitSymbol: baseKpi.unitSymbol,
      unitPosition: baseKpi.unitPosition ?? undefined,
      isActive: true
    }
  });

  const actor = await prisma.user.findUnique({
    where: { id: template.createdById }
  });
  if (!actor) {
    throw new Error("C.08: template creator user missing.");
  }

  const kpiId = disposableKpi.id;
  const parentTarget = 800_000;
  const childTarget = 400_000;
  const syncedValue = 200_000;
  const prefix = `C.08 KPI multi-parent ${Date.now()}`;

  let parent1Id: string | undefined;
  let parent2Id: string | undefined;
  const disposableKpiId = disposableKpi.id;
  const childIds: string[] = [];

  try {
    const parent1 = await prisma.performanceGoal.create({
      data: {
        title: `${prefix} company A`,
        description: "C.08 disposable",
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
        kpiId: null
      }
    });
    parent1Id = parent1.id;

    const parent2 = await prisma.performanceGoal.create({
      data: {
        title: `${prefix} company B`,
        description: "C.08 disposable",
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
        kpiId: null
      }
    });
    parent2Id = parent2.id;

    const child1 = await prisma.performanceGoal.create({
      data: {
        title: `${prefix} Finance child A`,
        description: "C.08",
        type: "department",
        category: template.category,
        parentGoalId: parent1.id,
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
        requiresManagerApproval: false,
        formulaType: null,
        createdById: template.createdById,
        status: "active",
        stage: "planning",
        kpiId,
        syncEndpointPath: MOCK_PATH,
        syncConfig: { fieldPath: FIELD_PATH }
      }
    });
    childIds.push(child1.id);

    const child2 = await prisma.performanceGoal.create({
      data: {
        title: `${prefix} Finance child B`,
        description: "C.08",
        type: "department",
        category: template.category,
        parentGoalId: parent2.id,
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
        requiresManagerApproval: false,
        formulaType: null,
        createdById: template.createdById,
        status: "active",
        stage: "planning",
        kpiId,
        syncEndpointPath: MOCK_PATH,
        syncConfig: { fieldPath: FIELD_PATH }
      }
    });
    childIds.push(child2.id);

    const transport = async () => ({ value: syncedValue });

    await PerformanceIntegrationService.runManualSync({
      kpiId,
      endpointPath: MOCK_PATH,
      fieldPath: FIELD_PATH,
      actor,
      transport
    });

    const [c1, c2, p1, p2] = await Promise.all([
      prisma.performanceGoal.findUnique({ where: { id: child1.id } }),
      prisma.performanceGoal.findUnique({ where: { id: child2.id } }),
      prisma.performanceGoal.findUnique({ where: { id: parent1.id } }),
      prisma.performanceGoal.findUnique({ where: { id: parent2.id } })
    ]);

    const v1 = Number(c1!.currentValue);
    const v2 = Number(c2!.currentValue);
    const childrenOk =
      Number.isFinite(v1) &&
      Number.isFinite(v2) &&
      Math.abs(v1 - syncedValue) < 0.01 &&
      Math.abs(v2 - syncedValue) < 0.01;

    /** Single child each: child 50% achievement → parent weighted progress 50%; suggested current = 50% × 800k parent target */
    const expParentProgress = 50;
    const expParentCurrent = 400_000;
    const pp1 = Number(p1!.progressPercentage);
    const pp2 = Number(p2!.progressPercentage);
    const pc1 = Number(p1!.currentValue);
    const pc2 = Number(p2!.currentValue);

    const parentsOk =
      Number.isFinite(pp1) &&
      Number.isFinite(pp2) &&
      Math.abs(pp1 - expParentProgress) < 0.1 &&
      Math.abs(pp2 - expParentProgress) < 0.1 &&
      Number.isFinite(pc1) &&
      Number.isFinite(pc2) &&
      Math.abs(pc1 - expParentCurrent) < 1 &&
      Math.abs(pc2 - expParentCurrent) < 1;

    const pass = childrenOk && parentsOk;

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "C.08",
          kpiId,
          childGoalIds: childIds,
          parentGoalIds: [parent1.id, parent2.id],
          syncedValue,
          observed: {
            children: { a: v1, b: v2 },
            parents: {
              a: { progressPct: pp1, current: pc1 },
              b: { progressPct: pp2, current: pc2 }
            }
          },
          expected: { childValue: syncedValue, parentProgressPct: expParentProgress, parentCurrent: expParentCurrent },
          pass
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("C.08 assertions failed");
    }
  } finally {
    for (const id of [...childIds].reverse()) {
      await prisma.performanceGoal.delete({ where: { id } }).catch(() => {});
    }
    if (parent2Id) {
      await prisma.performanceGoal.delete({ where: { id: parent2Id } }).catch(() => {});
    }
    if (parent1Id) {
      await prisma.performanceGoal.delete({ where: { id: parent1Id } }).catch(() => {});
    }
    await prisma.kPI.delete({ where: { id: disposableKpiId } }).catch(() => {});
  }
}

main()
  .catch((e) => {
    console.error("C08_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
