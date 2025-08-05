// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedChartOfAccounts() {
  console.log("🌱 Seeding comprehensive chart of accounts...");

  try {
    // Check if accounts already exist
    const existingAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountName: { contains: "Cash and Cash Equivalents" } },
          { accountName: { contains: "Accounts Receivable" } },
          { accountName: { contains: "Management Fees Income" } }
        ]
      }
    });

    if (existingAccounts.length > 0) {
      console.log("✅ Chart of accounts already exist, skipping...");
      return;
    }

    // 1000s - Assets
    console.log("📊 Creating Asset accounts...");
    
    // Current Assets
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1000",
    accountName: "Cash and Cash Equivalents",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Bank balances, petty cash"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1010",
    accountName: "Accounts Receivable",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Receivables from partners, fees"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1020",
    accountName: "Prepaid Expenses",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Prepaid rent, insurance"
      }
    });

  // Fixed Assets
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1100",
        accountName: "Office Equipment",
        accountType: "Fixed Asset",
        financialStatement: "Balance Sheet",
        notes: "Furniture, computers"
      }
    });

    // Long-Term Assets
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1200",
        accountName: "Long-Term Investments",
        accountType: "Long-Term Asset",
        financialStatement: "Balance Sheet",
        notes: "Investments in portfolio companies"
      }
    });

    // Contra-Asset
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1300",
    accountName: "Accumulated Depreciation",
        accountType: "Contra-Asset",
        financialStatement: "Balance Sheet",
        notes: "Depreciation of office equipment"
      }
    });

    // 2000s - Liabilities
    console.log("📊 Creating Liability accounts...");
    
    // Current Liabilities
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2000",
    accountName: "Accounts Payable",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "Vendor payables"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2010",
    accountName: "Accrued Expenses",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "Salaries payable, interest"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2100",
        accountName: "Deferred Revenue",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "If applicable, e.g., management fees prepaid"
      }
    });

    // Long-Term Liabilities
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2200",
        accountName: "Notes Payable",
        accountType: "Long-Term Liability",
        financialStatement: "Balance Sheet",
        notes: "Loans (if any)"
      }
    });

    // 3000s - Equity
    console.log("📊 Creating Equity accounts...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "3000",
    accountName: "Share Capital",
        accountType: "Equity",
        financialStatement: "Balance Sheet",
        notes: "Initial capital contributions"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "3100",
    accountName: "Retained Earnings",
        accountType: "Equity",
        financialStatement: "Balance Sheet",
        notes: "Cumulative net income/loss"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "3200",
    accountName: "Current Year Earnings",
        accountType: "Equity",
        financialStatement: "Balance Sheet",
        notes: "Transfers to retained earnings"
      }
    });

    // 4000s - Revenue
    console.log("📊 Creating Revenue accounts...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "4000",
        accountName: "Management Fees Income",
        accountType: "Revenue",
        financialStatement: "Income Statement",
        notes: "Fund management revenue"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "4010",
        accountName: "Investment Gains",
        accountType: "Revenue",
        financialStatement: "Income Statement",
        notes: "Dividends, exits, interest"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "4020",
    accountName: "Other Income",
        accountType: "Revenue",
        financialStatement: "Income Statement",
        notes: "Consulting or advisory revenue"
      }
    });

    // 5000s - Operating Expenses
    console.log("📊 Creating Operating Expense accounts...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5000",
    accountName: "Salaries and Wages",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Staff and executive payroll"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5010",
        accountName: "Office Rent",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Office lease"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5020",
        accountName: "Office Equipment",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Small asset purchases, non-capitalized"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5030",
        accountName: "Travel and Entertainment",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "VC travel, conferences"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5040",
        accountName: "Marketing and PR",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Branding, investor relations"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5050",
        accountName: "Professional Fees",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Legal, audit, advisory"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5060",
        accountName: "Utilities and Internet",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Overheads"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "s5070",
        accountName: "Bank Charges",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Transfer fees, account charges"
      }
    });

    // 6000s - Investment-Related
    console.log("📊 Creating Investment-Related accounts...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "6000",
        accountName: "Investment Write-Offs",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Failed investments"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "6010",
        accountName: "Capital Calls Paid",
        accountType: "Expense",
        financialStatement: "Cash Flow / Tracking",
        notes: "Contributions to external funds"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "6020",
        accountName: "Distributions Received",
        accountType: "Income",
        financialStatement: "Income Statement / Cash Flow",
        notes: "Cash or non-cash returns"
      }
    });

    // VAT Accounts (for tax compliance)
    console.log("📊 Creating VAT accounts...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2001",
        accountName: "VAT Output",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "VAT collected on sales (14.5% in Zimbabwe)"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1101",
        accountName: "VAT Input",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "VAT paid on purchases (14.5% in Zimbabwe)"
      }
    });

    console.log("🎉 Comprehensive chart of accounts seeded successfully!");
    console.log("");
    console.log("Created account categories:");
    console.log("- Assets (1000s): Cash, Receivables, Equipment, Investments");
    console.log("- Liabilities (2000s): Payables, Accruals, Loans");
    console.log("- Equity (3000s): Share Capital, Retained Earnings");
    console.log("- Revenue (4000s): Management Fees, Investment Gains");
    console.log("- Operating Expenses (5000s): Salaries, Rent, Travel, etc.");
    console.log("- Investment-Related (6000s): Write-offs, Capital Calls");
    console.log("- VAT Accounts: Input and Output for tax compliance");
    console.log("");
    console.log("These accounts support comprehensive double-entry bookkeeping for the ERP system.");

  } catch (error) {
    console.error("❌ Error seeding chart of accounts:", error);
    throw error;
  }
}

async function main() {
  try {
    await seedChartOfAccounts();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 