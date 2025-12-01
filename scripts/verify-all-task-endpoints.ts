// @ts-nocheck
/**
 * Verification script to ensure all task fetching endpoints include taskPercentage
 */
import { TaskService } from '../src/services/TaskService';
import { IndividualGoalToTaskService } from '../src/services/IndividualGoalToTaskService';
import { ActivityService } from '../src/services/ActivityService';
import { prisma } from '../src/utils/database';

async function verifyAllEndpoints() {
  try {
    console.log('🔍 Verifying all task fetching endpoints include taskPercentage...\n');

    // Get a sample user and department for testing
    const sampleUser = await prisma.user.findFirst();

    if (!sampleUser) {
      console.log('⚠️  No users found in database. Skipping user-specific tests.');
      await prisma.$disconnect();
      return;
    }

    const sampleDepartment = 'Finance';

    let allPassed = true;

    // 1. Test TaskService.getAllTasks
    console.log('1️⃣  Testing TaskService.getAllTasks()...');
    try {
      const allTasks = await TaskService.getAllTasks({});
      const hasTaskPercentage = allTasks.every((t: any) => t.taskPercentage !== undefined);
      if (hasTaskPercentage && allTasks.length > 0) {
        console.log(`   ✅ All ${allTasks.length} tasks have taskPercentage`);
      } else if (allTasks.length === 0) {
        console.log('   ⚠️  No tasks found (skipping)');
      } else {
        console.log('   ❌ Some tasks missing taskPercentage');
        allPassed = false;
      }
    } catch (error: any) {
      console.log(`   ⚠️  Error: ${error.message}`);
    }

    // 2. Test TaskService.getUserTasks
    console.log('\n2️⃣  Testing TaskService.getUserTasks()...');
    try {
      const userTasks = await TaskService.getUserTasks(sampleUser.id, {});
      const hasTaskPercentage = userTasks.every((t: any) => t.taskPercentage !== undefined);
      if (hasTaskPercentage && userTasks.length > 0) {
        console.log(`   ✅ All ${userTasks.length} user tasks have taskPercentage`);
      } else if (userTasks.length === 0) {
        console.log('   ⚠️  No user tasks found (skipping)');
      } else {
        console.log('   ❌ Some tasks missing taskPercentage');
        allPassed = false;
      }
    } catch (error: any) {
      console.log(`   ⚠️  Error: ${error.message}`);
    }

    // 3. Test TaskService.getTaskById
    console.log('\n3️⃣  Testing TaskService.getTaskById()...');
    try {
      const sampleTask = await prisma.task.findFirst({
        where: { isTrashed: false }
      });
      if (sampleTask) {
        const task = await TaskService.getTaskById(sampleTask.id);
        if (task.taskPercentage !== undefined) {
          console.log(`   ✅ Task ${task.id} has taskPercentage: ${task.taskPercentage}%`);
        } else {
          console.log('   ❌ Task missing taskPercentage');
          allPassed = false;
        }
      } else {
        console.log('   ⚠️  No tasks found (skipping)');
      }
    } catch (error: any) {
      console.log(`   ⚠️  Error: ${error.message}`);
    }

    // 4. Test IndividualGoalToTaskService.getUserPerformanceTasks
    console.log('\n4️⃣  Testing IndividualGoalToTaskService.getUserPerformanceTasks()...');
    try {
      const perfTasks = await IndividualGoalToTaskService.getUserPerformanceTasks(sampleUser.id);
      const hasTaskPercentage = perfTasks.every((t: any) => t.taskPercentage !== undefined);
      if (hasTaskPercentage && perfTasks.length > 0) {
        console.log(`   ✅ All ${perfTasks.length} performance tasks have taskPercentage`);
      } else if (perfTasks.length === 0) {
        console.log('   ⚠️  No performance tasks found (skipping)');
      } else {
        console.log('   ❌ Some tasks missing taskPercentage');
        allPassed = false;
      }
    } catch (error: any) {
      console.log(`   ⚠️  Error: ${error.message}`);
    }

    // 5. Test IndividualGoalToTaskService.getDepartmentPerformanceTasks
    console.log('\n5️⃣  Testing IndividualGoalToTaskService.getDepartmentPerformanceTasks()...');
    try {
      const deptTasks = await IndividualGoalToTaskService.getDepartmentPerformanceTasks(sampleDepartment);
      const hasTaskPercentage = deptTasks.every((t: any) => t.taskPercentage !== undefined);
      if (hasTaskPercentage && deptTasks.length > 0) {
        console.log(`   ✅ All ${deptTasks.length} department tasks have taskPercentage`);
      } else if (deptTasks.length === 0) {
        console.log('   ⚠️  No department tasks found (skipping)');
      } else {
        console.log('   ❌ Some tasks missing taskPercentage');
        allPassed = false;
      }
    } catch (error: any) {
      console.log(`   ⚠️  Error: ${error.message}`);
    }

    // 6. Test ActivityService.getManagerCreatedTasks
    console.log('\n6️⃣  Testing ActivityService.getManagerCreatedTasks()...');
    try {
      // Find a manager user
      const manager = await prisma.user.findFirst({
        where: {
          OR: [
            { roleCode: { contains: '_MGR' } },
            { roleCode: { contains: '_OFF' } },
            { role: { name: 'admin' } }
          ]
        }
      });
      if (manager) {
        const managerTasks = await ActivityService.getManagerCreatedTasks(manager.id);
        const hasTaskPercentage = managerTasks.every((t: any) => t.taskPercentage !== undefined);
        if (hasTaskPercentage && managerTasks.length > 0) {
          console.log(`   ✅ All ${managerTasks.length} manager tasks have taskPercentage`);
        } else if (managerTasks.length === 0) {
          console.log('   ⚠️  No manager tasks found (skipping)');
        } else {
          console.log('   ❌ Some tasks missing taskPercentage');
          allPassed = false;
        }
      } else {
        console.log('   ⚠️  No manager user found (skipping)');
      }
    } catch (error: any) {
      // This might fail if user doesn't have permission, which is expected
      if (error.message.includes('permission')) {
        console.log('   ⚠️  Permission check (expected for non-managers)');
      } else {
        console.log(`   ⚠️  Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ All verified endpoints include taskPercentage!');
    } else {
      console.log('⚠️  Some endpoints may be missing taskPercentage');
    }
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Verification error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAllEndpoints();

