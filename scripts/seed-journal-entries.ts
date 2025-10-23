// @ts-nocheck
/**
 * Seed Journal Entries
 * 
 * This script creates sample journal entries to test the accounting module
 * and demonstrate proper double-entry bookkeeping principles.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedJournalEntries() {
  console.log('📚 Seeding Journal Entries...');
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

    // Get chart of accounts for reference
    const accounts = await prisma.chartOfAccounts.findMany({
      select: { id: true, accountNo: true, accountName: true, accountType: true }
    });

    if (accounts.length === 0) {
      console.log('❌ No chart of accounts found. Please run chart of accounts seeder first.');
      return;
    }

    console.log(`📊 Found ${accounts.length} chart of accounts`);
    
    // Create account mapping
    const accountMap = new Map(accounts.map(acc => [acc.accountNo, acc.id]));

    // Get admin user for createdById
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });

    if (!adminUser) {
      console.log('❌ Admin user not found. Please run main seeder first.');
      return;
    }

    console.log(`👤 Using admin user: ${adminUser.email}`);

    // Create sample journal entries
    console.log('\n📝 Creating sample journal entries...');
    
    // 1. Initial Capital Investment
    await createJournalEntry(
      'Initial Capital Investment',
      'Initial capital contribution from shareholders',
      [
        { accountNo: '1000', debit: 100000, credit: 0 }, // Cash
        { accountNo: '3000', debit: 0, credit: 100000 }   // Share Capital
      ],
      adminUser.id,
      accountMap
    );

    // 2. Office Rent Payment
    await createJournalEntry(
      'Office Rent Payment',
      'Monthly office rent payment',
      [
        { accountNo: '5000', debit: 5000, credit: 0 },    // Rent Expense
        { accountNo: '1000', debit: 0, credit: 5000 }     // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 3. Salary Payment
    await createJournalEntry(
      'Salary Payment',
      'Monthly salary payment to employees',
      [
        { accountNo: '5030', debit: 15000, credit: 0 },   // Salaries and Wages
        { accountNo: '1000', debit: 0, credit: 15000 }    // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 4. Equipment Purchase
    await createJournalEntry(
      'Office Equipment Purchase',
      'Purchase of office equipment',
      [
        { accountNo: '1100', debit: 10000, credit: 0 },   // Office Equipment (Asset)
        { accountNo: '1000', debit: 0, credit: 10000 }   // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 5. Revenue Recognition
    await createJournalEntry(
      'Service Revenue',
      'Revenue from consulting services',
      [
        { accountNo: '1000', debit: 25000, credit: 0 },   // Cash
        { accountNo: '4000', debit: 0, credit: 25000 }    // Management Fees Income
      ],
      adminUser.id,
      accountMap
    );

    // 6. Marketing Expense
    await createJournalEntry(
      'Marketing Campaign',
      'Marketing and advertising expenses',
      [
        { accountNo: '5060', debit: 3000, credit: 0 },   // Marketing Expense
        { accountNo: '1000', debit: 0, credit: 3000 }      // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 7. Utility Payment
    await createJournalEntry(
      'Utility Bills Payment',
      'Electricity, water, and internet bills',
      [
        { accountNo: '5040', debit: 2000, credit: 0 },    // Utilities Expense
        { accountNo: '1000', debit: 0, credit: 2000 }     // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 8. Professional Fees
    await createJournalEntry(
      'Legal and Audit Fees',
      'Professional services fees',
      [
        { accountNo: '5050', debit: 5000, credit: 0 },    // Professional Fees
        { accountNo: '1000', debit: 0, credit: 5000 }     // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 9. Bank Loan
    await createJournalEntry(
      'Bank Loan Received',
      'Business loan from bank',
      [
        { accountNo: '1000', debit: 50000, credit: 0 },   // Cash
        { accountNo: '2200', debit: 0, credit: 50000 }    // Notes Payable
      ],
      adminUser.id,
      accountMap
    );

    // 10. Depreciation Entry
    await createJournalEntry(
      'Equipment Depreciation',
      'Monthly depreciation of office equipment',
      [
        { accountNo: '1300', debit: 500, credit: 0 },     // Accumulated Depreciation
        { accountNo: '1100', debit: 0, credit: 500 }     // Office Equipment (reduction)
      ],
      adminUser.id,
      accountMap
    );

    // 11. VAT Input (Purchase with VAT)
    await createJournalEntry(
      'Purchase with VAT',
      'Office supplies purchase with 14.5% VAT',
      [
        { accountNo: '5010', debit: 1000, credit: 0 },    // Office Supplies Expense
        { accountNo: '1101', debit: 145, credit: 0 },     // VAT Input
        { accountNo: '1000', debit: 0, credit: 1145 }    // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 12. VAT Output (Sale with VAT)
    await createJournalEntry(
      'Sale with VAT',
      'Service revenue with 14.5% VAT',
      [
        { accountNo: '1000', debit: 11450, credit: 0 },   // Cash
        { accountNo: '4000', debit: 0, credit: 10000 },  // Management Fees Income
        { accountNo: '2001', debit: 0, credit: 1450 }     // VAT Output
      ],
      adminUser.id,
      accountMap
    );

    // 13. Accounts Receivable
    await createJournalEntry(
      'Credit Sale',
      'Service provided on credit',
      [
        { accountNo: '1200', debit: 15000, credit: 0 },  // Accounts Receivable
        { accountNo: '4000', debit: 0, credit: 15000 }   // Management Fees Income
      ],
      adminUser.id,
      accountMap
    );

    // 14. Accounts Payable
    await createJournalEntry(
      'Credit Purchase',
      'Office supplies purchased on credit',
      [
        { accountNo: '5010', debit: 2000, credit: 0 },    // Office Supplies Expense
        { accountNo: '2000', debit: 0, credit: 2000 }     // Accounts Payable
      ],
      adminUser.id,
      accountMap
    );

    // 15. Cash Collection from Receivables
    await createJournalEntry(
      'Cash Collection',
      'Collection of accounts receivable',
      [
        { accountNo: '1000', debit: 15000, credit: 0 },   // Cash
        { accountNo: '1200', debit: 0, credit: 15000 }   // Accounts Receivable
      ],
      adminUser.id,
      accountMap
    );

    // 16. Payment to Suppliers
    await createJournalEntry(
      'Supplier Payment',
      'Payment of accounts payable',
      [
        { accountNo: '2000', debit: 2000, credit: 0 },    // Accounts Payable
        { accountNo: '1000', debit: 0, credit: 2000 }     // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 17. Interest Income
    await createJournalEntry(
      'Bank Interest',
      'Interest earned on bank deposits',
      [
        { accountNo: '1000', debit: 500, credit: 0 },     // Cash
        { accountNo: '4010', debit: 0, credit: 500 }      // Investment Gains
      ],
      adminUser.id,
      accountMap
    );

    // 18. Travel Expense
    await createJournalEntry(
      'Business Travel',
      'Travel and accommodation expenses',
      [
        { accountNo: '5070', debit: 2500, credit: 0 },    // Travel Expense
        { accountNo: '1000', debit: 0, credit: 2500 }     // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 19. Insurance Payment
    await createJournalEntry(
      'Insurance Premium',
      'Business insurance premium payment',
      [
        { accountNo: '5080', debit: 1200, credit: 0 },    // Insurance Expense
        { accountNo: '1000', debit: 0, credit: 1200 }     // Cash
      ],
      adminUser.id,
      accountMap
    );

    // 20. Year-End Closing Entry
    await createJournalEntry(
      'Year-End Closing',
      'Transfer to retained earnings',
      [
        { accountNo: '3200', debit: 0, credit: 25000 },  // Current Year Earnings
        { accountNo: '3100', debit: 0, credit: 25000 }    // Retained Earnings
      ],
      adminUser.id,
      accountMap
    );

    console.log('\n🎉 Journal entries seeded successfully!');
    console.log('\n📊 Summary:');
    console.log('- Created 20 sample journal entries');
    console.log('- Demonstrated double-entry bookkeeping');
    console.log('- Covered all major account types');
    console.log('- Included VAT transactions');
    console.log('- Showed revenue, expense, asset, and liability entries');

    // Display account balances
    await displayAccountBalances();

  } catch (error) {
    console.error('❌ Error seeding journal entries:', error);
    throw error;
  }
}

async function createJournalEntry(
  title: string,
  description: string,
  lines: Array<{ accountNo: string; debit: number; credit: number }>,
  createdById: string,
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
      title,
      description,
      date: new Date(),
      reference: `JE-${Date.now()}`,
      totalAmount: totalDebits,
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
        accountId,
        debitAmount: line.debit,
        creditAmount: line.credit,
        description: `${title} - ${line.accountNo}`
      }
    });
  }

  console.log(`✅ Created: ${title} (${totalDebits.toFixed(2)} total)`);
}

async function displayAccountBalances() {
  console.log('\n💰 Account Balances:');
  console.log('-'.repeat(40));

  // Get account balances
  const accountBalances = await prisma.journalEntryLine.groupBy({
    by: ['accountId'],
    _sum: {
      debitAmount: true,
      creditAmount: true
    }
  });

  const accounts = await prisma.chartOfAccounts.findMany({
    where: {
      id: {
        in: accountBalances.map(b => b.accountId)
      }
    }
  });

  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));

  for (const balance of accountBalances) {
    const account = accountMap.get(balance.accountId);
    if (!account) continue;

    const totalDebits = balance._sum.debitAmount || 0;
    const totalCredits = balance._sum.creditAmount || 0;
    const netBalance = totalDebits - totalCredits;

    console.log(`${account.accountNo} - ${account.accountName}: ${netBalance.toFixed(2)}`);
  }
}

async function main() {
  try {
    await seedJournalEntries();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
