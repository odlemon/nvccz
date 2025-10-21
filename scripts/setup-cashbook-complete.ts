// @ts-nocheck
// Complete Cashbook Setup Script
// This script sets up the entire cashbook system with all required components

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupCashbookComplete() {
  console.log('🏦 Setting up Complete Cashbook System...');

  try {
    // Step 1: Seed Chart of Accounts for Cashbook
    console.log('\n📊 Step 1: Seeding Chart of Accounts...');
    
    const bankAccounts = [
      { accountNo: '1000', accountName: 'Cash and Cash Equivalents', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
      { accountNo: '1010', accountName: 'Main Bank Account - USD', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
      { accountNo: '1020', accountName: 'Savings Account - USD', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
      { accountNo: '1030', accountName: 'Petty Cash', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
      { accountNo: '1040', accountName: 'Bank Account - ZAR', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    ];

    const receivableAccounts = [
      { accountNo: '1200', accountName: 'Accounts Receivable Control', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
      { accountNo: '1210', accountName: 'Trade Debtors', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    ];

    const payableAccounts = [
      { accountNo: '2100', accountName: 'Accounts Payable Control', accountType: 'Current Liability', financialStatement: 'Balance Sheet' },
      { accountNo: '2110', accountName: 'Trade Creditors', accountType: 'Current Liability', financialStatement: 'Balance Sheet' },
    ];

    const revenueAccounts = [
      { accountNo: '4000', accountName: 'Sales Revenue', accountType: 'Revenue', financialStatement: 'Income Statement' },
      { accountNo: '4010', accountName: 'Interest Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
      { accountNo: '4020', accountName: 'Management Fees Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
      { accountNo: '4030', accountName: 'Investment Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
      { accountNo: '4040', accountName: 'Other Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
    ];

    const expenseAccounts = [
      { accountNo: '5000', accountName: 'Rent Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5010', accountName: 'Office Supplies Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5020', accountName: 'Bank Charges', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5030', accountName: 'Salaries and Wages', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5040', accountName: 'Utilities Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5050', accountName: 'Professional Fees', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5060', accountName: 'Marketing Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5070', accountName: 'Travel Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5080', accountName: 'Insurance Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
      { accountNo: '5090', accountName: 'Other Operating Expenses', accountType: 'Expense', financialStatement: 'Income Statement' },
    ];

    const vatAccounts = [
      { accountNo: '2200', accountName: 'VAT Output', accountType: 'Current Liability', financialStatement: 'Balance Sheet' },
      { accountNo: '1300', accountName: 'VAT Input', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    ];

    const allAccounts = [
      ...bankAccounts,
      ...receivableAccounts,
      ...payableAccounts,
      ...revenueAccounts,
      ...expenseAccounts,
      ...vatAccounts
    ];

    for (const account of allAccounts) {
      await prisma.chartOfAccounts.upsert({
        where: { accountNo: account.accountNo },
        update: account,
        create: {
          ...account,
          isActive: true
        }
      });
      console.log(`   ✅ Created/Updated account: ${account.accountNo} - ${account.accountName}`);
    }

    // Step 2: Create Sample Banks
    console.log('\n🏦 Step 2: Creating Sample Banks...');
    
    // First, get or create a default currency
    let defaultCurrency = await prisma.currency.findFirst({
      where: { code: 'USD' }
    });
    
    if (!defaultCurrency) {
      defaultCurrency = await prisma.currency.create({
        data: {
          code: 'USD',
          name: 'US Dollar',
          symbol: '$',
          isActive: true,
          isDefault: true
        }
      });
      console.log(`   ✅ Created default currency: ${defaultCurrency.code}`);
    }

    const banks = [
      {
        name: 'Main Bank Account - USD',
        accountNumber: 'USD-001-123456',
        currencyId: defaultCurrency.id,
        glAccountId: null // Will be linked after creation
      },
      {
        name: 'Savings Account - USD', 
        accountNumber: 'USD-002-789012',
        currencyId: defaultCurrency.id,
        glAccountId: null
      },
      {
        name: 'Petty Cash',
        accountNumber: 'CASH-001',
        currencyId: defaultCurrency.id,
        glAccountId: null
      }
    ];

    const createdBanks = [];
    for (const bank of banks) {
      const createdBank = await prisma.bank.upsert({
        where: { accountNumber: bank.accountNumber },
        update: bank,
        create: {
          ...bank,
          isActive: true
        }
      });
      createdBanks.push(createdBank);
      console.log(`   ✅ Created bank: ${createdBank.name}`);
    }

    // Step 3: Link Banks to GL Accounts
    console.log('\n🔗 Step 3: Linking Banks to GL Accounts...');
    
    for (let i = 0; i < createdBanks.length; i++) {
      const bank = createdBanks[i];
      const glAccount = await prisma.chartOfAccounts.findFirst({
        where: { 
          accountName: bank.name,
          accountType: 'Current Asset'
        }
      });
      
      if (glAccount) {
        await prisma.bank.update({
          where: { id: bank.id },
          data: { glAccountId: glAccount.id }
        });
        console.log(`   ✅ Linked ${bank.name} to GL account ${glAccount.accountNo}`);
      } else {
        console.log(`   ⚠️  Warning: GL account not found for ${bank.name}`);
      }
    }

    // Step 4: Create Sample Customers
    console.log('\n👥 Step 4: Creating Sample Customers...');
    
    const customers = [
      {
        name: 'ABC Company Ltd',
        email: 'accounts@abc.com',
        phone: '+1-555-0101',
        address: '123 Business St, City, State 12345'
      },
      {
        name: 'XYZ Corporation',
        email: 'finance@xyz.com', 
        phone: '+1-555-0102',
        address: '456 Corporate Ave, City, State 12345'
      }
    ];

    for (const customer of customers) {
      // Check if customer already exists by name
      const existingCustomer = await prisma.customer.findFirst({
        where: { name: customer.name }
      });
      
      if (existingCustomer) {
        // Update existing customer
        await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: customer
        });
        console.log(`   ✅ Updated customer: ${customer.name}`);
      } else {
        // Create new customer
        await prisma.customer.create({
          data: {
            ...customer,
            isActive: true
          }
        });
        console.log(`   ✅ Created customer: ${customer.name}`);
      }
    }

    // Step 5: Create Sample Suppliers
    console.log('\n🏢 Step 5: Creating Sample Suppliers...');
    
    const suppliers = [
      {
        name: 'Office Supplies Ltd',
        email: 'orders@officesupplies.com',
        phone: '+1-555-0201',
        address: '789 Supply St, City, State 12345'
      },
      {
        name: 'Professional Services Inc',
        email: 'billing@profservices.com',
        phone: '+1-555-0202', 
        address: '321 Service Blvd, City, State 12345'
      }
    ];

    for (const supplier of suppliers) {
      // Check if supplier already exists by name
      const existingSupplier = await prisma.vendor.findFirst({
        where: { name: supplier.name }
      });
      
      if (existingSupplier) {
        // Update existing supplier
        await prisma.vendor.update({
          where: { id: existingSupplier.id },
          data: supplier
        });
        console.log(`   ✅ Updated supplier: ${supplier.name}`);
      } else {
        // Create new supplier
        await prisma.vendor.create({
          data: {
            ...supplier,
            isActive: true
          }
        });
        console.log(`   ✅ Created supplier: ${supplier.name}`);
      }
    }

    console.log('\n🎉 Cashbook System Setup Complete!');
    console.log('\n📋 Summary:');
    console.log(`   • Chart of Accounts: ${allAccounts.length} accounts created`);
    console.log(`   • Banks: ${createdBanks.length} banks created`);
    console.log(`   • Customers: ${customers.length} customers created`);
    console.log(`   • Suppliers: ${suppliers.length} suppliers created`);
    console.log('\n🚀 Next Steps:');
    console.log('   1. Run database migration: npx prisma migrate dev --name add-cashbook-module');
    console.log('   2. Test cashbook endpoints with sample data');
    console.log('   3. Link banks to GL accounts if not done automatically');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  }
}

// Run the setup
setupCashbookComplete()
  .catch((e) => {
    console.error('❌ Setup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
