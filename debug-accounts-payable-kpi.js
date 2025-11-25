// Debug script to check Accounts Payable calculation discrepancy
// Run: node debug-accounts-payable-kpi.js

const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function debugAccountsPayable() {
  console.log('🔍 Debugging Accounts Payable Calculation Discrepancy');
  console.log('==================================================\n');

  const asOfDate = new Date('2025-11-30T23:59:59.999Z');
  const currencyId = 'cmh3bymy70000una4yk8leusu'; // USD currency from your request

  try {
    // Find Accounts Payable account
    const apAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '2000' },
          { accountName: { contains: 'Accounts Payable' }, accountType: 'Current Liability' }
        ],
        isActive: true
      }
    });

    if (!apAccount) {
      console.log('❌ Accounts Payable account (2000) not found!');
      return;
    }

    console.log(`✅ Found Accounts Payable account:`);
    console.log(`   Account No: ${apAccount.accountNo}`);
    console.log(`   Account Name: ${apAccount.accountName}`);
    console.log(`   Account ID: ${apAccount.id}`);
    console.log(`   Account Type: ${apAccount.accountType}\n`);

    // Get all journal entry lines for Accounts Payable up to as-of date
    const journalEntryWhere = {
      transactionDate: { lte: asOfDate },
      status: 'POSTED',
      currencyId: currencyId
    };

    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: apAccount.id,
        journalEntry: {
          is: journalEntryWhere
        }
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            transactionDate: true,
            description: true,
            currencyId: true
          }
        }
      },
      orderBy: {
        journalEntry: {
          transactionDate: 'asc'
        }
      }
    });

    console.log(`📊 Journal Entry Lines Found: ${journalLines.length}\n`);

    if (journalLines.length === 0) {
      console.log('⚠️ No journal entries found for Accounts Payable');
      return;
    }

    // Calculate balance using Decimal arithmetic (same as Balance Sheet)
    let balance = new Decimal(0);
    console.log('📋 Transaction Details:');
    console.log('─'.repeat(80));
    
    const transactions = [];
    for (const line of journalLines) {
      const credit = new Decimal(line.creditAmount || 0);
      const debit = new Decimal(line.debitAmount || 0);
      
      balance = balance.plus(credit).minus(debit);
      
      const netChange = credit.minus(debit);
      transactions.push({
        date: line.journalEntry.transactionDate,
        ref: line.journalEntry.referenceNumber,
        description: line.journalEntry.description,
        debit: debit.toNumber(),
        credit: credit.toNumber(),
        netChange: netChange.toNumber(),
        runningBalance: balance.toNumber()
      });

      console.log(`${new Date(line.journalEntry.transactionDate).toISOString().split('T')[0]} | ${line.journalEntry.referenceNumber || 'N/A'}`);
      console.log(`  Dr: $${debit.toFixed(2)} | Cr: $${credit.toFixed(2)} | Net: $${netChange.toFixed(2)} | Running: $${balance.toFixed(2)}`);
    }

    console.log('─'.repeat(80));
    console.log(`\n💰 Final Accounts Payable Balance: $${balance.toFixed(2)}`);

    // Now check if there are multiple Accounts Payable accounts
    const allAPAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountNo: '2000' },
          { accountName: { contains: 'Accounts Payable' }, accountType: 'Current Liability' },
          { accountName: { contains: 'Creditors' }, accountType: 'Current Liability' }
        ],
        isActive: true
      }
    });

    if (allAPAccounts.length > 1) {
      console.log(`\n⚠️ WARNING: Found ${allAPAccounts.length} Accounts Payable-related accounts:`);
      allAPAccounts.forEach(acc => {
        console.log(`   - ${acc.accountNo} - ${acc.accountName} (ID: ${acc.id})`);
      });

      // Calculate total across all AP accounts
      let totalAcrossAllAccounts = new Decimal(0);
      for (const acc of allAPAccounts) {
        const lines = await prisma.journalEntryLine.findMany({
          where: {
            chartOfAccountId: acc.id,
            journalEntry: {
              is: journalEntryWhere
            }
          }
        });

        let accBalance = new Decimal(0);
        for (const line of lines) {
          accBalance = accBalance.plus(line.creditAmount || 0).minus(line.debitAmount || 0);
        }
        totalAcrossAllAccounts = totalAcrossAllAccounts.plus(accBalance);
        console.log(`     Balance for ${acc.accountNo}: $${accBalance.toFixed(2)}`);
      }
      console.log(`\n   📊 Total across ALL Accounts Payable accounts: $${totalAcrossAllAccounts.toFixed(2)}`);
    }

    // Check without currency filter
    console.log(`\n🔍 Checking WITHOUT currency filter...`);
    const journalEntryWhereNoCurrency = {
      transactionDate: { lte: asOfDate },
      status: 'POSTED'
    };

    const journalLinesNoCurrency = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: apAccount.id,
        journalEntry: {
          is: journalEntryWhereNoCurrency
        }
      }
    });

    let balanceNoCurrency = new Decimal(0);
    for (const line of journalLinesNoCurrency) {
      balanceNoCurrency = balanceNoCurrency.plus(line.creditAmount || 0).minus(line.debitAmount || 0);
    }

    console.log(`   Balance WITH currency filter (${currencyId}): $${balance.toFixed(2)}`);
    console.log(`   Balance WITHOUT currency filter (all currencies): $${balanceNoCurrency.toFixed(2)}`);
    console.log(`   Difference: $${balanceNoCurrency.minus(balance).toFixed(2)}`);

    // Check date filtering
    console.log(`\n🔍 Checking date filtering...`);
    const allTimeLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: apAccount.id,
        journalEntry: {
          status: 'POSTED',
          currencyId: currencyId
        }
      }
    });

    let balanceAllTime = new Decimal(0);
    for (const line of allTimeLines) {
      balanceAllTime = balanceAllTime.plus(line.creditAmount || 0).minus(line.debitAmount || 0);
    }

    console.log(`   Balance up to ${asOfDate.toISOString().split('T')[0]}: $${balance.toFixed(2)}`);
    console.log(`   Balance ALL TIME (no date filter): $${balanceAllTime.toFixed(2)}`);
    console.log(`   Difference: $${balanceAllTime.minus(balance).toFixed(2)}`);

    console.log(`\n✅ Expected Balance Sheet value: $2,690.00`);
    console.log(`📊 Calculated value: $${balance.toFixed(2)}`);
    console.log(`📊 Performance KPI showing: $9,040.00`);
    
    if (Math.abs(balance.toNumber() - 2690) < 0.01) {
      console.log(`\n✅ Calculated balance matches Balance Sheet!`);
    } else {
      console.log(`\n❌ Calculated balance does NOT match Balance Sheet!`);
      console.log(`   Difference: $${Math.abs(balance.toNumber() - 2690).toFixed(2)}`);
    }

    if (Math.abs(balanceAllTime.toNumber() - 9040) < 0.01) {
      console.log(`\n⚠️ Performance KPI is showing ALL TIME balance (no date filter)!`);
      console.log(`   This is the issue - it's not filtering by date.`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAccountsPayable();

