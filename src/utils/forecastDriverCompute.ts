// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { accountNoInRange } from "../constants/forecastingEngine";
import { buildCellNaturalKeyHash } from "../utils/forecastCellKey";
import { periodKeyToBounds } from "../utils/forecastPeriodUtils";
import {
  cagrProjection,
  linearProjection,
  linearRegressionSlopeIntercept
} from "../utils/forecastMath";
import {
  isDefaultDriverFormula,
  normalizeFormulaDialect,
  preprocessCellRefs
} from "../utils/forecastFormulaDialect";
import { ForecastFormulaParser } from "../services/ForecastFormulaParser";
import { getPostedPeriodExpenseByAccount } from "../services/AccountingGlPeriodTotalsService";

export function buildCellCacheKey(input: {
  scenarioId: string;
  periodKey: string;
  accountId: string;
  entityId: string;
  fundId: string | null;
}): string {
  return buildCellNaturalKeyHash({
    scenarioId: input.scenarioId,
    periodKey: input.periodKey,
    accountId: input.accountId,
    entityId: input.entityId,
    fundId: input.fundId,
    portfolioCompanyId: null,
    analyticalTag: null
  });
}

export function resolveCellRefValue(
  ref: string,
  ctx: {
    periodKeys: string[];
    t: number;
    accounts: Array<{ id: string; accountNo: number | string }>;
    cellValueCache: Map<string, number>;
    scenarioId: string;
    entityId: string;
    fundId: string | null;
  }
): number {
  const parts = ref.split("|").map((p) => p.trim());
  let periodKey: string | undefined;
  let accountNo: number | undefined;

  if (parts.length >= 2) {
    periodKey = parts[0];
    accountNo = Number(parts[1]);
  } else {
    accountNo = Number(parts[0]);
    periodKey = ctx.periodKeys[ctx.t];
  }

  if (!periodKey || !Number.isFinite(accountNo)) return 0;
  const account = ctx.accounts.find((a) => Number(a.accountNo) === accountNo);
  if (!account) return 0;
  const hash = buildCellCacheKey({
    scenarioId: ctx.scenarioId,
    periodKey,
    accountId: account.id,
    entityId: ctx.entityId,
    fundId: ctx.fundId
  });
  return ctx.cellValueCache.get(hash) ?? 0;
}

export function buildFormulaCellValues(
  expression: string,
  ctx: Parameters<typeof resolveCellRefValue>[1]
): Record<string, number> {
  const normalized = normalizeFormulaDialect(expression);
  const { expression: prepared, cellRefs } = preprocessCellRefs(normalized);
  const cellValues: Record<string, number> = {};
  const placeholderRe = /__CELL_\d+_[a-zA-Z0-9_]*__/g;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = placeholderRe.exec(prepared))) {
    const placeholder = m[0];
    const ref = cellRefs[idx++] ?? "";
    cellValues[placeholder] = resolveCellRefValue(ref, ctx);
  }
  return cellValues;
}

export async function computeBuiltinDriverValue(input: {
  driverType: string;
  params: Record<string, number>;
  historicalBase: number;
  t: number;
  projectedRate: Decimal;
  elapsed: string[];
  account: { sourceAccountId?: string | null };
}): Promise<number | null> {
  const { driverType, params, historicalBase, t, projectedRate, elapsed, account } = input;
  switch (driverType) {
    case "CAGR_DRIVEN": {
      const rate = Number(params.cagr_scalar ?? params.cagr ?? 0);
      return cagrProjection(historicalBase, rate, t);
    }
    case "HEADCOUNT_GROWTH": {
      const headcount = Number(params.headcount ?? 1);
      const costPerHead = Number(params.cost_per_head ?? params.unit_cost ?? 0);
      const growth = Number(params.growth_rate ?? 0);
      return headcount * Math.pow(1 + growth, t) * costPerHead;
    }
    case "INFLATION_MULTIPLIER": {
      const inflation = Number(params.inflation_rate ?? 0);
      return historicalBase * Math.pow(1 + inflation, t);
    }
    case "FX_SCALAR":
      return historicalBase * Number(projectedRate);
    case "LINEAR_REGRESSION": {
      const lookback = Math.max(3, Number(params.lookback_periods ?? 3));
      const points: Array<{ t: number; y: number }> = [];
      const glAccountIdLR = account.sourceAccountId ?? null;
      for (let i = Math.max(0, elapsed.length - lookback); i < elapsed.length; i++) {
        const pk = elapsed[i];
        const b = periodKeyToBounds(pk);
        let y = 0;
        if (glAccountIdLR) {
          const glRows = await getPostedPeriodExpenseByAccount(b.start, b.end, {
            excludePerformanceJournals: true
          });
          y = glRows.find((r) => r.chartOfAccountId === glAccountIdLR)?.actualAmount ?? 0;
        }
        points.push({ t: i, y });
      }
      const { m, b } = linearRegressionSlopeIntercept(points);
      return linearProjection(m, b, t);
    }
    case "MANUAL_OVERRIDE":
      return null;
    default:
      return null;
  }
}

export async function computeDriverCellValue(input: {
  driver: { driverType: string; formulaExpression: string; parameters: unknown };
  params: Record<string, number>;
  historicalBase: number;
  t: number;
  periodKey: string;
  projectedRate: Decimal;
  elapsed: string[];
  periodKeys: string[];
  account: { id: string; accountNo: number | string; sourceAccountId?: string | null };
  cellValueCache: Map<string, number>;
  scenarioId: string;
  entityId: string;
  fundId: string | null;
  accounts: Array<{ id: string; accountNo: number | string }>;
}): Promise<number> {
  const {
    driver,
    params,
    historicalBase,
    t,
    projectedRate,
    elapsed,
    periodKeys,
    account,
    cellValueCache,
    scenarioId,
    entityId,
    fundId,
    accounts
  } = input;

  if (isDefaultDriverFormula(driver.driverType, driver.formulaExpression)) {
    const builtin = await computeBuiltinDriverValue({
      driverType: driver.driverType,
      params,
      historicalBase,
      t,
      projectedRate,
      elapsed,
      account
    });
    if (builtin != null) return builtin;
  }

  const refCtx = {
    periodKeys,
    t,
    accounts,
    cellValueCache,
    scenarioId,
    entityId,
    fundId
  };

  const lagFn = (periodsAgo: number) => {
    const lagIdx = t - periodsAgo;
    if (lagIdx < 0) return 0;
    const lagPk = periodKeys[lagIdx];
    if (!lagPk) return 0;
    const hash = buildCellCacheKey({
      scenarioId,
      periodKey: lagPk,
      accountId: account.id,
      entityId,
      fundId
    });
    return cellValueCache.get(hash) ?? 0;
  };

  const cellValues = buildFormulaCellValues(driver.formulaExpression, refCtx);
  const evalCtx = ForecastFormulaParser.buildEvalContext({
    t,
    historicalBase,
    parameters: params,
    lag: lagFn,
    cellValues
  });

  return ForecastFormulaParser.evaluate(driver.formulaExpression, evalCtx);
}

export function accountInDriverRange(
  accountNo: number | string,
  driver: { targetAccountRangeStart: number; targetAccountRangeEnd: number }
): boolean {
  return accountNoInRange(accountNo, driver.targetAccountRangeStart, driver.targetAccountRangeEnd);
}
