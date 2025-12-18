import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function manuallySyncPayrollToGoals() {
  try {
    console.log('🔄 Manually syncing payroll to goals...\n');

    // Get the Payroll Expense KPI
    const payrollKPI = await prisma.kPI.findFirst({
      where: {
        name: 'Payroll Expense'
      }
    });

    if (!payrollKPI) {
      console.log('❌ Payroll Expense KPI not found.');
      return;
    }

    console.log(`✅ Found Payroll Expense KPI: ${payrollKPI.id}\n`);

    // Find all goals linked to Payroll Expense KPI
    const goals = await prisma.performanceGoal.findMany({
      where: {
        kpiId: payrollKPI.id,
        status: {
          in: ['active', 'completed']
        }
      },
      select: {
        id: true,
        title: true,
        targetValue: true,
        currentValue: true,
        startDate: true,
        endDate: true,
        kpiId: true,
        completedAt: true
      }
    });

    console.log(`Found ${goals.length} goal(s) linked to Payroll Expense KPI\n`);

    // Update each goal
    for (const goal of goals) {
      console.log(`Processing goal: "${goal.title}"`);
      console.log(`  Date Range: ${new Date(goal.startDate).toISOString().split('T')[0]} to ${new Date(goal.endDate).toISOString().split('T')[0]}`);

      // Sum all COMPLETED payroll runs within goal's date range
      const relevantPayrollRuns = await prisma.payrollRun.findMany({
        where: {
          status: 'COMPLETED',
          endDate: {
            gte: goal.startDate,
            lte: goal.endDate
          }
        },
        select: {
          id: true,
          name: true,
          payPeriod: true,
          totalGrossPay: true,
          endDate: true
        }
      });

      console.log(`  Found ${relevantPayrollRuns.length} completed payroll run(s) in date range:`);
      let totalPayrollExpense = new Decimal(0);
      relevantPayrollRuns.forEach((run, index) => {
        console.log(`    ${index + 1}. ${run.name} (${run.payPeriod}): $${run.totalGrossPay?.toString() || '0'}`);
        if (run.totalGrossPay) {
          totalPayrollExpense = totalPayrollExpense.add(run.totalGrossPay);
        }
      });

      const totalPayrollValue = parseFloat(totalPayrollExpense.toString());
      const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = targetValue > 0 
        ? Math.min((totalPayrollValue / targetValue) * 100, 100) 
        : 0;
      const isCompleted = totalPayrollValue >= targetValue;

      console.log(`  Total Payroll: $${totalPayrollValue.toFixed(2)}`);
      console.log(`  Target: $${targetValue.toFixed(2)}`);
      console.log(`  Progress: ${progressPercentage.toFixed(1)}%`);
      console.log(`  Status: ${isCompleted ? 'COMPLETED' : 'ACTIVE'}`);

      // Update goal
      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: totalPayrollValue,
          monetaryValueAchieved: totalPayrollValue,
          progressPercentage: progressPercentage,
          status: isCompleted ? 'completed' : 'active',
          stage: isCompleted ? 'completed' : 'in_progress',
          completedAt: isCompleted && !goal.completedAt ? new Date() : goal.completedAt,
          updatedAt: new Date()
        }
      });

      console.log(`  ✅ Updated goal: ${updatedGoal.currentValue}/${updatedGoal.targetValue} (${updatedGoal.progressPercentage}%)\n`);
    }

    console.log('✅ Manual sync completed!');

  } catch (error) {
    console.error('❌ Error syncing payroll to goals:', error);
  } finally {
    await prisma.$disconnect();
  }
}

manuallySyncPayrollToGoals();

