import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPayrollSyncViaAPI() {
  try {
    console.log('🧪 Testing Payroll-Goal Sync via API\n');

    // Step 1: Get current goal state
    console.log('Step 1: Getting current goal state...');
    const goal = await prisma.performanceGoal.findFirst({
      where: {
        title: {
          contains: 'Payroll control'
        }
      }
    });

    if (!goal) {
      console.log('❌ Goal not found');
      return;
    }

    console.log(`   Goal: "${goal.title}"`);
    console.log(`   Current Value: ${goal.currentValue || 0}`);
    console.log(`   Target: ${goal.targetValue || 'N/A'}`);
    console.log(`   Progress: ${goal.progressPercentage || 0}%\n`);

    // Step 2: Check for existing payroll runs
    console.log('Step 2: Checking existing payroll runs...');
    const existingRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED'
      },
      orderBy: {
        endDate: 'desc'
      },
      take: 5
    });

    console.log(`   Found ${existingRuns.length} completed payroll run(s):`);
    existingRuns.forEach((run, index) => {
      console.log(`   ${index + 1}. ${run.name} - $${run.totalGrossPay?.toString() || '0'} - ${run.status}`);
    });

    // Step 3: Instructions for testing
    console.log('\n📋 To test automatic sync:');
    console.log('   1. Create a new payroll run via API:');
    console.log('      POST http://localhost:3000/api/payroll/payroll-runs');
    console.log('      Body: {');
    console.log('        "name": "Test Payroll Run",');
    console.log('        "payPeriod": "Test Period",');
    console.log('        "startDate": "2025-12-20T00:00:00Z",');
    console.log('        "endDate": "2025-12-25T23:59:59Z",');
    console.log('        "currencyId": "[currency-id]"');
    console.log('      }');
    console.log('');
    console.log('   2. Process the payroll run:');
    console.log('      POST http://localhost:3000/api/payroll/payroll-runs/{payrollRunId}/process');
    console.log('');
    console.log('   3. Check the goal again - it should be automatically updated!');
    console.log('      GET http://localhost:3000/api/performance/goals/{goalId}');
    console.log('');
    console.log('   OR run this script again to verify the goal was updated.');

    // Step 4: Calculate expected value
    const relevantRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED',
        endDate: {
          gte: goal.startDate,
          lte: goal.endDate
        }
      }
    });

    let expectedTotal = 0;
    relevantRuns.forEach(run => {
      if (run.totalGrossPay) {
        expectedTotal += parseFloat(run.totalGrossPay.toString());
      }
    });

    console.log('\n📊 Current Status:');
    console.log(`   Goal Current Value: ${goal.currentValue || 0}`);
    console.log(`   Expected from Payroll Runs: ${expectedTotal}`);
    console.log(`   Match: ${Math.abs((goal.currentValue || 0) - expectedTotal) < 0.01 ? '✅ YES' : '❌ NO'}`);

    if (Math.abs((goal.currentValue || 0) - expectedTotal) < 0.01) {
      console.log('\n✅ SYNC IS WORKING! The goal matches the payroll total.');
      console.log('   When you process a new payroll run, it will automatically update the goal.');
    } else {
      console.log('\n⚠️ There may be a mismatch. Run the manual sync script to fix it.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPayrollSyncViaAPI();

