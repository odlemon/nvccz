// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedChartOfAccounts() {
  console.log("🌱 Seeding comprehensive chart of accounts...");

  try {
    // Check if accounts already exist
    const existingAccounts = await prisma.chartOfAccounts.findMany({
      take: 1
    });

    if (existingAccounts.length > 0) {
      console.log("✅ Chart of accounts already exist, skipping...");
      return;
    }

    // 1000s - ASSETS
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
        accountName: "Main Bank Account - USD",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Primary operating account"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1020",
        accountName: "Savings Account - USD",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Interest-bearing savings"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1030",
        accountName: "Petty Cash",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Small cash transactions"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1040",
        accountName: "Bank Account - ZAR",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "South African Rand account"
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

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1200",
        accountName: "Accounts Receivable Control",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Receivables from partners, fees"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1210",
        accountName: "Trade Debtors",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Customer receivables"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1300",
        accountName: "VAT Input",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "VAT input tracking"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1500",
        accountName: "Inventory",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "Goods purchased for resale or use"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1520",
        accountName: "Delivery Van",
        accountType: "Fixed Asset",
        financialStatement: "Balance Sheet",
        notes: "Delivery van asset. Natural balance: Debit. Increases must be Debit."
      }
    });

    // Fixed Assets
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1100",
        accountName: "Office Equipment",
        accountType: "Fixed Asset",
        financialStatement: "Balance Sheet",
        notes: "Furniture, computers, equipment"
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

    // Contra-Assets
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "1300",
        accountName: "Accumulated Depreciation",
        accountType: "Contra-Asset",
        financialStatement: "Balance Sheet",
        notes: "Depreciation of office equipment"
      }
    });

    // 2000s - LIABILITIES
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
        accountNo: "2001",
        accountName: "VAT Output",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "VAT collected on sales (14.5% in Zimbabwe)"
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
        accountNo: "2020",
        accountName: "Goods Received Not Invoiced (GRNI)",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "Accrued liability for goods/services received but not yet invoiced"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2100",
        accountName: "Accounts Payable Control",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "If applicable, e.g., management fees prepaid"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2110",
        accountName: "Trade Creditors",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "Supplier payables"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2200",
        accountName: "VAT Output",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "VAT output tracking"
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

    // 3000s - EQUITY
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

    // 4000s - REVENUE
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

    // 5000s - OPERATING EXPENSES
    console.log("📊 Creating Operating Expense accounts...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5000",
        accountName: "Rent Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Office lease"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5010",
        accountName: "Office Supplies Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Office supplies and materials"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5020",
        accountName: "Bank Charges",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Transfer fees, account charges"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5030",
        accountName: "Salaries and Wages",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Staff and executive payroll"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5040",
        accountName: "Utilities Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Electricity, water, internet"
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
        accountName: "Marketing Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Branding, advertising, PR"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5070",
        accountName: "Travel Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Business travel, conferences"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5080",
        accountName: "Insurance Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Business insurance"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5090",
        accountName: "Other Operating Expenses",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Miscellaneous operating costs"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "5100",
        accountName: "Rent Expense",
        accountType: "Expense",
        financialStatement: "Income Statement",
        notes: "Office rent and lease"
      }
    });

    // 6000s - INVESTMENT-RELATED
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

    // VAT ACCOUNTS - CRITICAL FOR CASHBOOK MODULE
    console.log("📊 Creating VAT accounts for cashbook module...");
    
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2100",
        accountName: "VAT Output",
        accountType: "Current Liability",
        financialStatement: "Balance Sheet",
        notes: "VAT collected on sales and receipts - Zimbabwe 15% standard rate"
      }
    });

    await prisma.chartOfAccounts.create({
      data: {
        accountNo: "2110",
        accountName: "VAT Input",
        accountType: "Current Asset",
        financialStatement: "Balance Sheet",
        notes: "VAT paid on purchases and payments - Zimbabwe 15% standard rate"
      }
    });

    console.log("🎉 Comprehensive chart of accounts seeded successfully!");
    console.log("");
    console.log("Created account categories:");
    console.log("- Assets (1000s): Cash, Bank Accounts, Receivables, Equipment, Investments, VAT Input");
    console.log("- Liabilities (2000s): Payables, Accruals, VAT Output, GRNI");
    console.log("- Equity (3000s): Share Capital, Retained Earnings, Current Year Earnings");
    console.log("- Revenue (4000s): Management Fees, Investment Gains, Other Income");
    console.log("- Operating Expenses (5000s): Rent, Salaries, Travel, Marketing, Professional Fees, etc.");
    console.log("- Investment-Related (6000s): Write-offs, Capital Calls, Distributions");
    console.log("- VAT Compliance: Input and Output accounts for Zimbabwe tax compliance");
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