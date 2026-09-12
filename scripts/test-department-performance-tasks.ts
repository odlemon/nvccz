// @ts-nocheck
import { IndividualGoalToTaskService } from '../src/services/IndividualGoalToTaskService';
import { prisma } from '../src/utils/database';

async function testDepartmentPerformanceTasks() {
  try {
    console.log('🧪 Testing Department Performance Tasks with taskPercentage...\n');

    const departmentName = 'Finance';
    console.log(`📋 Fetching performance tasks for department: ${departmentName}\n`);

    const tasks = await IndividualGoalToTaskService.getDepartmentPerformanceTasks(departmentName);

    console.log(`✅ Found ${tasks.length} task(s)\n`);

    if (tasks.length === 0) {
      console.log('ℹ️  No tasks found');
      await prisma.$disconnect();
      return;
    }

    // Check if taskPercentage is present
    console.log('🔍 Checking taskPercentage field:\n');
    
    const tasksWithPercentage = tasks.filter((t: any) => t.taskPercentage !== undefined && t.taskPercentage !== null);
    console.log(`   Tasks with taskPercentage: ${tasksWithPercentage.length}/${tasks.length}`);

    // Check completed tasks
    const completedTasks = tasks.filter((t: any) => 
      t.status === 'completed' || t.stage === 'completed'
    );
    const completedWith100 = completedTasks.filter((t: any) => t.taskPercentage === 100);

    console.log(`\n📊 Completed Tasks:`);
    console.log(`   Total completed: ${completedTasks.length}`);
    console.log(`   Completed with 100%: ${completedWith100.length}`);

    // Show sample tasks
    console.log('\n📝 Sample Tasks:\n');
    tasks.slice(0, 3).forEach((task: any, index: number) => {
      console.log(`Task ${index + 1}:`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Title: ${task.title}`);
      console.log(`   Stage: ${task.stage}`);
      console.log(`   Status: ${task.status || 'N/A'}`);
      console.log(`   taskPercentage: ${task.taskPercentage}% ${task.taskPercentage !== undefined ? '✅' : '❌ MISSING'}`);
      if (task.stage === 'completed' && task.taskPercentage !== 100) {
        console.log(`   ⚠️  WARNING: Completed task should have 100% but has ${task.taskPercentage}%`);
      }
      console.log('');
    });

    if (tasksWithPercentage.length === tasks.length) {
      console.log('✅ All tasks have taskPercentage field!');
    } else {
      console.log('⚠️  Some tasks are missing taskPercentage');
    }

    if (completedTasks.length > 0 && completedWith100.length === completedTasks.length) {
      console.log('✅ All completed tasks correctly show 100%!');
    } else if (completedTasks.length > 0) {
      console.log('⚠️  Some completed tasks don\'t have 100%');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testDepartmentPerformanceTasks();

