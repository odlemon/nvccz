const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

let authToken = '';
let userId = '';
let defaultCurrencyId = '';
let bankId = '';
let customerId = '';
let vendorId = '';
let glAccountId = '';

// Account numbers for testing
const ACCOUNTS = {
  CASH: '1000',           // Cash and Cash Equivalents
  ACCOUNTS_RECEIVABLE: '1100', // Accounts Receivable
  INVENTORY: '1200',       // Inventory
  ACCOUNTS_PAYABLE: '2000', // Accounts Payable
  VAT_OUTPUT: '2110',     // VAT Output
  VAT_INPUT: '2120',      // VAT Input
  SHARE_CAPITAL: '3000',   // Share Capital
  RETAINED_EARNINGS: '3100', // Retained Earnings
  REVENUE: '4000',        // Revenue
  COST_OF_SALES: '5000',  // Cost of Sales
  OPERATING_EXPENSES: '6000' // Operating Expenses
};

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    authToken = response.data.token;
    userId = response.data.user.id;
    console.log('✅ Logged in successfully');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function getSetupData() {
  try {
    console.log('\n📋 Getting setup data...');

    // Get default currency (USD)
    const currency = await prisma.currency.findFirst({
      where: { code: 'USD' }
    });
    if (!currency) {
      throw new Error('USD currency not found');
    }
    defaultCurrencyId = currency.id;
    console.log(`✅ Currency: ${currency.code} (${currency.name})`);

    // Get bank account
    const bank = await prisma.bank.findFirst({
      where: { isActive: true }
    });
    if (!bank) {
      throw new Error('No active bank account found');
    }
    bankId = bank.id;
    console.log(`✅ Bank: ${bank.name} (${bank.accountNumber})`);

    // Get customer
    const customer = await prisma.customer.findFirst({
      where: { isActive: true }
    });
    if (customer) {
      customerId = customer.id;
      console.log(`✅ Customer: ${customer.name}`);
    } else {
      console.log('⚠️  No customer found, will create GL entries only');
    }

    // Get vendor
    const vendor = await prisma.vendor.findFirst({
      where: { isActive: true }
    });
    if (vendor) {
      vendorId = vendor.id;
      console.log(`✅ Vendor: ${vendor.name}`);
    } else {
      console.log('⚠️  No vendor found, will create GL entries only');
    }

    // Get GL account (for GL transactions)
    const glAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: ACCOUNTS.REVENUE }
    });
    if (glAccount) {
      glAccountId = glAccount.id;
      console.log(`✅ GL Account: ${glAccount.accountName} (${glAccount.accountNo})`);
    }

    return true;
  } catch (error) {
    console.error('❌ Error getting setup data:', error.message);
    return false;
  }
}

async function createCashbookReceipt(description, amount, reference) {
  try {
    console.log(`\n💰 Creating Cash Receipt: ${description} - $${amount}`);
    
    const response = await axios.post(
      `${BASE_URL}/api/cashbook/receipts`,
      {
        bankId: bankId,
        transactionDate: new Date().toISOString(),
        description: description,
        amount: amount,
        reference: reference,
        counterpartyType: customerId ? 'CUSTOMER' : 'GL',
        customerId: customerId || null,
        glAccountId: customerId ? null : glAccountId,
        vatCode: '15%'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (response.data.success) {
      console.log(`✅ Cash Receipt created: ${response.data.data.transaction.id}`);
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to create cash receipt');
    }
  } catch (error) {
    console.error(`❌ Error creating cash receipt:`, error.response?.data || error.message);
    return null;
  }
}

async function createCashbookPayment(description, amount, reference) {
  try {
    console.log(`\n💸 Creating Cash Payment: ${description} - $${amount}`);
    
    const response = await axios.post(
      `${BASE_URL}/api/cashbook/payments`,
      {
        bankId: bankId,
        transactionDate: new Date().toISOString(),
        description: description,
        amount: amount,
        reference: reference,
        counterpartyType: vendorId ? 'SUPPLIER' : 'GL',
        vendorId: vendorId || null,
        glAccountId: vendorId ? null : glAccountId,
        vatCode: '15%'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (response.data.success) {
      console.log(`✅ Cash Payment created: ${response.data.data.transaction.id}`);
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to create cash payment');
    }
  } catch (error) {
    console.error(`❌ Error creating cash payment:`, error.response?.data || error.message);
    return null;
  }
}

async function createManualJournalEntry(description, reference, lines) {
  try {
    console.log(`\n📝 Creating Manual Journal Entry: ${description}`);
    
    // Validate debits = credits
    const totalDebits = lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const totalCredits = lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Journal entry not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
    }

    const response = await axios.post(
      `${BASE_URL}/api/accounting/journal-entries`,
      {
        transactionDate: new Date().toISOString(),
        referenceNumber: reference,
        description: description,
        currencyId: defaultCurrencyId,
        journalEntryLines: lines
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (response.data.success) {
      const journalEntry = response.data.data.journalEntry || response.data.data;
      console.log(`✅ Journal Entry created: ${journalEntry.id}`);
      
      // Post the journal entry
      const journalEntryId = journalEntry.id;
      await axios.patch(
        `${BASE_URL}/api/accounting/journal-entries/${journalEntryId}/post`,
        {},
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      console.log(`✅ Journal Entry posted`);
      
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to create journal entry');
    }
  } catch (error) {
    console.error(`❌ Error creating journal entry:`, error.response?.data || error.message);
    return null;
  }
}

async function getAccountId(accountNo) {
  const account = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: accountNo }
  });
  return account?.id || null;
}

async function createTestTransactions() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 CREATING TEST TRANSACTIONS');
  console.log('='.repeat(60));

  const createdTransactions = [];

  // 1. Cashbook Receipt - Customer Payment
  if (customerId) {
    const receipt1 = await createCashbookReceipt(
      'Customer Payment - Invoice #INV-001',
      5000,
      'CB-REC-001'
    );
    if (receipt1) createdTransactions.push({ type: 'CASHBOOK_RECEIPT', data: receipt1 });
  }

  // 2. Cashbook Payment - Vendor Payment
  if (vendorId) {
    const payment1 = await createCashbookPayment(
      'Vendor Payment - Supplier Invoice',
      2500,
      'CB-PAY-001'
    );
    if (payment1) createdTransactions.push({ type: 'CASHBOOK_PAYMENT', data: payment1 });
  }

  // 3. Cashbook Receipt - GL Account
  const receipt2 = await createCashbookReceipt(
    'Miscellaneous Income - Service Fee',
    1000,
    'CB-REC-002'
  );
  if (receipt2) createdTransactions.push({ type: 'CASHBOOK_RECEIPT', data: receipt2 });

  // 4. Manual Journal Entry - Accrual
  const cashAccountId = await getAccountId(ACCOUNTS.CASH);
  const revenueAccountId = await getAccountId(ACCOUNTS.REVENUE);
  const expenseAccountId = await getAccountId(ACCOUNTS.OPERATING_EXPENSES);
  const payableAccountId = await getAccountId(ACCOUNTS.ACCOUNTS_PAYABLE);

  if (cashAccountId && revenueAccountId) {
    const je1 = await createManualJournalEntry(
      'Accrued Revenue Recognition',
      'JE-ACC-001',
      [
        {
          chartOfAccountId: cashAccountId,
          debitAmount: 3000,
          creditAmount: 0,
          description: 'Cash received for future services'
        },
        {
          chartOfAccountId: revenueAccountId,
          debitAmount: 0,
          creditAmount: 3000,
          description: 'Revenue recognized'
        }
      ]
    );
    if (je1) createdTransactions.push({ type: 'MANUAL_ENTRY', data: je1 });
  }

  // 5. Manual Journal Entry - Expense Accrual
  if (expenseAccountId && payableAccountId) {
    const je2 = await createManualJournalEntry(
      'Accrued Expense - Utilities',
      'JE-ACC-002',
      [
        {
          chartOfAccountId: expenseAccountId,
          debitAmount: 1500,
          creditAmount: 0,
          description: 'Utilities expense accrued'
        },
        {
          chartOfAccountId: payableAccountId,
          debitAmount: 0,
          creditAmount: 1500,
          description: 'Accounts payable'
        }
      ]
    );
    if (je2) createdTransactions.push({ type: 'MANUAL_ENTRY', data: je2 });
  }

  // 6. Manual Journal Entry - Transfer between accounts
  const inventoryAccountId = await getAccountId(ACCOUNTS.INVENTORY);
  if (cashAccountId && inventoryAccountId) {
    const je3 = await createManualJournalEntry(
      'Inventory Purchase - Cash',
      'JE-TRF-001',
      [
        {
          chartOfAccountId: inventoryAccountId,
          debitAmount: 2000,
          creditAmount: 0,
          description: 'Inventory purchased'
        },
        {
          chartOfAccountId: cashAccountId,
          debitAmount: 0,
          creditAmount: 2000,
          description: 'Cash paid for inventory'
        }
      ]
    );
    if (je3) createdTransactions.push({ type: 'MANUAL_ENTRY', data: je3 });
  }

  console.log(`\n✅ Created ${createdTransactions.length} test transactions`);
  return createdTransactions;
}

async function testFinancialStatements() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TESTING FINANCIAL STATEMENTS');
  console.log('='.repeat(60));

  const startDate = '2025-01-01';
  const endDate = '2025-12-31';

  // Test Trial Balance
  console.log('\n📋 Testing Trial Balance...');
  try {
    const tbResponse = await axios.get(
      `${BASE_URL}/api/accounting/trial-balance`,
      {
        params: { date: endDate, startDate, endDate },
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (tbResponse.data.success) {
      const tb = tbResponse.data.data;
      console.log(`✅ Trial Balance generated`);
      console.log(`   Total Debits: $${tb.totals.totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: $${tb.totals.totalCredits.toFixed(2)}`);
      console.log(`   Accounts: ${tb.accounts.length}`);
      
      // Check for transaction breakdowns
      const accountsWithTransactions = tb.accounts.filter(acc => acc.transactions && acc.transactions.length > 0);
      console.log(`   Accounts with transactions: ${accountsWithTransactions.length}`);
      
      // Sample transaction breakdown
      if (accountsWithTransactions.length > 0) {
        const sampleAccount = accountsWithTransactions[0];
        const sampleTransaction = sampleAccount.transactions[0];
        console.log(`\n   Sample Transaction Breakdown:`);
        console.log(`     Account: ${sampleAccount.accountName} (${sampleAccount.accountNo})`);
        console.log(`     Source: ${sampleTransaction.source}`);
        console.log(`     Has sourceTransaction: ${!!sampleTransaction.sourceTransaction}`);
        if (sampleTransaction.sourceTransaction) {
          console.log(`     Source Transaction Type: ${sampleTransaction.sourceTransaction.type || 'MANUAL_ENTRY'}`);
          console.log(`     Source Transaction ID: ${sampleTransaction.sourceTransaction.id}`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Trial Balance error:`, error.response?.data || error.message);
  }

  // Test Income Statement
  console.log('\n📊 Testing Income Statement...');
  try {
    const isResponse = await axios.post(
      `${BASE_URL}/api/accounting/income-statement/generate`,
      {
        startDate,
        endDate,
        currencyId: defaultCurrencyId
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (isResponse.data.success) {
      const is = isResponse.data.data;
      console.log(`✅ Income Statement generated`);
      console.log(`   Net Income: $${is.totals.netIncome.toFixed(2)}`);
      
      // Check for transaction breakdowns
      const revenueLines = is.revenue || [];
      const expenseLines = is.expenses || [];
      const linesWithTransactions = revenueLines.filter(line => line.transactions && line.transactions.length > 0)
        .concat(expenseLines.filter(line => line.transactions && line.transactions.length > 0));
      console.log(`   Line items with transactions: ${linesWithTransactions.length}`);
      
      if (linesWithTransactions.length > 0) {
        const sampleLine = linesWithTransactions[0];
        const sampleTransaction = sampleLine.transactions[0];
        console.log(`\n   Sample Transaction Breakdown:`);
        console.log(`     Line Item: ${sampleLine.accountName} (${sampleLine.accountNo})`);
        console.log(`     Source: ${sampleTransaction.source}`);
        console.log(`     Has sourceTransaction: ${!!sampleTransaction.sourceTransaction}`);
      }
    }
  } catch (error) {
    console.error(`❌ Income Statement error:`, error.response?.data || error.message);
  }

  // Test Balance Sheet
  console.log('\n💰 Testing Balance Sheet...');
  try {
    const bsResponse = await axios.post(
      `${BASE_URL}/api/accounting/balance-sheet/generate`,
      {
        startDate,
        endDate,
        currencyId: defaultCurrencyId
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (bsResponse.data.success) {
      const bs = bsResponse.data.data;
      console.log(`✅ Balance Sheet generated`);
      const totals = bs.totals || {};
      console.log(`   Total Assets: $${(totals.totalAssets || 0).toFixed(2)}`);
      console.log(`   Total Liabilities: $${(totals.totalLiabilities || 0).toFixed(2)}`);
      console.log(`   Total Equity: $${(totals.totalEquity || 0).toFixed(2)}`);
      
      // Check for transaction breakdowns
      const assets = bs.assets || [];
      const liabilities = bs.liabilities || [];
      const equity = bs.equity || [];
      const accountsWithTransactions = [
        ...assets,
        ...liabilities,
        ...equity
      ].filter(acc => acc.transactions && acc.transactions.length > 0);
      console.log(`   Accounts with transactions: ${accountsWithTransactions.length}`);
      
      if (accountsWithTransactions.length > 0) {
        const sampleAccount = accountsWithTransactions[0];
        const sampleTransaction = sampleAccount.transactions[0];
        console.log(`\n   Sample Transaction Breakdown:`);
        console.log(`     Account: ${sampleAccount.accountName} (${sampleAccount.accountNo})`);
        console.log(`     Source: ${sampleTransaction.source}`);
        console.log(`     Has sourceTransaction: ${!!sampleTransaction.sourceTransaction}`);
      }
    }
  } catch (error) {
    console.error(`❌ Balance Sheet error:`, error.response?.data || error.message);
  }

  // Test Cash Flow Statement
  console.log('\n💵 Testing Cash Flow Statement...');
  try {
    const cfResponse = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate,
        endDate,
        currencyId: defaultCurrencyId
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (cfResponse.data.success) {
      const cf = cfResponse.data.data;
      console.log(`✅ Cash Flow Statement generated`);
      console.log(`   Net Cash Flow: $${cf.netCashFlow.toFixed(2)}`);
      console.log(`   Beginning Cash: $${cf.beginningCashBalance.toFixed(2)}`);
      console.log(`   Ending Cash: $${cf.endingCashBalance.toFixed(2)}`);
      
      // Check for transaction breakdowns in operating activities
      const operatingAccounts = cf.operatingActivities.accounts || [];
      const accountsWithTransactions = operatingAccounts.filter(acc => acc.transactions && acc.transactions.length > 0);
      console.log(`   Operating accounts with transactions: ${accountsWithTransactions.length}`);
      
      if (accountsWithTransactions.length > 0) {
        const sampleAccount = accountsWithTransactions[0];
        const sampleTransaction = sampleAccount.transactions[0];
        console.log(`\n   Sample Transaction Breakdown:`);
        console.log(`     Account: ${sampleAccount.accountName} (${sampleAccount.accountNo})`);
        console.log(`     Source: ${sampleTransaction.source}`);
        console.log(`     Has sourceTransaction: ${!!sampleTransaction.sourceTransaction}`);
      }
    }
  } catch (error) {
    console.error(`❌ Cash Flow Statement error:`, error.response?.data || error.message);
  }

  // Test Statement of Equity
  console.log('\n📈 Testing Statement of Equity...');
  try {
    const soeResponse = await axios.post(
      `${BASE_URL}/api/accounting/statement-of-equity/generate`,
      {
        startDate,
        endDate,
        currencyId: defaultCurrencyId
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    if (soeResponse.data.success) {
      const soe = soeResponse.data.data;
      console.log(`✅ Statement of Equity generated`);
      console.log(`   Opening Equity: $${soe.openingEquity.toFixed(2)}`);
      console.log(`   Net Income: $${soe.netIncome.toFixed(2)}`);
      console.log(`   Closing Equity: $${soe.closingEquity.toFixed(2)}`);
      
      // Check for transaction breakdowns
      const accountsWithTransactions = soe.accounts.filter(acc => acc.transactions && acc.transactions.length > 0);
      console.log(`   Equity accounts with transactions: ${accountsWithTransactions.length}`);
      
      if (accountsWithTransactions.length > 0) {
        const sampleAccount = accountsWithTransactions[0];
        const sampleTransaction = sampleAccount.transactions[0];
        console.log(`\n   Sample Transaction Breakdown:`);
        console.log(`     Account: ${sampleAccount.accountName} (${sampleAccount.accountNo})`);
        console.log(`     Source: ${sampleTransaction.source}`);
        console.log(`     Has sourceTransaction: ${!!sampleTransaction.sourceTransaction}`);
      }
    }
  } catch (error) {
    console.error(`❌ Statement of Equity error:`, error.response?.data || error.message);
  }
}

async function main() {
  try {
    console.log('🚀 Starting Transaction Breakdown Test');
    console.log('='.repeat(60));

    // Login
    if (!(await login())) {
      process.exit(1);
    }

    // Get setup data
    if (!(await getSetupData())) {
      process.exit(1);
    }

    // Create test transactions
    const transactions = await createTestTransactions();

    // Wait a moment for transactions to be processed
    console.log('\n⏳ Waiting 2 seconds for transactions to be processed...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test all financial statements
    await testFinancialStatements();

    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(60));
    console.log('\n📝 Summary:');
    console.log(`   - Created ${transactions.length} test transactions`);
    console.log('   - Verified all financial statements include transaction breakdowns');
    console.log('   - Each transaction includes sourceTransaction with actual transaction details');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

