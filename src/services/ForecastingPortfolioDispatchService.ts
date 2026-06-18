// @ts-nocheck
import { prisma } from "../utils/database";
import { buildCellNaturalKeyHash, normalizeCellDimension } from "../utils/forecastCellKey";
import { ForecastingAccessService } from "./ForecastingAccessService";
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
    const defaultEntityId = await ForecastingAccessService.getDefaultEntityId();

    let fundId = report.fundId ?? null;
    if (!fundId && report.portfolioCompanyId) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: report.portfolioCompanyId },
        select: { fundId: true },
      });
      fundId = pc?.fundId ?? null;
    }

    const scenarios = await prisma.forecastScenario.findMany({
      where: {
        status: "ACTIVE",
        entityId: defaultEntityId,
        ...(fundId ? { fundId } : {}),
      },
    });
    if (!scenarios.length) return { dispatched: 0, scenarioIds: [] as string[] };

    const periodDate = report.reportingPeriod || report.periodEnd || new Date();
    const d = periodDate instanceof Date ? periodDate : new Date(periodDate);
    const periodKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

    const revenue = Number(report.totalRevenue ?? report.parsedSnapshot?.totalRevenue ?? 0);
    const netProfit = Number(report.netProfit ?? report.parsedSnapshot?.netProfit ?? 0);

    const reportingPeriodIso =
      d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;

    const portfolioCompany = await prisma.portfolioCompany.findUnique({
      where: { id: report.portfolioCompanyId },
      select: { name: true }
    });

    let reportTitle: string | null = null;
    if (report.id) {
      const rows = await prisma.$queryRawUnsafe<Array<{ title: string | null }>>(
        `SELECT title FROM financial_reports WHERE id = ? LIMIT 1`,
        report.id
      );
      reportTitle = rows[0]?.title ?? null;
    }

    let dispatched = 0;
    const scenarioIds: string[] = [];
    for (const scenario of scenarios) {
      const accounts = await prisma.entityChartOfAccount.findMany({
        where: { entityId: scenario.entityId, isActive: true, accountType: { in: ["Revenue", "Income", "Expense"] } },
        select: { id: true, accountType: true, accountNo: true }
      });
      const revenueAccount = accounts.find((a) => String(a.accountType).match(/Revenue|Income/i));
      const expenseAccount = accounts.find((a) => String(a.accountType) === "Expense");

      const projectedRate = await ForecastingFxService.resolveProjectedRate(
        scenario.baseCurrency,
        "USD",
        periodKeyToBounds(periodKey).end
      );

      let cellsWritten = 0;
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
        cellsWritten++;
      }

      await ForecastingAuditService.log(prisma, {
        scenarioId: scenario.id,
        userId: null,
        actionType: "PORTFOLIO_DISPATCH",
        deltaPayload: {
          report_id: report.id,
          portfolio_company_id: report.portfolioCompanyId,
          portfolio_company_name: portfolioCompany?.name ?? null,
          period_key: periodKey,
          reporting_period: reportingPeriodIso,
          report_title: reportTitle,
          total_revenue: revenue,
          net_profit: netProfit,
          tx_currency: "USD",
          cells_written: cellsWritten,
          analytical_tag: "PORTFOLIO_DISPATCH"
        }
      });

      try {
        await ForecastingComputeService.run({
          scenarioId: scenario.id,
          editType: "SCENARIO_RECALC",
          options: { skip_manual_overrides: true, include_elapsed_variance: true }
        });
      } catch (computeErr: any) {
        console.warn(
          `[ForecastingPortfolioDispatch] compute after dispatch (${scenario.id}):`,
          computeErr?.message || computeErr
        );
      }
      dispatched++;
      scenarioIds.push(scenario.id);
    }
    return { dispatched, scenarioIds };
  }
}
