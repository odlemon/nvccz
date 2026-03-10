// @ts-nocheck
/**
 * Operational Performance – Profit & Loss report
 *
 * Requirement: View the Profit & Loss report.
 * Expected: Net Profit figure correctly subtracts Total Expenses (5000s) from Total Revenue (4000s).
 *
 * Run: npx ts-node scripts/test-profit-and-loss-report.ts
 * (Test data is left in place; no cleanup.)
 */
import { prisma } from '../src/utils/database';
import { IncomeStatementService } from '../src/services/IncomeStatementService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('=== Profit & Loss report test (Net Profit = Total Revenue - Total Expenses) ===\n');

  const currency = await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) {
    console.error('No active currency found.');
    process.exit(1);
  }

  // Use 2025 so we have a period with possible P&L activity; ensure some revenue and expense for a real formula check
  const year = 2025;
  const startDate = new Date(year, 0, 1, 0, 0, 0, 0);
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

  const admin = await prisma.user.findFirst({ select: { id: true } });
  const acc4000 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '4000', isActive: true } });
  const acc5000 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '5000', isActive: true } });
  const bankGl = await prisma.chartOfAccounts.findFirst({ where: { accountNo: { in: ['1000', '1010', '1100'] }, isActive: true } });
  if (admin && acc4000 && acc5000 && bankGl) {
    const midYear = new Date(year, 5, 15, 12, 0, 0, 0);
    const existing = await prisma.journalEntry.findFirst({
      where: {
        description: { contains: 'P&L test revenue' },
        transactionDate: { gte: startDate, lte: endDate }
      }
    });
    if (!existing) {
      const { Decimal } = await import('@prisma/client/runtime/library');
      const ref = `TEST-PL-${Date.now()}`;
      const jeRev = await prisma.journalEntry.create({
        data: {
          transactionDate: midYear,
          referenceNumber: ref,
          description: 'P&L test revenue',
          totalAmount: new Decimal(10000),
          currencyId: currency.id,
          status: 'POSTED',
          createdById: admin.id
        }
      });
      await prisma.journalEntryLine.createMany({
        data: [
          { journalEntryId: jeRev.id, chartOfAccountId: bankGl.id, debitAmount: new Decimal(10000), creditAmount: new Decimal(0), description: 'Dr Bank' },
          { journalEntryId: jeRev.id, chartOfAccountId: acc4000.id, debitAmount: new Decimal(0), creditAmount: new Decimal(10000), description: 'Cr Revenue' }
        ]
      });
      const jeExp = await prisma.journalEntry.create({
        data: {
          transactionDate: midYear,
          referenceNumber: ref + '-exp',
          description: 'P&L test expense',
          totalAmount: new Decimal(3000),
          currencyId: currency.id,
          status: 'POSTED',
          createdById: admin.id
        }
      });
      await prisma.journalEntryLine.createMany({
        data: [
          { journalEntryId: jeExp.id, chartOfAccountId: acc5000.id, debitAmount: new Decimal(3000), creditAmount: new Decimal(0), description: 'Dr Expense' },
          { journalEntryId: jeExp.id, chartOfAccountId: bankGl.id, debitAmount: new Decimal(0), creditAmount: new Decimal(3000), description: 'Cr Bank' }
        ]
      });
      console.log('Created test P&L data for', year, '(Revenue 10000, Expense 3000).\n');
    }
  }

  const report = await IncomeStatementService.generateIncomeStatement({
    startDate,
    endDate,
    currencyId: currency.id
  });

  const totalRevenue = report.sections.revenue.total;
  const totalExpenses = report.sections.operatingExpenses.total;
  const netProfitFromFormula = totalRevenue - totalExpenses;

  // Net Profit (before tax) must equal Total Revenue (4000s) - Total Expenses (5000s)
  const netProfitReported = report.totals.netIncomeBeforeTaxes;

  console.log(`P&L Report (${year}):`);
  console.log('  Total Revenue (4000s):', totalRevenue);
  console.log('  Total Expenses (5000s):', totalExpenses);
  console.log('  Net Profit (Revenue - Expenses):', netProfitFromFormula);
  console.log('  Report totals.netIncomeBeforeTaxes:', netProfitReported);
  console.log('  Report totals.netIncome:', report.totals.netIncome);

  assert(
    Math.abs(netProfitReported - netProfitFromFormula) < 0.01,
    `Net Profit must equal Total Revenue - Total Expenses: expected ${netProfitFromFormula}, got ${netProfitReported}`
  );

  if (failures.length > 0) {
    console.error('\n❌ FAILED:');
    failures.forEach((f) => console.error('  -', f));
    process.exit(1);
  }

  console.log('\n✅ PASSED: Net Profit correctly subtracts Total Expenses (5000s) from Total Revenue (4000s).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
