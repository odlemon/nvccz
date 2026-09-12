/**
 * One-off: compare VC CAC snapshots, goals, and expected spend/customers.
 * Run: npx ts-node --transpile-only scripts/verify-vc-cac-kpi-state.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { VcCacSyncService, VC_CAC_KPI_CODE, getVcCacMarketingCategoryNames } from "../src/services/VcCacSyncService";
import { computeKpiLineProgressPercent, parseGoalCurrentAndTarget } from "../src/services/performanceGoalRollupUtils";
import { PerformanceAnalyticsService } from "../src/services/PerformanceAnalyticsService";

function expenseToUsd(
  totalAmount: Decimal,
  code: string,
  usdZwg: Decimal | null
): number {
  const t = Number(totalAmount);
  if (!Number.isFinite(t)) return 0;
  const c = String(code || "").toUpperCase();
  if (c === "USD") return t;
  if ((c === "ZWG" || c === "ZWL" || c === "ZIG") && usdZwg != null) {
    const r = Number(usdZwg);
    if (Number.isFinite(r) && r > 0) return t / r;
  }
  return t;
}

async function main() {
  const nameSet = new Set(getVcCacMarketingCategoryNames().map((n) => n.toLowerCase()));
  const categories = await prisma.expenseCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  });
  const marketingCategoryIds = categories
    .filter((c) => nameSet.has(String(c.name).trim().toLowerCase()))
    .map((c) => c.id);

  const currencies = await prisma.currency.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const ccy = new Map(currencies.map((c) => [c.id, c.code]));

  const expenses = marketingCategoryIds.length
    ? await prisma.expense.findMany({
        where: {
          status: "POSTED",
          isActive: true,
          categoryId: { in: marketingCategoryIds }
        },
        select: {
          id: true,
          totalAmount: true,
          usdZwgRateSnapshot: true,
          currencyId: true,
          description: true,
          category: { select: { name: true } }
        }
      })
    : [];

  let spendUsd = 0;
  for (const e of expenses) {
    const code = ccy.get(e.currencyId) ?? "USD";
    spendUsd += expenseToUsd(e.totalAmount, code, e.usdZwgRateSnapshot);
  }

  const customerCount = await prisma.customer.count({ where: { isActive: true } });
  const expectedCac = customerCount > 0 ? spendUsd / customerCount : null;
  const expectedCacStr = expectedCac != null ? (Math.round(expectedCac * 1e6) / 1e6).toFixed(6) : "n/a";

  const [snapCac, snapNum, snapDen] = await Promise.all([
    prisma.performanceMetricSnapshot.findUnique({ where: { code: "VC_CAC" } }),
    prisma.performanceMetricSnapshot.findUnique({ where: { code: "VC_CAC_NUMERATOR_USD" } }),
    prisma.performanceMetricSnapshot.findUnique({ where: { code: "VC_CAC_CUSTOMER_COUNT" } })
  ]);

  const cacGoals = await prisma.performanceGoal.findMany({
    where: {
      OR: [
        { kpi: { code: VC_CAC_KPI_CODE } },
        { formulaType: "VC_CAC" as const }
      ]
    },
    include: { kpi: { select: { id: true, name: true, code: true, isReverseKpi: true } } },
    orderBy: { updatedAt: "desc" }
  });

  const kpiRow = await prisma.kPI.findUnique({
    where: { code: VC_CAC_KPI_CODE },
    select: { id: true, name: true, isReverseKpi: true }
  });

  // Same aggregation path as GET /api/performance/analytics/kpi?kpiId=...
  const analysisAll = kpiRow
    ? await PerformanceAnalyticsService.getKPIAnalysis(kpiRow.id, undefined, undefined, undefined)
    : await PerformanceAnalyticsService.getKPIAnalysis(undefined, undefined, undefined, undefined);
  const cacKpiAnalytic = analysisAll.kpiAnalytics?.find(
    (a: { kpi?: { name?: string; id?: string } }) =>
      a.kpi?.id === kpiRow?.id || a.kpi?.name === "Customer Acquisition Cost"
  );

  console.log("=== Raw inputs (recomputed) ===");
  console.log(
    JSON.stringify(
      {
        marketingCategoryNamesMatched: categories.filter((c) => nameSet.has(c.name.toLowerCase())).map((c) => c.name),
        postedMarketingExpenseLines: expenses.length,
        sumMarketingSpendUsd: spendUsd,
        activeCustomerCount: customerCount,
        expectedCacUsd: expectedCac,
        expectedCacPrecise6: expectedCacStr
      },
      null,
      2
    )
  );

  console.log("\n=== performance_metric_snapshots (stored) ===");
  console.log(
    JSON.stringify(
      {
        VC_CAC: snapCac ? { value: snapCac.value, computedAt: snapCac.computedAt, source: snapCac.source } : null,
        VC_CAC_NUMERATOR_USD: snapNum ? { value: snapNum.value, computedAt: snapNum.computedAt } : null,
        VC_CAC_CUSTOMER_COUNT: snapDen ? { value: snapDen.value, computedAt: snapDen.computedAt } : null
      },
      null,
      2
    )
  );

  const numOk = snapNum && Math.abs(parseFloat(snapNum.value) - spendUsd) < 0.02;
  const denOk = snapDen && Math.abs(parseFloat(snapDen.value) - customerCount) < 0.0001;
  const cacVal = snapCac ? parseFloat(snapCac.value) : NaN;
  const cacOk =
    expectedCac != null &&
    Number.isFinite(cacVal) &&
    Math.abs(cacVal - expectedCac) < Math.max(0.01, expectedCac * 1e-6);
  console.log("\n=== Snapshot vs recomputed (should match) ===");
  console.log(
    JSON.stringify(
      {
        numeratorMatch: numOk,
        customerCountMatch: denOk,
        cacMatch: cacOk
      },
      null,
      2
    )
  );

  console.log("\n=== VC CAC performance_goals (stored) ===");
  for (const g of cacGoals) {
    const { current, target } = parseGoalCurrentAndTarget(g);
    const linePct = computeKpiLineProgressPercent([g], g.kpi);
    console.log(
      JSON.stringify(
        {
          id: g.id,
          title: g.title,
          kpi: g.kpi?.code,
          targetValue: g.targetValue,
          targetOperator: g.targetOperator,
          isReverseKpi: g.isReverseKpi,
          currentValue: g.currentValue,
          preciseCurrentValue: g.preciseCurrentValue,
          progressPercentage: g.progressPercentage,
          parseGoalCurrentAndTarget: { current, target },
          computeKpiLineProgressPercentSingleGoal: linePct
        },
        null,
        2
      )
    );
  }

  console.log("\n=== GET /api/performance/analytics/kpi (Customer Acquisition Cost row) ===");
  if (cacKpiAnalytic) {
    console.log(
      JSON.stringify(
        {
          kpi: cacKpiAnalytic.kpi,
          totalGoals: cacKpiAnalytic.totalGoals,
          totalTargetValue: cacKpiAnalytic.totalTargetValue,
          totalCurrentValue: cacKpiAnalytic.totalCurrentValue,
          sourceCurrentValue: cacKpiAnalytic.sourceCurrentValue,
          progressPercentage: cacKpiAnalytic.progressPercentage,
          completionRate: cacKpiAnalytic.completionRate,
          goalStages: {
            completedGoals: cacKpiAnalytic.completedGoals,
            inProgressGoals: cacKpiAnalytic.inProgressGoals,
            notStartedGoals: cacKpiAnalytic.notStartedGoals
          }
        },
        null,
        2
      )
    );
  } else {
    console.log("No KPI group found for code VC_CUSTOMER_ACQUISITION_COST (no goals for that kpiId?).");
  }

  const sumGoalCurrents = cacGoals.reduce((s, g) => {
    const { current } = parseGoalCurrentAndTarget(g);
    return s + current;
  }, 0);
  const analyticsMatchesGoals =
    cacKpiAnalytic &&
    Math.abs(Number(cacKpiAnalytic.totalCurrentValue) - sumGoalCurrents) < 0.02;
  console.log("\n=== Analytics totalCurrentValue vs sum(goal currents) ===");
  console.log(
    JSON.stringify(
      { sumOfGoalCurrents: sumGoalCurrents, analyticsTotalCurrent: cacKpiAnalytic?.totalCurrentValue, match: analyticsMatchesGoals },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
