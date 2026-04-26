import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { DataIntegrationService } from "./DataIntegrationService";
import { computeKpiLineProgressPercent } from "./performanceGoalRollupUtils";

const AUM_CODE = "AUM_TOTAL";

function asDecimal18_6(n: number): string {
  // 6dp for AUM integrations in this codebase
  return (Math.round(n * 1_000_000) / 1_000_000).toFixed(6);
}

export class AumRealtimeSyncService {
  /**
   * Recompute AUM and persist it in:
   * - `performance_metric_snapshots` (always, even when no goal exists)
   * - all AUM-linked performance goals (when present) with `lastSyncedAt` timestamp
   *
   * Trigger this from Accounting Assets or Funds updates.
   */
  static async recomputeAndPersist(params: { source: "assets" | "funds" | "system" }) {
    const now = new Date();

    // Fast aggregates:
    // - Funds AUM: reuse existing fund-based logic (OPEN/CLOSED)
    // - Assets AUM proxy: sum currentBookValue for active in-use assets
    const [fundsAum, assetsAgg] = await Promise.all([
      DataIntegrationService.calculateAUM(),
      prisma.asset.aggregate({
        where: { isActive: true, status: "IN_USE" },
        _sum: { currentBookValue: true }
      })
    ]);

    const assetsTotal = assetsAgg._sum.currentBookValue
      ? Number(assetsAgg._sum.currentBookValue)
      : 0;
    const total = fundsAum.totalAUM.toNumber() + assetsTotal;
    const totalStr = asDecimal18_6(total);

    // Always write cached snapshot (dashboard can rely on this even when no goal exists)
    await prisma.performanceMetricSnapshot.upsert({
      where: { code: AUM_CODE },
      create: {
        code: AUM_CODE,
        value: totalStr,
        computedAt: now,
        source: params.source
      },
      update: {
        value: totalStr,
        computedAt: now,
        source: params.source
      }
    });

    // Update any linked goals (PM KPI goal rows).
    const goalRows = await prisma.performanceGoal.findMany({
      where: {
        OR: [
          { formulaType: { in: ["AUM", "AUM_TOTAL"] } },
          { kpi: { name: { equals: "Assets Under Management" } } },
          { kpi: { name: { contains: "AUM" } } }
        ]
      },
      include: {
        kpi: { select: { isReverseKpi: true } }
      }
    });

    if (goalRows.length) {
      const dec = new Decimal(totalStr);
      for (const g of goalRows) {
        const pct = computeKpiLineProgressPercent(
          [{ ...g, currentValue: dec, preciseCurrentValue: totalStr }],
          g.kpi
        );
        await prisma.performanceGoal.update({
          where: { id: g.id },
          data: {
            currentValue: dec,
            preciseCurrentValue: totalStr,
            lastSyncedValue: totalStr,
            lastSyncedAt: now,
            syncEndpointPath: "in-process://realtime-aum",
            progressPercentage: new Decimal(Math.min(100, Math.max(0, pct)).toFixed(2))
          }
        });
      }
    }

    return { totalAum: total, totalAumPrecise: totalStr, computedAt: now, updatedGoals: goalRows.length };
  }
}

