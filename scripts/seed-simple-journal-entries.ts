// @ts-nocheck
/**
 * Simple Journal Entries Seeder
 * 
 * This script creates a simple set of journal entries with vendors and customers
 * for basic accounting testing.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSimpleJournalEntries() {
  console.log('📚 Seeding Simple Journal Entries...');
  console.log('=' .repeat(50));

  try {
    // Check if journal entries already exist
    const existingEntries = await prisma.journalEntry.findMany({
      take: 1
    });

    if (existingEntries.length > 0) {
      console.log('✅ Journal entries already exist, skipping...');
      return;
    }

    // Get required data
    const accounts = await prisma.chartOfAccounts.findMany({
      select: { id: true, accountNo: true, accountName: true, accountType: true }
    });

    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });

    const defaultCurrency = await prisma.currency.findFirst({
      where: { code: 'USD' }
    });

    if (!adminUser || !defaultCurrency) {
      console.log('❌ Admin user or default currency not found. Please run main seeder first.');
      return;
    }

    console.log(`📊 Found ${accounts.length} chart of accounts`);
    console.log(`👤 Using admin user: ${adminUser.email}`);
    console.log(`💰 Using currency: ${defaultCurrency.code}`);

    // Create account mapping
    const accountMap = new Map(accounts.map(acc => [acc.accountNo, acc.id]));

    // Create sample vendors and customers first
    console.log('\n🏢 Creating sample vendors and customers...');
    
    const vendor1 = await prisma.vendor.create({
      data: {
        name: 'Office Supplies Ltd',
        email: 'orders@officesupplies.com',
        phone: '+263 4 123456',
        address: '123 Business Street, Harare',
        isActive: true
      }
    });

    const vendor2 = await prisma.vendor.create({
      data: {
        name: 'Tech Solutions Inc',
        email: 'sales@techsolutions.com',
        phone: '+263 4 234567',
        address: '456 Tech Avenue, Harare',
        isActive: true
      }
    });

    const customer1 = await prisma.customer.create({
      data: {
        name: 'ABC Corporation',
        email: 'finance@abccorp.com',
        phone: '+263 4 345678',
        address: '789 Corporate Plaza, Harare',
        isActive: true
      }
    });

    const customer2 = await prisma.customer.create({
      data: {
        name: 'XYZ Enterprises',
        email: 'accounts@xyzent.com',
        phone: '+263 4 456789',
        address: '321 Enterprise Building, Harare',
        isActive: true
      }
    });

    console.log(`✅ Created vendor: ${vendor1.name}`);
    console.log(`✅ Created vendor: ${vendor2.name}`);
    console.log(`✅ Created customer: ${customer1.name}`);
    console.log(`✅ Created customer: ${customer2.name}`);

    // Create simple journal entries
    console.log('\n📝 Creating simple journal entries...');
    
    // 1. Initial Capital
    await createSimpleJournalEntry(
      'Initial Capital Investment',
      'Shareholders invest $100,000',
      [
        { accountNo: '1000', debit: 100000, credit: 0 }, // Cash
        { accountNo: '3000', debit: 0, credit: 100000 }  // Share Capital
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 2. Rent Payment
    await createSimpleJournalEntry(
      'Office Rent Payment',
      'Monthly office rent',
      [
        { accountNo: '5000', debit: 5000, credit: 0 },    // Rent Expense
        { accountNo: '1000', debit: 0, credit: 5000 }     // Cash
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 3. Salary Payment
    await createSimpleJournalEntry(
      'Employee Salaries',
      'Monthly salary payment',
      [
        { accountNo: '5030', debit: 15000, credit: 0 },   // Salaries and Wages
        { accountNo: '1000', debit: 0, credit: 15000 }    // Cash
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 4. Office Supplies Purchase
    await createSimpleJournalEntry(
      'Office Supplies Purchase',
      `Purchase from ${vendor1.name}`,
      [
        { accountNo: '5010', debit: 2000, credit: 0 },    // Office Supplies Expense
        { accountNo: '1000', debit: 0, credit: 2000 }      // Cash
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 5. Equipment Purchase
    await createSimpleJournalEntry(
      'Computer Equipment Purchase',
      `Purchase from ${vendor2.name}`,
      [
        { accountNo: '1100', debit: 10000, credit: 0 },   // Office Equipment
        { accountNo: '1000', debit: 0, credit: 10000 }     // Cash
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 6. Service Revenue - Cash
    await createSimpleJournalEntry(
      'Service Revenue - Cash',
      `Consulting services for ${customer1.name}`,
      [
        { accountNo: '1000', debit: 25000, credit: 0 },    // Cash
        { accountNo: '4000', debit: 0, credit: 25000 }     // Management Fees Income
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 7. Service Revenue - Credit
    await createSimpleJournalEntry(
      'Service Revenue - Credit',
      `Consulting services for ${customer2.name} (on credit)`,
      [
        { accountNo: '1200', debit: 20000, credit: 0 },   // Accounts Receivable
        { accountNo: '4000', debit: 0, credit: 20000 }    // Management Fees Income
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 8. Collection of Receivables
    await createSimpleJournalEntry(
      'Receivables Collection',
      `Payment received from ${customer2.name}`,
      [
        { accountNo: '1000', debit: 20000, credit: 0 },    // Cash
        { accountNo: '1200', debit: 0, credit: 20000 }     // Accounts Receivable
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 9. Utility Payment
    await createSimpleJournalEntry(
      'Utility Bills Payment',
      'Electricity, water, internet bills',
      [
        { accountNo: '5040', debit: 3000, credit: 0 },     // Utilities Expense
        { accountNo: '1000', debit: 0, credit: 3000 }      // Cash
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    // 10. Professional Fees
    await createSimpleJournalEntry(
      'Legal and Audit Fees',
      'Professional services fees',
      [
        { accountNo: '5050', debit: 5000, credit: 0 },     // Professional Fees
        { accountNo: '1000', debit: 0, credit: 5000 }       // Cash
      ],
      adminUser.id,
      defaultCurrency.id,
      accountMap
    );

    console.log('\n🎉 Simple journal entries seeded successfully!');
    console.log('\n📊 Summary:');
    console.log('- Created 2 vendors and 2 customers');
    console.log('- Created 10 simple journal entries');
    console.log('- Demonstrated basic double-entry bookkeeping');
    console.log('- Covered revenue, expense, asset, and equity transactions');

    // Display account balances
    await displaySimpleBalances();

  } catch (error) {
    console.error('❌ Error seeding simple journal entries:', error);
    throw error;
  }
}

async function createSimpleJournalEntry(
  title: string,
  description: string,
  lines: Array<{ accountNo: string; debit: number; credit: number }>,
  createdById: string,
  currencyId: string,
  accountMap: Map<string, string>
) {
  // Validate that debits equal credits
  const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry "${title}" is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
  }

  // Create journal entry
  const journalEntry = await prisma.journalEntry.create({
    data: {
      transactionDate: new Date(),
      referenceNumber: `JE-${Date.now()}-${Math.random().toString(36).substr(2, 3)}`,
      description: `${title} - ${description}`,
      totalAmount: totalDebits,
      currencyId,
      createdById,
      status: 'POSTED'
    }
  });

  // Create journal entry lines
  for (const line of lines) {
    const accountId = accountMap.get(line.accountNo);
    if (!accountId) {
      throw new Error(`Account ${line.accountNo} not found`);
    }

    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: accountId,
        debitAmount: line.debit,
        creditAmount: line.credit,
        description: `${title} - ${line.accountNo}`
      }
    });
  }

  console.log(`✅ Created: ${title} (${totalDebits.toFixed(2)})`);
}

async function displaySimpleBalances() {
  console.log('\n💰 Simple Account Balances:');
  console.log('-'.repeat(40));

  // Get account balances
  const accountBalances = await prisma.journalEntryLine.groupBy({
    by: ['chartOfAccountId'],
    _sum: {
      debitAmount: true,
      creditAmount: true
    }
  });

  const accounts = await prisma.chartOfAccounts.findMany({
    where: {
      id: {
        in: accountBalances.map(b => b.chartOfAccountId)
      }
    },
    orderBy: { accountNo: 'asc' }
  });

  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));

  console.log('\n📊 Key Account Balances:');
  for (const balance of accountBalances) {
    const account = accountMap.get(balance.chartOfAccountId);
    if (!account) continue;

    const totalDebits = balance._sum.debitAmount || 0;
    const totalCredits = balance._sum.creditAmount || 0;
    const netBalance = totalDebits - totalCredits;

    // Only show accounts with non-zero balances
    if (Math.abs(netBalance) > 0.01) {
      const sign = netBalance >= 0 ? '+' : '';
      console.log(`${account.accountNo} - ${account.accountName}: ${sign}${netBalance.toFixed(2)}`);
    }
  }

  // Calculate basic totals
  const cashBalance = accountBalances.find(b => {
    const account = accountMap.get(b.chartOfAccountId);
    return account?.accountNo === '1000';
  });

  const revenueBalance = accountBalances.find(b => {
    const account = accountMap.get(b.chartOfAccountId);
    return account?.accountNo === '4000';
  });

  const expenseTotal = accountBalances.reduce((sum, b) => {
    const account = accountMap.get(b.chartOfAccountId);
    if (account?.accountType === 'Expense') {
      const totalDebits = b._sum.debitAmount || 0;
      const totalCredits = b._sum.creditAmount || 0;
      return sum + (totalDebits - totalCredits);
    }
    return sum;
  }, 0);

  console.log('\n📈 Simple Financial Summary:');
  if (cashBalance) {
    const cashTotal = (cashBalance._sum.debitAmount || 0) - (cashBalance._sum.creditAmount || 0);
    console.log(`   Cash Balance: ${cashTotal.toFixed(2)}`);
  }
  if (revenueBalance) {
    const revenueTotal = (revenueBalance._sum.creditAmount || 0) - (revenueBalance._sum.debitAmount || 0);
    console.log(`   Total Revenue: ${revenueTotal.toFixed(2)}`);
  }
  console.log(`   Total Expenses: ${expenseTotal.toFixed(2)}`);
  console.log(`   Net Income: ${((revenueBalance ? (revenueBalance._sum.creditAmount || 0) - (revenueBalance._sum.debitAmount || 0) : 0) - expenseTotal).toFixed(2)}`);
}

async function main() {
  try {
    await seedSimpleJournalEntries();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
