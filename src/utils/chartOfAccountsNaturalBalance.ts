import type { PrismaClient } from '@prisma/client';

/**
 * Natural balance (normal balance) for GL accounts.
 * Debit-normal: increases post as Debits (assets, expenses).
 * Credit-normal: increases post as Credits (liabilities, equity, revenue, contra-assets).
 */
export type NaturalBalance = 'DEBIT' | 'CREDIT';

const DEBIT_NORMAL_TYPES = new Set<string>([
  'Current Asset',
  'Fixed Asset',
  'Long-Term Asset',
  'Expense',
  'Non-Current Asset',
  'Asset',
  'Bank',
  'Cash'
]);

export function naturalBalanceForAccountType(accountType: string): NaturalBalance {
  return DEBIT_NORMAL_TYPES.has(accountType) ? 'DEBIT' : 'CREDIT';
}

export function isDebitNaturalBalance(
  naturalBalance: string | null | undefined,
  accountType: string
): boolean {
  if (naturalBalance === 'DEBIT' || naturalBalance === 'CREDIT') {
    return naturalBalance === 'DEBIT';
  }
  return naturalBalanceForAccountType(accountType) === 'DEBIT';
}

/**
 * Sets naturalBalance from accountType on every create/update/upsert so it stays locked to the type rule.
 */
export function attachChartOfAccountsNaturalBalanceMiddleware(client: PrismaClient): void {
  client.$use(async (params, next) => {
    if (params.model !== 'ChartOfAccounts') {
      return next(params);
    }

    if (params.action === 'create') {
      const data = params.args.data as Record<string, unknown> | undefined;
      if (data && typeof data.accountType === 'string') {
        (params.args as { data: Record<string, unknown> }).data = {
          ...data,
          naturalBalance: naturalBalanceForAccountType(data.accountType)
        };
      }
      return next(params);
    }

    if (params.action === 'update') {
      const data = params.args.data as Record<string, unknown> | undefined;
      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return next(params);
      }
      let type = data.accountType;
      const where = params.args.where as { id?: string; accountNo?: string };
      if (type === undefined && where?.id) {
        const cur = await client.chartOfAccounts.findUnique({
          where: { id: where.id },
          select: { accountType: true }
        });
        type = cur?.accountType;
      } else if (type === undefined && where?.accountNo) {
        const cur = await client.chartOfAccounts.findUnique({
          where: { accountNo: where.accountNo },
          select: { accountType: true }
        });
        type = cur?.accountType;
      }
      if (typeof type === 'string') {
        (params.args as { data: Record<string, unknown> }).data = {
          ...data,
          naturalBalance: naturalBalanceForAccountType(type)
        };
      }
      return next(params);
    }

    if (params.action === 'upsert') {
      const args = params.args as {
        create: Record<string, unknown>;
        update?: Record<string, unknown>;
        where: { id?: string; accountNo?: string };
      };
      if (args.create && typeof args.create.accountType === 'string') {
        args.create = {
          ...args.create,
          naturalBalance: naturalBalanceForAccountType(args.create.accountType as string)
        };
      }
      if (args.update && Object.keys(args.update).length > 0) {
        const u = { ...args.update };
        let type = u.accountType;
        if (type === undefined && args.where?.id) {
          const cur = await client.chartOfAccounts.findUnique({
            where: { id: args.where.id },
            select: { accountType: true }
          });
          type = cur?.accountType;
        } else if (type === undefined && args.where?.accountNo) {
          const cur = await client.chartOfAccounts.findUnique({
            where: { accountNo: args.where.accountNo },
            select: { accountType: true }
          });
          type = cur?.accountType;
        }
        if (typeof type === 'string') {
          args.update = {
            ...u,
            naturalBalance: naturalBalanceForAccountType(type)
          };
        }
      }
      return next(params);
    }

    return next(params);
  });
}
