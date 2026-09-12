/**
 * Explain performance dashboard task totals vs board.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/count-dashboard-tasks.ts
 */
import { prisma } from "../src/utils/database";
import {
  classifyDashboardTaskStage,
  taskCountsForDashboard
} from "../src/services/PerformanceDashboardService";

async function main() {
  const year = 2026;
  const periodEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const all = await prisma.task.findMany({
    where: { isTrashed: false },
    select: {
      id: true,
      title: true,
      stage: true,
      createdAt: true,
      fromDueDiligence: true,
      isPerformanceTask: true,
      goalId: true,
      applicationId: true,
      department: true
    },
    orderBy: { createdAt: "asc" }
  });

  const inYearScope = all.filter((t) => new Date(t.createdAt) <= periodEnd);
  const counts = taskCountsForDashboard(inYearScope);

  const byStage = new Map<string, number>();
  for (const t of inYearScope) {
    const s = t.stage || "(null)";
    byStage.set(s, (byStage.get(s) || 0) + 1);
  }

  const byBucket = { pending: 0, inProgress: 0, completed: 0, overdue: 0 };
  for (const t of inYearScope) {
    const b = classifyDashboardTaskStage(t.stage);
    byBucket[b] += 1;
  }

  console.log("=== Performance dashboard scope (year=2026, isTrashed=false, createdAt<=2026-12-31) ===\n");
  console.log(`Total in scope: ${inYearScope.length}`);
  console.log(`All non-trashed in DB: ${all.length}`);
  console.log("\nRaw DB stage counts:", Object.fromEntries(byStage));
  console.log("\nDashboard buckets:", {
    pending: counts.pending,
    inProgress: counts.inProgress,
    overdue: counts.overdue,
    inProgressCard: counts.inProgress + counts.overdue,
    completed: counts.completed,
    sum: counts.pending + counts.inProgress + counts.overdue + counts.completed
  });

  console.log("\n--- Task list (in year scope) ---");
  for (const t of inYearScope) {
    const bucket = classifyDashboardTaskStage(t.stage);
    const flags = [
      t.fromDueDiligence ? "DD" : null,
      t.isPerformanceTask ? "perf" : null,
      t.goalId ? "goal" : null,
      t.applicationId ? "app" : null
    ]
      .filter(Boolean)
      .join(",");
    console.log(
      `${t.id.slice(0, 12)}… | ${bucket.padEnd(10)} | stage=${t.stage} | ${t.title.slice(0, 50)} | ${flags || "manual"}`
    );
  }

  const dd = inYearScope.filter((t) => t.fromDueDiligence).length;
  const perf = inYearScope.filter((t) => t.isPerformanceTask).length;
  const withGoal = inYearScope.filter((t) => t.goalId).length;
  console.log("\n--- Breakdown ---");
  console.log(`fromDueDiligence: ${dd}`);
  console.log(`isPerformanceTask: ${perf}`);
  console.log(`linked to goal: ${withGoal}`);
  console.log(`neither DD nor perf flag: ${inYearScope.filter((t) => !t.fromDueDiligence && !t.isPerformanceTask).length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
