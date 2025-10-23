// @ts-nocheck
/**
 * Step 9: Seed Journal Entries
 * 
 * This script creates sample journal entries for testing.
 * Run this after all other data is created.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedJournalEntries() {
  console.log('📝 Step 9: Seeding Journal Entries...');
  console.log('=' .repeat(50));

  try {
    // Check if journal entries already exist
    const existingEntries = await prisma.journalEntry.findMany({
      take: 1
    });

    if (existingEntries.length > 0) {
      console.log('✅ Journal entries already exist, skipping...');
      console.log(`Found ${existingEntries.length} existing journal entries`);
      return;
    }

    // Get required data
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });

    if (!adminUser) {
      throw new Error('Admin user not found. Please run admin seeder first.');
    }

    const defaultCurrency = await prisma.currency.findFirst({
      where: { code: 'USD' }
    });

    if (!defaultCurrency) {
      throw new Error('Default currency (USD) not found. Please run currencies seeder first.');
    }

    const chartOfAccounts = await prisma.chartOfAccounts.findMany();
    if (chartOfAccounts.length === 0) {
      throw new Error('Chart of accounts not found. Please run chart of accounts seeder first.');
    }

    const accountMap = new Map(chartOfAccounts.map(acc => [acc.accountNo, acc.id]));

    console.log('📊 Creating sample journal entries...');

    // Helper function to create a journal entry
    const createJournalEntry = async (
      title: string,
      description: string,
      lines: Array<{ accountNo: string, debit: number, credit: number }>
    ) => {
      const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`Journal entry "${title}" is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
      }

      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: new Date(),
          referenceNumber: `JE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          description: `${title} - ${description}`,
          totalAmount: totalDebits,
          currencyId: defaultCurrency.id,
          createdById: adminUser.id,
          status: 'POSTED'
        }
      });

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

      console.log(`   ✅ ${title} (${totalDebits.toFixed(2)})`);
    };

    // Scenario 1: Initial Capital Investment
    await createJournalEntry(
      'Initial Capital Investment',
      'Shareholders invest initial capital of $200,000',
      [
        { accountNo: '1000', debit: 200000, credit: 0 }, // Cash and Cash Equivalents
        { accountNo: '3000', debit: 0, credit: 200000 }  // Share Capital
      ]
    );

    // Scenario 2: Office Rent Payment
    await createJournalEntry(
      'Office Rent Payment',
      'Monthly office rent paid',
      [
        { accountNo: '5000', debit: 8000, credit: 0 },   // Rent Expense
        { accountNo: '1000', debit: 0, credit: 8000 }  // Cash and Cash Equivalents
      ]
    );

    // Scenario 3: Employee Salaries
    await createJournalEntry(
      'Employee Salaries',
      'Monthly salaries paid to employees',
      [
        { accountNo: '5030', debit: 45000, credit: 0 },  // Salaries and Wages
        { accountNo: '1000', debit: 0, credit: 45000 }   // Cash and Cash Equivalents
      ]
    );

    // Scenario 4: Office Equipment Purchase
    await createJournalEntry(
      'Office Equipment Purchase',
      'Purchase of office equipment for $25,000 cash',
      [
        { accountNo: '1100', debit: 25000, credit: 0 }, // Office Equipment (Fixed Asset)
        { accountNo: '1000', debit: 0, credit: 25000 } // Cash and Cash Equivalents
      ]
    );

    // Scenario 5: Service Revenue - Cash
    await createJournalEntry(
      'Service Revenue - Cash',
      'Received cash for management fees',
      [
        { accountNo: '1000', debit: 75000, credit: 0 },  // Cash and Cash Equivalents
        { accountNo: '4000', debit: 0, credit: 75000 }   // Management Fees Income (Revenue)
      ]
    );

    // Scenario 6: Service Revenue - Credit
    await createJournalEntry(
      'Service Revenue - Credit',
      'Billed client for management fees on credit',
      [
        { accountNo: '1200', debit: 50000, credit: 0 },  // Accounts Receivable Control
        { accountNo: '4000', debit: 0, credit: 50000 }   // Management Fees Income (Revenue)
      ]
    );

    // Scenario 7: Utility Bills Payment
    await createJournalEntry(
      'Utility Bills Payment',
      'Paid utility bills',
      [
        { accountNo: '5040', debit: 3500, credit: 0 },   // Utilities Expense
        { accountNo: '1000', debit: 0, credit: 3500 }    // Cash and Cash Equivalents
      ]
    );

    // Scenario 8: Professional Fees
    await createJournalEntry(
      'Professional Fees',
      'Paid for legal and audit services',
      [
        { accountNo: '5050', debit: 5000, credit: 0 },   // Professional Fees
        { accountNo: '1000', debit: 0, credit: 5000 }    // Cash and Cash Equivalents
      ]
    );

    // Scenario 9: Marketing Expense
    await createJournalEntry(
      'Marketing Expense',
      'Paid for marketing and advertising',
      [
        { accountNo: '5060', debit: 3000, credit: 0 },     // Marketing Expense
        { accountNo: '1000', debit: 0, credit: 3000 }      // Cash and Cash Equivalents
      ]
    );

    // Scenario 10: Travel Expense
    await createJournalEntry(
      'Travel Expense',
      'Business travel expenses',
      [
        { accountNo: '5070', debit: 2000, credit: 0 },    // Travel Expense
        { accountNo: '1000', debit: 0, credit: 2000 }     // Cash and Cash Equivalents
      ]
    );

    console.log('\n🎉 Journal entries seeded successfully!');
    console.log('\n📊 Summary:');
    console.log('- Created 10 sample journal entries');
    console.log('- All entries are balanced (debits = credits)');
    console.log('- Entries include: Capital investment, rent, salaries, equipment, revenue, utilities, professional fees, marketing, travel');
    console.log('- All entries are posted and ready for use');

  } catch (error) {
    console.error('❌ Error seeding journal entries:', error);
    throw error;
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
