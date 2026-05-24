// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { BudgetManagementService } from "./BudgetManagementService";
import { resolveSalariesAndWagesExpenseAccount } from "./payrollGlAccountResolver";

const SALARY_CATEGORIES = new Set([
  "salary",
  "salaries",
  "payroll",
  "wages",
  "staff_cost",
  "personnel"
]);

/**
 * Keeps accounting budget salary line actuals in sync with completed payroll runs
 * (gross pay summed over the active budget period).
 */
export class BudgetPayrollSyncService {
  private static async findBudgetForPayrollPeriod(
    periodStart: Date,
    periodEnd: Date
  ) {
    const overlapWhere = {
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart }
    };
    const active = await prisma.budget.findMany({
      where: { ...overlapWhere, isActive: true },
      include: { budgetItems: true },
      orderBy: { startDate: "desc" },
      take: 1
    });
    if (active[0]) return active[0];
    const any = await prisma.budget.findMany({
      where: overlapWhere,
      include: { budgetItems: true },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      take: 1
    });
    return any[0] ?? null;
  }

  private static isSalaryBudgetItem(
    item: { category: string; accountCode?: string | null },
    payrollAccountNo: string
  ): boolean {
    const cat = (item.category || "").toLowerCase().replace(/\s+/g, "_");
    if (SALARY_CATEGORIES.has(cat)) return true;
    if (
      item.accountCode &&
      String(item.accountCode).trim() === payrollAccountNo.trim()
    ) {
      return true;
    }
    return false;
  }

  private static async sumCompletedPayrollGrossInRange(
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<number> {
    const runs = await prisma.payrollRun.findMany({
      where: {
        status: "COMPLETED",
        endDate: { gte: rangeStart, lte: rangeEnd }
      },
      select: { totalGrossPay: true }
    });
    return runs.reduce((sum, r) => sum + Number(r.totalGrossPay ?? 0), 0);
  }

  /**
   * After payroll is posted, update (or create) salary budget line and set actual = sum of
   * completed payroll gross in the overlapping active budget period.
   */
  static async syncPayrollRunToBudget(
    payrollRunId: string,
    createdById: string
  ): Promise<{
    synced: boolean;
    budgetId?: string;
    budgetItemId?: string;
    actualAmount?: number;
    message?: string;
  }> {
    try {
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          totalGrossPay: true
        }
      });

      if (!payrollRun || payrollRun.status !== "COMPLETED") {
        return {
          synced: false,
          message: "Payroll run not completed; budget sync skipped"
        };
      }

      const budget = await this.findBudgetForPayrollPeriod(
        payrollRun.startDate,
        payrollRun.endDate
      );
      if (!budget) {
        return {
          synced: false,
          message: "No active accounting budget overlaps this payroll period"
        };
      }

      const payrollAccount = await resolveSalariesAndWagesExpenseAccount();
      const payrollGrossTotal = await this.sumCompletedPayrollGrossInRange(
        budget.startDate,
        budget.endDate
      );

      let salaryItem = budget.budgetItems.find((item) =>
        this.isSalaryBudgetItem(item, payrollAccount.accountNo)
      );

      if (!salaryItem) {
        salaryItem = await BudgetManagementService.createBudgetItem(
          budget.id,
          {
            category: "salary",
            description: "Salaries and Wages (Payroll)",
            accountCode: payrollAccount.accountNo,
            budgetedAmount: 0
          },
          createdById
        );
        console.log(
          `[BudgetPayrollSync] Created salary budget line on "${budget.name}" (${budget.id})`
        );
      }

      const roundedActual = Math.round(payrollGrossTotal * 100) / 100;
      await BudgetManagementService.updateBudgetItem(salaryItem.id, {
        actualAmount: roundedActual,
        varianceExplanation: `Updated from completed payroll runs through ${payrollRun.name} (${payrollRun.id})`
      });

      console.log(
        `[BudgetPayrollSync] Budget "${budget.name}" salary actual = ${roundedActual} (gross pay, ${payrollAccount.accountNo})`
      );

      return {
        synced: true,
        budgetId: budget.id,
        budgetItemId: salaryItem.id,
        actualAmount: roundedActual
      };
    } catch (error: any) {
      console.error("[BudgetPayrollSync] Failed:", error?.message || error);
      return {
        synced: false,
        message: error?.message || "Budget payroll sync failed"
      };
    }
  }

  /** Backfill: recalc salary actuals once per distinct active/overlapping budget. */
  static async syncAllCompletedPayrollToBudgets(): Promise<{
    processed: number;
    synced: number;
    budgetsUpdated: string[];
    results: Array<{ payrollRunId: string; synced: boolean; message?: string }>;
  }> {
    const runs = await prisma.payrollRun.findMany({
      where: { status: "COMPLETED" },
      select: { id: true, createdById: true, endDate: true },
      orderBy: { endDate: "desc" }
    });
    const budgetsUpdated = new Set<string>();
    const results: Array<{
      payrollRunId: string;
      synced: boolean;
      message?: string;
    }> = [];
    let synced = 0;

    for (const run of runs) {
      const r = await this.syncPayrollRunToBudget(run.id, run.createdById);
      results.push({
        payrollRunId: run.id,
        synced: r.synced,
        message: r.message
      });
      if (r.synced && r.budgetId) {
        if (!budgetsUpdated.has(r.budgetId)) {
          budgetsUpdated.add(r.budgetId);
          synced++;
        }
      }
    }

    for (const budgetId of budgetsUpdated) {
      await BudgetManagementService.updateBudgetTotals(budgetId);
    }

    return {
      processed: runs.length,
      synced,
      budgetsUpdated: [...budgetsUpdated],
      results
    };
  }
}
