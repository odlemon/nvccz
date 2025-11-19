const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

// Replicate categorization logic
function categorizeAccountsByCashFlow(accounts) {
  for (const account of accounts) {
    const accountName = account.accountName.toLowerCase();
    const accountNo = account.accountNo;

    // Check if this is a cash/bank account
    const isCashAccount = accountName.includes("cash") || 
                          accountName.includes("bank") ||
                          (account.accountType === "Current Asset" && accountNo >= "1000" && accountNo < "1100");

    if (isCashAccount) {
      account.cashFlowCategory = "CASH_ACCOUNT";
      continue;
    }

    // Operating Activities
    if (isOperatingActivity(accountName, accountNo, account.accountType)) {
      account.cashFlowCategory = "Operating";
    }
    // Investing Activities
    else if (isInvestingActivity(accountName, accountNo, account.accountType)) {
      account.cashFlowCategory = "Investing";
    }
    // Financing Activities
    else if (isFinancingActivity(accountName, accountNo, account.accountType)) {
      account.cashFlowCategory = "Financing";
    }
    // Default to Operating
    else {
      account.cashFlowCategory = "Operating";
    }
  }
  return accounts;
}

function isOperatingActivity(accountName, accountNo, accountType) {
  if (accountType === "Revenue" || accountType === "Expense") {
    return true;
  }
  const operatingKeywords = [
    "accounts receivable", "accounts payable", "inventory", "prepaid", "accrued",
    "sales", "revenue", "income", "expense", "cost", "wages", "salary", "rent",
    "utilities", "insurance", "maintenance", "office", "travel", "advertising",
    "management fees", "operating", "administrative", "selling"
  ];
  return operatingKeywords.some(keyword => accountName.includes(keyword));
}

function isInvestingActivity(accountName, accountNo, accountType) {
  const investingKeywords = [
    "equipment", "machinery", "vehicle", "building", "property", "land",
    "investment", "securities", "bonds", "stocks", "fixed asset", "capital asset",
    "depreciation", "accumulated depreciation", "amortization"
  ];
  return investingKeywords.some(keyword => accountName.includes(keyword));
}

function isFinancingActivity(accountName, accountNo, accountType) {
  const financingKeywords = [
    "loan", "mortgage", "bank loan", "long term debt", "short term debt",
    "capital", "equity", "shareholder", "dividend",
    "drawing", "withdrawal", "contribution"
  ];
  const isCashAccount = accountName.includes("cash") || 
                        accountName.includes("bank") ||
                        (accountType === "Current Asset" && accountNo >= "1000" && accountNo < "1100");
  if (isCashAccount) {
    return false;
  }
  return financingKeywords.some(keyword => accountName.includes(keyword));
}

async function testCategorization() {
  try {
    console.log('🧪 Testing Cash Flow Categorization...\n');

    const startDate = new Date('2025-11-01');
    const endDate = new Date('2025-11-30');
    const currency = await prisma.currency.findFirst({ where: { isActive: true } });

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
        }
      }
    });

    console.log(`📋 Found ${journalEntries.length} journal entries\n`);

    // Calculate account balances (simplified version)
    const accountMap = new Map();

    for (const je of journalEntries) {
      for (const line of je.journalEntryLines) {
        const accountId = line.chartOfAccountId;
        if (!accountMap.has(accountId)) {
          accountMap.set(accountId, {
            accountId: accountId,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            transactions: []
          });
        }
        const acc = accountMap.get(accountId);
        const debitAmt = new Decimal(line.debitAmount || 0).toNumber();
        const creditAmt = new Decimal(line.creditAmount || 0).toNumber();
        acc.totalDebits += debitAmt;
        acc.totalCredits += creditAmt;
        acc.transactions.push({
          reference: je.referenceNumber,
          description: je.description,
          date: je.transactionDate,
          debit: debitAmt,
          credit: creditAmt
        });
      }
    }

    // Convert to array format
    const accounts = Array.from(accountMap.values()).map(acc => ({
      accountId: acc.accountId,
      accountNo: acc.accountNo,
      accountName: acc.accountName,
      accountType: acc.accountType,
      financialStatement: acc.financialStatement,
      netAmount: acc.totalDebits - acc.totalCredits,
      totalDebits: acc.totalDebits,
      totalCredits: acc.totalCredits,
      transactions: acc.transactions
    }));

    console.log(`📊 Found ${accounts.length} accounts with activity\n`);

    // Categorize accounts
    const categorizedAccounts = categorizeAccountsByCashFlow(accounts);

    // Find account 1501
    const account1501 = categorizedAccounts.find(acc => acc.accountNo === '1501');
    
    if (account1501) {
      console.log(`✅ Found Account 1501: ${account1501.accountName}`);
      console.log(`   Account Type: ${account1501.accountType}`);
      console.log(`   Cash Flow Category: ${account1501.cashFlowCategory || 'NOT SET'}`);
      console.log(`   Net Amount: $${account1501.netAmount.toFixed(2)}`);
      console.log(`   Total Debits: $${account1501.totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: $${account1501.totalCredits.toFixed(2)}\n`);
    } else {
      console.log('❌ Account 1501 not found in categorized accounts!\n');
    }

    // Check investing accounts
    const investingAccounts = categorizedAccounts.filter(acc => acc.cashFlowCategory === 'Investing');
    console.log(`\n📊 Investing Accounts (${investingAccounts.length}):`);
    investingAccounts.forEach((acc, index) => {
      console.log(`\n   ${index + 1}. ${acc.accountNo} - ${acc.accountName}`);
      console.log(`      Type: ${acc.accountType}`);
      console.log(`      Net Amount: $${acc.netAmount.toFixed(2)}`);
    });

    // Calculate investing total
    let investingTotal = 0;
    for (const account of investingAccounts) {
      if (account.accountType === "Asset" || 
          account.accountType === "Fixed Asset" || 
          account.accountType === "Long-Term Asset" || 
          account.accountType === "Non-Current Asset") {
        investingTotal -= account.netAmount;
      } else if (account.accountType === "Revenue") {
        investingTotal += account.netAmount;
      }
    }

    console.log(`\n💰 Calculated Investing Total: $${investingTotal.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testCategorization();

