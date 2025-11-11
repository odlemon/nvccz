//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';

async function main() {
  console.log('🔄 Recalculating progress for all performance goals...');

  const goals = await prisma.performanceGoal.findMany({
    select: {
      id: true,
      title: true,
      currentValue: true,
      targetValue: true,
      progressPercentage: true,
      status: true,
      stage: true
    }
  });

  let updated = 0;

  for (const goal of goals) {
    const currentValue = goal.currentValue ? Number(goal.currentValue) : 0;
    const targetValue = goal.targetValue ? Number(goal.targetValue) : 0;
    let progress = goal.progressPercentage ? Number(goal.progressPercentage) : 0;

    if (targetValue > 0) {
      progress = Math.min((currentValue / targetValue) * 100, 100);
    } else if (goal.status === 'completed' || goal.stage === 'completed') {
      progress = 100;
    }

    const stage =
      progress >= 100
        ? 'completed'
        : progress > 0
        ? 'in_progress'
        : goal.stage || 'planning';

    const status =
      progress >= 100
        ? 'completed'
        : goal.status || 'active';

    if (
      progress !== (goal.progressPercentage ? Number(goal.progressPercentage) : 0) ||
      stage !== goal.stage ||
      status !== goal.status
    ) {
      await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          progressPercentage: progress,
          stage,
          status,
          updatedAt: new Date()
        }
      });
      updated++;
      console.log(`✅ ${goal.title} (${goal.id}) → ${progress.toFixed(1)}% (${stage})`);
    }
  }

  console.log(`🎉 Finished. Updated ${updated} goal(s).`);
}

main()
  .catch(error => {
    console.error('❌ Failed to recalculate goal progress:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


