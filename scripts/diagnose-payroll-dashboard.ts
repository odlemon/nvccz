// @ts-nocheck
import { prisma } from '../src/utils/database';

async function diagnosePayrollDashboard() {
  try {
    console.log('🔍 Diagnosing Payroll Dashboard Data Issue\n');
    console.log('='.repeat(80));

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    console.log(`\n📅 Current Period:`);
    console.log(`   Month: ${currentMonth} (${now.toLocaleString('default', { month: 'long' })})`);
    console.log(`   Year: ${currentYear}`);
    console.log(`   Start: ${currentMonthStart.toISOString()}`);
    console.log(`   End: ${currentMonthEnd.toISOString()}`);

    // Get ALL payroll runs
    const allPayrollRuns = await prisma.payrollRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        employeePayrolls: {
          select: {
            id: true,
            employeeId: true
          }
        }
      }
    });

    console.log(`\n📊 All Payroll Runs: ${allPayrollRuns.length}`);
    if (allPayrollRuns.length > 0) {
      console.log('\n   Status Breakdown:');
      const statusCounts: Record<string, number> = {};
      allPayrollRuns.forEach(run => {
        statusCounts[run.status] = (statusCounts[run.status] || 0) + 1;
      });
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`      ${status}: ${count}`);
      });

      console.log('\n   Recent Payroll Runs:');
      allPayrollRuns.slice(0, 10).forEach((run, i) => {
        const endDate = new Date(run.endDate);
        const isInCurrentMonth = endDate >= currentMonthStart && endDate <= currentMonthEnd;
        console.log(`\n   ${i + 1}. ${run.name || 'Unnamed'}`);
        console.log(`      ID: ${run.id}`);
        console.log(`      Status: ${run.status}`);
        console.log(`      Start Date: ${new Date(run.startDate).toISOString().split('T')[0]}`);
        console.log(`      End Date: ${endDate.toISOString().split('T')[0]}`);
        console.log(`      In Current Month: ${isInCurrentMonth ? '✅ YES' : '❌ NO'}`);
        console.log(`      Employee Count: ${run.employeePayrolls.length}`);
        console.log(`      Total Net Pay: $${parseFloat(run.totalNetPay.toString()).toLocaleString()}`);
        console.log(`      Created: ${new Date(run.createdAt).toISOString()}`);
      });
    } else {
      console.log('   ⚠️  No payroll runs found in database');
    }

    // Check what the dashboard query would return
    console.log(`\n\n🔍 Dashboard Query Results:`);
    console.log('─'.repeat(80));
    
    const dashboardQuery = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED',
        endDate: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      },
      include: {
        employeePayrolls: {
          select: {
            id: true,
            employeeId: true
          }
        }
      }
    });

    console.log(`\n   Completed runs in current month: ${dashboardQuery.length}`);
    if (dashboardQuery.length > 0) {
      dashboardQuery.forEach((run, i) => {
        console.log(`\n   ${i + 1}. ${run.name || 'Unnamed'}`);
        console.log(`      End Date: ${new Date(run.endDate).toISOString().split('T')[0]}`);
        console.log(`      Employees: ${run.employeePayrolls.length}`);
        console.log(`      Total: $${parseFloat(run.totalNetPay.toString()).toLocaleString()}`);
      });
    } else {
      console.log('   ⚠️  No completed runs found for current month');
      
      // Check if there are completed runs but with different dates
      const completedRuns = await prisma.payrollRun.findMany({
        where: {
          status: 'COMPLETED'
        },
        orderBy: { endDate: 'desc' },
        take: 5
      });

      if (completedRuns.length > 0) {
        console.log(`\n   Found ${completedRuns.length} completed runs (but outside current month):`);
        completedRuns.forEach((run, i) => {
          const endDate = new Date(run.endDate);
          console.log(`\n   ${i + 1}. ${run.name || 'Unnamed'}`);
          console.log(`      End Date: ${endDate.toISOString().split('T')[0]}`);
          console.log(`      Month: ${endDate.getMonth() + 1}/${endDate.getFullYear()}`);
          console.log(`      Days from now: ${Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))}`);
        });
      }
    }

    // Check if there are runs with PROCESSING status
    const processingRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'PROCESSING'
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n\n⏳ Processing Runs: ${processingRuns.length}`);
    if (processingRuns.length > 0) {
      processingRuns.forEach((run, i) => {
        console.log(`\n   ${i + 1}. ${run.name || 'Unnamed'}`);
        console.log(`      End Date: ${new Date(run.endDate).toISOString().split('T')[0]}`);
        console.log(`      Created: ${new Date(run.createdAt).toISOString()}`);
      });
    }

    // Check if there are runs with DRAFT status
    const draftRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'DRAFT'
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    console.log(`\n\n📝 Draft Runs: ${draftRuns.length}`);
    if (draftRuns.length > 0) {
      draftRuns.forEach((run, i) => {
        console.log(`\n   ${i + 1}. ${run.name || 'Unnamed'}`);
        console.log(`      End Date: ${new Date(run.endDate).toISOString().split('T')[0]}`);
        console.log(`      Created: ${new Date(run.createdAt).toISOString()}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Potential Issues:');
    console.log('─'.repeat(80));
    
    if (dashboardQuery.length === 0) {
      if (allPayrollRuns.some(r => r.status === 'COMPLETED')) {
        console.log('   ❌ Issue: Completed runs exist but their endDate is not in current month');
        console.log('   💡 Solution: Check if endDate is set correctly when payroll is processed');
      } else if (allPayrollRuns.some(r => r.status === 'PROCESSING')) {
        console.log('   ❌ Issue: Payroll runs are in PROCESSING status, not COMPLETED');
        console.log('   💡 Solution: Ensure payroll processing completes and sets status to COMPLETED');
      } else {
        console.log('   ❌ Issue: No completed payroll runs found');
        console.log('   💡 Solution: Process a payroll run to completion');
      }
    } else {
      console.log('   ✅ Dashboard query should return data');
      console.log('   💡 If dashboard is still empty, check the frontend or API response');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

diagnosePayrollDashboard();
