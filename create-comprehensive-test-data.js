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

// Account numbers for reference
const ACCOUNTS = {
  CASH: '1000',
  ACCOUNTS_RECEIVABLE: '1200',
  ACCOUNTS_PAYABLE: '2000',
  VAT_OUTPUT: '2110',
  VAT_INPUT: '2120',
  SHARE_CAPITAL: '3000',
  RETAINED_EARNINGS: '3100',
  REVENUE: '4000',
  COST_OF_SALES: '5000',
  OPERATING_EXPENSES: '5010'
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
    if (!customer) {
      throw new Error('No active customer found');
    }
    customerId = customer.id;
    console.log(`✅ Customer: ${customer.name}`);

    // Get vendor
    const vendor = await prisma.vendor.findFirst({
      where: { isActive: true }
    });
    if (!vendor) {
      throw new Error('No active vendor found');
    }
    vendorId = vendor.id;
    console.log(`✅ Vendor: ${vendor.name}`);

    return true;
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    return false;
  }
}

async function createCashbookReceipt(description, amount, reference, date) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/cashbook/receipts`,
      {
        bankId: bankId,
        transactionDate: date,
        description: description,
        amount: amount,
        reference: reference,
        counterpartyType: 'GL',
        glAccountId: (await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.REVENUE } })).id,
        vatCode: '15%'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Post the transaction
    if (response.data.data?.id) {
      await axios.post(
        `${BASE_URL}/api/cashbook/transactions/${response.data.data.id}/post`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );
    }

    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create receipt ${reference}:`, error.response?.data || error.message);
    return null;
  }
}

async function createCashbookPayment(description, amount, reference, date, glAccountNo) {
  try {
    const glAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: glAccountNo }
    });

    if (!glAccount) {
      console.error(`❌ GL Account ${glAccountNo} not found`);
      return null;
    }

    const response = await axios.post(
      `${BASE_URL}/api/cashbook/payments`,
      {
        bankId: bankId,
        transactionDate: date,
        description: description,
        amount: amount,
        reference: reference,
        counterpartyType: 'GL',
        glAccountId: glAccount.id,
        vatCode: '15%'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Post the transaction
    if (response.data.data?.id) {
      await axios.post(
        `${BASE_URL}/api/cashbook/transactions/${response.data.data.id}/post`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );
    }

    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create payment ${reference}:`, error.response?.data || error.message);
    return null;
  }
}

async function createInvoice(description, amount, invoiceNumber, date) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/accounting/invoices`,
      {
        customerId: customerId,
        amount: amount,
        currencyId: defaultCurrencyId,
        invoiceDate: date,
        dueDate: new Date(new Date(date).setDate(new Date(date).getDate() + 30)).toISOString().split('T')[0],
        description: description,
        invoiceNumber: invoiceNumber,
        isTaxable: true,
        items: [
          {
            description: description,
            quantity: 1,
            unitPrice: amount
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create invoice ${invoiceNumber}:`, error.response?.data || error.message);
    return null;
  }
}

async function createExpense(description, amount, receiptNumber, date, category) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/accounting/expenses`,
      {
        vendorId: vendorId,
        category: category,
        amount: amount,
        currencyId: defaultCurrencyId,
        transactionDate: date,
        description: description,
        receiptNumber: receiptNumber,
        isTaxable: true,
        paymentMethod: 'BANK'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create expense ${receiptNumber}:`, error.response?.data || error.message);
    return null;
  }
}

async function createManualJournalEntry(reference, description, date, lines) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/accounting/journal-entries`,
      {
        referenceNumber: reference,
        description: description,
        transactionDate: date,
        currencyId: defaultCurrencyId,
        lines: lines
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Post the journal entry
    if (response.data.data?.journalEntry?.id || response.data.data?.id) {
      const jeId = response.data.data?.journalEntry?.id || response.data.data?.id;
      await axios.post(
        `${BASE_URL}/api/accounting/journal-entries/${jeId}/post`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );
    }

    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create journal entry ${reference}:`, error.response?.data || error.message);
    return null;
  }
}

async function createTestData() {
  console.log('\n🚀 Creating comprehensive test data for financial statements...\n');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Get account IDs
  const cashAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.CASH } });
  const revenueAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.REVENUE } });
  const arAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.ACCOUNTS_RECEIVABLE } });
  const apAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.ACCOUNTS_PAYABLE } });
  const expenseAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.OPERATING_EXPENSES } });
  const vatOutputAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.VAT_OUTPUT } });
  const vatInputAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.VAT_INPUT } });
  const shareCapitalAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: ACCOUNTS.SHARE_CAPITAL } });

  // Base date: January 1, 2025
  const baseDate = new Date('2025-01-01');

  // ============================================================================
  // 1. CASHBOOK RECEIPTS (Revenue - Operating Activities)
  // ============================================================================
  console.log('📥 Creating Cashbook Receipts (Revenue)...\n');

  await createCashbookReceipt(
    'Management Fees - Q1 2025',
    10000,
    'CB-REC-001',
    new Date('2025-01-15').toISOString().split('T')[0]
  );
  console.log('✅ Created: Management Fees Receipt - $10,000');

  await createCashbookReceipt(
    'Consulting Services Revenue',
    7500,
    'CB-REC-002',
    new Date('2025-02-10').toISOString().split('T')[0]
  );
  console.log('✅ Created: Consulting Services Receipt - $7,500');

  await createCashbookReceipt(
    'Investment Advisory Fees',
    15000,
    'CB-REC-003',
    new Date('2025-03-20').toISOString().split('T')[0]
  );
  console.log('✅ Created: Investment Advisory Fees Receipt - $15,000');

  // ============================================================================
  // 2. CASHBOOK PAYMENTS (Expenses - Operating Activities)
  // ============================================================================
  console.log('\n📤 Creating Cashbook Payments (Expenses)...\n');

  await createCashbookPayment(
    'Office Rent Payment',
    2000,
    'CB-PAY-001',
    new Date('2025-01-05').toISOString().split('T')[0],
    ACCOUNTS.OPERATING_EXPENSES
  );
  console.log('✅ Created: Office Rent Payment - $2,000');

  await createCashbookPayment(
    'Utilities Payment',
    500,
    'CB-PAY-002',
    new Date('2025-02-05').toISOString().split('T')[0],
    ACCOUNTS.OPERATING_EXPENSES
  );
  console.log('✅ Created: Utilities Payment - $500');

  await createCashbookPayment(
    'Marketing Expenses',
    3000,
    'CB-PAY-003',
    new Date('2025-03-10').toISOString().split('T')[0],
    ACCOUNTS.OPERATING_EXPENSES
  );
  console.log('✅ Created: Marketing Expenses Payment - $3,000');

  // ============================================================================
  // 3. INVOICES (Revenue + Accounts Receivable)
  // ============================================================================
  console.log('\n📄 Creating Invoices (Revenue + A/R)...\n');

  await createInvoice(
    'Management Fees Invoice - Client A',
    12000,
    'INV-2025-001',
    new Date('2025-01-20').toISOString().split('T')[0]
  );
  console.log('✅ Created: Invoice INV-2025-001 - $12,000');

  await createInvoice(
    'Consulting Services Invoice - Client B',
    8500,
    'INV-2025-002',
    new Date('2025-02-15').toISOString().split('T')[0]
  );
  console.log('✅ Created: Invoice INV-2025-002 - $8,500');

  // ============================================================================
  // 4. EXPENSES (Expense Accounts)
  // ============================================================================
  console.log('\n💰 Creating Expenses...\n');

  await createExpense(
    'Salaries and Wages - January 2025',
    8000,
    'EXP-2025-001',
    new Date('2025-01-31').toISOString().split('T')[0],
    'Salaries and Wages'
  );
  console.log('✅ Created: Salaries Expense - $8,000');

  await createExpense(
    'Travel and Accommodation - Business Trip',
    1500,
    'EXP-2025-002',
    new Date('2025-02-20').toISOString().split('T')[0],
    'Travel and Accommodation'
  );
  console.log('✅ Created: Travel Expense - $1,500');

  await createExpense(
    'Office Equipment Purchase',
    2500,
    'EXP-2025-003',
    new Date('2025-03-05').toISOString().split('T')[0],
    'Office Equipment'
  );
  console.log('✅ Created: Office Equipment Expense - $2,500');

  await createExpense(
    'Branding and Marketing Campaign',
    4000,
    'EXP-2025-004',
    new Date('2025-03-15').toISOString().split('T')[0],
    'Branding and Marketing'
  );
  console.log('✅ Created: Marketing Expense - $4,000');

  // ============================================================================
  // 5. MANUAL JOURNAL ENTRIES (Accruals, Adjustments, etc.)
  // ============================================================================
  console.log('\n📝 Creating Manual Journal Entries...\n');

  // Accrued Revenue
  if (cashAccount && revenueAccount) {
    await createManualJournalEntry(
      'JE-ACC-001',
      'Accrued Revenue Recognition',
      new Date('2025-01-25').toISOString().split('T')[0],
      [
        {
          chartOfAccountId: arAccount.id,
          debitAmount: 5000,
          creditAmount: 0,
          description: 'Accrued revenue from services rendered'
        },
        {
          chartOfAccountId: revenueAccount.id,
          debitAmount: 0,
          creditAmount: 5000,
          description: 'Revenue recognized'
        }
      ]
    );
    console.log('✅ Created: Accrued Revenue Journal Entry - $5,000');
  }

  // Accrued Expense
  if (expenseAccount && apAccount) {
    await createManualJournalEntry(
      'JE-ACC-002',
      'Accrued Expense - Utilities',
      new Date('2025-02-28').toISOString().split('T')[0],
      [
        {
          chartOfAccountId: expenseAccount.id,
          debitAmount: 600,
          creditAmount: 0,
          description: 'Utilities expense accrued'
        },
        {
          chartOfAccountId: apAccount.id,
          debitAmount: 0,
          creditAmount: 600,
          description: 'Accounts payable'
        }
      ]
    );
    console.log('✅ Created: Accrued Expense Journal Entry - $600');
  }

  // Share Capital Contribution
  if (cashAccount && shareCapitalAccount) {
    await createManualJournalEntry(
      'JE-CAP-001',
      'Share Capital Contribution',
      new Date('2025-01-01').toISOString().split('T')[0],
      [
        {
          chartOfAccountId: cashAccount.id,
          debitAmount: 50000,
          creditAmount: 0,
          description: 'Cash received from shareholders'
        },
        {
          chartOfAccountId: shareCapitalAccount.id,
          debitAmount: 0,
          creditAmount: 50000,
          description: 'Share capital issued'
        }
      ]
    );
    console.log('✅ Created: Share Capital Contribution - $50,000');
  }

  // Inventory Purchase
  const inventoryAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1300' } // Inventory account
  });
  if (cashAccount && inventoryAccount) {
    await createManualJournalEntry(
      'JE-INV-001',
      'Inventory Purchase',
      new Date('2025-02-10').toISOString().split('T')[0],
      [
        {
          chartOfAccountId: inventoryAccount.id,
          debitAmount: 3000,
          creditAmount: 0,
          description: 'Inventory purchased'
        },
        {
          chartOfAccountId: cashAccount.id,
          debitAmount: 0,
          creditAmount: 3000,
          description: 'Cash paid for inventory'
        }
      ]
    );
    console.log('✅ Created: Inventory Purchase - $3,000');
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ Test data creation completed!');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('📊 Summary:');
  console.log('   • Cashbook Receipts: 3 (Revenue)');
  console.log('   • Cashbook Payments: 3 (Expenses)');
  console.log('   • Invoices: 2 (Revenue + A/R)');
  console.log('   • Expenses: 4 (Various expense categories)');
  console.log('   • Manual Journal Entries: 4 (Accruals, Capital, Inventory)');
  console.log('\n💡 You can now test:');
  console.log('   • Income Statement (Profit & Loss)');
  console.log('   • Balance Sheet');
  console.log('   • Cash Flow Statement');
  console.log('   • Trial Balance');
  console.log('   • Statement of Equity');
  console.log('\n');
}

async function main() {
  try {
    if (!(await login())) {
      process.exit(1);
    }

    if (!(await getSetupData())) {
      process.exit(1);
    }

    await createTestData();
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

