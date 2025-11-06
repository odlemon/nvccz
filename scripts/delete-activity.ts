import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const activityId = 'cmhnd7z980001l804smjw0goi';

async function deleteActivity() {
  try {
    console.log('🔍 Finding activity:', activityId);
    
    const activity = await prisma.activityLog.findUnique({
      where: { id: activityId }
    });

    if (!activity) {
      console.log('❌ Activity not found');
      return;
    }

    console.log('✅ Activity found:');
    console.log(`   Title: ${activity.title}`);
    console.log(`   Task ID: ${activity.taskId}`);
    console.log(`   User ID: ${activity.userId}`);

    console.log('\n🔄 Deleting activity...');
    await prisma.activityLog.delete({
      where: { id: activityId }
    });

    console.log('✅ Activity deleted successfully');
  } catch (error: any) {
    console.error('❌ Error deleting activity:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteActivity();

