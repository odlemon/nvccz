/**
 * D.06 historical-entry endpoint semantics UAT
 * - Create task
 * - Record historical entry with past date + collected values
 * - Verify accepted + red zone + collected values persisted
 */
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";
import { resolveTaskPerformanceZone } from "../src/services/TaskCollaborationService";

async function main() {
  const actor = await prisma.user.findFirst();
  if (!actor) {
    throw new Error("D.06 historical-entry: no actor found");
  }

  let taskId: string | undefined;
  try {
    const task = await TaskService.createTask(
      {
        title: `D06 endpoint historical ${Date.now()}`,
        description: "Historical endpoint UAT",
        team: [actor.id],
        stage: "todo",
        date: new Date(Date.now() + 86400000),
        priority: "medium"
      },
      actor.id
    );
    taskId = task.id;

    const updated = await TaskService.recordHistoricalTaskEntry(
      task.id,
      {
        historicalDate: new Date("2020-05-20T00:00:00.000Z"),
        stage: "todo",
        monetaryValueAchieved: 250,
        percentValueAchieved: 15,
        note: "Backfilled from legacy spreadsheet",
        source: "legacy_import"
      },
      actor.id
    );

    const zone = resolveTaskPerformanceZone(updated);
    const pass =
      updated.isOverdue === true &&
      zone === "RED ZONE" &&
      Number(updated.monetaryValueAchieved || 0) >= 250 &&
      Number(updated.percentValueAchieved || 0) >= 15;

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "D.06.historical-entry",
          taskId: updated.id,
          observed: {
            dueDate: updated.date,
            stage: updated.stage,
            isOverdue: updated.isOverdue,
            overdueStatus: updated.overdueStatus,
            performanceZone: zone,
            monetaryValueAchieved: updated.monetaryValueAchieved,
            percentValueAchieved: updated.percentValueAchieved
          },
          pass
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("D.06 historical-entry assertions failed");
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
    console.error("D06_HISTORICAL_ENDPOINT_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

