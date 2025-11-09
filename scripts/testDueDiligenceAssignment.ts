import { DueDiligenceService } from '../src/services/DueDiligenceService';
import { TaskService } from '../src/services/TaskService';
import { prisma } from '../src/utils/database';

async function testAssignment() {
  const applicationId = process.argv[2];
  const assigneeId = process.argv[3];

  if (!applicationId || !assigneeId) {
    console.error('Usage: npx ts-node scripts/testDueDiligenceAssignment.ts <applicationId> <assigneeId>');
    process.exit(1);
  }

  console.log(`Assigning due diligence task for application ${applicationId} to user ${assigneeId}`);

  const adminUserId = 'cmhlnqd460001unnslmw98ry8';

  const assignmentResult = await DueDiligenceService.assignDueDiligenceTask(
    applicationId,
    assigneeId,
    {
      title: `Due diligence follow-up ${new Date().toISOString()}`,
      description: 'Automated test assignment',
      priority: 'high',
      dueDate: new Date()
    },
    adminUserId
  );

  console.log('Assignment response:', assignmentResult);

  const tasks = await TaskService.getUserTasks(assigneeId, {});
  const latestTask = tasks.find(task => task.id === assignmentResult.task.id);

  console.log('Created task with application:', latestTask);
}

testAssignment()
  .catch((error) => {
    console.error('Assignment test failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

