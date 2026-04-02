/**
 * One-off UAT: pick a task owned by or assigned to a user, leave Red Zone if needed,
 * then call TaskService.updateTaskStage(..., 'red') so notifyTaskRedZone runs (email + notifications).
 *
 * Usage: npx ts-node scripts/trigger-task-red-zone-email-for-user.ts [userId]
 * Default userId: cml7spmbr000ckt1bcwq6pd8o
 */
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";
import { isRedZoneTask } from "../src/services/TaskCollaborationService";

const DEFAULT_USER_ID = "cml7spmbr000ckt1bcwq6pd8o";

function teamIds(team: unknown): string[] {
  if (!team) return [];
  if (Array.isArray(team)) return team.filter((x) => typeof x === "string") as string[];
  return [];
}

async function findTaskForUser(userId: string) {
  const asCreator = await prisma.task.findFirst({
    where: { createdBy: userId, isTrashed: false },
    orderBy: { updatedAt: "desc" }
  });
  if (asCreator) return asCreator;

  const candidates = await prisma.task.findMany({
    where: { isTrashed: false },
    orderBy: { updatedAt: "desc" },
    take: 800
  });
  return candidates.find((t) => teamIds(t.team).includes(userId)) ?? null;
}

async function main() {
  const userId = process.argv[2] || DEFAULT_USER_ID;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true }
  });
  if (!user) {
    console.error("User not found:", userId);
    process.exit(1);
  }

  let task = await findTaskForUser(userId);
  if (!task) {
    console.error("No non-trashed task found for user (creator or team).");
    process.exit(1);
  }

  const currentTeam = teamIds(task.team);
  if (!currentTeam.includes(userId)) {
    await prisma.task.update({
      where: { id: task.id },
      data: { team: [...currentTeam, userId] }
    });
    task = (await prisma.task.findUnique({ where: { id: task.id } }))!;
    console.log("Updated task team to include user for notifications/email.");
  }

  if (isRedZoneTask(task)) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        stage: "todo",
        status: "todo",
        isOverdue: false,
        overdueStatus: null,
        originalStage: null
      }
    });
    console.log("Task was already Red Zone; reset to todo so entering red triggers email.");
  }

  await TaskService.updateTaskStage(task.id, "red");
  console.log("OK: stage -> red for task", task.id, "| user", user.email || user.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
