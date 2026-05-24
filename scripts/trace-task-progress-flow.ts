/**
 * Trace task → goal progress → performance JEs for UAT.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/trace-task-progress-flow.ts --taskId=<id>
 *   npx ts-node --transpile-only -r dotenv/config scripts/trace-task-progress-flow.ts --goalId=<id>
 */
import { prisma } from "../src/utils/database";
import { resolveKpiFinancialProfile } from "../src/services/kpiFinancialAccountingRules";
import { getKpiProgressJournalSkipReasonFromProfile } from "../src/services/kpiFinancialAccountingRules";
import { performanceProgressJournalReference } from "../src/services/KpiAccountingIntegrationService";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const taskId = arg("taskId");
  const goalIdArg = arg("goalId");

  if (!taskId && !goalIdArg) {
    console.error("Provide --taskId=... or --goalId=...");
    process.exit(1);
  }

  let goalId = goalIdArg;
  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        stage: true,
        goalId: true,
        monetaryValue: true,
        monetaryValueAchieved: true,
        percentValueAchieved: true,
        isPerformanceTask: true,
        kpi: true
      }
    });
    if (!task) {
      console.error("Task not found:", taskId);
      process.exit(1);
    }
    console.log("\n=== Task ===");
    console.log(JSON.stringify(task, null, 2));
    goalId = task.goalId ?? goalId;
    if (!goalId) {
      console.log("\nTask has no goalId — progress events / KPI journals will not run.");
      process.exit(0);
    }
  }

  const goal = await prisma.performanceGoal.findUnique({
    where: { id: goalId! },
    include: {
      kpi: {
        select: {
          id: true,
          name: true,
          code: true,
          isFinancial: true,
          accountType: true,
          accountNumber: true,
          journalEntryType: true
        }
      },
      parentGoal: { select: { id: true, title: true, type: true } }
    }
  });
  if (!goal) {
    console.error("Goal not found:", goalId);
    process.exit(1);
  }

  console.log("\n=== Linked goal ===");
  console.log({
    id: goal.id,
    title: goal.title,
    type: goal.type,
    status: goal.status,
    parentGoalId: goal.parentGoalId,
    parentTitle: goal.parentGoal?.title,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    progressPercentage: goal.progressPercentage,
    kpi: goal.kpi
      ? { name: goal.kpi.name, code: goal.kpi.code, accountNumber: goal.kpi.accountNumber }
      : null,
    syncConfig: goal.syncConfig
  });

  if (goal.kpi) {
    const profile = resolveKpiFinancialProfile({
      name: goal.kpi.name,
      code: goal.kpi.code,
      catalogDescription: null,
      catalogDepartmentName: null,
      accountType: goal.kpi.accountType,
      accountNumber: goal.kpi.accountNumber,
      journalEntryType: goal.kpi.journalEntryType,
      isFinancial: goal.kpi.isFinancial
    });
    const skip = getKpiProgressJournalSkipReasonFromProfile(profile, {
      parentGoalId: goal.parentGoalId,
      formulaType: goal.formulaType,
      amount: 1
    });
    console.log("\n=== KPI journal eligibility (incremental progress) ===");
    console.log({
      syncStrategy: profile.syncStrategy,
      postsProgressJournal: profile.postsProgressJournal,
      skipReasonIfAny: skip ?? "(would attempt JE on positive delta)"
    });
  }

  const events = await prisma.performanceGoalProgressEvent.findMany({
    where: { goalId: goal.id },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    include: {
      journalEntry: {
        select: { id: true, referenceNumber: true, status: true, totalAmount: true, transactionDate: true }
      }
    }
  });

  console.log(`\n=== Progress events (${events.length}) ===`);
  for (const e of events) {
    console.log({
      id: e.id,
      source: e.source,
      sourceRef: e.sourceRef,
      amount: e.amount?.toString(),
      recordedAt: e.recordedAt,
      journalEntryId: e.journalEntryId,
      journal: e.journalEntry
    });
  }

  const refs = events.map((e) => performanceProgressJournalReference(goal.id, e.id));
  const byRef = await prisma.journalEntry.findMany({
    where: {
      OR: [
        { referenceNumber: { startsWith: `PERF-GOAL-${goal.id}` } },
        ...(refs.length ? [{ referenceNumber: { in: refs } }] : [])
      ]
    },
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      totalAmount: true,
      transactionDate: true,
      description: true,
      journalEntryLines: {
        select: {
          debitAmount: true,
          creditAmount: true,
          description: true,
          chartOfAccount: { select: { accountNo: true, accountName: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  console.log(`\n=== Performance journals (PERF-GOAL-${goal.id}-*) (${byRef.length}) ===`);
  console.log(JSON.stringify(byRef, null, 2));

  if (taskId) {
    const logs = await prisma.activityLog.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        monetaryValueAchieved: true,
        status: true,
        createdAt: true,
        userId: true
      }
    });
    console.log(`\n=== Activity log rows for task (${logs.length}) ===`);
    console.log(JSON.stringify(logs, null, 2));
  }

  console.log("\nServer log lines to grep after POST activity:");
  console.log("  🔄 Updating linked goal progress for task:");
  console.log("  📊 Goal progress from task monetary sum:");
  console.log("  ✅ Performance progress journal posted");
  console.log("  ⏭️ Performance progress journal skipped");
  console.log("  Performance progress JE failed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
