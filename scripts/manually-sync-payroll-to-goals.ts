/**
 * Re-apply payroll→goal sync using PerformanceGoalService (reverse-KPI aware).
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/manually-sync-payroll-to-goals.ts
 */
import { prisma } from "../src/utils/database";
import { PerformanceGoalService } from "../src/services/PerformanceGoalService";

async function manuallySyncPayrollToGoals() {
  try {
    console.log("🔄 Re-syncing payroll expense goals (reverse-KPI aware)...\n");

    const payrollGoal = await prisma.performanceGoal.findFirst({
      where: {
        OR: [
          { title: { contains: "PAYROLL" } },
          { kpi: { code: "PAYROLL_EXPENSE" } }
        ]
      },
      select: { startDate: true, endDate: true, title: true }
    });

    const runWhere: Record<string, unknown> = { status: "COMPLETED" };
    if (payrollGoal) {
      runWhere.startDate = { lte: payrollGoal.endDate };
      runWhere.endDate = { gte: payrollGoal.startDate };
      console.log(`Goal window: ${payrollGoal.title} (${payrollGoal.startDate.toISOString().slice(0, 10)} .. ${payrollGoal.endDate.toISOString().slice(0, 10)})\n`);
    }

    const latestRun = await prisma.payrollRun.findFirst({
      where: runWhere,
      orderBy: { endDate: "desc" },
      select: { id: true, name: true, totalGrossPay: true, createdById: true, startDate: true, endDate: true }
    });

    const actorId =
      latestRun?.createdById ??
      (await prisma.user.findFirst({ select: { id: true } }))?.id ??
      "";

    if (latestRun) {
      console.log(`Reference payroll run: ${latestRun.name} (${latestRun.id})\n`);
    } else {
      console.log("No overlapping COMPLETED payroll run — refreshing goals from all runs in each goal window.\n");
    }

    await PerformanceGoalService.refreshAllPayrollExpenseGoals(actorId);

    console.log("\n✅ Manual sync completed!");
  } catch (error) {
    console.error("❌ Error syncing payroll to goals:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

manuallySyncPayrollToGoals();
