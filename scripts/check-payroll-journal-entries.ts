import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPayrollJournalEntries() {
  try {
    console.log('🔍 Checking Payroll Journal Entries\n');

    // Step 1: Find all payroll runs
    console.log('Step 1: Finding all payroll runs...');
    const payrollRuns = await prisma.payrollRun.findMany({
      select: {
        id: true,
        name: true,
        payPeriod: true,
        status: true,
        totalGrossPay: true,
        endDate: true
      },
      orderBy: {
        endDate: 'desc'
      }
    });

    console.log(`   Found ${payrollRuns.length} payroll run(s)\n`);

    // Step 2: Find journal entries related to payroll
    console.log('Step 2: Finding journal entries with "Payroll" in description...');
    const payrollJournalEntries = await prisma.journalEntry.findMany({
      where: {
        description: {
          contains: 'Payroll'
        }
      },
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        transactionDate: true,
        status: true,
        totalAmount: true,
        journalEntryLines: {
          select: {
            id: true,
            debitAmount: true,
            creditAmount: true,
            chartOfAccount: {
              select: {
                accountNo: true,
                accountName: true
              }
            }
          }
        }
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });

    console.log(`   Found ${payrollJournalEntries.length} journal entry/entries with "Payroll" in description\n`);

    if (payrollJournalEntries.length > 0) {
      console.log('📋 Payroll Journal Entries:');
      payrollJournalEntries.forEach((entry, index) => {
        console.log(`\n   ${index + 1}. ${entry.referenceNumber}`);
        console.log(`      Description: ${entry.description}`);
        console.log(`      Date: ${entry.transactionDate.toISOString().split('T')[0]}`);
        console.log(`      Status: ${entry.status}`);
        console.log(`      Total Amount: $${entry.totalAmount.toString()}`);
        console.log(`      Lines: ${entry.journalEntryLines.length}`);
        entry.journalEntryLines.forEach((line, lineIndex) => {
          const account = line.chartOfAccount;
          if (line.debitAmount && line.debitAmount.gt(0)) {
            console.log(`         ${lineIndex + 1}. DR ${account.accountNo} - ${account.accountName}: $${line.debitAmount.toString()}`);
          }
          if (line.creditAmount && line.creditAmount.gt(0)) {
            console.log(`         ${lineIndex + 1}. CR ${account.accountNo} - ${account.accountName}: $${line.creditAmount.toString()}`);
          }
        });
      });
    }

    // Step 3: Check all journal entries by status
    console.log('\n\nStep 3: Checking all journal entries by status...');
    const statusCounts = await prisma.journalEntry.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });

    console.log('   Status Breakdown:');
    statusCounts.forEach((stat) => {
      console.log(`      ${stat.status}: ${stat._count.id} entries`);
    });

    // Step 4: Check what Trial Balance would see
    console.log('\n\nStep 4: Checking what Trial Balance sees (POSTED entries only)...');
    const postedPayrollEntries = payrollJournalEntries.filter(e => e.status === 'POSTED');
    console.log(`   POSTED payroll entries: ${postedPayrollEntries.length}`);

    // Step 5: Check what Journal view would see (POSTED_AND_PENDING)
    console.log('\n\nStep 5: Checking what Journal view sees (POSTED and PENDING entries)...');
    const visiblePayrollEntries = payrollJournalEntries.filter(e => 
      e.status === 'POSTED' || e.status === 'PENDING'
    );
    console.log(`   Visible payroll entries: ${visiblePayrollEntries.length}`);

    // Step 6: Check for entries with "Salaries" or "Wages" in description
    console.log('\n\nStep 6: Checking for entries with "Salaries" or "Wages"...');
    const salaryEntries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { description: { contains: 'Salaries' } },
          { description: { contains: 'Wages' } },
          { description: { contains: 'salary' } },
          { description: { contains: 'wage' } }
        ]
      },
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        status: true,
        transactionDate: true
      }
    });

    console.log(`   Found ${salaryEntries.length} entry/entries with salary/wage keywords`);
    if (salaryEntries.length > 0) {
      salaryEntries.forEach((entry, index) => {
        console.log(`      ${index + 1}. ${entry.referenceNumber} - ${entry.description} (${entry.status})`);
      });
    }

    // Step 7: Summary
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total Payroll Runs: ${payrollRuns.length}`);
    console.log(`Journal Entries with "Payroll": ${payrollJournalEntries.length}`);
    console.log(`   - POSTED: ${payrollJournalEntries.filter(e => e.status === 'POSTED').length}`);
    console.log(`   - PENDING: ${payrollJournalEntries.filter(e => e.status === 'PENDING').length}`);
    console.log(`   - VOID: ${payrollJournalEntries.filter(e => e.status === 'VOID').length}`);
    console.log(`\nTrial Balance sees: ${postedPayrollEntries.length} (POSTED only)`);
    console.log(`Journal view sees: ${visiblePayrollEntries.length} (POSTED + PENDING)`);
    console.log(`\nSalary/Wage entries: ${salaryEntries.length}`);

    if (payrollJournalEntries.length === 0 && payrollRuns.length > 0) {
      console.log('\n⚠️ ISSUE FOUND: Payroll runs exist but no journal entries found!');
      console.log('   This means journal entries are not being created for payroll runs.');
    } else if (payrollJournalEntries.length > 0 && postedPayrollEntries.length === 0) {
      console.log('\n⚠️ ISSUE FOUND: Journal entries exist but none are POSTED!');
      console.log('   Trial Balance requires POSTED status, but entries are PENDING.');
    } else if (postedPayrollEntries.length > 0 && visiblePayrollEntries.length === 0) {
      console.log('\n⚠️ ISSUE FOUND: Entries are POSTED but not visible in Journal view!');
      console.log('   This suggests a filtering issue in the Journal view.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPayrollJournalEntries();

