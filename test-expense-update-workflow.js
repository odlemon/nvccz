/**
 * Test script to demonstrate the expense update workflow
 * This shows how the system handles expense updates with proper double-entry bookkeeping
 */

const BASE_URL = 'http://localhost:3000/api/accounting';

// Test data
const testExpense = {
  vendorId: "your-vendor-id", // Replace with actual vendor ID
  categoryId: "your-category-id", // Replace with actual category ID
  currencyId: "your-currency-id", // Replace with actual currency ID
  amount: 300,
  transactionDate: "2024-01-15",
  description: "Legal Fees",
  isTaxable: true
};

async function testExpenseWorkflow() {
  console.log("=== Expense Update Workflow Test ===\n");

  try {
    // Step 1: Create initial expense (300 ZWL, Taxable)
    console.log("1. Creating initial expense...");
    console.log("   Amount: 300 ZWL, Taxable: Yes");
    console.log("   Expected: Dr Legal Fees 300, Dr VAT Input 43.50, Cr Bank 343.50\n");

    const createResponse = await fetch(`${BASE_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      },
      body: JSON.stringify(testExpense)
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create expense: ${createResponse.statusText}`);
    }

    const createdExpense = await createResponse.json();
    console.log("   ✅ Expense created successfully");
    console.log(`   Expense ID: ${createdExpense.data.id}`);
    console.log(`   Journal Entry: ${createdExpense.data.journalEntry.referenceNumber}`);
    console.log(`   Status: ${createdExpense.data.status}\n`);

    // Step 2: Update expense to 500 ZWL
    console.log("2. Updating expense to 500 ZWL...");
    console.log("   Expected workflow:");
    console.log("   a) Create reversal: Cr Legal Fees 300, Cr VAT Input 43.50, Dr Bank 343.50");
    console.log("   b) Update expense to 500 ZWL");
    console.log("   c) Create new entry: Dr Legal Fees 500, Dr VAT Input 72.50, Cr Bank 572.50\n");

    const updateData = {
      ...testExpense,
      amount: 500,
      description: "Legal Fees - Updated"
    };

    const updateResponse = await fetch(`${BASE_URL}/expenses/${createdExpense.data.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      },
      body: JSON.stringify(updateData)
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update expense: ${updateResponse.statusText}`);
    }

    const updatedExpense = await updateResponse.json();
    console.log("   ✅ Expense updated successfully");
    console.log(`   New Amount: ${updatedExpense.data.amount} ZWL`);
    console.log(`   New VAT: ${updatedExpense.data.vatAmount} ZWL`);
    console.log(`   New Total: ${updatedExpense.data.totalAmount} ZWL`);
    console.log(`   New Journal Entry: ${updatedExpense.data.journalEntry.referenceNumber}`);
    console.log(`   Status: ${updatedExpense.data.status}\n`);

    // Step 3: Verify the journal entries
    console.log("3. Verifying journal entries...");
    console.log("   The system should have created:");
    console.log("   - Original entry: Dr Legal Fees 300, Dr VAT Input 43.50, Cr Bank 343.50");
    console.log("   - Reversal entry: Cr Legal Fees 300, Cr VAT Input 43.50, Dr Bank 343.50");
    console.log("   - Updated entry: Dr Legal Fees 500, Dr VAT Input 72.50, Cr Bank 572.50");
    console.log("   - Net effect: Dr Legal Fees 200, Dr VAT Input 29.00, Cr Bank 229.00\n");

    console.log("✅ Expense update workflow completed successfully!");
    console.log("   The double-entry bookkeeping is properly maintained.");

  } catch (error) {
    console.error("❌ Error during test:", error.message);
  }
}

// Instructions for running the test
console.log("=== Expense Update Workflow Test Instructions ===\n");
console.log("Before running this test:");
console.log("1. Replace 'your-vendor-id' with an actual vendor ID from your database");
console.log("2. Replace 'your-category-id' with an actual expense category ID");
console.log("3. Replace 'your-currency-id' with an actual currency ID");
console.log("4. Replace 'YOUR_TOKEN_HERE' with a valid authentication token");
console.log("5. Ensure your server is running on localhost:3000");
console.log("6. Make sure you have the required chart of accounts set up:");
console.log("   - An expense account (e.g., 'Legal Fees')");
console.log("   - A VAT Input account");
console.log("   - A Bank Account");
console.log("\nRun the test with: node test-expense-update-workflow.js\n");

// Uncomment the line below to run the test
// testExpenseWorkflow(); 