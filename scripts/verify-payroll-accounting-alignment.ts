import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function verifyPayrollAccountingAlignment() {
  try {
    console.log('🔍 Verifying Payroll Accounting Alignment\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Get all payroll runs
    console.log('Step 1: Payroll Runs Data');
    console.log('───────────────────────────────────────────────────────────\n');
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        status: 'COMPLETED'
      },
      select: {
        id: true,
        name: true,
        payPeriod: true,
        totalGrossPay: true,
        totalDeductions: true,
        totalNetPay: true,
        endDate: true
      },
      orderBy: {
        endDate: 'desc'
      }
    });

    console.log(`Found ${payrollRuns.length} completed payroll run(s):\n`);
    let totalPayrollGross = new Decimal(0);
    let totalPayrollDeductions = new Decimal(0);
    let totalPayrollNet = new Decimal(0);

    payrollRuns.forEach((run, index) => {
      console.log(`${index + 1}. ${run.name} (${run.payPeriod})`);
      console.log(`   Gross Pay: $${run.totalGrossPay?.toString() || '0'}`);
      console.log(`   Deductions: $${run.totalDeductions?.toString() || '0'}`);
      console.log(`   Net Pay: $${run.totalNetPay?.toString() || '0'}`);
      console.log(`   Date: ${new Date(run.endDate).toISOString().split('T')[0]}\n`);

      if (run.totalGrossPay) totalPayrollGross = totalPayrollGross.add(run.totalGrossPay);
      if (run.totalDeductions) totalPayrollDeductions = totalPayrollDeductions.add(run.totalDeductions);
      if (run.totalNetPay) totalPayrollNet = totalPayrollNet.add(run.totalNetPay);
    });

    console.log(`Total Payroll Summary:`);
    console.log(`   Total Gross Pay: $${totalPayrollGross.toString()}`);
    console.log(`   Total Deductions: $${totalPayrollDeductions.toString()}`);
    console.log(`   Total Net Pay: $${totalPayrollNet.toString()}\n`);

    // Step 2: Get payroll journal entries
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Step 2: Journal Entries Data');
    console.log('═══════════════════════════════════════════════════════════\n');

    const payrollJournalEntries = await prisma.journalEntry.findMany({
      where: {
        description: {
          contains: 'Payroll'
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: {
              select: {
                accountNo: true,
                accountName: true,
                accountType: true
              }
            }
          }
        }
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });

    console.log(`Found ${payrollJournalEntries.length} payroll journal entry/entries:\n`);

    let totalJournalGross = new Decimal(0);
    let totalJournalDebits = new Decimal(0);
    let totalJournalCredits = new Decimal(0);

    payrollJournalEntries.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.referenceNumber}`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Date: ${entry.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Total Amount: $${entry.totalAmount.toString()}`);
      console.log(`   Lines:`);

      let entryDebits = new Decimal(0);
      let entryCredits = new Decimal(0);

      entry.journalEntryLines.forEach((line, lineIndex) => {
        const account = line.chartOfAccount;
        if (line.debitAmount && line.debitAmount.gt(0)) {
          entryDebits = entryDebits.add(line.debitAmount);
          console.log(`      ${lineIndex + 1}. DR ${account.accountNo} - ${account.accountName}: $${line.debitAmount.toString()}`);
        }
        if (line.creditAmount && line.creditAmount.gt(0)) {
          entryCredits = entryCredits.add(line.creditAmount);
          console.log(`      ${lineIndex + 1}. CR ${account.accountNo} - ${account.accountName}: $${line.creditAmount.toString()}`);
        }
      });

      console.log(`   Entry Debits: $${entryDebits.toString()}`);
      console.log(`   Entry Credits: $${entryCredits.toString()}`);
      console.log(`   Balanced: ${entryDebits.eq(entryCredits) ? '✅ YES' : '❌ NO'}\n`);

      totalJournalDebits = totalJournalDebits.add(entryDebits);
      totalJournalCredits = totalJournalCredits.add(entryCredits);
      totalJournalGross = totalJournalGross.add(entry.totalAmount);
    });

    console.log(`Total Journal Entries Summary:`);
    console.log(`   Total Journal Amount: $${totalJournalGross.toString()}`);
    console.log(`   Total Debits: $${totalJournalDebits.toString()}`);
    console.log(`   Total Credits: $${totalJournalCredits.toString()}`);
    console.log(`   Balanced: ${totalJournalDebits.eq(totalJournalCredits) ? '✅ YES' : '❌ NO'}\n`);

    // Step 3: Check Trial Balance for payroll-related accounts
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Step 3: Trial Balance Data (Payroll-Related Accounts)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Find payroll-related accounts
    const payrollAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountName: { contains: 'Salaries' } },
          { accountName: { contains: 'Wages' } },
          { accountName: { contains: 'PAYE' } },
          { accountName: { contains: 'NSSA' } },
          { accountName: { contains: 'Pension' } },
          { accountNo: '5010' }, // Salaries Expense
          { accountNo: '5030' }, // Salaries and Wages
          { accountNo: '2150' }, // PAYE Payable
          { accountNo: '2160' }, // NSSA/Pension Payable
          { accountNo: '2250' }  // Net Wages Payable
        ],
        isActive: true
      },
      select: {
        id: true,
        accountNo: true,
        accountName: true,
        accountType: true
      }
    });

    console.log(`Found ${payrollAccounts.length} payroll-related account(s):\n`);
    payrollAccounts.forEach((acc, index) => {
      console.log(`   ${index + 1}. ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
    });

    // Get journal entry lines for these accounts
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    console.log(`\n   Checking balances as of: ${today.toISOString().split('T')[0]}\n`);

    let totalTrialBalanceDebits = new Decimal(0);
    let totalTrialBalanceCredits = new Decimal(0);

    for (const account of payrollAccounts) {
      const accountLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.id,
          journalEntry: {
            transactionDate: {
              lte: today
            },
            status: 'POSTED',
            cashbookEntries: {
              none: {
                OR: [
                  { status: 'VOIDED' },
                  { reversedAt: { not: null } }
                ]
              }
            },
            AND: [
              {
                referenceNumber: {
                  not: {
                    startsWith: 'VR-'
                  }
                }
              },
              {
                referenceNumber: {
                  not: {
                    startsWith: 'REV-'
                  }
                }
              }
            ]
          }
        },
        select: {
          debitAmount: true,
          creditAmount: true,
          journalEntry: {
            select: {
              referenceNumber: true,
              description: true
            }
          }
        }
      });

      let accountDebits = new Decimal(0);
      let accountCredits = new Decimal(0);

      accountLines.forEach(line => {
        if (line.debitAmount) accountDebits = accountDebits.add(line.debitAmount);
        if (line.creditAmount) accountCredits = accountCredits.add(line.creditAmount);
      });

      if (accountDebits.gt(0) || accountCredits.gt(0)) {
        console.log(`   ${account.accountNo} - ${account.accountName}:`);
        console.log(`      Debits: $${accountDebits.toString()}`);
        console.log(`      Credits: $${accountCredits.toString()}`);
        console.log(`      Net: $${accountDebits.sub(accountCredits).toString()}`);
        console.log(`      Transactions: ${accountLines.length}\n`);

        totalTrialBalanceDebits = totalTrialBalanceDebits.add(accountDebits);
        totalTrialBalanceCredits = totalTrialBalanceCredits.add(accountCredits);
      }
    }

    console.log(`Total Trial Balance Summary (Payroll Accounts):`);
    console.log(`   Total Debits: $${totalTrialBalanceDebits.toString()}`);
    console.log(`   Total Credits: $${totalTrialBalanceCredits.toString()}\n`);

    // Step 4: Comparison and Verification
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Step 4: Alignment Verification');
    console.log('═══════════════════════════════════════════════════════════\n');

    const payrollGrossValue = parseFloat(totalPayrollGross.toString());
    const journalGrossValue = parseFloat(totalJournalGross.toString());
    const journalDebitsValue = parseFloat(totalJournalDebits.toString());
    const journalCreditsValue = parseFloat(totalJournalCredits.toString());
    const trialDebitsValue = parseFloat(totalTrialBalanceDebits.toString());
    const trialCreditsValue = parseFloat(totalTrialBalanceCredits.toString());

    console.log('1. Payroll vs Journal Entries:');
    const payrollJournalMatch = Math.abs(payrollGrossValue - journalGrossValue) < 0.01;
    console.log(`   Payroll Gross: $${payrollGrossValue.toFixed(2)}`);
    console.log(`   Journal Total: $${journalGrossValue.toFixed(2)}`);
    console.log(`   Match: ${payrollJournalMatch ? '✅ YES' : '❌ NO'}`);
    if (!payrollJournalMatch) {
      console.log(`   Difference: $${Math.abs(payrollGrossValue - journalGrossValue).toFixed(2)}`);
    }
    console.log('');

    console.log('2. Journal Entry Balance:');
    const journalBalanced = Math.abs(journalDebitsValue - journalCreditsValue) < 0.01;
    console.log(`   Total Debits: $${journalDebitsValue.toFixed(2)}`);
    console.log(`   Total Credits: $${journalCreditsValue.toFixed(2)}`);
    console.log(`   Balanced: ${journalBalanced ? '✅ YES' : '❌ NO'}`);
    if (!journalBalanced) {
      console.log(`   Difference: $${Math.abs(journalDebitsValue - journalCreditsValue).toFixed(2)}`);
    }
    console.log('');

    console.log('3. Journal Entries vs Trial Balance:');
    const journalTrialDebitsMatch = Math.abs(journalDebitsValue - trialDebitsValue) < 0.01;
    const journalTrialCreditsMatch = Math.abs(journalCreditsValue - trialCreditsValue) < 0.01;
    console.log(`   Journal Debits: $${journalDebitsValue.toFixed(2)}`);
    console.log(`   Trial Balance Debits: $${trialDebitsValue.toFixed(2)}`);
    console.log(`   Match: ${journalTrialDebitsMatch ? '✅ YES' : '❌ NO'}`);
    if (!journalTrialDebitsMatch) {
      console.log(`   Difference: $${Math.abs(journalDebitsValue - trialDebitsValue).toFixed(2)}`);
    }
    console.log(`   Journal Credits: $${journalCreditsValue.toFixed(2)}`);
    console.log(`   Trial Balance Credits: $${trialCreditsValue.toFixed(2)}`);
    console.log(`   Match: ${journalTrialCreditsMatch ? '✅ YES' : '❌ NO'}`);
    if (!journalTrialCreditsMatch) {
      console.log(`   Difference: $${Math.abs(journalCreditsValue - trialCreditsValue).toFixed(2)}`);
    }
    console.log('');

    // Final Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 FINAL VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const allAligned = payrollJournalMatch && journalBalanced && journalTrialDebitsMatch && journalTrialCreditsMatch;

    if (allAligned) {
      console.log('✅ ALL SYSTEMS ALIGNED!');
      console.log('   ✅ Payroll amounts match Journal Entries');
      console.log('   ✅ Journal Entries are balanced');
      console.log('   ✅ Journal Entries match Trial Balance');
      console.log('\n   Everything is in sync! 🎉');
    } else {
      console.log('⚠️ MISALIGNMENT DETECTED!');
      if (!payrollJournalMatch) {
        console.log('   ❌ Payroll amounts do NOT match Journal Entries');
      }
      if (!journalBalanced) {
        console.log('   ❌ Journal Entries are NOT balanced');
      }
      if (!journalTrialDebitsMatch || !journalTrialCreditsMatch) {
        console.log('   ❌ Journal Entries do NOT match Trial Balance');
      }
      console.log('\n   Investigation needed to identify the discrepancy.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPayrollAccountingAlignment();

