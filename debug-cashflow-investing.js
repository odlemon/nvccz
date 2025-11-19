const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function debugCashFlow() {
  try {
    console.log('🔍 Debugging Cash Flow Investing Activities...\n');

    const startDate = new Date('2025-11-01');
    const endDate = new Date('2025-11-30');
    const currency = await prisma.currency.findFirst({ where: { isActive: true } });

    console.log(`📅 Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

    // Get journal entries (same as cash flow service)
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        },
        status: 'POSTED',
        currencyId: currency.id,
        NOT: {
          cashbookEntries: {
            some: {
              OR: [
                { status: 'VOIDED' },
                { reversedAt: { not: null } }
              ]
            }
          }
        },
        AND: [
          {
            referenceNumber: {
              not: { startsWith: 'VR-' }
            }
          },
          {
            referenceNumber: {
              not: { startsWith: 'REV-' }
            }
          }
        ]
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        cashbookEntries: {
          include: {
            bank: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    console.log(`📋 Found ${journalEntries.length} journal entries\n`);

    // Find account 1501
    const account1501 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1501' }
    });

    if (!account1501) {
      console.log('❌ Account 1501 not found');
      return;
    }

    // Calculate balance like CashFlowBalanceService does
    let totalDebits = 0;
    let totalCredits = 0;
    const transactions = [];

    for (const je of journalEntries) {
      for (const line of je.journalEntryLines) {
        if (line.chartOfAccountId === account1501.id) {
          const debitAmt = new Decimal(line.debitAmount || 0).toNumber();
          const creditAmt = new Decimal(line.creditAmount || 0).toNumber();
          
          totalDebits = new Decimal(totalDebits).plus(debitAmt).toNumber();
          totalCredits = new Decimal(totalCredits).plus(creditAmt).toNumber();

          transactions.push({
            reference: je.referenceNumber,
            description: je.description,
            date: je.transactionDate,
            debit: debitAmt,
            credit: creditAmt
          });
        }
      }
    }

    const netAmount = totalDebits - totalCredits;

    console.log(`📊 Account 1501 (${account1501.accountName}):`);
    console.log(`   Account Type: ${account1501.accountType}`);
    console.log(`   Total Debits: $${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
    console.log(`   Net Amount: $${netAmount.toFixed(2)}\n`);

    if (transactions.length === 0) {
      console.log('⚠️  No transactions found for account 1501 in this period!');
      console.log('   This means the $40,000 disbursement is outside the date range.\n');
    } else {
      console.log(`📋 Transactions (${transactions.length}):`);
      transactions.forEach((tx, index) => {
        console.log(`   ${index + 1}. ${tx.reference} - ${tx.date.toISOString().split('T')[0]}`);
        console.log(`      Debit: $${tx.debit}, Credit: $${tx.credit}`);
      });
    }

    // Check categorization
    const accountName = account1501.accountName.toLowerCase();
    const investingKeywords = [
      "equipment", "machinery", "vehicle", "building", "property", "land",
      "investment", "securities", "bonds", "stocks", "fixed asset", "capital asset",
      "depreciation", "accumulated depreciation", "amortization"
    ];

    const isInvesting = investingKeywords.some(keyword => accountName.includes(keyword));
    console.log(`\n🔍 Categorization:`);
    console.log(`   Would be categorized as Investing: ${isInvesting ? '✅ YES' : '❌ NO'}`);

    if (isInvesting && netAmount > 0) {
      console.log(`\n💰 Expected Cash Flow Calculation:`);
      console.log(`   Account Type: ${account1501.accountType}`);
      console.log(`   Net Amount: $${netAmount.toFixed(2)}`);
      console.log(`   For Asset: total -= netAmount`);
      console.log(`   Expected Investing Total: -$${netAmount.toFixed(2)}`);
      console.log(`   But actual total is: $0.00`);
      console.log(`   ⚠️  This suggests the account is not being included in the calculation!\n`);
    }

    // Check all investing accounts
    console.log('🔍 Checking all accounts that should be in Investing Activities:\n');
    
    const allAccounts = new Map();
    for (const je of journalEntries) {
      for (const line of je.journalEntryLines) {
        const accountId = line.chartOfAccount.id;
        if (!allAccounts.has(accountId)) {
          allAccounts.set(accountId, {
            account: line.chartOfAccount,
            totalDebits: 0,
            totalCredits: 0
          });
        }
        const acc = allAccounts.get(accountId);
        acc.totalDebits += new Decimal(line.debitAmount || 0).toNumber();
        acc.totalCredits += new Decimal(line.creditAmount || 0).toNumber();
      }
    }

    const investingAccounts = [];
    for (const [accountId, data] of allAccounts.entries()) {
      const accountName = data.account.accountName.toLowerCase();
      const isInvesting = investingKeywords.some(keyword => accountName.includes(keyword));
      
      if (isInvesting) {
        const netAmount = data.totalDebits - data.totalCredits;
        investingAccounts.push({
          accountNo: data.account.accountNo,
          accountName: data.account.accountName,
          accountType: data.account.accountType,
          netAmount: netAmount
        });
      }
    }

    console.log(`📊 Investing Accounts Found (${investingAccounts.length}):`);
    investingAccounts.forEach((acc, index) => {
      console.log(`\n   ${index + 1}. ${acc.accountNo} - ${acc.accountName}`);
      console.log(`      Type: ${acc.accountType}`);
      console.log(`      Net Amount: $${acc.netAmount.toFixed(2)}`);
      if (acc.accountType === 'Asset' || acc.accountType === 'Non-Current Asset' || 
          acc.accountType === 'Fixed Asset' || acc.accountType === 'Long-Term Asset') {
        console.log(`      Expected Cash Flow: -$${acc.netAmount.toFixed(2)} (outflow)`);
      }
    });

    const totalInvesting = investingAccounts.reduce((sum, acc) => {
      if (acc.accountType === 'Asset' || acc.accountType === 'Non-Current Asset' || 
          acc.accountType === 'Fixed Asset' || acc.accountType === 'Long-Term Asset') {
        return sum - acc.netAmount;
      }
      return sum;
    }, 0);

    console.log(`\n💰 Calculated Total Investing: $${totalInvesting.toFixed(2)}`);
    console.log(`   But API shows: $0.00\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

debugCashFlow();

