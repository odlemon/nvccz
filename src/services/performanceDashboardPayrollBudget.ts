// @ts-nocheck
import { prisma } from "../utils/database";
import { PerformanceGoalService } from "./PerformanceGoalService";

export const PAYROLL_BUDGET_LINE_NAME = "Salaries and Wages (Payroll)";

export type PayrollBudgetSlice = {
  name: string;
  budgeted: number;
  actual: number;
};

/** Same overlap rule as PerformanceGoalService.syncPayrollToGoals (pay period vs dashboard window). */
export async function sumCompletedPayrollGrossOverlappingPeriod(
  windowStart: Date,
  windowEnd: Date
): Promise<number> {
  const payrollRuns = await prisma.payrollRun.findMany({
    where: {
      status: "COMPLETED",
      startDate: { lte: windowEnd },
      endDate: { gte: windowStart },
    },
    select: { id: true, totalGrossPay: true },
  });

  let actual = 0;
  for (const run of payrollRuns) {
    if (run.totalGrossPay != null) {
      actual += parseFloat(String(run.totalGrossPay));
    }
  }
  return Math.round(actual * 100) / 100;
}

/** Sum Payroll Expense KPI goal targets whose date range overlaps the dashboard window. */
export async function sumPayrollGoalTargetsOverlappingPeriod(
  windowStart: Date,
  windowEnd: Date
): Promise<number> {
  const payrollKpi = await PerformanceGoalService.resolvePayrollExpenseKpiForSync();
  if (!payrollKpi) {
    return 0;
  }

  const goals = await prisma.performanceGoal.findMany({
    where: {
      OR: [{ kpiId: payrollKpi.id }, { formulaType: "PAYROLL_EXPENSE" }],
      startDate: { lte: windowEnd },
      endDate: { gte: windowStart },
      status: { notIn: ["cancelled", "archived", "deleted"] },
    },
    select: {
      targetValue: true,
      preciseTargetValue: true,
    },
  });

  let budgeted = 0;
  for (const goal of goals) {
    const raw =
      goal.preciseTargetValue != null && String(goal.preciseTargetValue).trim() !== ""
        ? goal.preciseTargetValue
        : goal.targetValue;
    const n = raw != null ? parseFloat(String(raw)) : 0;
    if (Number.isFinite(n) && n > 0) {
      budgeted += n;
    }
  }
  return Math.round(budgeted * 100) / 100;
}

/**
 * Budget tracker payroll line: budgeted = sum of goal targets (Payroll Expense KPI);
 * actual = sum of completed payroll run **gross** pay (never GL). Matches goals module.
 * Note: Payroll dashboard headline total uses **net pay** and `updatedAt` filters — different metric.
 */
export async function getPayrollExpenseBudgetSliceForPeriod(
  windowStart: Date,
  windowEnd: Date
): Promise<PayrollBudgetSlice | null> {
  const [budgeted, actual] = await Promise.all([
    sumPayrollGoalTargetsOverlappingPeriod(windowStart, windowEnd),
    sumCompletedPayrollGrossOverlappingPeriod(windowStart, windowEnd),
  ]);

  if (budgeted <= 0 && actual <= 0) {
    return null;
  }

  return {
    name: PAYROLL_BUDGET_LINE_NAME,
    budgeted,
    actual,
  };
}

/** True when a posted journal entry is the canonical gross-pay accrual from PayrollService. */
export function isCanonicalPayrollGrossJournal(je: {
  referenceNumber?: string | null;
  description?: string | null;
}): boolean {
  const ref = String(je.referenceNumber || "");
  const desc = String(je.description || "");
  return (
    ref.startsWith("PAYROLL-") && desc.startsWith("Payroll Journal - Gross Pay:")
  );
}

export function isPayrollBudgetCategoryItem(item: {
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  accountCode?: string | null;
}): boolean {
  const cat = (item.category || "").toLowerCase().replace(/\s+/g, "_");
  const desc = (item.description || "").toLowerCase();
  if (["salary", "salaries", "payroll", "wages", "staff_cost", "personnel"].includes(cat)) {
    return true;
  }
  return (
    desc.includes("payroll") ||
    desc.includes("salaries") ||
    desc.includes("wages") ||
    desc.includes("staff cost")
  );
}

export function isPayrollGlExpenseAccount(account: {
  accountNo?: string | null;
  accountName?: string | null;
}): boolean {
  const no = String(account.accountNo || "").trim();
  if (no === "5010" || no === "5030") {
    return true;
  }
  const name = (account.accountName || "").toLowerCase();
  return (
    name.includes("payroll") ||
    name.includes("salaries") ||
    name.includes("wages") ||
    (name.includes("gross") && name.includes("pay"))
  );
}
