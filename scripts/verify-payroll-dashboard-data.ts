// @ts-nocheck
import { prisma } from '../src/utils/database';

async function verifyPayrollDashboardData() {
  try {
    console.log('🔍 Verifying Payroll Dashboard Data\n');
    console.log('='.repeat(80));

    // Get all completed payroll runs
    const completedRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED'
      },
      include: {
        employeePayrolls: {
          include: {
            employee: {
              include: {
                user: {
                  include: {
                    department: true
                  }
                }
              }
            },
            allowances: {
              include: {
                allowanceType: true
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    console.log(`\n📊 Completed Payroll Runs: ${completedRuns.length}\n`);

    if (completedRuns.length === 0) {
      console.log('   ⚠️  No completed payroll runs found');
      return;
    }

    let totalPayroll = 0;
    let totalEmployees = new Set<string>();

    completedRuns.forEach((run, i) => {
      console.log(`\n${i + 1}. ${run.name || 'Unnamed'} (${run.id})`);
      console.log(`   Status: ${run.status}`);
      console.log(`   Start Date: ${new Date(run.startDate).toISOString().split('T')[0]}`);
      console.log(`   End Date: ${new Date(run.endDate).toISOString().split('T')[0]}`);
      console.log(`   Updated At: ${new Date(run.updatedAt).toISOString()}`);
      console.log(`   Total Net Pay: $${parseFloat(run.totalNetPay.toString()).toLocaleString()}`);
      console.log(`   Total Gross Pay: $${parseFloat(run.totalGrossPay.toString()).toLocaleString()}`);
      console.log(`   Total Deductions: $${parseFloat(run.totalDeductions.toString()).toLocaleString()}`);
      console.log(`   Employee Payrolls: ${run.employeePayrolls.length}`);

      totalPayroll += parseFloat(run.totalNetPay.toString());

      run.employeePayrolls.forEach((ep, j) => {
        const employee = ep.employee;
        const user = employee.user;
        const name = `${user.firstName} ${user.lastName}`;
        const department = user.department?.name || user.userDepartment || 'Unassigned';
        
        totalEmployees.add(ep.employeeId);

        let bonusAmount = 0;
        ep.allowances.forEach(allowance => {
          const allowanceTypeName = allowance.allowanceType?.name?.toLowerCase() || '';
          if (allowanceTypeName.includes('bonus')) {
            bonusAmount += parseFloat(allowance.amount.toString());
          }
        });

        console.log(`\n   Employee ${j + 1}: ${name}`);
        console.log(`      Employee ID: ${ep.employeeId}`);
        console.log(`      Department: ${department}`);
        console.log(`      Basic Salary: $${parseFloat(ep.basicSalary.toString()).toLocaleString()}`);
        console.log(`      Net Pay: $${parseFloat(ep.netPay.toString()).toLocaleString()}`);
        console.log(`      Gross Pay: $${parseFloat(ep.grossPay.toString()).toLocaleString()}`);
        console.log(`      Deductions: $${parseFloat(ep.totalDeductions.toString()).toLocaleString()}`);
        console.log(`      Bonuses: $${bonusAmount.toLocaleString()}`);
        console.log(`      Allowances: ${ep.allowances.length}`);
      });
    });

    console.log(`\n\n📈 Summary:`);
    console.log('─'.repeat(80));
    console.log(`   Total Completed Payroll Runs: ${completedRuns.length}`);
    console.log(`   Total Payroll Amount: $${totalPayroll.toLocaleString()}`);
    console.log(`   Total Unique Employees Paid: ${totalEmployees.size}`);

    // Check what the dashboard should show
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    console.log(`\n\n📅 Current Month Filter (${currentMonth}/${currentYear}):`);
    console.log('─'.repeat(80));
    console.log(`   Start: ${currentMonthStart.toISOString()}`);
    console.log(`   End: ${currentMonthEnd.toISOString()}`);

    const currentMonthRuns = completedRuns.filter(run => {
      const updatedAt = new Date(run.updatedAt);
      return updatedAt >= currentMonthStart && updatedAt <= currentMonthEnd;
    });

    console.log(`\n   Runs completed in current month: ${currentMonthRuns.length}`);

    if (currentMonthRuns.length === 0) {
      console.log(`   ⚠️  No runs in current month - dashboard should use most recent runs`);
      const mostRecentRun = completedRuns[0];
      if (mostRecentRun) {
        console.log(`\n   Most Recent Run:`);
        console.log(`      Name: ${mostRecentRun.name}`);
        console.log(`      Updated: ${new Date(mostRecentRun.updatedAt).toISOString()}`);
        console.log(`      Total Net Pay: $${parseFloat(mostRecentRun.totalNetPay.toString()).toLocaleString()}`);
        console.log(`      Employees: ${mostRecentRun.employeePayrolls.length}`);
      }
    } else {
      const currentMonthTotal = currentMonthRuns.reduce((sum, run) => 
        sum + parseFloat(run.totalNetPay.toString()), 0
      );
      const currentMonthEmployeeCount = new Set(
        currentMonthRuns.flatMap(run => run.employeePayrolls.map(ep => ep.employeeId))
      ).size;

      console.log(`   Total Payroll: $${currentMonthTotal.toLocaleString()}`);
      console.log(`   Employees Paid: ${currentMonthEmployeeCount}`);
      console.log(`   Average Salary: $${currentMonthEmployeeCount > 0 ? (currentMonthTotal / currentMonthEmployeeCount).toLocaleString() : 0}`);
    }

    // Verify the data matches what was shown
    console.log(`\n\n✅ Expected Dashboard Values:`);
    console.log('─'.repeat(80));
    
    if (currentMonthRuns.length > 0) {
      const expectedTotal = currentMonthRuns.reduce((sum, run) => 
        sum + parseFloat(run.totalNetPay.toString()), 0
      );
      const expectedEmployees = new Set(
        currentMonthRuns.flatMap(run => run.employeePayrolls.map(ep => ep.employeeId))
      ).size;
      const expectedAverage = expectedEmployees > 0 ? expectedTotal / expectedEmployees : 0;

      console.log(`   totalPayrollThisMonth.value: $${expectedTotal.toLocaleString()}`);
      console.log(`   totalEmployeesPaid.value: ${expectedEmployees}`);
      console.log(`   averageSalary.value: $${expectedAverage.toLocaleString()}`);
    } else {
      // Using most recent run
      const mostRecentRun = completedRuns[0];
      if (mostRecentRun) {
        const expectedTotal = parseFloat(mostRecentRun.totalNetPay.toString());
        const expectedEmployees = mostRecentRun.employeePayrolls.length;
        const expectedAverage = expectedEmployees > 0 ? expectedTotal / expectedEmployees : 0;

        console.log(`   totalPayrollThisMonth.value: $${expectedTotal.toLocaleString()} (from most recent run)`);
        console.log(`   totalEmployeesPaid.value: ${expectedEmployees}`);
        console.log(`   averageSalary.value: $${expectedAverage.toLocaleString()}`);
      }
    }

    // Check all active employees
    const allActiveEmployees = await prisma.employee.findMany({
      where: { isActive: true },
      include: {
        user: {
          include: {
            department: true
          }
        }
      }
    });

    console.log(`\n\n👥 All Active Employees: ${allActiveEmployees.length}`);
    allActiveEmployees.forEach((emp, i) => {
      const user = emp.user;
      const name = `${user.firstName} ${user.lastName}`;
      const department = user.department?.name || user.userDepartment || 'Unassigned';
      console.log(`\n   ${i + 1}. ${name}`);
      console.log(`      ID: ${emp.id}`);
      console.log(`      Department: ${department}`);
      console.log(`      Basic Salary: $${parseFloat(emp.basicSalary.toString()).toLocaleString()}`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPayrollDashboardData();
