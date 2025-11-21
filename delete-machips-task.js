const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteExistingTask() {
  try {
    const application = await prisma.application.findFirst({
      where: {
        businessName: 'Machips'
      },
      include: {
        tasks: true
      }
    });
    if (!application) {
      console.log('❌ Application "Machips" not found.');
      return;
    }

    const existingTask = application.tasks.find(task => task.fromDueDiligence);
    if (!existingTask) {
      console.log('ℹ️ No due diligence task found for Machips.');
      return;
    }

    await prisma.task.delete({ where: { id: existingTask.id } });
    console.log(`✅ Deleted task ${existingTask.id} for Machips.`);
  } catch (error) {
    console.error('❌ Error deleting task:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteExistingTask();

