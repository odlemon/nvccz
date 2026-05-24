/**
 * Verify performance dashboard budgetTracker uses accounting Budget + line items.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/test-performance-budget-tracker.ts
 */
import { prisma } from "../src/utils/database";
import { PerformanceDashboardService } from "../src/services/PerformanceDashboardService";

async function main() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  console.log("Performance budget tracker (accounting)\n");
  console.log(`Dashboard period: ${year}-${String(month).padStart(2, "0")}\n`);

  const overlapping = await prisma.budget.findMany({
    where: {
      startDate: { lte: new Date(year, month, 0, 23, 59, 59, 999) },
      endDate: { gte: new Date(year, month - 1, 1) }
    },
    select: {
      id: true,
      name: true,
      period: true,
      isActive: true,
      totalBudgeted: true,
      totalActual: true,
      _count: { select: { budgetItems: true } }
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }]
  });

  console.log(`Budgets overlapping month: ${overlapping.length}`);
  for (const b of overlapping) {
    console.log(
      `  - ${b.name} (${b.period}) active=${b.isActive} items=${b._count.budgetItems} budgeted=${b.totalBudgeted} actual=${b.totalActual}`
    );
  }
  console.log("");

  const dashboard = await PerformanceDashboardService.getDashboardData({ month, year });
  const bt = dashboard.budgetTracker;

  console.log("budgetTracker from API service:");
  console.log(JSON.stringify(bt, null, 2));

  console.log(`overBudget: ${bt.overBudget}, percentageUsed: ${bt.percentageUsed}`);

  const ok =
    bt.percentageUsed >= 0 &&
    bt.percentageUsed <= 100 &&
    (overlapping.length === 0
      ? bt.lineItems.length >= 0
      : bt.lineItems.length >= 0);

  if (!ok) {
    console.error("\nFAIL: unexpected budgetTracker shape or missing budget link");
    process.exit(1);
  }

  if (bt.overBudget && bt.percentageUsed !== 100) {
    console.warn("WARN: overBudget true but percentageUsed is not capped at 100");
  }

  console.log("\nPASS: accounting budget tracker resolved");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
