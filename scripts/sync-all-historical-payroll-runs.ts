import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function syncAllHistoricalPayrollRuns() {
  try {
    console.log('🔄 Syncing All Historical Payroll Runs to Performance Goals\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Get the Payroll Expense KPI
    console.log('Step 1: Finding Payroll Expense KPI...');
    const payrollKPI = await prisma.kPI.findFirst({
      where: {
        name: 'Payroll Expense'
      }
    });

    if (!payrollKPI) {
      console.log('❌ Payroll Expense KPI not found. Cannot proceed.');
      return;
    }

    console.log(`✅ Found Payroll Expense KPI: ${payrollKPI.id}`);
    console.log(`   Name: ${payrollKPI.name}\n`);

    // Step 2: Find all goals linked to Payroll Expense KPI
    console.log('Step 2: Finding goals linked to Payroll Expense KPI...');
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
        completedAt: true,
        progressPercentage: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ Found ${goals.length} goal(s) linked to Payroll Expense KPI:\n`);
    goals.forEach((goal, index) => {
      console.log(`   ${index + 1}. "${goal.title}"`);
      console.log(`      ID: ${goal.id}`);
      console.log(`      Target: $${goal.targetValue || 'N/A'}`);
      console.log(`      Current: $${goal.currentValue || 0}`);
      console.log(`      Progress: ${goal.progressPercentage || 0}%`);
      console.log(`      Date Range: ${new Date(goal.startDate).toISOString().split('T')[0]} to ${new Date(goal.endDate).toISOString().split('T')[0]}`);
      console.log('');
    });

    if (goals.length === 0) {
      console.log('⚠️ No goals found. Nothing to sync.');
      return;
    }

    // Step 3: Get all COMPLETED payroll runs
    console.log('Step 3: Finding all COMPLETED payroll runs...');
    const allPayrollRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED'
      },
      select: {
        id: true,
        name: true,
        payPeriod: true,
        totalGrossPay: true,
        startDate: true,
        endDate: true,
        status: true
      },
      orderBy: {
        endDate: 'asc'
      }
    });

    console.log(`✅ Found ${allPayrollRuns.length} completed payroll run(s):\n`);
    allPayrollRuns.forEach((run, index) => {
      console.log(`   ${index + 1}. ${run.name} (${run.payPeriod})`);
      console.log(`      ID: ${run.id}`);
      console.log(`      Amount: $${run.totalGrossPay?.toString() || '0'}`);
      console.log(`      Date: ${new Date(run.endDate).toISOString().split('T')[0]}`);
      console.log(`      Status: ${run.status}`);
      console.log('');
    });

    // Step 4: Sync each goal
    console.log('Step 4: Syncing each goal with relevant payroll runs...\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    let totalGoalsUpdated = 0;
    let totalRunsSynced = 0;

    for (const goal of goals) {
      console.log(`📊 Processing Goal: "${goal.title}"`);
      console.log(`   Goal ID: ${goal.id}`);
      console.log(`   Date Range: ${new Date(goal.startDate).toISOString().split('T')[0]} to ${new Date(goal.endDate).toISOString().split('T')[0]}`);

      // Find all COMPLETED payroll runs within goal's date range
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
        },
        orderBy: {
          endDate: 'asc'
        }
      });

      console.log(`   Found ${relevantPayrollRuns.length} payroll run(s) in date range:`);
      
      if (relevantPayrollRuns.length === 0) {
        console.log(`   ⚠️ No payroll runs found in this goal's date range.`);
        console.log('');
        continue;
      }

      // Calculate total
      let totalPayrollExpense = new Decimal(0);
      relevantPayrollRuns.forEach((run, index) => {
        const amount = run.totalGrossPay || new Decimal(0);
        totalPayrollExpense = totalPayrollExpense.add(amount);
        console.log(`      ${index + 1}. ${run.name} (${run.payPeriod}): $${amount.toString()}`);
        totalRunsSynced++;
      });

      const totalPayrollValue = parseFloat(totalPayrollExpense.toString());
      const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = targetValue > 0 
        ? Math.min((totalPayrollValue / targetValue) * 100, 100) 
        : 0;
      const isCompleted = totalPayrollValue >= targetValue;

      const beforeValue = goal.currentValue ? parseFloat(goal.currentValue.toString()) : 0;
      const valueChanged = Math.abs(beforeValue - totalPayrollValue) > 0.01;

      console.log(`   Total Payroll Expense: $${totalPayrollValue.toFixed(2)}`);
      console.log(`   Target: $${targetValue.toFixed(2)}`);
      console.log(`   Progress: ${progressPercentage.toFixed(1)}%`);
      console.log(`   Status: ${isCompleted ? 'COMPLETED' : 'ACTIVE'}`);

      if (valueChanged) {
        console.log(`   ⚠️ Value changed: $${beforeValue.toFixed(2)} → $${totalPayrollValue.toFixed(2)}`);
      } else {
        console.log(`   ✅ Value already correct: $${totalPayrollValue.toFixed(2)}`);
      }

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

      if (valueChanged) {
        console.log(`   ✅ Goal updated successfully!`);
        totalGoalsUpdated++;
      } else {
        console.log(`   ℹ️ Goal already synced (no changes needed)`);
      }

      console.log(`   Final State: $${updatedGoal.currentValue}/${updatedGoal.targetValue} (${updatedGoal.progressPercentage}%)\n`);
    }

    // Step 5: Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SYNC SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`✅ Goals processed: ${goals.length}`);
    console.log(`✅ Goals updated: ${totalGoalsUpdated}`);
    console.log(`✅ Payroll runs synced: ${totalRunsSynced}`);
    console.log(`✅ Total payroll runs found: ${allPayrollRuns.length}\n`);

    if (totalGoalsUpdated > 0) {
      console.log('🎉 Sync completed! Historical payroll runs have been linked to goals.');
    } else {
      console.log('ℹ️ All goals were already synced. No updates needed.');
    }

    // Step 6: Final verification
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔍 FINAL VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const finalGoals = await prisma.performanceGoal.findMany({
      where: {
        kpiId: payrollKPI.id
      },
      select: {
        title: true,
        targetValue: true,
        currentValue: true,
        progressPercentage: true,
        status: true
      }
    });

    finalGoals.forEach((goal, index) => {
      console.log(`${index + 1}. "${goal.title}"`);
      console.log(`   Current: $${goal.currentValue || 0} / Target: $${goal.targetValue || 'N/A'}`);
      console.log(`   Progress: ${goal.progressPercentage || 0}%`);
      console.log(`   Status: ${goal.status}\n`);
    });

    console.log('✅ All historical payroll runs have been synced!');

  } catch (error) {
    console.error('❌ Error syncing historical payroll runs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

syncAllHistoricalPayrollRuns();

