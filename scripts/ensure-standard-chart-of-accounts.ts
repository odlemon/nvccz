// @ts-nocheck
/**
 * Ensures standard chart-of-accounts exist for payroll, journals, cashbook, VAT, and common integrations.
 * For each defined row: if accountNo is missing, creates it; if it already exists, skips (no overwrite).
 *
 * Run: npx ts-node scripts/ensure-standard-chart-of-accounts.ts
 *      npm run db:ensure:chart-of-accounts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type StdRow = {
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: string;
  naturalBalance: 'DEBIT' | 'CREDIT';
  notes?: string;
};

/**
 * Standard codes referenced across PayrollService, JournalEntryService, CashbookService,
 * PurchaseInvoiceService, MultiCurrencyService, YearEndCloseService, etc.
 */
const STANDARD_CHART_OF_ACCOUNTS: StdRow[] = [
  // —— Assets ——
  { accountNo: '1000', accountName: 'Cash on Hand', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },
  { accountNo: '1010', accountName: 'Petty Cash', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },
  { accountNo: '1030', accountName: 'Petty Cash / Cash Clearing', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },
  { accountNo: '1100', accountName: 'Bank - Operating Account', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },
  { accountNo: '1101', accountName: 'VAT Input Recoverable', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },
  { accountNo: '1200', accountName: 'Accounts Receivable', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },
  { accountNo: '1300', accountName: 'Prepayments', accountType: 'Current Asset', financialStatement: 'Balance Sheet', naturalBalance: 'DEBIT' },

  // —— Liabilities ——
  { accountNo: '2000', accountName: 'Accounts Payable', accountType: 'Current Liability', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },
  { accountNo: '2100', accountName: 'VAT Output Payable', accountType: 'Current Liability', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },
  { accountNo: '2110', accountName: 'VAT Input (clearing) / VAT Payable', accountType: 'Current Liability', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },
  { accountNo: '2150', accountName: 'PAYE Payable', accountType: 'Current Liability', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },
  { accountNo: '2160', accountName: 'NSSA / Pension Payable', accountType: 'Current Liability', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },
  { accountNo: '2250', accountName: 'Net Wages Payable', accountType: 'Current Liability', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },

  // —— Equity ——
  { accountNo: '3100', accountName: 'Retained Earnings', accountType: 'Equity', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },

  // —— Revenue ——
  { accountNo: '4000', accountName: 'Sales Revenue', accountType: 'Revenue', financialStatement: 'Income Statement', naturalBalance: 'CREDIT' },
  { accountNo: '4010', accountName: 'Management Fee Revenue', accountType: 'Revenue', financialStatement: 'Income Statement', naturalBalance: 'CREDIT', notes: 'Portfolio / asset management recurring fees' },
  { accountNo: '4020', accountName: 'Performance Fee Revenue', accountType: 'Revenue', financialStatement: 'Income Statement', naturalBalance: 'CREDIT', notes: 'Performance / carry fees' },
  { accountNo: '4050', accountName: 'Unrealized Foreign Exchange Gain/Loss', accountType: 'Revenue', financialStatement: 'Income Statement', naturalBalance: 'CREDIT' },

  // —— Expenses (incl. JournalEntryService category map + payroll) ——
  { accountNo: '5010', accountName: 'Payroll Expense (Gross Pay)', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT', notes: 'Gross payroll cost before deductions; primary DR for payroll JE per COA spec' },
  { accountNo: '5030', accountName: 'Salaries and Wages', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT', notes: 'Legacy / alternate payroll expense; used if 5010 absent' },
  { accountNo: '5060', accountName: 'Marketing Expense', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '5070', accountName: 'Travel and Accommodation', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '5090', accountName: 'Other Operating Expenses', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '5130', accountName: 'Depreciation Expense', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '5200', accountName: 'General Operating Expense', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '6000', accountName: 'Foreign Exchange Gain/Loss', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '6050', accountName: 'Foreign Exchange Loss', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },
  { accountNo: '6095', accountName: 'Rounding Variance', accountType: 'Expense', financialStatement: 'Income Statement', naturalBalance: 'DEBIT' },

  // —— Non-current assets (common fixed asset / depreciation pairing) ——
  { accountNo: '1550', accountName: 'Accumulated Depreciation', accountType: 'Fixed Asset', financialStatement: 'Balance Sheet', naturalBalance: 'CREDIT' },
];

async function ensureRow(row: StdRow): Promise<'created' | 'exists' | 'error'> {
  const existing = await prisma.chartOfAccounts.findUnique({
    where: { accountNo: row.accountNo },
  });
  if (existing) {
    console.log(`  exists  ${row.accountNo}  ${existing.accountName}`);
    return 'exists';
  }
  try {
    await prisma.chartOfAccounts.create({
      data: {
        accountNo: row.accountNo,
        accountName: row.accountName,
        accountType: row.accountType,
        financialStatement: row.financialStatement,
        naturalBalance: row.naturalBalance,
        isActive: true,
        ...(row.notes ? { notes: row.notes } : {}),
      },
    });
    console.log(`  created ${row.accountNo}  ${row.accountName}`);
    return 'created';
  } catch (e: any) {
    console.error(`  ERROR   ${row.accountNo}: ${e?.message || e}`);
    return 'error';
  }
}

async function main() {
  console.log('Ensuring standard chart of accounts (create if missing)...\n');
  let created = 0;
  let exists = 0;
  let errors = 0;

  for (const row of STANDARD_CHART_OF_ACCOUNTS) {
    const r = await ensureRow(row);
    if (r === 'created') created++;
    else if (r === 'exists') exists++;
    else errors++;
  }

  console.log('\n──────── summary ────────');
  console.log(`Created: ${created}  Already present: ${exists}  Errors: ${errors}`);
  console.log('Done.\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
