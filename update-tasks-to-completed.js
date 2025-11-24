const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateTaskStages() {
  try {
    const result = await prisma.task.updateMany({
      where: {
        applicationId: 'cmhukf24w0000lh0468l9xojj'
      },
      data: {
        stage: 'completed'
      }
    });
    
    console.log(`✅ Updated ${result.count} tasks to 'completed' stage`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateTaskStages();


