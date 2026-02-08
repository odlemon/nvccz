// @ts-nocheck
import { prisma } from '../src/utils/database';

async function debugPayrollMetrics() {
  try {
    console.log('🔍 Debugging Payroll Metrics for year=2025, currencyId=USD\n');
    console.log('='.repeat(80));

    // Resolve USD currency code to ID
    const currency = await prisma.currency.findFirst({
      where: { code: 'USD' },
      select: { id: true, code: true, name: true }
    });

    if (!currency) {
      console.log('❌ USD currency not found');
      return;
    }

    console.log(`\n💰 Currency: ${currency.code} (${currency.name})`);
    console.log(`   ID: ${currency.id}\n`);

    // Get year range
    const yearStart = new Date(2025, 0, 1);
    const yearEnd = new Date(2025, 11, 31, 23, 59, 59, 999);

    console.log(`📅 Year Filter: 2025`);
    console.log(`   Start: ${yearStart.toISOString()}`);
    console.log(`   End: ${yearEnd.toISOString()}\n`);

    // Get all completed payroll runs for 2025 with USD
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: {
          gte: yearStart,
          lte: yearEnd
        },
        currencyId: currency.id
      },
      include: {
        employeePayrolls: {
          include: {
            employee: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    console.log(`📊 Payroll Runs Found: ${payrollRuns.length}\n`);

    if (payrollRuns.length === 0) {
      console.log('   ⚠️  No payroll runs found for this filter');
      return;
    }

    let totalPayroll = 0;
    let totalEmployees = new Set<string>();

    payrollRuns.forEach((run, i) => {
      const runTotal = parseFloat(run.totalNetPay.toString());
      totalPayroll += runTotal;

      console.log(`\n${i + 1}. ${run.name || 'Unnamed'} (${run.id})`);
      console.log(`   Updated At: ${new Date(run.updatedAt).toISOString()}`);
      console.log(`   Start Date: ${new Date(run.startDate).toISOString().split('T')[0]}`);
      console.log(`   End Date: ${new Date(run.endDate).toISOString().split('T')[0]}`);
      console.log(`   Total Net Pay: $${runTotal.toLocaleString()}`);
      console.log(`   Total Gross Pay: $${parseFloat(run.totalGrossPay.toString()).toLocaleString()}`);
      console.log(`   Employee Payrolls: ${run.employeePayrolls.length}`);

      run.employeePayrolls.forEach((ep, j) => {
        const employee = ep.employee;
        const user = employee.user;
        const name = `${user.firstName} ${user.lastName}`;
        totalEmployees.add(ep.employeeId);

        console.log(`\n   Employee ${j + 1}: ${name}`);
        console.log(`      Employee ID: ${ep.employeeId}`);
        console.log(`      Basic Salary: $${parseFloat(ep.basicSalary.toString()).toLocaleString()}`);
        console.log(`      Net Pay: $${parseFloat(ep.netPay.toString()).toLocaleString()}`);
        console.log(`      Gross Pay: $${parseFloat(ep.grossPay.toString()).toLocaleString()}`);
      });
    });

    console.log(`\n\n📈 Summary:`);
    console.log('─'.repeat(80));
    console.log(`   Total Payroll Runs: ${payrollRuns.length}`);
    console.log(`   Total Payroll Amount: $${totalPayroll.toLocaleString()}`);
    console.log(`   Total Unique Employees: ${totalEmployees.size}`);
    console.log(`   Average Salary: $${totalEmployees.size > 0 ? (totalPayroll / totalEmployees.size).toLocaleString() : 0}`);

    // Check what the dashboard should show
    console.log(`\n\n✅ Expected Dashboard Metrics:`);
    console.log('─'.repeat(80));
    console.log(`   totalPayrollThisMonth.value: $${totalPayroll.toLocaleString()}`);
    console.log(`   totalEmployeesPaid.value: ${totalEmployees.size}`);
    console.log(`   averageSalary.value: $${totalEmployees.size > 0 ? (totalPayroll / totalEmployees.size).toLocaleString() : 0}`);

    // Check if there are multiple runs for the same employee
    const employeeRunCounts = new Map<string, number>();
    payrollRuns.forEach(run => {
      run.employeePayrolls.forEach(ep => {
        const count = employeeRunCounts.get(ep.employeeId) || 0;
        employeeRunCounts.set(ep.employeeId, count + 1);
      });
    });

    console.log(`\n\n👥 Employee Run Counts:`);
    console.log('─'.repeat(80));
    employeeRunCounts.forEach((count, employeeId) => {
      console.log(`   Employee ${employeeId}: ${count} payroll run(s)`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debugPayrollMetrics();
