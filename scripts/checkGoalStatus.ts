import { EnhancedGoalTrackingService } from '../src/services/EnhancedGoalTrackingService';

const goalId = process.argv[2];

if (!goalId) {
  console.error('Usage: npx ts-node scripts/checkGoalStatus.ts <goalId>');
  process.exit(1);
}

EnhancedGoalTrackingService.checkGoalStatus(goalId)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error('Error checking goal status:', error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../src/utils/database');
    await prisma.$disconnect();
  });

