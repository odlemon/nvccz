// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import {
  accountNoInRange,
  FORECAST_COMPUTE_TIMEOUT_MS,
  FORECAST_ERROR_CODES
} from "../constants/forecastingEngine";
import { buildCellNaturalKeyHash, normalizeCellDimension } from "../utils/forecastCellKey";
import {
  buildPeriodKeys,
  classifyPeriodKeys,
  periodIndex,
  periodKeyToBounds
} from "../utils/forecastPeriodUtils";
import {
  cagrProjection,
  linearProjection,
  linearRegressionSlopeIntercept,
  toDec
} from "../utils/forecastMath";
import { ForecastFormulaParser } from "./ForecastFormulaParser";
import { ForecastingDagEngine } from "./ForecastingDagEngine";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingError } from "./ForecastingError";
import { ForecastingFxService } from "./ForecastingFxService";
import { ForecastingOpmBridgeService } from "./ForecastingOpmBridgeService";
import { ForecastingScenarioService } from "./ForecastingScenarioService";
import { ForecastingVarianceService } from "./ForecastingVarianceService";
import { getPostedPeriodExpenseByAccount } from "./AccountingGlPeriodTotalsService";

const runningJobs = new Set<string>();

export class ForecastingComputeService {
  static async run(input: {
    scenarioId: string;
    editType: string;
    user?: any;
    userId?: string;
    driverId?: string;
    coordinates?: { period_key?: string; account_id?: string };
    accountRange?: { start: number; end: number };
    periodRange?: { start: string; end: string };
    options?: { skip_manual_overrides?: boolean; include_elapsed_variance?: boolean };
  }) {
    if (runningJobs.has(input.scenarioId)) {
      throw new ForecastingError(FORECAST_ERROR_CODES.COMPUTE_IN_PROGRESS, "Compute already running", 409);
    }
    runningJobs.add(input.scenarioId);
    const started = Date.now();
    let jobId: string | null = null;

    try {
      const scenario = await ForecastingAccessService.loadScenarioOrThrow(input.scenarioId, input.user);
      const mutating = input.editType !== "GL_SYNC";
      if (mutating && scenario.status === "LOCKED") {
        throw ForecastingError.locked();
      }

      jobId = (
        await prisma.forecastComputeJob.create({
          data: {
            scenarioId: input.scenarioId,
            status: "RUNNING",
            triggerType: input.editType
          }
        })
      ).id;

      const periodKeys = buildPeriodKeys(
        scenario.horizonStartDate,
        scenario.horizonEndDate,
        scenario.granularity as any
      );
      const { elapsed, future } = classifyPeriodKeys(periodKeys);
      const drivers = await prisma.forecastDriver.findMany({ where: { scenarioId: input.scenarioId } });
      const accounts = await ForecastingScenarioService.resolveAccountsForScenario(input.scenarioId);
      const skipManual = input.options?.skip_manual_overrides === true;

      const manualCells = skipManual
        ? await prisma.forecastCell.findMany({
            where: { scenarioId: input.scenarioId, isManualOverride: true },
            select: { naturalKeyHash: true }
          })
        : [];
      const manualSet = new Set(manualCells.map((c) => c.naturalKeyHash));

      const updatedCells: any[] = [];
      const rateCache = new Map<string, Decimal>();
      const resolveRate = async (txCurrency: string, periodEnd: Date) => {
        const key = `${txCurrency}|${periodEnd.toISOString().slice(0, 10)}`;
        if (!rateCache.has(key)) {
          rateCache.set(
            key,
            await ForecastingFxService.resolveProjectedRate(scenario.baseCurrency, txCurrency, periodEnd)
          );
        }
        return rateCache.get(key)!;
      };

      const targetPeriods =
        input.periodRange?.start && input.periodRange?.end
          ? periodKeys.filter((p) => p >= input.periodRange!.start && p <= input.periodRange!.end)
          : future.length ? future : periodKeys;

      for (const driver of drivers) {
        const params = (driver.parameters || {}) as Record<string, number>;
        const rangeAccounts = accounts.filter((a) =>
          accountNoInRange(a.accountNo, driver.targetAccountRangeStart, driver.targetAccountRangeEnd)
        );
        if (input.accountRange) {
          const filtered = rangeAccounts.filter((a) =>
            accountNoInRange(a.accountNo, input.accountRange!.start, input.accountRange!.end)
          );
          if (!filtered.length) continue;
        }
        if (input.coordinates?.account_id) {
          const one = rangeAccounts.find((a) => a.id === input.coordinates!.account_id);
          if (!one) continue;
          rangeAccounts.splice(0, rangeAccounts.length, one);
        }

        for (const account of rangeAccounts) {
          if (input.coordinates?.account_id && account.id !== input.coordinates.account_id) continue;

          let historicalBase = Number(params.historical_base || params.base_value || 0);
          if (params.historical_months_lookback && elapsed.length) {
            const lookback = Math.min(elapsed.length, Number(params.historical_months_lookback));
            let sum = 0;
            // Use sourceAccountId to look up GL actuals (global chart_of_accounts)
            // External startup entities (no sourceAccountId) will have historicalBase = 0
            const glAccountId = account.sourceAccountId ?? null;
            for (let i = elapsed.length - lookback; i < elapsed.length; i++) {
              const pk = elapsed[i];
              const bounds = periodKeyToBounds(pk);
              if (glAccountId) {
                const glRows = await getPostedPeriodExpenseByAccount(bounds.start, bounds.end, {
                  excludePerformanceJournals: true
                });
                const row = glRows.find((r) => r.chartOfAccountId === glAccountId);
                sum += row?.actualAmount ?? 0;
              }
            }
            historicalBase = lookback ? sum / lookback : historicalBase;
          }

          for (let pi = 0; pi < targetPeriods.length; pi++) {
            const periodKey = targetPeriods[pi];
            if (input.coordinates?.period_key && periodKey !== input.coordinates.period_key) continue;

            const t = periodIndex(periodKeys, periodKey);
            const bounds = periodKeyToBounds(periodKey);
            const txCurrency = String(params.tx_currency || "USD");
            const projectedRate = await resolveRate(txCurrency, bounds.end);

            let txValue = 0;
            switch (driver.driverType) {
              case "CAGR_DRIVEN": {
                const rate = Number(params.cagr_scalar ?? params.cagr ?? 0);
                const k = t;
                txValue = cagrProjection(historicalBase, rate, k);
                break;
              }
              case "HEADCOUNT_GROWTH": {
                const headcount = Number(params.headcount ?? 1);
                const costPerHead = Number(params.cost_per_head ?? params.unit_cost ?? 0);
                const growth = Number(params.growth_rate ?? 0);
                txValue = headcount * Math.pow(1 + growth, t) * costPerHead;
                break;
              }
              case "INFLATION_MULTIPLIER": {
                const inflation = Number(params.inflation_rate ?? 0);
                txValue = historicalBase * Math.pow(1 + inflation, t);
                break;
              }
              case "FX_SCALAR": {
                txValue = historicalBase * Number(projectedRate);
                break;
              }
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
                txValue = linearProjection(m, b, t);
                break;
              }
              case "MANUAL_OVERRIDE":
                continue;
              default:
                txValue = ForecastFormulaParser.evaluate(driver.formulaExpression, {
                  t,
                  "t-1": t > 0 ? t - 1 : 0,
                  "t-12": t >= 12 ? t - 12 : 0,
                  HISTORICAL_BASE: historicalBase,
                  parameters: params
                });
            }

            const naturalKeyHash = buildCellNaturalKeyHash({
              scenarioId: input.scenarioId,
              periodKey,
              accountId: account.id,
              entityId: scenario.entityId,
              fundId: scenario.fundId,
              portfolioCompanyId: null,
              analyticalTag: null
            });
            if (manualSet.has(naturalKeyHash)) continue;

            const fx = ForecastingVarianceService.applyFxToCell(
              txValue,
              projectedRate,
              scenario.baseCurrency,
              txCurrency
            );

            const cell = await prisma.forecastCell.upsert({
              where: { naturalKeyHash },
              create: {
                scenarioId: input.scenarioId,
                periodKey,
                accountId: account.id,
                entityId: scenario.entityId,
                fundId: normalizeCellDimension(scenario.fundId),
                portfolioCompanyId: "",
                analyticalTag: "",
                naturalKeyHash,
                ...fx,
                isManualOverride: false
              },
              update: {
                ...fx,
                isManualOverride: false
              }
            });
            updatedCells.push(cell);
            if (updatedCells.length >= 5000) break;
          }
          if (updatedCells.length >= 5000) break;
        }
        if (updatedCells.length >= 5000) break;
      }

      if (input.options?.include_elapsed_variance !== false && elapsed.length) {
        await ForecastingVarianceService.recomputeScenarioElapsed(
          input.scenarioId,
          periodKeys,
          elapsed,
          scenario.baseCurrency
        );
      }

      const durationMs = Date.now() - started;
      if (durationMs > FORECAST_COMPUTE_TIMEOUT_MS) {
        throw new ForecastingError(FORECAST_ERROR_CODES.COMPUTE_TIMEOUT, "Compute exceeded timeout", 504);
      }

      await prisma.$transaction(
        async (tx) => {
          await tx.forecastComputeJob.update({
            where: { id: jobId! },
            data: {
              status: "COMPLETED",
              affectedCellCount: updatedCells.length,
              durationMs
            }
          });
          await tx.forecastScenario.update({
            where: { id: input.scenarioId },
            data: { lastComputeAt: new Date() }
          });
        },
        { maxWait: 15_000, timeout: 30_000 }
      );

      if (input.userId || input.user?.id) {
        await ForecastingAuditService.log(prisma, {
          scenarioId: input.scenarioId,
          userId: input.userId || input.user?.id,
          actionType: "COMPUTE",
          deltaPayload: { edit_type: input.editType, affected: updatedCells.length, duration_ms: durationMs }
        });
      }

      await ForecastingOpmBridgeService.onComputeCompleted(
        input.scenarioId,
        input.userId || input.user?.id || "system"
      );

      return {
        compute_job_id: jobId,
        status: "COMPLETED",
        affected_cell_count: updatedCells.length,
        duration_ms: durationMs,
        updated_cells: updatedCells.slice(0, 100)
      };
    } catch (err) {
      if (jobId) {
        try {
          await prisma.forecastComputeJob.update({
            where: { id: jobId },
            data: {
              status: "FAILED",
              errorMessage: (err as Error).message,
              durationMs: Date.now() - started
            }
          });
        } catch {
          // Job row may be missing after connection/transaction errors; compute failure still propagates.
        }
      }
      throw err;
    } finally {
      runningJobs.delete(input.scenarioId);
    }
  }

  static async validateFormula(expression: string) {
    return ForecastFormulaParser.validate(expression);
  }

  static async getJob(computeJobId: string, user?: any) {
    const job = await prisma.forecastComputeJob.findUnique({ where: { id: computeJobId } });
    if (!job) {
      throw new ForecastingError(FORECAST_ERROR_CODES.SCENARIO_NOT_FOUND, "Compute job not found", 404);
    }
    if (user) {
      await ForecastingAccessService.loadScenarioForUser(user, job.scenarioId);
    }
    return job;
  }
}
