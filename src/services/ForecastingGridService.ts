// @ts-nocheck
import { prisma } from "../utils/database";
import { accountNoInRange } from "../constants/forecastingEngine";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { formatForecastUserName } from "../utils/forecastUserDisplay";

export class ForecastingGridService {
  static async getGrid(scenarioId: string, query: Record<string, any>, user?: any) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const where: any = { scenarioId };
    if (query.period_start || query.period_end) {
      where.periodKey = {};
      if (query.period_start) where.periodKey.gte = String(query.period_start);
      if (query.period_end) where.periodKey.lte = String(query.period_end);
    }
    if (query.portfolio_company_id) {
      where.portfolioCompanyId = String(query.portfolio_company_id);
    }

    const entityAccounts = await prisma.entityChartOfAccount.findMany({
      where: { entityId: scenario.entityId, isActive: true },
      select: { id: true, accountNo: true, accountName: true, accountType: true }
    });
    const accountById = new Map(entityAccounts.map((a) => [a.id, a]));

    if (query.account_range_start != null && query.account_range_end != null) {
      const start = Number(query.account_range_start);
      const end = Number(query.account_range_end);
      const filteredAccountIds = entityAccounts
        .filter((a) => accountNoInRange(a.accountNo, start, end))
        .map((a) => a.id);
      where.accountId = { in: filteredAccountIds };
    }

    const [cells, total] = await Promise.all([
      prisma.forecastCell.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ accountId: "asc" }, { periodKey: "asc" }],
        include: {
          lastEditedBy: { select: { firstName: true, lastName: true, email: true } }
        }
      }),
      prisma.forecastCell.count({ where })
    ]);

    const includeActuals = query.include_actuals !== "false";
    const includeVariance = query.include_variance !== "false";

    const rows = cells.map((c) => {
      const acct = accountById.get(c.accountId);
      return {
      account_id: c.accountId,
      account_no: acct?.accountNo ?? null,
      account_name: acct?.accountName ?? null,
      period_key: c.periodKey,
      fund_id: c.fundId || null,
      portfolio_company_id: c.portfolioCompanyId || null,
      analytical_tag: c.analyticalTag || null,
      forecast_value: c.forecastValue,
      tx_currency: c.txCurrency,
      tx_currency_value: c.txCurrencyValue,
      base_currency_value: c.baseCurrencyValue,
      projected_rate: c.projectedRate,
      ...(includeActuals
        ? {
            actual_value: c.actualValueOverride,
            actual_rate: c.actualRate
          }
        : {}),
      ...(includeVariance
        ? {
            variance_absolute: c.varianceAbsolute,
            variance_percent: c.variancePercent
          }
        : {}),
      is_manual_override: c.isManualOverride,
      last_edited_by_name: formatForecastUserName(c.lastEditedBy),
      updated_at: c.updatedAt.toISOString()
    };
    });

    return {
      scenario_id: scenarioId,
      base_currency: scenario.baseCurrency,
      rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 }
    };
  }
}
