//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';
import { PerformanceWorkflowService } from '../src/services/PerformanceWorkflowService';

async function main() {
  console.log('🔍 Recalculating goal progress from task activities...');

  const tasks = await prisma.task.findMany({
    where: {
      fromDueDiligence: false,
      goalId: { not: null },
      isTrashed: false
    },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          progressPercentage: true
        }
      }
    }
  });

  let updatedCount = 0;

  for (const task of tasks) {
    if (!task.goal) continue;

    const lastActivity = await prisma.activityLog.findFirst({
      where: { taskId: task.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastActivity) continue;

    // Skip goals that already have progress > 0
    const progressValue = task.goal.progressPercentage ? Number(task.goal.progressPercentage) : 0;
    if (progressValue > 0) continue;

    await PerformanceWorkflowService.updateProgressFromTasks(task.id);
    updatedCount++;
    console.log(`✅ Recalculated goal progress via task ${task.id} → goal ${task.goal.id}`);
  }

  console.log(`🎉 Done. Updated ${updatedCount} goal(s).`);
}

main()
  .catch(error => {
    console.error('❌ Failed to recalculate goal progress:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

