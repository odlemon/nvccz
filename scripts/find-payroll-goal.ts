import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findPayrollGoal() {
  try {
    // Search for goals with "Payroll" in the title (case-insensitive)
    // MySQL doesn't support case-insensitive search directly, so we'll get all and filter
    const allGoals = await prisma.performanceGoal.findMany({
      include: {
        kpi: {
          select: {
            id: true,
            name: true,
            type: true,
            unitSymbol: true,
            unitPosition: true,
            unit: true,
            unitCategory: true,
          },
        },
      },
    });

    // Filter case-insensitively for payroll
    const goals = allGoals.filter(goal => 
      goal.title.toLowerCase().includes('payroll') ||
      goal.title.toLowerCase().includes('control')
    );

    console.log(`Found ${goals.length} goal(s) with "Payroll" in title:\n`);
    
    goals.forEach((goal, index) => {
      console.log(`\n${index + 1}. Goal: "${goal.title}"`);
      console.log(`   ID: ${goal.id}`);
      console.log(`   KPI ID: ${goal.kpiId || 'None'}`);
      if (goal.kpi) {
        console.log(`   KPI Name: ${goal.kpi.name}`);
        console.log(`   KPI Type: ${goal.kpi.type}`);
        console.log(`   KPI Unit: ${goal.kpi.unit || 'N/A'}`);
        console.log(`   KPI Unit Symbol: ${goal.kpi.unitSymbol || 'N/A'}`);
      } else {
        console.log(`   KPI: Not linked to any KPI`);
      }
    });

    // Also search for "control" in case it's "Payroll control"
    const controlGoals = allGoals.filter(goal => 
      goal.title.toLowerCase().includes('control')
    );

    if (controlGoals.length > 0) {
      console.log(`\n\nFound ${controlGoals.length} goal(s) with "control" in title:\n`);
      controlGoals.forEach((goal, index) => {
        console.log(`\n${index + 1}. Goal: "${goal.title}"`);
        console.log(`   ID: ${goal.id}`);
        console.log(`   KPI ID: ${goal.kpiId || 'None'}`);
        if (goal.kpi) {
          console.log(`   KPI Name: ${goal.kpi.name}`);
          console.log(`   KPI Type: ${goal.kpi.type}`);
          console.log(`   KPI Unit: ${goal.kpi.unit || 'N/A'}`);
          console.log(`   KPI Unit Symbol: ${goal.kpi.unitSymbol || 'N/A'}`);
        } else {
          console.log(`   KPI: Not linked to any KPI`);
        }
      });
    }

    // List all goals if none found
    if (goals.length === 0 && controlGoals.length === 0) {
      console.log(`\n\nNo Payroll goals found. Showing all ${allGoals.length} goals in database:\n`);
      if (allGoals.length === 0) {
        console.log('No goals exist in the database.');
      } else {
        allGoals.forEach((goal, index) => {
          console.log(`${index + 1}. "${goal.title}" - KPI: ${goal.kpi?.name || 'None'}`);
        });
      }
    }

  } catch (error) {
    console.error('Error finding payroll goal:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findPayrollGoal();

