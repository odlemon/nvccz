import axios from 'axios';

// Sample expenses data
const expenses = [
  {
    name: "Bank Payment Expense",
    data: {
      vendorId: "cmg97iu9b0000ung8h8u3bg02", // Using existing vendor ID
      category: "Office Equipment",
      amount: 1500.00,
      currencyId: "usd_currency_id", // USD currency
      transactionDate: "2024-01-15",
      description: "Office equipment purchase - computers and furniture",
      receiptNumber: "BANK-EXP-001",
      isTaxable: true,
      paymentMethod: "BANK"
    }
  },
  {
    name: "Credit Payment Expense", 
    data: {
      vendorId: "cmg97iu9b0000ung8h8u3bg02", // Using existing vendor ID
      category: "Travel and Accommodation",
      amount: 800.00,
      currencyId: "usd_currency_id", // USD currency
      transactionDate: "2024-01-16",
      description: "Business travel expenses - client meetings",
      receiptNumber: "CREDIT-EXP-001",
      isTaxable: true,
      paymentMethod: "CREDIT"
    }
  }
];

async function createExpenses() {
  console.log('💰 Creating Sample Expenses...\n');
  
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
      
      // Calculate expected VAT and total
      const vatAmount = expense.data.amount * 0.15; // 15% VAT
      const totalAmount = expense.data.amount + vatAmount;
      console.log(`   Expected VAT: $${vatAmount.toFixed(2)}`);
      console.log(`   Expected Total: $${totalAmount.toFixed(2)}`);
      
      // Make API call to create expense
      const response = await axios.post('http://localhost:3000/api/accounting/expenses', expense.data, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token_placeholder' // This will likely fail without proper auth
        }
      });
      
      console.log('\n✅ Expense Created Successfully!');
      console.log('📊 Response Details:');
      console.log(`   Status: ${response.status}`);
      console.log(`   Success: ${response.data.success}`);
      console.log(`   Message: ${response.data.message}`);
      
      if (response.data.data) {
        console.log('\n📋 Expense Data:');
        console.log(`   Expense ID: ${response.data.data.id}`);
        console.log(`   Amount: $${response.data.data.amount}`);
        console.log(`   VAT Amount: $${response.data.data.vatAmount}`);
        console.log(`   Total Amount: $${response.data.data.totalAmount}`);
        console.log(`   Payment Method: ${response.data.data.paymentMethod}`);
        console.log(`   Status: ${response.data.data.status}`);
        console.log(`   Journal Entry ID: ${response.data.data.journalEntryId}`);
        
        if (response.data.data.journalEntry) {
          console.log('\n📝 Journal Entry Created:');
          console.log(`   Reference: ${response.data.data.journalEntry.referenceNumber}`);
          console.log(`   Status: ${response.data.data.journalEntry.status}`);
        }
      }
      
    } catch (error: any) {
      console.error(`\n❌ Error creating ${expense.name}:`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Message: ${error.response.data?.message || 'Unknown error'}`);
        
        if (error.response.status === 401) {
          console.error('\n🔐 Authentication Required:');
          console.error('   The expense creation requires authentication.');
          console.error('   You need to:');
          console.error('   1. Login as a user');
          console.error('   2. Get a valid user token');
          console.error('   3. Use the token in the Authorization header');
        } else if (error.response.status === 400) {
          console.error('\n⚠️  Validation Error:');
          console.error('   Check that all required fields are provided');
          console.error('   Verify vendor ID and currency ID exist');
        }
      } else if (error.request) {
        console.error('   Network Error: Could not reach the server');
        console.error('   Make sure the server is running on http://localhost:3000');
      } else {
        console.error(`   Error: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }
  
  console.log('🎯 Expected Journal Entries:');
  console.log('\n📝 Bank Payment Expense:');
  console.log('   Dr. 5100 - Office Equipment          $1,500.00');
  console.log('   Dr. 1101 - VAT Input                 $225.00');
  console.log('       Cr. 1000 - Cash and Cash Equivalents $1,725.00');
  
  console.log('\n📝 Credit Payment Expense:');
  console.log('   Dr. 5070 - Travel Expense            $800.00');
  console.log('   Dr. 1101 - VAT Input                 $120.00');
  console.log('       Cr. 1000 - Cash and Cash Equivalents $920.00');
  
  console.log('\n💡 Note: These expenses require authentication to create.');
  console.log('   Use the admin dashboard or login first to get a valid token.');
}

// Run the expense creation
createExpenses();



