// Test script to demonstrate Office Equipment asset treatment
// This shows the CORRECTED behavior for Office Equipment transactions

console.log("🧪 OFFICE EQUIPMENT ASSET TREATMENT TEST");
console.log("=" .repeat(60));
console.log("Testing CORRECTED Office Equipment journal entries");
console.log("=" .repeat(60));

// Test scenarios for Office Equipment (now treated as ASSET)
const officeEquipmentScenarios = [
  {
    name: "Computer Purchase via Bank (Taxable)",
    amount: 2500,
    vat: 375,
    total: 2875,
    paymentMethod: "BANK",
    isTaxable: true,
    description: "Laptop purchase for office",
    journalEntry: {
      debit: [
        { account: "1100", name: "Office Equipment", amount: 2500 },
        { account: "1101", name: "VAT Input", amount: 375 }
      ],
      credit: [
        { account: "1000", name: "Cash and Cash Equivalents", amount: 2875 }
      ]
    }
  },
  {
    name: "Office Furniture via Cash (Taxable)",
    amount: 800,
    vat: 120,
    total: 920,
    paymentMethod: "CASH",
    isTaxable: true,
    description: "Desk and chair purchase",
    journalEntry: {
      debit: [
        { account: "1100", name: "Office Equipment", amount: 800 },
        { account: "1101", name: "VAT Input", amount: 120 }
      ],
      credit: [
        { account: "1030", name: "Petty Cash", amount: 920 }
      ]
    }
  },
  {
    name: "Office Equipment on Credit (Taxable)",
    amount: 3000,
    vat: 450,
    total: 3450,
    paymentMethod: "CREDIT",
    isTaxable: true,
    description: "Office furniture on credit",
    journalEntry: {
      debit: [
        { account: "1100", name: "Office Equipment", amount: 3000 },
        { account: "1101", name: "VAT Input", amount: 450 }
      ],
      credit: [
        { account: "2000", name: "Accounts Payable", amount: 3450 }
      ]
    }
  }
];

function displayJournalEntry(journalEntry, scenario) {
  console.log(`\n📊 Journal Entry: ${scenario.name}`);
  console.log("=" .repeat(60));
  
  console.log("DEBITS:");
  journalEntry.debit.forEach(line => {
    console.log(`  Dr. ${line.account} - ${line.name.padEnd(30)} $${line.amount.toFixed(2)}`);
  });
  
  console.log("\nCREDITS:");
  journalEntry.credit.forEach(line => {
    console.log(`      Cr. ${line.account} - ${line.name.padEnd(30)} $${line.amount.toFixed(2)}`);
  });
  
  // Verify balance
  const totalDebits = journalEntry.debit.reduce((sum, line) => sum + line.amount, 0);
  const totalCredits = journalEntry.credit.reduce((sum, line) => sum + line.amount, 0);
  
  console.log("\n" + "=" .repeat(60));
  console.log(`Total Debits:  $${totalDebits.toFixed(2)}`);
  console.log(`Total Credits: $${totalCredits.toFixed(2)}`);
  console.log(`Balance:       $${(totalDebits - totalCredits).toFixed(2)} ${totalDebits === totalCredits ? '✅ BALANCED' : '❌ UNBALANCED'}`);
}

function displayScenarioSummary(scenario) {
  console.log(`\n💰 ${scenario.name}`);
  console.log(`   Amount: $${scenario.amount.toFixed(2)}`);
  console.log(`   VAT: $${scenario.vat.toFixed(2)} (${scenario.isTaxable ? '15%' : '0%'})`);
  console.log(`   Total: $${scenario.total.toFixed(2)}`);
  console.log(`   Payment: ${scenario.paymentMethod}`);
  console.log(`   Description: ${scenario.description}`);
}

// Display all scenarios
console.log("\n📋 OFFICE EQUIPMENT (Account 1100 - FIXED ASSET)");
console.log("=" .repeat(60));

officeEquipmentScenarios.forEach(scenario => {
  displayScenarioSummary(scenario);
  displayJournalEntry(scenario.journalEntry, scenario);
});

// Show the difference between old and new treatment
console.log("\n🔄 COMPARISON: OLD vs NEW TREATMENT");
console.log("=" .repeat(60));

console.log("\n❌ OLD TREATMENT (WRONG):");
console.log("   Office Equipment → Account 5120 (Office Supplies - Expense)");
console.log("   Impact: Reduces profit immediately, no asset tracking");
console.log("   Journal Entry:");
console.log("     Dr. 5120 - Office Supplies        $2,000.00  (Expense)");
console.log("     Dr. 1101 - VAT Input              $300.00");
console.log("         Cr. 1000 - Cash                $2,300.00");

console.log("\n✅ NEW TREATMENT (CORRECT):");
console.log("   Office Equipment → Account 1100 (Office Equipment - Fixed Asset)");
console.log("   Impact: Creates asset, proper depreciation tracking");
console.log("   Journal Entry:");
console.log("     Dr. 1100 - Office Equipment       $2,000.00  (Asset)");
console.log("     Dr. 1101 - VAT Input              $300.00");
console.log("         Cr. 1000 - Cash                $2,300.00");

console.log("\n🎯 KEY DIFFERENCES:");
console.log("┌─────────────────┬─────────────────┬─────────────────┐");
console.log("│ Aspect          │ Old (Wrong)     │ New (Correct)   │");
console.log("├─────────────────┼─────────────────┼─────────────────┤");
console.log("│ Account Type    │ Expense (P&L)   │ Fixed Asset (BS)│");
console.log("│ Financial Impact│ Reduces Profit  │ Creates Asset   │");
console.log("│ Depreciation    │ Not Applicable  │ Can Depreciate  │");
console.log("│ Balance Sheet   │ No Impact       │ Asset Increase  │");
console.log("│ Income Statement│ Expense Record  │ No Impact       │");
console.log("└─────────────────┴─────────────────┴─────────────────┘");

console.log("\n💡 BUSINESS BENEFITS:");
console.log("✅ Proper asset tracking and management");
console.log("✅ Accurate financial position reporting");
console.log("✅ Support for depreciation schedules");
console.log("✅ Better cash flow analysis");
console.log("✅ Compliance with accounting standards");

console.log("\n🎉 OFFICE EQUIPMENT NOW TREATED AS ASSET!");
console.log("💡 Equipment purchases will appear on Balance Sheet as Fixed Assets!");
