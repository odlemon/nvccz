/**
 * E.03 — After sending a task chat message, row is addressable as tasks/{taskId}/chats/{msgId}
 * (persisted in activity_logs; GET /api/tasks/:id/chats/:msgId).
 */
import { prisma } from "../src/utils/database";
import { TaskCollaborationService } from "../src/services/TaskCollaborationService";

async function main() {
  const taskId = "cmneen5st0003unno1toqyrwm";
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, createdBy: true }
  });
  if (!task?.createdBy) {
    throw new Error("Task or createdBy missing");
  }

  const created = await TaskCollaborationService.createTaskComment({
    taskId,
    actorId: task.createdBy,
    content: `E.03 storage test ${Date.now()}`,
    mentionUserIds: [],
    files: []
  });

  const expectedPath = TaskCollaborationService.taskChatStoragePath(taskId, created.id);
  if (created.storagePath !== expectedPath) {
    throw new Error(`storagePath mismatch: ${created.storagePath} vs ${expectedPath}`);
  }

  const fetched = await TaskCollaborationService.getTaskChatMessage(taskId, created.id, task.createdBy);
  if (fetched.storagePath !== expectedPath || fetched.content !== created.content) {
    throw new Error("getTaskChatMessage does not match created message");
  }

  const row = await prisma.activityLog.findFirst({
    where: { id: created.id, taskId }
  });
  if (!row) {
    throw new Error("activity_log row missing");
  }

  console.log(
    JSON.stringify(
      {
        uat: "E.03",
        pass: true,
        storagePath: expectedPath,
        msgId: created.id,
        taskId
      },
      null,
      2
    )
  );

  await prisma.activityLog.delete({ where: { id: created.id } });
}

main()
  .catch((e) => {
    console.error("E03_TEST_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
