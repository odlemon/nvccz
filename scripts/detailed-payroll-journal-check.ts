import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function detailedPayrollJournalCheck() {
  try {
    console.log('🔍 Detailed Payroll Journal Entry Check\n');

    // Get all payroll runs
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED'
      },
      select: {
        id: true,
        name: true,
        payPeriod: true,
        totalGrossPay: true,
        createdAt: true,
        endDate: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${payrollRuns.length} completed payroll run(s):\n`);

    // Get all payroll journal entries
    const journalEntries = await prisma.journalEntry.findMany({
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
        totalAmount: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${journalEntries.length} payroll journal entry/entries:\n`);

    // Match them up
    console.log('Matching Payroll Runs to Journal Entries:\n');
    
    let totalPayroll = 0;
    let totalJournal = 0;

    payrollRuns.forEach((run, index) => {
      console.log(`${index + 1}. ${run.name} (${run.payPeriod})`);
      console.log(`   Payroll ID: ${run.id}`);
      console.log(`   Amount: $${run.totalGrossPay?.toString() || '0'}`);
      console.log(`   Created: ${new Date(run.createdAt).toISOString()}`);
      
      // Try to find matching journal entry by checking reference number pattern
      const expectedRef = `PAYROLL-${run.payPeriod.replace(/\s+/g, '-').toUpperCase()}`;
      const matchingEntry = journalEntries.find(entry => 
        entry.referenceNumber === expectedRef ||
        entry.description.includes(run.name) ||
        entry.description.includes(run.payPeriod)
      );

      if (matchingEntry) {
        console.log(`   ✅ Journal Entry: ${matchingEntry.referenceNumber}`);
        console.log(`   Journal Amount: $${matchingEntry.totalAmount.toString()}`);
        console.log(`   Match: ${parseFloat(run.totalGrossPay?.toString() || '0') === parseFloat(matchingEntry.totalAmount.toString()) ? '✅ YES' : '❌ NO'}`);
        totalJournal += parseFloat(matchingEntry.totalAmount.toString());
      } else {
        console.log(`   ❌ Journal Entry: NOT FOUND`);
      }
      
      totalPayroll += parseFloat(run.totalGrossPay?.toString() || '0');
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TOTALS');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total Payroll Gross: $${totalPayroll.toFixed(2)}`);
    console.log(`Total Journal Entries: $${totalJournal.toFixed(2)}`);
    console.log(`Difference: $${Math.abs(totalPayroll - totalJournal).toFixed(2)}`);
    console.log(`Match: ${Math.abs(totalPayroll - totalJournal) < 0.01 ? '✅ YES' : '❌ NO'}\n`);

    // Check if issue is duplicate payroll runs or missing entries
    if (Math.abs(totalPayroll - totalJournal) > 0.01) {
      console.log('⚠️ MISMATCH DETECTED!');
      console.log('   Possible causes:');
      console.log('   1. Some payroll runs processed before journal entry code existed');
      console.log('   2. Journal entry creation failed for some runs');
      console.log('   3. Duplicate payroll runs with same period name');
    } else {
      console.log('✅ PERFECT MATCH!');
      console.log('   All payroll amounts match journal entries.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

detailedPayrollJournalCheck();

