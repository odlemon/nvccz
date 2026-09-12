import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function testPayrollGoalSync() {
  try {
    console.log('🧪 Testing Payroll-Goal Sync Integration\n');

    // Step 1: Check if "Payroll control" goal exists
    console.log('Step 1: Checking for "Payroll control" goal...');
    const payrollGoal = await prisma.performanceGoal.findFirst({
      where: {
        title: {
          contains: 'Payroll control'
        }
      },
      include: {
        kpi: true
      }
    });

    if (!payrollGoal) {
      console.log('❌ "Payroll control" goal not found. Cannot test.');
      return;
    }

    console.log(`✅ Found goal: "${payrollGoal.title}"`);
    console.log(`   Goal ID: ${payrollGoal.id}`);
    console.log(`   Target Value: ${payrollGoal.targetValue || 'N/A'}`);
    console.log(`   Current Value: ${payrollGoal.currentValue || 0}`);
    console.log(`   Progress: ${payrollGoal.progressPercentage || 0}%`);
    console.log(`   KPI: ${payrollGoal.kpi?.name || 'None'}`);
    console.log(`   Date Range: ${new Date(payrollGoal.startDate).toISOString().split('T')[0]} to ${new Date(payrollGoal.endDate).toISOString().split('T')[0]}\n`);

    // Step 2: Check existing payroll runs
    console.log('Step 2: Checking existing payroll runs...');
    const existingRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED',
        endDate: {
          gte: payrollGoal.startDate,
          lte: payrollGoal.endDate
        }
      },
      select: {
        id: true,
        name: true,
        payPeriod: true,
        totalGrossPay: true,
        endDate: true,
        status: true
      },
      orderBy: {
        endDate: 'desc'
      }
    });

    console.log(`   Found ${existingRuns.length} completed payroll run(s) in goal date range:`);
    let totalPayroll = new Decimal(0);
    existingRuns.forEach((run, index) => {
      console.log(`   ${index + 1}. ${run.name} (${run.payPeriod}): $${run.totalGrossPay?.toString() || '0'}`);
      if (run.totalGrossPay) {
        totalPayroll = totalPayroll.add(run.totalGrossPay);
      }
    });
    console.log(`   Total Payroll Expense: $${totalPayroll.toString()}\n`);

    // Step 3: Check if there are employees to create a test payroll run
    console.log('Step 3: Checking for employees...');
    const employees = await prisma.employee.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        basicSalary: true
      },
      take: 5
    });

    console.log(`   Found ${employees.length} active employee(s)`);
    if (employees.length === 0) {
      console.log('   ⚠️ No active employees found. Cannot create test payroll run.');
      console.log('\n📊 Current State Summary:');
      console.log(`   Goal Current Value: ${payrollGoal.currentValue || 0}`);
      console.log(`   Goal Target Value: ${payrollGoal.targetValue || 'N/A'}`);
      console.log(`   Expected from Payroll Runs: $${totalPayroll.toString()}`);
      console.log(`   Match: ${parseFloat(payrollGoal.currentValue?.toString() || '0') === parseFloat(totalPayroll.toString()) ? '✅ YES' : '❌ NO'}`);
      return;
    }

    employees.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.user?.firstName} ${emp.user?.lastName} - Salary: $${emp.basicSalary?.toString() || '0'}`);
    });

    // Step 4: Check if we can create a test payroll run
    console.log('\nStep 4: Checking if we can create a test payroll run...');
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Check if payroll run already exists for this month
    const existingRun = await prisma.payrollRun.findFirst({
      where: {
        startDate: {
          gte: firstDayOfMonth
        },
        endDate: {
          lte: lastDayOfMonth
        }
      }
    });

    if (existingRun) {
      console.log(`   ⚠️ Payroll run already exists for this month: ${existingRun.name}`);
      console.log(`   Status: ${existingRun.status}`);
      
      if (existingRun.status === 'COMPLETED') {
        console.log(`   Total Gross Pay: $${existingRun.totalGrossPay?.toString() || '0'}`);
        console.log('\n📊 Verification:');
        const expectedTotal = totalPayroll.add(existingRun.totalGrossPay || 0);
        console.log(`   Goal Current Value: ${payrollGoal.currentValue || 0}`);
        console.log(`   Expected Total (including this run): $${expectedTotal.toString()}`);
        console.log(`   Match: ${parseFloat(payrollGoal.currentValue?.toString() || '0') === parseFloat(expectedTotal.toString()) ? '✅ YES - Sync is working!' : '❌ NO - Sync may not be working'}`);
      } else {
        console.log(`   ⚠️ Payroll run is not COMPLETED. Status: ${existingRun.status}`);
        console.log('   To test sync, you need to process this payroll run.');
      }
    } else {
      console.log('   ℹ️ No payroll run exists for this month.');
      console.log('   To test sync, create and process a payroll run via the API.');
    }

    // Step 5: Final verification
    console.log('\n📊 Final Verification:');
    console.log(`   Goal: "${payrollGoal.title}"`);
    console.log(`   Target: $${payrollGoal.targetValue || 'N/A'}`);
    console.log(`   Current Value: $${payrollGoal.currentValue || 0}`);
    console.log(`   Progress: ${payrollGoal.progressPercentage || 0}%`);
    console.log(`   Total from Payroll Runs: $${totalPayroll.toString()}`);
    
    const currentValue = parseFloat(payrollGoal.currentValue?.toString() || '0');
    const expectedValue = parseFloat(totalPayroll.toString());
    const match = Math.abs(currentValue - expectedValue) < 0.01; // Allow small floating point differences
    
    if (match) {
      console.log(`   ✅ SYNC IS WORKING! Goal value matches payroll total.`);
    } else {
      console.log(`   ❌ SYNC MAY NOT BE WORKING!`);
      console.log(`   Difference: $${Math.abs(currentValue - expectedValue).toFixed(2)}`);
      console.log(`   This could mean:`);
      console.log(`   - Payroll runs haven't been processed yet`);
      console.log(`   - Sync hasn't run (check if payroll runs are COMPLETED)`);
      console.log(`   - Date range mismatch`);
    }

  } catch (error) {
    console.error('❌ Error testing payroll-goal sync:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPayrollGoalSync();

