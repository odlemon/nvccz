// @ts-nocheck
import { prisma } from "../utils/database";

type ChartDb = { chartOfAccounts: typeof prisma.chartOfAccounts };

/**
 * Payroll posting must use exact COA codes — no fallback to arbitrary 21xx/22xx (would mis-post to VAT/AP/etc.).
 */
async function requireLiabilityByAccountNo(
  accountNo: "2150" | "2160" | "2250",
  createData: {
    accountName: string;
    accountType: string;
    financialStatement: string;
    naturalBalance: "CREDIT";
  },
  db: ChartDb = prisma
) {
  let row = await db.chartOfAccounts.findUnique({
    where: { accountNo },
  });

  if (row) {
    if (!row.isActive) {
      throw new Error(
        `Chart account ${accountNo} (${row.accountName}) exists but is inactive. Activate it for payroll posting.`
      );
    }
    return row;
  }

  try {
    row = await db.chartOfAccounts.create({
      data: {
        accountNo,
        ...createData,
        isActive: true,
      },
    });
    return row;
  } catch (e: any) {
    row = await db.chartOfAccounts.findUnique({ where: { accountNo } });
    if (row?.isActive) return row;
    throw new Error(
      `Payroll requires chart account ${accountNo} "${createData.accountName}". Create it in Chart of Accounts or fix DB. ${e?.message || e}`
    );
  }
}

export async function resolvePayePayableAccount(db: ChartDb = prisma) {
  return requireLiabilityByAccountNo(
    "2150",
    {
      accountName: "PAYE Payable",
      accountType: "Current Liability",
      financialStatement: "Balance Sheet",
      naturalBalance: "CREDIT",
    },
    db
  );
}

export async function resolveNssaPensionPayableAccount(db: ChartDb = prisma) {
  return requireLiabilityByAccountNo(
    "2160",
    {
      accountName: "NSSA/Pension Payable",
      accountType: "Current Liability",
      financialStatement: "Balance Sheet",
      naturalBalance: "CREDIT",
    },
    db
  );
}

export async function resolveNetWagesPayableAccount(db: ChartDb = prisma) {
  return requireLiabilityByAccountNo(
    "2250",
    {
      accountName: "Net Wages Payable",
      accountType: "Current Liability",
      financialStatement: "Balance Sheet",
      naturalBalance: "CREDIT",
    },
    db
  );
}
