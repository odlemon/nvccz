// @ts-nocheck
import { prisma } from '../utils/database';

type ChartDb = { chartOfAccounts: typeof prisma.chartOfAccounts };

/**
 * GL for payroll **gross pay** expense (P&L debit).
 * Prefers **5010 Payroll Expense (Gross Pay)** (COA spec), then **5030 Salaries and Wages** (legacy).
 * Does not fall back to arbitrary 5xxx expenses (UAT: not Office Supplies).
 */
export async function resolveSalariesAndWagesExpenseAccount(
  db: ChartDb = prisma
): Promise<{ id: string; accountNo: string; accountName: string }> {
  const notOfficeSupplies = {
    NOT: {
      OR: [
        { accountName: { contains: 'Office' } },
        { accountName: { contains: 'Suppl' } },
        { accountName: { contains: 'Stationery' } },
      ],
    },
  };

  let acc = await db.chartOfAccounts.findFirst({
    where: {
      accountNo: '5010',
      isActive: true,
      ...notOfficeSupplies,
    },
  });
  if (acc) return acc;

  acc = await db.chartOfAccounts.findFirst({
    where: { accountNo: '5030', isActive: true },
  });
  if (acc) return acc;

  const payrollNamePatterns: Array<{ contains: string }> = [
    { contains: 'Payroll Expense' },
    { contains: 'Gross Pay' },
    { contains: 'Salaries and Wages' },
    { contains: 'Salaries & Wages' },
    { contains: 'Salary and Wage' },
    { contains: 'Salaries Expense' },
    { contains: 'Salary Expense' },
  ];

  for (const pattern of payrollNamePatterns) {
    acc = await db.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        accountType: 'Expense',
        accountName: pattern,
        ...notOfficeSupplies,
      },
      orderBy: { accountNo: 'asc' },
    });
    if (acc) return acc;
  }

  acc = await db.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      accountType: 'Expense',
      OR: [
        { accountName: { contains: 'Payroll' } },
        { accountName: { contains: 'Staff Cost' } },
        { accountName: { contains: 'Personnel' } },
      ],
      ...notOfficeSupplies,
    },
    orderBy: { accountNo: 'asc' },
  });
  if (acc) return acc;

  try {
    acc = await db.chartOfAccounts.create({
      data: {
        accountNo: '5010',
        accountName: 'Payroll Expense (Gross Pay)',
        accountType: 'Expense',
        financialStatement: 'Income Statement',
        naturalBalance: 'DEBIT',
        isActive: true,
      },
    });
    return acc;
  } catch {
    acc = await db.chartOfAccounts.findFirst({
      where: { accountNo: '5010', isActive: true, ...notOfficeSupplies },
    });
    if (acc) return acc;
  }

  try {
    acc = await db.chartOfAccounts.create({
      data: {
        accountNo: '5030',
        accountName: 'Salaries and Wages',
        accountType: 'Expense',
        financialStatement: 'Income Statement',
        naturalBalance: 'DEBIT',
        isActive: true,
      },
    });
    return acc;
  } catch {
    acc = await db.chartOfAccounts.findFirst({
      where: { accountNo: '5030', isActive: true },
    });
    if (acc) return acc;
  }

  throw new Error(
    'Payroll accounting requires chart account 5010 "Payroll Expense (Gross Pay)" or 5030 "Salaries and Wages" (Expense). ' +
      'Run npm run db:ensure:chart-of-accounts or create them in Chart of Accounts. Do not map payroll to Office Supplies.'
  );
}
