/**
 * Data fix: align **PerformanceGoal** `progressPercentage` (and sync-driven currents)
 * with the same rules as KPI analytics + realtime syncs.
 *
 * 1. Recomputes **AUM** and **VC CAC** from source (assets/funds, customers, marketing expenses) — updates
 *    `currentValue`, `preciseCurrentValue`, `lastSynced*`, and `progressPercentage` on linked goals.
 * 2. For **every** goal with a `kpiId`, sets `progressPercentage` from `parseGoalCurrentAndTarget` +
 *    `computeKpiLineProgressPercent` (reverse KPI, no-target rule, etc.).
 *
 * KPI catalog rows (`kpis`) do not store live progress; goals do. This script fixes goal rows.
 *
 * Run: npm run db:backfill:kpi-linked-goal-progress
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { AumRealtimeSyncService } from "../src/services/AumRealtimeSyncService";
import { VcCacSyncService } from "../src/services/VcCacSyncService";
import { computeKpiLineProgressPercent } from "../src/services/performanceGoalRollupUtils";

function pctDec(p: number) {
  return new Decimal(Math.min(100, Math.max(0, p)).toFixed(2));
}

async function main() {
  console.log("1) AUM + VC CAC realtime recompute (updates linked goals + snapshots)...");
  const aum = await AumRealtimeSyncService.recomputeAndPersist({ source: "system" });
  const cac = await VcCacSyncService.recomputeAndPersist({ source: "system" });
  console.log("   AUM:", aum);
  console.log("   CAC:", cac);

  console.log("\n2) Backfill progressPercentage for all goals with a KPI...");

  const goals = await prisma.performanceGoal.findMany({
    where: { kpiId: { not: null } },
    include: {
      kpi: {
        select: {
          id: true,
          name: true,
          code: true,
          catalogDescription: true,
          isReverseKpi: true
        }
      }
    }
  });

  let changed = 0;
  for (const g of goals) {
    const p = computeKpiLineProgressPercent([g as any], g.kpi);
    const next = pctDec(p);
    const prev = g.progressPercentage != null ? new Decimal(String(g.progressPercentage)) : null;
    if (prev == null || !prev.equals(next)) {
      await prisma.performanceGoal.update({
        where: { id: g.id },
        data: { progressPercentage: next }
      });
      changed += 1;
    }
  }

  console.log(`   Total KPI-linked goals: ${goals.length}`);
  console.log(`   progressPercentage updated: ${changed}`);

  console.log("\n3) Sample (first 8) for verification — title | kpi | current | target | progress %");
  const sample = await prisma.performanceGoal.findMany({
    where: { kpiId: { not: null } },
    take: 8,
    orderBy: { updatedAt: "desc" },
    include: {
      kpi: { select: { name: true, code: true, catalogDescription: true } }
    }
  });
  for (const r of sample) {
    const k = r.kpi;
    console.log(
      `   ${String(r.title).slice(0, 40)} | ${k?.name} | cur=${r.currentValue ?? "-"} / tgt=${r.targetValue ?? "-"} | precise=${r.preciseCurrentValue ?? "-"} | prog=${r.progressPercentage}`
    );
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
