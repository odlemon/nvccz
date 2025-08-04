import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const chartOfAccounts = [
  // Assets
  {
    accountCode: "1000",
    accountName: "Current Assets",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "1100",
    accountName: "Cash and Cash Equivalents",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "1110",
    accountName: "Bank Account",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "1200",
    accountName: "Accounts Receivable",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "1300",
    accountName: "Prepaid Expenses",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "1400",
    accountName: "Other Current Assets",
    accountType: "ASSET",
    parentId: null
  },

  // Fixed Assets
  {
    accountCode: "2000",
    accountName: "Fixed Assets",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "2100",
    accountName: "Equipment",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "2200",
    accountName: "Furniture and Fixtures",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "2300",
    accountName: "Computer Equipment",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "2400",
    accountName: "Accumulated Depreciation",
    accountType: "ASSET",
    parentId: null
  },

  // Liabilities
  {
    accountCode: "3000",
    accountName: "Current Liabilities",
    accountType: "LIABILITY",
    parentId: null
  },
  {
    accountCode: "3100",
    accountName: "Accounts Payable",
    accountType: "LIABILITY",
    parentId: null
  },
  {
    accountCode: "3200",
    accountName: "Accrued Expenses",
    accountType: "LIABILITY",
    parentId: null
  },
  {
    accountCode: "3300",
    accountName: "VAT Payable",
    accountType: "LIABILITY",
    parentId: null
  },
  {
    accountCode: "3400",
    accountName: "Other Current Liabilities",
    accountType: "LIABILITY",
    parentId: null
  },

  // Long-term Liabilities
  {
    accountCode: "4000",
    accountName: "Long-term Liabilities",
    accountType: "LIABILITY",
    parentId: null
  },
  {
    accountCode: "4100",
    accountName: "Long-term Loans",
    accountType: "LIABILITY",
    parentId: null
  },

  // Equity
  {
    accountCode: "5000",
    accountName: "Equity",
    accountType: "EQUITY",
    parentId: null
  },
  {
    accountCode: "5100",
    accountName: "Share Capital",
    accountType: "EQUITY",
    parentId: null
  },
  {
    accountCode: "5200",
    accountName: "Retained Earnings",
    accountType: "EQUITY",
    parentId: null
  },
  {
    accountCode: "5300",
    accountName: "Current Year Earnings",
    accountType: "EQUITY",
    parentId: null
  },

  // Revenue
  {
    accountCode: "6000",
    accountName: "Revenue",
    accountType: "REVENUE",
    parentId: null
  },
  {
    accountCode: "6100",
    accountName: "Management Fees",
    accountType: "REVENUE",
    parentId: null
  },
  {
    accountCode: "6200",
    accountName: "Consulting Fees",
    accountType: "REVENUE",
    parentId: null
  },
  {
    accountCode: "6300",
    accountName: "Interest Income",
    accountType: "REVENUE",
    parentId: null
  },
  {
    accountCode: "6400",
    accountName: "Other Income",
    accountType: "REVENUE",
    parentId: null
  },

  // Expenses
  {
    accountCode: "7000",
    accountName: "Expenses",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7100",
    accountName: "Office Expenses",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7200",
    accountName: "Travel Expenses",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7300",
    accountName: "Legal and Professional Fees",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7400",
    accountName: "Marketing and Advertising",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7500",
    accountName: "Utilities",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7600",
    accountName: "Rent Expense",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7700",
    accountName: "Salaries and Wages",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7800",
    accountName: "Insurance",
    accountType: "EXPENSE",
    parentId: null
  },
  {
    accountCode: "7900",
    accountName: "Other Expenses",
    accountType: "EXPENSE",
    parentId: null
  },

  // VAT Accounts
  {
    accountCode: "8000",
    accountName: "VAT Input",
    accountType: "ASSET",
    parentId: null
  },
  {
    accountCode: "8100",
    accountName: "VAT Output",
    accountType: "LIABILITY",
    parentId: null
  }
];

async function seedChartOfAccounts() {
  try {
    console.log("🌱 Starting Chart of Accounts seeding...");

    // Clear existing chart of accounts
    await prisma.chartOfAccounts.deleteMany({});
    console.log("✅ Cleared existing chart of accounts");

    // Create new chart of accounts
    const createdAccounts = await prisma.chartOfAccounts.createMany({
      data: chartOfAccounts
    });

    console.log(`✅ Created ${createdAccounts.count} chart of accounts entries`);

    // Verify the accounts were created
    const accountCount = await prisma.chartOfAccounts.count();
    console.log(`📊 Total chart of accounts: ${accountCount}`);

    // Display some key accounts
    const keyAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountName: {
          in: [
            "Bank Account",
            "Accounts Payable",
            "VAT Input",
            "VAT Payable",
            "Office Expenses",
            "Management Fees"
          ]
        }
      },
      select: {
        accountCode: true,
        accountName: true,
        accountType: true
      }
    });

    console.log("\n🔑 Key Accounts Created:");
    keyAccounts.forEach(account => {
      console.log(`  ${account.accountCode} - ${account.accountName} (${account.accountType})`);
    });

    console.log("\n✅ Chart of Accounts seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding chart of accounts:", error);
    throw error;
  }
}

// Run the seeding function
seedChartOfAccounts()
  .then(async () => {
    await prisma.$disconnect();
    console.log("🔌 Database connection closed");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("❌ Seeding failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  }); 