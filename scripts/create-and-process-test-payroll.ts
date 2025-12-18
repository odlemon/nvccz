import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createAndProcessTestPayroll() {
  try {
    console.log('🧪 Creating and Processing Test Payroll Run\n');

    // Step 1: Get user and currency
    const user = await prisma.user.findFirst({
      where: {
        email: 'admin@nts.com'
      }
    });

    if (!user) {
      console.log('❌ Admin user not found');
      return;
    }

    const currency = await prisma.currency.findFirst({
      where: {
        code: 'USD'
      }
    });

    if (!currency) {
      console.log('❌ USD currency not found');
      return;
    }

    // Step 2: Get current goal state BEFORE
    const goalBefore = await prisma.performanceGoal.findFirst({
      where: {
        title: {
          contains: 'Payroll control'
        }
      }
    });

    if (!goalBefore) {
      console.log('❌ Goal not found');
      return;
    }

    console.log('📊 Goal State BEFORE:');
    console.log(`   Current Value: ${goalBefore.currentValue || 0}`);
    console.log(`   Progress: ${goalBefore.progressPercentage || 0}%\n`);

    // Step 3: Create a test payroll run
    console.log('Step 1: Creating test payroll run...');
    const testDate = new Date('2025-12-20');
    const testEndDate = new Date('2025-12-25');

    const payrollRun = await prisma.payrollRun.create({
      data: {
        name: 'Test Payroll Sync',
        payPeriod: 'Test Period Dec 20-25',
        startDate: testDate,
        endDate: testEndDate,
        status: 'DRAFT',
        currencyId: currency.id,
        createdById: user.id
      }
    });

    console.log(`   ✅ Created payroll run: ${payrollRun.id}`);
    console.log(`   Name: ${payrollRun.name}\n`);

    // Step 4: Process the payroll run (this should trigger the sync)
    console.log('Step 2: Processing payroll run (this will trigger automatic sync)...');
    console.log('   ⚠️ Note: This requires calling the API endpoint.');
    console.log('   POST http://localhost:3000/api/payroll/payroll-runs/' + payrollRun.id + '/process');
    console.log('   Authorization: Bearer [token]\n');

    // We can't directly call the service method because it needs the full context
    // But we can simulate by calling the sync method directly
    console.log('Step 3: Testing sync directly...');
    const { PerformanceGoalService } = await import('../src/services/PerformanceGoalService');
    
    // Get employee to calculate payroll
    const employee = await prisma.employee.findFirst({
      where: {
        isActive: true
      }
    });

    if (!employee) {
      console.log('   ⚠️ No active employees found. Cannot calculate payroll.');
      console.log('   The payroll run was created but needs to be processed via API.');
      return;
    }

    // Calculate expected payroll amount (basic salary)
    const expectedGrossPay = employee.basicSalary || new (await import('@prisma/client/runtime/library')).Decimal(1500);
    
    console.log(`   Expected gross pay: $${expectedGrossPay.toString()}`);
    console.log('   Calling sync method directly to test...\n');

    // Manually trigger sync with expected amount
    await PerformanceGoalService.syncPayrollToGoals(
      payrollRun.id,
      expectedGrossPay,
      user.id
    );

    // Step 5: Check goal state AFTER
    const goalAfter = await prisma.performanceGoal.findFirst({
      where: {
        title: {
          contains: 'Payroll control'
        }
      }
    });

    console.log('📊 Goal State AFTER:');
    console.log(`   Current Value: ${goalAfter?.currentValue || 0}`);
    console.log(`   Progress: ${goalAfter?.progressPercentage || 0}%\n`);

    const beforeValue = goalBefore.currentValue || 0;
    const afterValue = goalAfter?.currentValue || 0;
    const difference = afterValue - beforeValue;

    console.log('📈 Comparison:');
    console.log(`   Before: $${beforeValue}`);
    console.log(`   After: $${afterValue}`);
    console.log(`   Difference: $${difference}\n`);

    if (difference > 0) {
      console.log('✅ SYNC IS WORKING! Goal was updated.');
    } else {
      console.log('⚠️ Goal was not updated. This could mean:');
      console.log('   - Payroll run date is outside goal date range');
      console.log('   - Payroll run is not COMPLETED yet');
      console.log('   - No payroll runs match the criteria');
    }

    // Cleanup: Delete test payroll run if it's still DRAFT
    if (payrollRun.status === 'DRAFT') {
      console.log('\n🧹 Cleaning up test payroll run...');
      await prisma.payrollRun.delete({
        where: { id: payrollRun.id }
      });
      console.log('   ✅ Test payroll run deleted');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAndProcessTestPayroll();

