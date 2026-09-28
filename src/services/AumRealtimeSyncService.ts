import { prisma } from "../utils/database";
import { DataIntegrationService } from "./DataIntegrationService";

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
      const { PerformanceGoalProgressEventService } = await import("./PerformanceGoalProgressEventService");
      for (const g of goalRows) {
        // value, progress and zone come from the event ledger (recomputed), not a direct overwrite
        await PerformanceGoalProgressEventService.setValueFromIntegration(g.id, Number(totalStr), `realtime-aum:${now.toISOString()}`, g.createdById);
        await prisma.performanceGoal.update({
          where: { id: g.id },
          data: {
            lastSyncedValue: totalStr,
            lastSyncedAt: now,
            ...(g.syncEndpointPath && /\/v1\//.test(String(g.syncEndpointPath)) ? {} : { syncEndpointPath: "in-process://realtime-aum" })
          }
        });
      }
    }

    return { totalAum: total, totalAumPrecise: totalStr, computedAt: now, updatedGoals: goalRows.length };
  }
}

