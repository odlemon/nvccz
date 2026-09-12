/**
 * D.05 Bulk Status Update
 * - Create 5 tasks linked to one department goal.
 * - Bulk move all 5 to "completed".
 * - Assert all 5 updated and parent goal roll-up recalculated once.
 */
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";

async function main() {
  const template = await prisma.performanceGoal.findFirst({
    where: {
      type: "department",
      parentGoalId: { not: null }
    }
  });
  if (!template?.parentGoalId) {
    throw new Error("D.05: need a department goal with a parent");
  }

  const actor = await prisma.user.findUnique({ where: { id: template.createdById } });
  if (!actor) {
    throw new Error("D.05: template creator not found");
  }

  const taskIds: string[] = [];
  let recalcCalls = 0;
  const originalRecalc = (TaskService as any).recalculateGoalProgressFromTasks;

  try {
    for (let i = 1; i <= 5; i += 1) {
      const created = await prisma.task.create({
        data: {
          title: `D05 bulk task ${i} ${Date.now()}`,
          description: "D.05 disposable",
          team: [actor.id],
          stage: "todo",
          date: new Date(Date.now() + 86400000),
          priority: "medium",
          goalId: template.id,
          isPerformanceTask: true,
          performanceCategory: "performance",
          createdBy: actor.id,
          activities: []
        }
      });
      taskIds.push(created.id);
    }

    (TaskService as any).recalculateGoalProgressFromTasks = async (...args: any[]) => {
      recalcCalls += 1;
      return originalRecalc.apply(TaskService, args);
    };

    const updated = await TaskService.bulkUpdateTaskStage(taskIds, "completed", {}, actor.id);
    const allCompleted = updated.length === 5 && updated.every((t: any) => String(t.stage) === "completed");
    const recalcOnce = recalcCalls === 1;
    const pass = allCompleted && recalcOnce;

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "D.05",
          setup: {
            linkedGoalId: template.id,
            parentGoalId: template.parentGoalId,
            createdTasks: taskIds.length
          },
          observed: {
            updatedCount: updated.length,
            allCompleted,
            recalcCallsForGoal: recalcCalls
          },
          pass
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("D.05 assertions failed");
    }
  } finally {
    (TaskService as any).recalculateGoalProgressFromTasks = originalRecalc;
    if (taskIds.length > 0) {
      await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } }).catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error("D05_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

