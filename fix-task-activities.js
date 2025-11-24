const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLICATION_ID = 'cmhukf24w0000lh0468l9xojj';
const USER_ID = 'cmhnuwcev0001ii04wz7es15b'; // The assignee

async function fixTaskActivities() {
  try {
    console.log('🔧 Fixing task activities for Machips...\n');

    const tasks = await prisma.task.findMany({
      where: {
        applicationId: APPLICATION_ID
      }
    });

    console.log(`📋 Found ${tasks.length} task(s) to fix\n`);

    for (const task of tasks) {
      console.log(`📝 Fixing: ${task.title}`);
      
      // Get existing activities or initialize as empty array
      let activities = [];
      
      // Check if activities exist and are an array
      if (task.activities && Array.isArray(task.activities)) {
        activities = task.activities;
      }
      
      // Add completion activity
      activities.push({
        type: 'done',
        activity: `Task completed: ${task.title}. All due diligence work has been reviewed and approved.`,
        date: new Date(),
        by: USER_ID
      });

      // Update the task with proper activities array
      await prisma.task.update({
        where: { id: task.id },
        data: {
          activities: activities,
          updatedAt: new Date()
        }
      });

      console.log(`   ✅ Added completion activity (Total activities: ${activities.length})`);
    }

    console.log('\n🎉 All task activities fixed!\n');
    
    // Verify
    console.log('🔍 Verifying activities...\n');
    const verifyTasks = await prisma.task.findMany({
      where: { applicationId: APPLICATION_ID },
      select: {
        title: true,
        activities: true
      }
    });

    verifyTasks.forEach(task => {
      console.log(`✅ ${task.title}: ${task.activities?.length || 0} activities`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

fixTaskActivities();


