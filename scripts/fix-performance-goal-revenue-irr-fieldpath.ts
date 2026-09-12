/**
 * Patches goals whose sync `fieldPath` wrongly points at portfolio IRR (`data.metrics.irr`) while the
 * linked KPI is revenue. Sets `fieldPath` to `data.metrics.totalRevenue` and default HTTP path to
 * GET /api/accounting/v1/pe/portfolio-total-revenue (or use in-process POST .../sync-pe-portfolio-total-revenue).
 *
 * Optional: pass one goal id as argv[2] (e.g. audit sample cmneemxk10001unno9moyfkqs).
 *
 * Run: npx ts-node scripts/fix-performance-goal-revenue-irr-fieldpath.ts [goalId]
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { isPortfolioTotalRevenueCompatibleGoal } from "../src/services/performanceBackendSupport";

const IRR_FIELD = "data.metrics.irr";
const REVENUE_FIELD = "data.metrics.totalRevenue";
const DEFAULT_ENDPOINT = "/api/accounting/v1/pe/portfolio-total-revenue";

async function main() {
  const oneId = process.argv[2];
  const goals = await prisma.performanceGoal.findMany({
    where: oneId ? { id: oneId } : {},
    include: { kpi: { select: { name: true } } }
  });

  let patched = 0;
  for (const g of goals) {
    const sc = (g.syncConfig as Record<string, unknown>) || {};
    if (String(sc.fieldPath || "") !== IRR_FIELD) continue;
    if (!isPortfolioTotalRevenueCompatibleGoal(g)) continue;

    const nextEndpoint =
      !g.syncEndpointPath ||
      String(g.syncEndpointPath).includes("portfolio-irr") ||
      String(g.syncEndpointPath).includes("kpis/portfolio-irr")
        ? DEFAULT_ENDPOINT
        : g.syncEndpointPath;

    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: {
        syncConfig: { ...sc, fieldPath: REVENUE_FIELD },
        syncEndpointPath: nextEndpoint
      }
    });
    patched += 1;
    console.log(`Patched goal ${g.id} — ${g.title}`);
  }

  if (oneId && patched === 0) {
    console.log(
      "No change: goal not found, fieldPath is not data.metrics.irr, or KPI is not revenue-compatible."
    );
  } else {
    console.log(`Done. Patched ${patched} goal(s). Re-run portfolio total revenue sync for each goal.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
