const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteMachipsTasks() {
  try {
    console.log('🗑️  Deleting tasks for Machips application...\n');

    const APPLICATION_ID = 'cmhukf24w0000lh0468l9xojj';

    // Find all tasks for this application
    const tasks = await prisma.task.findMany({
      where: {
        applicationId: APPLICATION_ID
      },
      select: {
        id: true,
        title: true,
        createdAt: true
      }
    });

    console.log(`📋 Found ${tasks.length} task(s) for Machips:\n`);
    tasks.forEach((task, index) => {
      console.log(`${index + 1}. ${task.title} (${task.id})`);
    });

    if (tasks.length === 0) {
      console.log('\n✅ No tasks to delete.');
      return;
    }

    console.log(`\n🗑️  Deleting ${tasks.length} task(s)...\n`);

    // Delete all tasks for this application
    const result = await prisma.task.deleteMany({
      where: {
        applicationId: APPLICATION_ID
      }
    });

    console.log(`✅ Successfully deleted ${result.count} task(s)!\n`);
    console.log('📌 You can now regenerate Prisma client and create tasks with categories.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteMachipsTasks();


