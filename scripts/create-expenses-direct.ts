import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sample expenses data
const expenses = [
  {
    name: "Bank Payment Expense",
    data: {
      vendorId: "cmg97iu9b0000ung8h8u3bg02", // Using existing vendor ID
      category: "Office Equipment",
      amount: 1500.00,
      currencyId: "usd_currency_id", // USD currency
      transactionDate: new Date("2024-01-15"),
      description: "Office equipment purchase - computers and furniture",
      receiptNumber: "BANK-EXP-001",
      isTaxable: true,
      paymentMethod: "BANK" as const,
      createdById: "admin_user_id" // Using admin user ID
    }
  },
  {
    name: "Credit Payment Expense", 
    data: {
      vendorId: "cmg97iu9b0000ung8h8u3bg02", // Using existing vendor ID
      category: "Travel and Accommodation",
      amount: 800.00,
      currencyId: "usd_currency_id", // USD currency
      transactionDate: new Date("2024-01-16"),
      description: "Business travel expenses - client meetings",
      receiptNumber: "CREDIT-EXP-001",
      isTaxable: true,
      paymentMethod: "CREDIT" as const,
      createdById: "admin_user_id" // Using admin user ID
    }
  }
];

async function createExpensesDirect() {
  console.log('💰 Creating Sample Expenses Directly in Database...\n');
  
  for (const expense of expenses) {
    try {
      console.log(`🚀 Creating ${expense.name}...`);
      console.log(`📋 Details:`);
      console.log(`   Category: ${expense.data.category}`);
      console.log(`   Amount: $${expense.data.amount.toLocaleString()}`);
      console.log(`   Payment Method: ${expense.data.paymentMethod}`);
      console.log(`   Currency: USD`);
      console.log(`   Description: ${expense.data.description}`);
      console.log(`   Receipt: ${expense.data.receiptNumber}`);
      console.log(`   Taxable: ${expense.data.isTaxable ? 'Yes' : 'No'}`);
      
      // Calculate VAT and total
      const vatAmount = expense.data.amount * 0.15; // 15% VAT
      const totalAmount = expense.data.amount + vatAmount;
      console.log(`   VAT Amount: $${vatAmount.toFixed(2)}`);
      console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
      
      // Create expense in database
      const createdExpense = await prisma.expense.create({
        data: {
          vendorId: expense.data.vendorId,
          category: expense.data.category,
          amount: expense.data.amount,
          vatAmount: vatAmount,
          totalAmount: totalAmount,
          currencyId: expense.data.currencyId,
          transactionDate: expense.data.transactionDate,
          description: expense.data.description,
          receiptNumber: expense.data.receiptNumber,
          isTaxable: expense.data.isTaxable,
          paymentMethod: expense.data.paymentMethod,
          status: "PENDING",
          createdById: expense.data.createdById
        },
        include: {
          vendor: true,
          currency: true
        }
      });
      
      console.log('\n✅ Expense Created Successfully!');
      console.log('📊 Database Details:');
      console.log(`   Expense ID: ${createdExpense.id}`);
      console.log(`   Amount: $${createdExpense.amount}`);
      console.log(`   VAT Amount: $${createdExpense.vatAmount}`);
      console.log(`   Total Amount: $${createdExpense.totalAmount}`);
      console.log(`   Payment Method: ${createdExpense.paymentMethod}`);
      console.log(`   Status: ${createdExpense.status}`);
      console.log(`   Created At: ${createdExpense.createdAt}`);
      
      if (createdExpense.vendor) {
        console.log(`   Vendor: ${createdExpense.vendor.name}`);
      }
      
      if (createdExpense.currency) {
        console.log(`   Currency: ${createdExpense.currency.code} (${createdExpense.currency.name})`);
      }
      
    } catch (error: any) {
      console.error(`\n❌ Error creating ${expense.name}:`);
      console.error(`   Error: ${error.message}`);
      
      if (error.code === 'P2003') {
        console.error('\n🔗 Foreign Key Constraint Error:');
        console.error('   The vendor ID or currency ID does not exist');
        console.error('   Make sure the vendor and currency exist in the database');
      } else if (error.code === 'P2002') {
        console.error('\n⚠️  Unique Constraint Error:');
        console.error('   A record with this data already exists');
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }
  
  console.log('🎯 Expected Journal Entries:');
  console.log('\n📝 Bank Payment Expense (Office Equipment):');
  console.log('   Dr. 5100 - Office Equipment          $1,500.00');
  console.log('   Dr. 1101 - VAT Input                 $225.00');
  console.log('       Cr. (Bank GL linked to the selected bank) $1,725.00');
  
  console.log('\n📝 Credit Payment Expense (Travel and Accommodation):');
  console.log('   Dr. 5070 - Travel Expense            $800.00');
  console.log('   Dr. 1101 - VAT Input                 $120.00');
  console.log('       Cr. Accounts Payable (or relevant liability) $920.00');
  
  console.log('\n💡 Note: These expenses are created directly in the database.');
  console.log('   Journal entries would need to be created separately for proper accounting.');
}

// Run the expense creation
createExpensesDirect();



