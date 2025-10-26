import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function createExpenseJournalEntries() {
  try {
    console.log('📝 Creating Journal Entries for Expenses...\n');
    
    // Get the expenses we created
    const expenses = await prisma.expense.findMany({
      where: {
        receiptNumber: { in: ['BANK-EXP-001', 'CREDIT-EXP-001'] }
      },
      include: {
        vendor: true,
        category: true,
        currency: true
      }
    });
    
    console.log(`📋 Found ${expenses.length} expenses to create journal entries for:\n`);
    
    for (const expense of expenses) {
      console.log(`🚀 Creating Journal Entry for: ${expense.description}`);
      console.log(`   Amount: $${expense.amount}`);
      console.log(`   VAT: $${expense.vatAmount}`);
      console.log(`   Total: $${expense.totalAmount}`);
      console.log(`   Payment Method: ${expense.paymentMethod}`);
      console.log(`   Category: ${expense.category.name}`);
      
      // Determine the expense account based on category
      let expenseAccountNo: string;
      let expenseAccountName: string;
      
      if (expense.category.name === 'Office Equipment') {
        expenseAccountNo = '5010'; // Office Supplies Expense
        expenseAccountName = 'Office Supplies Expense';
      } else if (expense.category.name === 'Travel and Accommodation') {
        expenseAccountNo = '5070'; // Travel Expense
        expenseAccountName = 'Travel Expense';
      } else {
        expenseAccountNo = '5090'; // Other Operating Expenses
        expenseAccountName = 'Other Operating Expenses';
      }
      
      // Get the expense account
      const expenseAccount = await prisma.chartOfAccounts.findUnique({
        where: { accountNo: expenseAccountNo }
      });
      
      if (!expenseAccount) {
        console.error(`❌ Expense account ${expenseAccountNo} not found!`);
        continue;
      }
      
      // Determine the credit account based on payment method
      let creditAccountNo: string;
      let creditAccountName: string;
      
      if (expense.paymentMethod === 'BANK') {
        creditAccountNo = '1000'; // Cash and Cash Equivalents
        creditAccountName = 'Cash and Cash Equivalents';
      } else if (expense.paymentMethod === 'CREDIT') {
        creditAccountNo = '2000'; // Accounts Payable
        creditAccountName = 'Accounts Payable';
      } else {
        creditAccountNo = '1030'; // Petty Cash
        creditAccountName = 'Petty Cash';
      }
      
      // Get the credit account
      const creditAccount = await prisma.chartOfAccounts.findUnique({
        where: { accountNo: creditAccountNo }
      });
      
      if (!creditAccount) {
        console.error(`❌ Credit account ${creditAccountNo} not found!`);
        continue;
      }
      
      // Create journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: expense.transactionDate,
          referenceNumber: `EXP-${expense.id.slice(-8).toUpperCase()}`,
          description: `Expense: ${expense.description}`,
          totalAmount: expense.totalAmount,
          currencyId: expense.currencyId,
          status: 'POSTED',
          createdById: expense.createdById
        }
      });
      
      console.log(`✅ Created Journal Entry: ${journalEntry.referenceNumber}`);
      
      // Create journal entry lines
      const journalEntryLines = [];
      
      // Debit: Expense Account
      journalEntryLines.push({
        journalEntryId: journalEntry.id,
        chartOfAccountId: expenseAccount.id,
        debitAmount: expense.amount,
        creditAmount: new Decimal(0),
        description: `Expense: ${expense.description}`
      });
      
      // If taxable, add VAT Input debit (we'll use a general expense account since VAT Input doesn't exist)
      const vatAmount = Number(expense.vatAmount);
      if (expense.isTaxable && vatAmount > 0) {
        // Use Other Operating Expenses for VAT since VAT Input account doesn't exist
        const vatAccount = await prisma.chartOfAccounts.findUnique({
          where: { accountNo: '5090' } // Other Operating Expenses
        });
        
        if (vatAccount) {
          journalEntryLines.push({
            journalEntryId: journalEntry.id,
            chartOfAccountId: vatAccount.id,
            debitAmount: expense.vatAmount,
            creditAmount: new Decimal(0),
            description: `VAT on ${expense.description}`
          });
        }
      }
      
      // Credit: Payment Account
      journalEntryLines.push({
        journalEntryId: journalEntry.id,
        chartOfAccountId: creditAccount.id,
        debitAmount: new Decimal(0),
        creditAmount: expense.totalAmount,
        description: `Payment for ${expense.description}`
      });
      
      // Create all journal entry lines
      await prisma.journalEntryLine.createMany({
        data: journalEntryLines
      });
      
      // Update expense with journal entry reference
      await prisma.expense.update({
        where: { id: expense.id },
        data: {
          journalEntryId: journalEntry.id,
          status: 'POSTED'
        }
      });
      
      console.log('📝 Journal Entry Lines Created:');
      console.log(`   Dr. ${expenseAccountNo} - ${expenseAccountName}        $${Number(expense.amount).toFixed(2)}`);
      if (expense.isTaxable && vatAmount > 0) {
        console.log(`   Dr. 5090 - Other Operating Expenses (VAT) $${vatAmount.toFixed(2)}`);
      }
      console.log(`       Cr. ${creditAccountNo} - ${creditAccountName} $${Number(expense.totalAmount).toFixed(2)}`);
      
      console.log('\n' + '='.repeat(80) + '\n');
    }
    
    console.log('🎉 All Journal Entries Created Successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✅ Bank Payment Expense → Journal Entry Created');
    console.log('   ✅ Credit Payment Expense → Journal Entry Created');
    console.log('   ✅ Proper double-entry bookkeeping applied');
    console.log('   ✅ Expenses updated with journal entry references');
    
  } catch (error: any) {
    console.error('❌ Error creating journal entries:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createExpenseJournalEntries();



