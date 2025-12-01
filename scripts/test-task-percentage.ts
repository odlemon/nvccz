// @ts-nocheck
import { prisma } from '../src/utils/database';
import { TaskService } from '../src/services/TaskService';

async function testTaskPercentage() {
  try {
    console.log('🧪 Testing Task Percentage Computation...\n');

    // Get some tasks
    console.log('📋 Fetching tasks...');
    const tasks = await TaskService.getAllTasks({});

    console.log(`✅ Found ${tasks.length} task(s)\n`);

    if (tasks.length === 0) {
      console.log('ℹ️  No tasks found to test');
      await prisma.$disconnect();
      return;
    }

    // Check completed tasks
    const completedTasks = tasks.filter((t: any) => 
      t.status === 'completed' || t.stage === 'completed'
    );

    console.log(`📊 Analysis:\n`);
    console.log(`   Total tasks: ${tasks.length}`);
    console.log(`   Completed tasks: ${completedTasks.length}\n`);

    // Test a few tasks
    console.log('🔍 Sample Tasks with taskPercentage:\n');
    
    tasks.slice(0, 5).forEach((task: any, index: number) => {
      console.log(`Task ${index + 1}:`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Title: ${task.title}`);
      console.log(`   Stage: ${task.stage}`);
      console.log(`   Status: ${task.status || 'N/A'}`);
      console.log(`   Monetary Value: ${task.monetaryValue || 'N/A'}`);
      console.log(`   Monetary Value Achieved: ${task.monetaryValueAchieved || 'N/A'}`);
      console.log(`   Percent Value: ${task.percentValue || 'N/A'}`);
      console.log(`   Percent Value Achieved: ${task.percentValueAchieved || 'N/A'}`);
      console.log(`   taskPercentage: ${task.taskPercentage}% ${task.taskPercentage === 100 && (task.status === 'completed' || task.stage === 'completed') ? '✅' : task.taskPercentage !== undefined ? '✅' : '❌'}`);
      console.log('');
    });

    // Verify completed tasks have 100%
    const completedWithPercentage = completedTasks.filter((t: any) => t.taskPercentage === 100);
    console.log(`\n✅ Completed Tasks Verification:`);
    console.log(`   Completed tasks: ${completedTasks.length}`);
    console.log(`   Completed tasks with 100%: ${completedWithPercentage.length}`);
    
    if (completedTasks.length > 0 && completedWithPercentage.length === completedTasks.length) {
      console.log(`   ✅ All completed tasks have 100% taskPercentage!`);
    } else if (completedTasks.length > 0) {
      console.log(`   ⚠️  Some completed tasks don't have 100%:`);
      completedTasks.forEach((t: any) => {
        if (t.taskPercentage !== 100) {
          console.log(`      - ${t.title}: ${t.taskPercentage}% (should be 100%)`);
        }
      });
    }

    // Check if all tasks have taskPercentage
    const tasksWithPercentage = tasks.filter((t: any) => t.taskPercentage !== undefined && t.taskPercentage !== null);
    console.log(`\n📊 taskPercentage Field:`);
    console.log(`   Tasks with taskPercentage: ${tasksWithPercentage.length}/${tasks.length}`);
    
    if (tasksWithPercentage.length === tasks.length) {
      console.log(`   ✅ All tasks have taskPercentage field!`);
    } else {
      console.log(`   ⚠️  Some tasks are missing taskPercentage`);
    }

    console.log('\n✅ Test completed!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testTaskPercentage();

