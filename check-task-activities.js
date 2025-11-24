const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTaskActivities() {
  try {
    const APPLICATION_ID = 'cmhukf24w0000lh0468l9xojj';

    console.log('🔍 Checking task activities for Machips...\n');

    const tasks = await prisma.task.findMany({
      where: {
        applicationId: APPLICATION_ID
      },
      select: {
        id: true,
        title: true,
        category: true,
        stage: true,
        activities: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (tasks.length === 0) {
      console.log('❌ No tasks found.');
      return;
    }

    console.log(`📋 Found ${tasks.length} task(s):\n`);
    console.log('═══════════════════════════════════════════════════════\n');

    tasks.forEach((task, index) => {
      console.log(`${index + 1}. ${task.title}`);
      console.log(`   Category: ${task.category || 'N/A'}`);
      console.log(`   Stage: ${task.stage}`);
      console.log(`   Created: ${task.createdAt.toISOString()}`);
      console.log(`   Updated: ${task.updatedAt.toISOString()}`);
      console.log(`   Activities (${Array.isArray(task.activities) ? task.activities.length : 0}):`);
      
      if (task.activities && Array.isArray(task.activities)) {
        if (task.activities.length === 0) {
          console.log('      (No activities logged)');
        } else {
          task.activities.forEach((activity, actIndex) => {
            console.log(`      ${actIndex + 1}. [${activity.type}] ${activity.activity}`);
            console.log(`         Date: ${activity.date}`);
            console.log(`         By: ${activity.by}`);
          });
        }
      } else {
        console.log('      (Activities field is not an array or is null)');
        console.log('      Raw activities:', JSON.stringify(task.activities, null, 2));
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkTaskActivities();


