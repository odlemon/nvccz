import type { PrismaClient } from '@prisma/client';

export type CashAndCashEquivalentsCoa = {
  id: string;
  accountNo: string;
  accountName: string;
  accountType: string;
};

/**
 * Chart line used for **all** bank balances (single "Cash and Cash Equivalents").
 *
 * Configure one of:
 * - `CASH_AND_CASH_EQUIVALENTS_GL_ACCOUNT_ID` — CoA row id (preferred)
 * - `CASH_AND_CASH_EQUIVALENTS_ACCOUNT_NO` — e.g. `1000`
 *
 * If neither is set, falls back to the first **active** account whose name contains
 * "cash and cash equivalent" (case-insensitive), then account **1000**, for local/dev.
 */
export async function resolveCashAndCashEquivalentsCoa(
  prisma: PrismaClient
): Promise<CashAndCashEquivalentsCoa> {
  const byId = process.env.CASH_AND_CASH_EQUIVALENTS_GL_ACCOUNT_ID?.trim();
  if (byId) {
    const coa = await prisma.chartOfAccounts.findUnique({ where: { id: byId } });
    if (!coa) {
      throw new Error(`CASH_AND_CASH_EQUIVALENTS_GL_ACCOUNT_ID not found: ${byId}`);
    }
    return {
      id: coa.id,
      accountNo: coa.accountNo,
      accountName: coa.accountName,
      accountType: coa.accountType,
    };
  }

  const byNo = process.env.CASH_AND_CASH_EQUIVALENTS_ACCOUNT_NO?.trim();
  if (byNo) {
    const coa = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: byNo, isActive: true },
    });
    if (!coa) {
      throw new Error(`CASH_AND_CASH_EQUIVALENTS_ACCOUNT_NO not found: ${byNo}`);
    }
    return {
      id: coa.id,
      accountNo: coa.accountNo,
      accountName: coa.accountName,
      accountType: coa.accountType,
    };
  }

  const byName = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      accountName: { contains: 'cash and cash equivalent' },
    },
  });
  if (byName) {
    return {
      id: byName.id,
      accountNo: byName.accountNo,
      accountName: byName.accountName,
      accountType: byName.accountType,
    };
  }

  const k1000 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1000', isActive: true },
  });
  if (k1000) {
    return {
      id: k1000.id,
      accountNo: k1000.accountNo,
      accountName: k1000.accountName,
      accountType: k1000.accountType,
    };
  }

  throw new Error(
    'Cash and Cash Equivalents CoA not configured. Set CASH_AND_CASH_EQUIVALENTS_GL_ACCOUNT_ID or CASH_AND_CASH_EQUIVALENTS_ACCOUNT_NO, or create active account 1000 / name containing "Cash and Cash Equivalents".'
  );
}

export async function assertGlAccountIsCashAndCashEquivalents(
  prisma: PrismaClient,
  glAccountId: string
): Promise<void> {
  const cace = await resolveCashAndCashEquivalentsCoa(prisma);
  if (glAccountId !== cace.id) {
    throw new Error(
      `Bank GL must be Cash and Cash Equivalents (${cace.accountNo} — ${cace.accountName}). ` +
        `Configure env (CASH_AND_CASH_EQUIVALENTS_*) or chart of accounts so the selected account is the single Cash and Cash Equivalents line.`
    );
  }
}
