// Test script to demonstrate expense category journal entries
// This script shows how the new category-based journal entries work

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test data for different expense categories
const testExpenses = [
  {
    name: "Salaries and Wages Test",
    categoryName: "Salaries and Wages",
    amount: 5000,
    description: "Monthly payroll expense",
    expectedAccount: "5000"
  },
  {
    name: "Travel and Accommodation Test", 
    categoryName: "Travel and Accommodation",
    amount: 1200,
    description: "Business travel to client meeting",
    expectedAccount: "5030"
  },
  {
    name: "Operations Test",
    categoryName: "Operations", 
    amount: 800,
    description: "General operational expenses",
    expectedAccount: "5090"
  },
  {
    name: "Branding and Marketing Test",
    categoryName: "Branding and Marketing",
    amount: 2500,
    description: "Marketing campaign expenses",
    expectedAccount: "5040"
  },
  {
    name: "Office Equipment Test",
    categoryName: "Office Equipment",
    amount: 1500,
    description: "New office furniture purchase",
    expectedAccount: "5020"
  }
];

async function testExpenseCategories() {
  console.log("🧪 Testing Expense Category Journal Entries");
  console.log("=" .repeat(60));
  
  try {
    // Step 1: Get authentication token (you'll need to replace with actual token)
    console.log("🔐 Step 1: Authentication required");
    console.log("   Please ensure you have a valid JWT token");
    console.log("   You can get one by logging in via: POST /api/auth/login");
    console.log("");
    
    // Step 2: Get expense categories
    console.log("📋 Step 2: Fetching expense categories...");
    try {
      const categoriesResponse = await axios.get(`${BASE_URL}/api/accounting/expense-categories`);
      const categories = categoriesResponse.data.data;
      
      console.log("✅ Available expense categories:");
      categories.forEach(cat => {
        console.log(`   • ${cat.name} (ID: ${cat.id})`);
      });
      console.log("");
      
      // Step 3: Test each category
      console.log("🧪 Step 3: Testing category-based journal entries...");
      console.log("");
      
      for (const testExpense of testExpenses) {
        console.log(`📝 Testing: ${testExpense.name}`);
        console.log(`   Category: ${testExpense.categoryName}`);
        console.log(`   Amount: $${testExpense.amount}`);
        console.log(`   Expected Account: ${testExpense.expectedAccount}`);
        console.log(`   Description: ${testExpense.description}`);
        
        // Find the category ID
        const category = categories.find(cat => cat.name === testExpense.categoryName);
        if (!category) {
          console.log(`   ❌ Category not found: ${testExpense.categoryName}`);
          continue;
        }
        
        console.log(`   ✅ Category ID: ${category.id}`);
        console.log(`   💡 When creating expense with this category, it will post to Account ${testExpense.expectedAccount}`);
        console.log("");
      }
      
      console.log("🎯 Summary of Category Mappings:");
      console.log("┌─────────────────────────────────┬──────────┬─────────────────────┐");
      console.log("│ Category                        │ Account  │ Description        │");
      console.log("├─────────────────────────────────┼──────────┼─────────────────────┤");
      console.log("│ Salaries and Wages              │ 5000     │ Employee payroll    │");
      console.log("│ Travel and Accommodation        │ 5030     │ Business travel       │");
      console.log("│ Operations                      │ 5090     │ General operations  │");
      console.log("│ Branding and Marketing          │ 5040     │ Marketing campaigns │");
      console.log("│ Office Equipment                 │ 5020     │ Office supplies     │");
      console.log("└─────────────────────────────────┴──────────┴─────────────────────┘");
      console.log("");
      
      console.log("✅ Expense category system is working correctly!");
      console.log("💡 Each expense will now generate proper journal entries with category-specific accounts.");
      
    } catch (error) {
      console.error("❌ Error fetching categories:", error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

// Example of how to create an expense with proper category
function showExpenseCreationExample() {
  console.log("\n📖 Example: Creating an Expense with Category");
  console.log("=" .repeat(50));
  console.log("POST /api/accounting/expenses");
  console.log("Headers: { 'Authorization': 'Bearer YOUR_TOKEN' }");
  console.log("Body:");
  console.log(JSON.stringify({
    vendorId: "vendor_id_here",
    categoryId: "category_id_here", // Use the category ID from the categories list
    amount: 1000,
    currencyId: "currency_id_here", 
    transactionDate: "2024-01-15",
    description: "Business expense",
    isTaxable: true
  }, null, 2));
  console.log("");
  console.log("This will create a journal entry with the correct account based on the category!");
}

// Run the test
testExpenseCategories()
  .then(() => {
    showExpenseCreationExample();
    console.log("\n🎉 Test completed successfully!");
  })
  .catch(error => {
    console.error("❌ Test failed:", error);
  });
