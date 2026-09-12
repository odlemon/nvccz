import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findMissingJournalEntries() {
  try {
    console.log('🔍 Finding Payroll Runs Missing Journal Entries\n');

    // Get all completed payroll runs
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED'
      },
      select: {
        id: true,
        name: true,
        payPeriod: true,
        totalGrossPay: true,
        endDate: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${payrollRuns.length} completed payroll run(s):\n`);

    // Check each payroll run for journal entry
    let missingCount = 0;
    let totalMissingAmount = 0;

    for (const run of payrollRuns) {
      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          OR: [
            { description: { contains: run.name } },
            { description: { contains: run.payPeriod } },
            { referenceNumber: { contains: run.payPeriod.replace(/\s+/g, '-').toUpperCase() } }
          ]
        }
      });

      if (journalEntry) {
        console.log(`✅ ${run.name} (${run.payPeriod})`);
        console.log(`   Journal Entry: ${journalEntry.referenceNumber}`);
        console.log(`   Amount: $${run.totalGrossPay?.toString() || '0'}\n`);
      } else {
        console.log(`❌ ${run.name} (${run.payPeriod})`);
        console.log(`   Journal Entry: MISSING!`);
        console.log(`   Amount: $${run.totalGrossPay?.toString() || '0'}`);
        console.log(`   Date: ${new Date(run.endDate).toISOString().split('T')[0]}\n`);
        missingCount++;
        if (run.totalGrossPay) {
          totalMissingAmount += parseFloat(run.totalGrossPay.toString());
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total Payroll Runs: ${payrollRuns.length}`);
    console.log(`With Journal Entries: ${payrollRuns.length - missingCount}`);
    console.log(`Missing Journal Entries: ${missingCount}`);
    if (missingCount > 0) {
      console.log(`Total Missing Amount: $${totalMissingAmount.toFixed(2)}`);
      console.log('\n⚠️ Some payroll runs are missing journal entries!');
      console.log('   This could be because:');
      console.log('   1. Journal entry creation failed silently');
      console.log('   2. Payroll was processed before journal entry code was added');
      console.log('   3. Error occurred during journal entry creation');
    } else {
      console.log('\n✅ All payroll runs have journal entries!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findMissingJournalEntries();

