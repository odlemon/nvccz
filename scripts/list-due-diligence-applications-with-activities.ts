// @ts-nocheck
/**
 * Script to list applications with due diligence that have tasks and activity logs
 */

import { prisma } from '../src/utils/database';

async function listDueDiligenceApplicationsWithActivities() {
  try {
    console.log('🔍 Finding applications with due diligence, tasks, and activity logs...\n');

    // Get all due diligence reviews
    const dueDiligenceReviews = await prisma.dueDiligenceReview.findMany({
      include: {
        application: {
          select: {
            id: true,
            businessName: true,
            applicantName: true,
            applicantEmail: true,
            currentStage: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${dueDiligenceReviews.length} due diligence review(s)\n`);

    const applicationsWithActivities = [];

    for (const dd of dueDiligenceReviews) {
      // Find tasks related to this application
      const tasks = await prisma.task.findMany({
        where: {
          applicationId: dd.applicationId,
          fromDueDiligence: true
        },
        include: {
          activityLogs: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      // Filter to only tasks that have activity logs
      const tasksWithActivities = tasks.filter(task => task.activityLogs && task.activityLogs.length > 0);

      if (tasksWithActivities.length > 0) {
        const totalActivities = tasksWithActivities.reduce((sum, task) => sum + task.activityLogs.length, 0);
        
        applicationsWithActivities.push({
          applicationId: dd.application.id,
          businessName: dd.application.businessName,
          applicantName: dd.application.applicantName,
          applicantEmail: dd.application.applicantEmail,
          currentStage: dd.application.currentStage,
          dueDiligenceStatus: dd.status,
          tasksCount: tasksWithActivities.length,
          totalActivities: totalActivities,
          tasks: tasksWithActivities.map(task => ({
            taskId: task.id,
            taskTitle: task.title,
            activitiesCount: task.activityLogs.length,
            activities: task.activityLogs.map(activity => ({
              activityId: activity.id,
              activityTitle: activity.title,
              status: activity.status,
              createdBy: `${activity.user.firstName} ${activity.user.lastName}`,
              createdAt: activity.createdAt
            }))
          }))
        });
      }
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📋 Applications with Due Diligence, Tasks, and Activity Logs`);
    console.log('════════════════════════════════════════════════════════════════\n');

    if (applicationsWithActivities.length === 0) {
      console.log('❌ No applications found with due diligence tasks that have activity logs.\n');
    } else {
      applicationsWithActivities.forEach((app, index) => {
        console.log(`${index + 1}. ${app.businessName}`);
        console.log(`   Applicant: ${app.applicantName} (${app.applicantEmail})`);
        console.log(`   Application ID: ${app.applicationId}`);
        console.log(`   Current Stage: ${app.currentStage}`);
        console.log(`   Due Diligence Status: ${app.dueDiligenceStatus}`);
        console.log(`   Tasks with Activities: ${app.tasksCount}`);
        console.log(`   Total Activities: ${app.totalActivities}`);
        console.log('\n   Tasks:');
        app.tasks.forEach((task, taskIndex) => {
          console.log(`   ${taskIndex + 1}. ${task.taskTitle}`);
          console.log(`      Activities: ${task.activitiesCount}`);
          task.activities.forEach((activity, actIndex) => {
            console.log(`      ${actIndex + 1}. ${activity.activityTitle}`);
            console.log(`         Status: ${activity.status}`);
            console.log(`         Created by: ${activity.createdBy}`);
            console.log(`         Created at: ${activity.createdAt.toISOString()}`);
          });
        });
        console.log('\n────────────────────────────────────────────────────────────\n');
      });

      console.log(`\n✅ Total: ${applicationsWithActivities.length} application(s) with due diligence tasks containing activity logs\n`);
    }

    // Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 Summary');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Due Diligence Reviews: ${dueDiligenceReviews.length}`);
    console.log(`Applications with Tasks & Activities: ${applicationsWithActivities.length}`);
    
    if (applicationsWithActivities.length > 0) {
      const totalTasks = applicationsWithActivities.reduce((sum, app) => sum + app.tasksCount, 0);
      const totalActivities = applicationsWithActivities.reduce((sum, app) => sum + app.totalActivities, 0);
      console.log(`Total Tasks with Activities: ${totalTasks}`);
      console.log(`Total Activity Logs: ${totalActivities}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
listDueDiligenceApplicationsWithActivities()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

