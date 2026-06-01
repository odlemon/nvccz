/**
 * Backfill company goals: progressPercentage/stage/status from current/target,
 * assignedToId → CEO when null. Logs how value was recorded (events vs direct columns).
 *
 * Usage:
 *   npm run db:backfill:company-goal-progress-owner
 *   GOAL_IDS=id1,id2 npm run db:backfill:company-goal-progress-owner
 *
 * Safe to re-run (idempotent when data already correct).
 */
// @ts-nocheck
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { deriveGoalProgressState, parseGoalCurrentAndTargetForAnalytics } from "../src/services/performanceGoalRollupUtils";
import { legacyProgressFieldsForGoal } from "../src/services/PerformanceGoalService";
import { resolveDefaultCompanyGoalAssigneeId } from "../src/services/performanceGoalDefaultAssignee";
import { PerformanceGoalProgressEventService } from "../src/services/PerformanceGoalProgressEventService";

async function main() {
  const goalIdsEnv = String(process.env.GOAL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const where: any = { type: "company" };
  if (goalIdsEnv.length) {
    where.id = { in: goalIdsEnv };
  }

  const goals = await prisma.performanceGoal.findMany({
    where,
    include: {
      performanceContract: { select: { id: true, contractType: true, title: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } }
    },
    orderBy: { displayOrder: "asc" }
  });

  console.log(`Found ${goals.length} company goal(s) to inspect.\n`);

  const ceoId = await resolveDefaultCompanyGoalAssigneeId();
  const ceoUser = ceoId
    ? await prisma.user.findUnique({
        where: { id: ceoId },
        select: { firstName: true, lastName: true, email: true }
      })
    : null;
  const ceoLabel = ceoUser
    ? `${ceoUser.firstName || ""} ${ceoUser.lastName || ""}`.trim() || ceoUser.email
    : "(none resolved)";

  let progressUpdated = 0;
  let assigneeUpdated = 0;

  for (const goal of goals) {
    const { current, target } = parseGoalCurrentAndTargetForAnalytics(goal);
    const eventSum = await PerformanceGoalProgressEventService.sumEventsForGoal(goal.id, false);
    const events = await prisma.performanceGoalProgressEvent.findMany({
      where: { goalId: goal.id },
      select: { source: true, amount: true },
      orderBy: { recordedAt: "asc" }
    });
    const eventsBySource: Record<string, number> = {};
    for (const e of events) {
      const src = String(e.source || "unknown");
      eventsBySource[src] = (eventsBySource[src] || 0) + parseFloat(String(e.amount ?? 0));
    }

    const oldProgress = goal.progressPercentage != null ? parseFloat(String(goal.progressPercentage)) : 0;
    const progressState = deriveGoalProgressState({
      currentValue: current,
      targetValue: target,
      targetOperator: goal.targetOperator,
      isReverseKpi: goal.isReverseKpi,
      previousStage: goal.stage,
      progressPercentage: goal.progressPercentage
    });
    const newProgress = parseFloat(progressState.progressPercentage);

    const patch: Record<string, unknown> = {};
    let changed = false;

    if (
      Math.abs(oldProgress - newProgress) > 0.009 ||
      goal.stage !== progressState.stage ||
      goal.status !== progressState.status
    ) {
      patch.progressPercentage = progressState.progressPercentage;
      patch.stage = progressState.stage;
      patch.status = progressState.status;
      patch.preciseCurrentValue = String(current);
      if (target > 0) {
        patch.preciseTargetValue = String(target);
      }
      Object.assign(patch, legacyProgressFieldsForGoal(goal, current));
      changed = true;
      progressUpdated += 1;
    }

    if (!goal.assignedToId && ceoId) {
      patch.assignedToId = ceoId;
      changed = true;
      assigneeUpdated += 1;
    }

    console.log("---");
    console.log(`Goal: ${goal.title} (${goal.id})`);
    console.log(
      `  Contract: ${goal.performanceContract?.contractType || "—"} ${goal.performanceContract?.title || ""}`
    );
    console.log(`  currentValue=${current} targetValue=${target} (stored progress was ${oldProgress}%)`);
    console.log(`  → progress ${newProgress}% stage=${progressState.stage} status=${progressState.status}`);
    console.log(`  Value achieved: eventSum=${eventSum} | activities=${JSON.stringify(goal.activities || {})}`);
    console.log(
      `  Progress events by source: ${Object.keys(eventsBySource).length ? JSON.stringify(eventsBySource) : "(none)"}`
    );
    console.log(
      `  monetaryValueAchieved=${goal.monetaryValueAchieved} percentValueAchieved=${goal.percentValueAchieved}`
    );
    console.log(`  Owner: ${goal.assignedToId ? "already set" : `→ CEO ${ceoLabel}`}`);

    if (changed) {
      await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: { ...patch, updatedAt: new Date() }
      });
      console.log("  [updated]");
    } else {
      console.log("  [skip] no changes");
    }
  }

  console.log(`\nDone. Progress/stage updated: ${progressUpdated}. Assignee set: ${assigneeUpdated}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
