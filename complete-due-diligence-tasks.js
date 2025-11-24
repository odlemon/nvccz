const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000/api';
const APPLICATION_ID = 'cmhukf24w0000lh0468l9xojj';

// Login as the assigned user
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'blessingmwalein+5@gmail.com',
      password: 'denze123'
    });
    
    // Handle both response structures
    const userData = response.data.data || response.data;
    const token = response.data.token || userData.token;
    
    console.log('✅ Logged in as:', userData.firstName || 'User', userData.lastName || '');
    return {
      token: token,
      userId: userData.id || userData.userId
    };
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getTasks() {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        applicationId: APPLICATION_ID
      },
      select: {
        id: true,
        title: true,
        category: true,
        stage: true,
        activities: true
      }
    });
    return tasks;
  } catch (error) {
    console.error('❌ Failed to get tasks:', error.message);
    return [];
  }
}

async function completeTask(taskId, userId, taskTitle) {
  try {
    // Update task to 'done' stage and add completion activity
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        stage: 'done',
        activities: {
          push: [
            {
              type: 'done',
              activity: `Task completed: ${taskTitle}. All due diligence work has been reviewed and approved.`,
              date: new Date(),
              by: userId
            }
          ]
        },
        updatedAt: new Date()
      }
    });
    console.log(`✅ Completed task: ${taskTitle}`);
    return updatedTask;
  } catch (error) {
    console.error(`❌ Failed to complete task "${taskTitle}":`, error.message);
  }
}

async function completeAllTasks() {
  console.log('🔐 Logging in as assigned user...\n');
  const { token, userId } = await login();
  console.log(`👤 User ID: ${userId}\n`);

  console.log('📋 Fetching tasks...\n');
  const tasks = await getTasks();

  if (tasks.length === 0) {
    console.log('❌ No tasks found for Machips application.');
    return;
  }

  console.log(`📋 Found ${tasks.length} task(s):\n`);
  tasks.forEach((task, index) => {
    console.log(`${index + 1}. ${task.title} [${task.category}] - Stage: ${task.stage}`);
  });
  console.log('\n');

  // Complete only tasks that are not already done
  const tasksToComplete = tasks.filter(task => task.stage !== 'done');

  if (tasksToComplete.length === 0) {
    console.log('✅ All tasks are already completed!\n');
  } else {
    console.log(`🎯 Completing ${tasksToComplete.length} task(s)...\n`);

    for (const task of tasksToComplete) {
      await completeTask(task.id, userId, task.title);
    }

    console.log('\n🎉 All tasks completed successfully!\n');
  }

  console.log('📊 Task Summary:');
  console.log('================================');
  const finalTasks = await getTasks();
  finalTasks.forEach((task, index) => {
    const status = task.stage === 'done' ? '✅' : '⏳';
    console.log(`${status} ${task.title} [${task.category}] - ${task.stage.toUpperCase()}`);
  });
  console.log('================================\n');

  console.log('📌 Next steps:');
  console.log('1. Update due diligence assessment for all 6 areas (PUT /api/applications/{id}/due-diligence)');
  console.log('2. Complete due diligence with final recommendation (POST /api/applications/{id}/due-diligence/complete)');

  await prisma.$disconnect();
}

completeAllTasks().catch(error => {
  console.error('❌ Script failed:', error.message);
  prisma.$disconnect();
  process.exit(1);
});

