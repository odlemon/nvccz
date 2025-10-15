// @ts-nocheck
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function addProcurementAccounts() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  ADD PROCUREMENT CHART OF ACCOUNTS                     ║");
  console.log("║  Date: 2025-10-14                                      ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  try {
    // First, check existing accounts
    console.log("🔍 Checking existing Chart of Accounts...\n");
    const existingAccounts = await prisma.chartOfAccounts.findMany({
      orderBy: { accountNo: 'asc' }
    });

    console.log(`Found ${existingAccounts.length} existing accounts:\n`);
    existingAccounts.forEach(acc => {
      console.log(`  ${acc.accountNo.padEnd(6)} | ${acc.accountName.padEnd(40)} | ${acc.accountType}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("📝 MISSING ACCOUNTS ANALYSIS");
    console.log("=".repeat(60) + "\n");

    // Define accounts needed for Procurement Module
    const requiredAccounts = [
      // ASSETS
      {
        accountNo: "1030",
        accountName: "Bank Account - ZIG",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Zimbabwe Gold (ZIG) currency bank account",
        category: "ASSET"
      },
      {
        accountNo: "1500",
        accountName: "Inventory",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Goods purchased for resale or use",
        category: "ASSET"
      },

      // LIABILITIES
      {
        accountNo: "2020",
        accountName: "Goods Received Not Invoiced (GRNI)",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "Accrued liability for goods/services received but not yet invoiced",
        category: "LIABILITY"
      },

      // REVENUE (for asset disposal)
      {
        accountNo: "4030",
        accountName: "Gain on Asset Disposal",
        accountType: "Revenue",
        financialStatement: "Income Statement",
        notes: "Gain realized from disposing of an asset above its book value",
        category: "REVENUE"
      },

      // EXPENSES - Detailed Categories
      {
        accountNo: "5080",
        accountName: "Loss on Asset Disposal",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Loss incurred from disposing of an asset below its book value",
        category: "EXPENSE"
      },
      {
        accountNo: "5100",
        accountName: "Rent Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Office and equipment rent expenses",
        category: "EXPENSE"
      },
      {
        accountNo: "5110",
        accountName: "Utilities Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Electricity, water, heating expenses",
        category: "EXPENSE"
      },
      {
        accountNo: "5120",
        accountName: "Office Supplies",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Stationery, printer ink, general office supplies",
        category: "EXPENSE"
      },
      {
        accountNo: "5130",
        accountName: "IT and Software",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Software licenses, cloud services, IT support",
        category: "EXPENSE"
      },
      {
        accountNo: "5140",
        accountName: "Maintenance and Repairs",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Equipment and facility maintenance",
        category: "EXPENSE"
      },
      {
        accountNo: "5150",
        accountName: "Insurance Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Business insurance premiums",
        category: "EXPENSE"
      },
      {
        accountNo: "5160",
        accountName: "Telecommunications",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Phone, mobile, internet expenses",
        category: "EXPENSE"
      },
      {
        accountNo: "5170",
        accountName: "Fuel and Vehicle Expenses",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Fuel, vehicle maintenance, parking",
        category: "EXPENSE"
      },
      {
        accountNo: "5180",
        accountName: "Printing and Copying",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Document printing and copying services",
        category: "EXPENSE"
      },
      {
        accountNo: "5190",
        accountName: "Cleaning and Janitorial",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Office cleaning services and supplies",
        category: "EXPENSE"
      },
      {
        accountNo: "5200",
        accountName: "Security Services",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Security guard services, alarm systems",
        category: "EXPENSE"
      }
    ];

    // Check which accounts are missing
    const missingAccounts = [];
    const existingAccountNos = new Set(existingAccounts.map(a => a.accountNo));

    for (const account of requiredAccounts) {
      if (!existingAccountNos.has(account.accountNo)) {
        missingAccounts.push(account);
      }
    }

    if (missingAccounts.length === 0) {
      console.log("✅ ✅ ✅ ALL REQUIRED ACCOUNTS ALREADY EXIST! ✅ ✅ ✅\n");
      return;
    }

    console.log(`Found ${missingAccounts.length} MISSING accounts:\n`);

    // Group by category
    const grouped = missingAccounts.reduce((acc, account) => {
      if (!acc[account.category]) acc[account.category] = [];
      acc[account.category].push(account);
      return acc;
    }, {});

    // Display missing accounts by category
    for (const [category, accounts] of Object.entries(grouped)) {
      console.log(`\n📌 ${category}S:`);
      accounts.forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.accountName}`);
        console.log(`      Type: ${acc.accountType}`);
        console.log(`      Purpose: ${acc.notes}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("💾 CREATING MISSING ACCOUNTS");
    console.log("=".repeat(60) + "\n");

    let createdCount = 0;

    for (const account of missingAccounts) {
      try {
        const created = await prisma.chartOfAccounts.create({
          data: {
            accountNo: account.accountNo,
            accountName: account.accountName,
            accountType: account.accountType,
            financialStatement: account.financialStatement,
            notes: account.notes,
            isActive: true
          }
        });

        console.log(`✅ Created: ${created.accountNo} - ${created.accountName}`);
        createdCount++;
      } catch (error) {
        console.error(`❌ Failed to create ${account.accountNo}: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Successfully created ${createdCount} out of ${missingAccounts.length} accounts\n`);

    if (createdCount > 0) {
      console.log("🎉 PROCUREMENT MODULE ACCOUNTS SETUP COMPLETE!");
      console.log("\n📋 NEW ACCOUNTS BY FUNCTION:\n");
      
      console.log("💰 ACCRUAL ACCOUNTING:");
      console.log("   2020 - Goods Received Not Invoiced (GRNI)");
      console.log("   → Used when goods are received before invoice\n");

      console.log("📦 INVENTORY MANAGEMENT:");
      console.log("   1500 - Inventory");
      console.log("   → Tracks goods purchased for resale\n");

      console.log("🏦 BANKING:");
      console.log("   1030 - Bank Account - ZIG");
      console.log("   → Zimbabwe Gold currency transactions\n");

      console.log("🔧 ASSET DISPOSAL:");
      console.log("   4030 - Gain on Asset Disposal");
      console.log("   5080 - Loss on Asset Disposal");
      console.log("   → Records profit/loss from asset sales\n");

      console.log("📋 EXPENSE CATEGORIES:");
      console.log("   5100 - Rent Expense");
      console.log("   5110 - Utilities Expense");
      console.log("   5120 - Office Supplies");
      console.log("   5130 - IT and Software");
      console.log("   5140 - Maintenance and Repairs");
      console.log("   5150 - Insurance Expense");
      console.log("   5160 - Telecommunications");
      console.log("   5170 - Fuel and Vehicle Expenses");
      console.log("   5180 - Printing and Copying");
      console.log("   5190 - Cleaning and Janitorial");
      console.log("   5200 - Security Services");
      console.log("   → Detailed tracking of procurement expenses\n");
    }

    console.log("✅ Chart of Accounts is now ready for full Procurement-to-Pay cycle!");
    console.log("\n🚀 NEXT STEPS:");
    console.log("   1. Implement Payment Processing journal entries");
    console.log("   2. Implement Goods Receipt (GRN) accrual accounting");
    console.log("   3. Test complete P2P workflow\n");

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addProcurementAccounts()
  .catch(e => {
    console.error("❌ Script failed:", e);
    process.exit(1);
  });


