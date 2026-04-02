/**
 * D.06 Deadline Validation
 * - Create task with past deadline (historical entry)
 * - System should accept creation
 * - Task should be flagged overdue/red-zone (unless completed)
 */
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";
import { resolveTaskPerformanceZone } from "../src/services/TaskCollaborationService";

async function main() {
  const actor = await prisma.user.findFirst();
  if (!actor) {
    throw new Error("D.06: no user found");
  }

  let taskId: string | undefined;
  try {
    const task = await TaskService.createTask(
      {
        title: `D06 historical back-entry ${Date.now()}`,
        description: "Historical task entry for audit trail",
        team: [actor.id],
        stage: "todo",
        date: new Date("2020-01-15T00:00:00.000Z"),
        priority: "medium"
      },
      actor.id
    );
    taskId = task.id;

    const loaded = await prisma.task.findUnique({ where: { id: task.id } });
    if (!loaded) {
      throw new Error("D.06: created task not found");
    }

    const zone = resolveTaskPerformanceZone(loaded);
    const pass = Boolean(loaded.id) && loaded.isOverdue === true && zone === "RED ZONE";

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "D.06",
          taskId: loaded.id,
          observed: {
            created: true,
            dueDate: loaded.date,
            stage: loaded.stage,
            isOverdue: loaded.isOverdue,
            overdueStatus: loaded.overdueStatus,
            performanceZone: zone
          },
          pass
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("D.06 assertions failed");
    }
  } finally {
    if (taskId) {
      await prisma.activityLog.deleteMany({ where: { taskId } }).catch(() => undefined);
      await prisma.task.delete({ where: { id: taskId } }).catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error("D06_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

