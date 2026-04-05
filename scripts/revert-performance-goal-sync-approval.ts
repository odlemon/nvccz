/**
 * Puts a performance goal back into "pending approval" after an approved sync,
 * so you can re-test POST /api/performance/integration/sync + /approve flows.
 *
 * Usage:
 *   npx ts-node scripts/revert-performance-goal-sync-approval.ts <goalId>
 *   npx ts-node scripts/revert-performance-goal-sync-approval.ts   # uses GOAL_ID env
 *
 * Example (B.12 UAT goal):
 *   npx ts-node scripts/revert-performance-goal-sync-approval.ts cmnjvhr6y0002unso5nwy8rsl
 */
import { prisma } from "../src/utils/database";

async function main() {
  const goalId = (process.argv[2] || process.env.GOAL_ID || "").trim();
  if (!goalId) {
    console.error("Usage: npx ts-node scripts/revert-performance-goal-sync-approval.ts <goalId>");
    process.exit(1);
  }

  const goal = await prisma.performanceGoal.findUnique({
    where: { id: goalId }
  });
  if (!goal) {
    throw new Error(`Goal not found: ${goalId}`);
  }

  const pendingStr =
    goal.lastSyncedValue != null && String(goal.lastSyncedValue).trim() !== ""
      ? String(goal.lastSyncedValue)
      : goal.preciseCurrentValue != null && String(goal.preciseCurrentValue).trim() !== ""
        ? String(goal.preciseCurrentValue)
        : null;

  if (!pendingStr) {
    throw new Error("Goal has no lastSyncedValue / preciseCurrentValue to re-pend.");
  }

  await prisma.performanceGoal.update({
    where: { id: goalId },
    data: {
      isPendingApproval: true,
      pendingActualValue: pendingStr,
      currentValue: 0,
      lastApprovedValue: null,
      progressPercentage: 0,
      preciseCurrentValue: pendingStr,
      lastSyncedValue: pendingStr,
      stage: "in_progress",
      status: "active",
      monetaryValueAchieved: 0,
      percentValueAchieved: 0
    }
  });

  if (goal.lastSyncJobId) {
    await prisma.performanceSyncJob.update({
      where: { id: goal.lastSyncJobId },
      data: {
        approvalStatus: "PENDING_APPROVAL",
        status: "PENDING_APPROVAL",
        approvedById: null,
        overrideComment: null
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        goalId,
        message:
          "Goal reset to pending approval; currentValue/progress cleared. Call sync again or approve with the pending value."
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
