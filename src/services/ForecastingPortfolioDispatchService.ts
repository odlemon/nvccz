// @ts-nocheck
import { prisma } from "../utils/database";
import { buildCellNaturalKeyHash, normalizeCellDimension } from "../utils/forecastCellKey";
import { ForecastingComputeService } from "./ForecastingComputeService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingFxService } from "./ForecastingFxService";
import { ForecastingVarianceService } from "./ForecastingVarianceService";
import { periodKeyToBounds } from "../utils/forecastPeriodUtils";

export class ForecastingPortfolioDispatchService {
  static async dispatchFromAcceptedReport(report: {
    id?: string;
    portfolioCompanyId: string;
    fundId?: string | null;
    reportingPeriod?: Date | string | null;
    periodEnd?: Date | string | null;
    totalRevenue?: number | null;
    netProfit?: number | null;
    parsedSnapshot?: any;
  }) {
    const scenarios = await prisma.forecastScenario.findMany({
      where: {
        status: "ACTIVE",
        entityId: report.portfolioCompanyId
      }
    });
    if (!scenarios.length) return { dispatched: 0 };

    const periodDate = report.reportingPeriod || report.periodEnd || new Date();
    const d = periodDate instanceof Date ? periodDate : new Date(periodDate);
    const periodKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

    const revenue = Number(report.totalRevenue ?? report.parsedSnapshot?.totalRevenue ?? 0);
    const netProfit = Number(report.netProfit ?? report.parsedSnapshot?.netProfit ?? 0);

    let dispatched = 0;
    for (const scenario of scenarios) {
      const accounts = await prisma.chartOfAccounts.findMany({
        where: { isActive: true, accountType: { in: ["Revenue", "Income", "Expense"] } },
        select: { id: true, accountType: true, accountNo: true }
      });
      const revenueAccount = accounts.find((a) => String(a.accountType).match(/Revenue|Income/i));
      const expenseAccount = accounts.find((a) => String(a.accountType) === "Expense");

      const projectedRate = await ForecastingFxService.resolveProjectedRate(
        scenario.baseCurrency,
        "USD",
        periodKeyToBounds(periodKey).end
      );

      for (const [accountId, value] of [
        [revenueAccount?.id, revenue],
        [expenseAccount?.id, Math.abs(netProfit)]
      ] as const) {
        if (!accountId || value == null) continue;
        const txValue = Number(value) * Number(projectedRate);
        const fx = ForecastingVarianceService.applyFxToCell(
          txValue,
          projectedRate,
          scenario.baseCurrency,
          "USD"
        );
        const naturalKeyHash = buildCellNaturalKeyHash({
          scenarioId: scenario.id,
          periodKey,
          accountId,
          entityId: scenario.entityId,
          fundId: scenario.fundId || report.fundId,
          portfolioCompanyId: report.portfolioCompanyId,
          analyticalTag: "PORTFOLIO_DISPATCH"
        });
        await prisma.forecastCell.upsert({
          where: { naturalKeyHash },
          create: {
            scenarioId: scenario.id,
            periodKey,
            accountId,
            entityId: scenario.entityId,
            fundId: normalizeCellDimension(scenario.fundId || report.fundId),
            portfolioCompanyId: report.portfolioCompanyId,
            analyticalTag: "PORTFOLIO_DISPATCH",
            naturalKeyHash,
            ...fx,
            isManualOverride: false
          },
          update: { ...fx }
        });
      }

      await ForecastingAuditService.log(prisma, {
        scenarioId: scenario.id,
        userId: null,
        actionType: "PORTFOLIO_DISPATCH",
        deltaPayload: { report_id: report.id, portfolio_company_id: report.portfolioCompanyId }
      });

      await ForecastingComputeService.run({
        scenarioId: scenario.id,
        editType: "SCENARIO_RECALC",
        options: { skip_manual_overrides: true, include_elapsed_variance: true }
      });
      dispatched++;
    }
    return { dispatched };
  }
}
