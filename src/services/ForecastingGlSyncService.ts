// @ts-nocheck
import { prisma } from "../utils/database";
import { buildPeriodKeys, classifyPeriodKeys, periodKeyToBounds } from "../utils/forecastPeriodUtils";
import { buildCellNaturalKeyHash, normalizeCellDimension } from "../utils/forecastCellKey";
import { getPostedPeriodExpenseByAccount } from "./AccountingGlPeriodTotalsService";
import { ForecastingComputeService } from "./ForecastingComputeService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingVarianceService } from "./ForecastingVarianceService";
import { toDec } from "../utils/forecastMath";

export class ForecastingGlSyncService {
  static async syncScenario(scenarioId: string, actorId = "system") {
    const scenario = await prisma.forecastScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) return { skipped: true, reason: "not_found" };

    const periodKeys = buildPeriodKeys(
      scenario.horizonStartDate,
      scenario.horizonEndDate,
      scenario.granularity as any
    );
    const { elapsed } = classifyPeriodKeys(periodKeys);
    let updated = 0;

    if (!elapsed.length) {
      await prisma.forecastScenario.update({
        where: { id: scenarioId },
        data: { lastGlSyncAt: new Date() }
      });
      await ForecastingAuditService.log(prisma, {
        scenarioId,
        userId: actorId === "system" ? null : actorId,
        actionType: "GL_SYNC",
        deltaPayload: { updated_cells: 0, elapsed_periods: [], note: "No elapsed periods in horizon yet" }
      });
      return {
        scenario_id: scenarioId,
        updated_cells: 0,
        elapsed_periods: [],
        elapsed_period_count: 0,
        note: "No elapsed periods in scenario horizon — nothing to pull from GL yet"
      };
    }

    // Build a lookup: global chartOfAccountId -> entity clone id
    // Only entity accounts with a sourceAccountId can receive GL actuals
    const entityAccounts = await prisma.entityChartOfAccount.findMany({
      where: { entityId: scenario.entityId, sourceAccountId: { not: null } },
      select: { id: true, sourceAccountId: true }
    });
    const sourceToEntityAccountId = new Map(entityAccounts.map((a) => [a.sourceAccountId!, a.id]));

    for (const periodKey of elapsed) {
      const bounds = periodKeyToBounds(periodKey);
      const glRows = await getPostedPeriodExpenseByAccount(bounds.start, bounds.end, {
        excludePerformanceJournals: true
      });
      for (const row of glRows) {
        // Map global account to per-entity account clone
        const entityAccountId = sourceToEntityAccountId.get(row.chartOfAccountId);
        if (!entityAccountId) continue; // account not cloned into this entity — skip

        const naturalKeyHash = buildCellNaturalKeyHash({
          scenarioId,
          periodKey,
          accountId: entityAccountId,
          entityId: scenario.entityId,
          fundId: scenario.fundId,
          portfolioCompanyId: null,
          analyticalTag: null
        });
        const existing = await prisma.forecastCell.findUnique({ where: { naturalKeyHash } });
        const actual = toDec(row.actualAmount);
        if (existing) {
          await prisma.forecastCell.update({
            where: { id: existing.id },
            data: {
              actualValueOverride: actual,
              varianceAbsolute: actual.minus(existing.forecastValue),
              variancePercent: existing.forecastValue.isZero()
                ? actual.greaterThan(0)
                  ? toDec(100)
                  : toDec(0)
                : actual.minus(existing.forecastValue).dividedBy(existing.forecastValue).times(100)
            }
          });
        } else {
          await prisma.forecastCell.create({
            data: {
              scenarioId,
              periodKey,
              accountId: entityAccountId,
              entityId: scenario.entityId,
              fundId: normalizeCellDimension(scenario.fundId),
              portfolioCompanyId: "",
              analyticalTag: "",
              naturalKeyHash,
              forecastValue: 0,
              actualValueOverride: actual,
              txCurrency: scenario.baseCurrency,
              txCurrencyValue: actual,
              baseCurrencyValue: actual,
              isManualOverride: false
            }
          });
        }
        updated++;
      }
    }

    await ForecastingVarianceService.recomputeScenarioElapsed(
      scenarioId,
      periodKeys,
      elapsed,
      scenario.baseCurrency
    );

    await prisma.forecastScenario.update({
      where: { id: scenarioId },
      data: { lastGlSyncAt: new Date() }
    });

    await ForecastingAuditService.log(prisma, {
      scenarioId,
      userId: actorId === "system" ? null : actorId,
      actionType: "GL_SYNC",
      deltaPayload: { updated_cells: updated }
    });

    await ForecastingComputeService.run({
      scenarioId,
      editType: "GL_SYNC",
      userId: actorId === "system" ? undefined : actorId,
      options: { skip_manual_overrides: true, include_elapsed_variance: true }
    });

    return {
      scenario_id: scenarioId,
      updated_cells: updated,
      elapsed_periods: elapsed,
      elapsed_period_count: elapsed.length
    };
  }

  static async syncAllActive() {
    const scenarios = await prisma.forecastScenario.findMany({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      select: { id: true }
    });
    const results = [];
    for (const s of scenarios) {
      results.push(await ForecastingGlSyncService.syncScenario(s.id));
    }
    return { synced: results.length, results };
  }
}
