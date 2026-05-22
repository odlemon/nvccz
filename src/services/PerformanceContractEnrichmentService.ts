// @ts-nocheck
import { prisma } from "../utils/database";
import { serializeDecimalsDeep } from "../utils/prismaDecimalJson";

const goalInclude = {
  kpi: {
    select: {
      id: true,
      name: true,
      code: true,
      unitCategory: true,
      unitSymbol: true,
      unitPosition: true,
      catalogDepartmentName: true,
    },
  },
  assignedTo: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
};

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapGoalRow(goal: any) {
  const target = toNum(goal.preciseTargetValue ?? goal.targetValue);
  const actual = toNum(goal.preciseCurrentValue ?? goal.currentValue);
  let progressPercentage = toNum(goal.progressPercentage);
  if (progressPercentage == null && target != null && target > 0 && actual != null) {
    progressPercentage = Math.min(100, (actual / target) * 100);
  }
  return {
    id: goal.id,
    title: goal.title,
    type: goal.type,
    status: goal.status,
    stage: goal.stage,
    departmentName: goal.departmentName,
    performanceContractId: goal.performanceContractId,
    scorecardPillar: goal.scorecardPillar,
    pillarId: goal.pillarId,
    scorecardWeight: toNum(goal.scorecardWeight),
    targetValue: target,
    targetUnit: goal.targetUnit,
    currentValue: actual,
    progressPercentage,
    isPendingApproval: Boolean(goal.isPendingApproval),
    isReverseKpi: Boolean(goal.isReverseKpi),
    dataSourceModule: goal.dataSourceModule,
    trackingFrequency: goal.trackingFrequency,
    kpi: goal.kpi
      ? {
          id: goal.kpi.id,
          name: goal.kpi.name,
          code: goal.kpi.code,
          unitCategory: goal.kpi.unitCategory,
          unitSymbol: goal.kpi.unitSymbol,
        }
      : null,
    assignedTo: goal.assignedTo ?? null,
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const arr = m.get(k) || [];
    arr.push(item);
    m.set(k, arr);
  }
  return m;
}

export class PerformanceContractEnrichmentService {
  /**
   * Attach `contractKpis` to each contract row returned by GET /performance/contracts.
   */
  static async enrichContractRows(contracts: any[]): Promise<any[]> {
    if (!contracts.length) return contracts;

    const contractIds = contracts.map((c) => c.id);

    const [linkedGoals, scorecards] = await Promise.all([
      prisma.performanceGoal.findMany({
        where: { performanceContractId: { in: contractIds } },
        include: goalInclude,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.performanceScorecard.findMany({
        where: { contractId: { in: contractIds } },
        select: {
          id: true,
          contractId: true,
          status: true,
          finalScore: true,
          scorecardType: true,
          periodLabel: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const goalsByContractId = groupBy(linkedGoals, (g) => g.performanceContractId);

    const deptContractsNeedingFallback = contracts.filter(
      (c) =>
        c.contractType === "DEPARTMENT" &&
        c.departmentName &&
        !(goalsByContractId.get(c.id)?.length)
    );

    const deptGoalsByContractId = new Map<string, any[]>();
    if (deptContractsNeedingFallback.length) {
      const deptGoals = await prisma.performanceGoal.findMany({
        where: {
          type: "department",
          OR: deptContractsNeedingFallback.map((c) => ({
            departmentName: c.departmentName,
            startDate: { lte: c.periodEnd },
            endDate: { gte: c.periodStart },
          })),
        },
        include: goalInclude,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      });

      for (const c of deptContractsNeedingFallback) {
        const matched = deptGoals.filter(
          (g) =>
            g.departmentName === c.departmentName &&
            g.startDate <= c.periodEnd &&
            g.endDate >= c.periodStart
        );
        if (matched.length) deptGoalsByContractId.set(c.id, matched);
      }
    }

    const latestScorecardByContractId = new Map<string, any>();
    for (const sc of scorecards) {
      if (!sc.contractId || latestScorecardByContractId.has(sc.contractId)) continue;
      latestScorecardByContractId.set(sc.contractId, sc);
    }

    return contracts.map((contract) => {
      const goals =
        goalsByContractId.get(contract.id) ||
        deptGoalsByContractId.get(contract.id) ||
        [];
      const goalRows = goals.map(mapGoalRow);
      const scorecard = latestScorecardByContractId.get(contract.id) ?? null;
      const metricsCount = goalRows.length;

      let contractKpisSummary: string | null = null;
      if (metricsCount === 0) {
        contractKpisSummary =
          "No KPIs are linked to this contract yet. Create performance goals with this contract id (or department goals for the same period).";
      } else if (!scorecard) {
        contractKpisSummary =
          "KPIs are defined. Generate the scorecard for this contract to compute section scores and ratings.";
      }

      return serializeDecimalsDeep({
        ...contract,
        contractKpis: {
          metricsCount,
          goalsCount: metricsCount,
          goals: goalRows,
          scorecard: scorecard
            ? {
                id: scorecard.id,
                status: scorecard.status,
                scorecardType: scorecard.scorecardType,
                periodLabel: scorecard.periodLabel,
                finalScore: toNum(scorecard.finalScore),
                updatedAt: scorecard.updatedAt,
              }
            : null,
          hasGeneratedScorecard: Boolean(scorecard),
          summary: contractKpisSummary,
        },
      });
    });
  }
}
