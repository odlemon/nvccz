// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../utils/database', () => ({
  prisma: {},
}));

import { resolveSalariesAndWagesExpenseAccount } from '../../services/payrollGlAccountResolver';

describe('resolveSalariesAndWagesExpenseAccount', () => {
  const salaries5010 = {
    id: 'good-5010',
    accountNo: '5010',
    accountName: 'Payroll Expense (Gross Pay)',
    accountType: 'Expense',
  };

  const salaries5030 = {
    id: 'good-5030',
    accountNo: '5030',
    accountName: 'Salaries and Wages',
    accountType: 'Expense',
  };

  let findFirst: jest.Mock;
  let create: jest.Mock;

  beforeEach(() => {
    findFirst = jest.fn();
    create = jest.fn();
  });

  function db() {
    return { chartOfAccounts: { findFirst, create } };
  }

  it('returns active 5010 when present (COA spec)', async () => {
    findFirst.mockResolvedValueOnce(salaries5010);
    const r = await resolveSalariesAndWagesExpenseAccount(db());
    expect(r).toEqual(salaries5010);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where.accountNo).toBe('5010');
  });

  it('returns 5030 when 5010 missing (5010 query excludes Office/Supplies mislabels)', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(salaries5030);
    const r = await resolveSalariesAndWagesExpenseAccount(db());
    expect(r).toEqual(salaries5030);
    expect(findFirst.mock.calls[0][0].where.accountNo).toBe('5010');
    expect(findFirst.mock.calls[0][0].where.NOT).toBeDefined();
    expect(findFirst.mock.calls[1][0].where.accountNo).toBe('5030');
  });

  it('matches Salaries and Wages by name when 5010 and 5030 rows missing', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'alt',
        accountNo: '5031',
        accountName: 'Salaries and Wages',
        accountType: 'Expense',
      });
    const r = await resolveSalariesAndWagesExpenseAccount(db());
    expect(r.accountNo).toBe('5031');
    expect(r.accountName).toContain('Salaries');
    expect(findFirst).toHaveBeenCalled();
  });

  it('throws clear error when 5010/5030 cannot be resolved (never picks random 5xxx)', async () => {
    findFirst.mockResolvedValue(null);
    create.mockRejectedValueOnce(new Error('Unique constraint failed')).mockRejectedValueOnce(new Error('Unique constraint failed'));

    await expect(resolveSalariesAndWagesExpenseAccount(db())).rejects.toThrow(
      /5010.*Payroll Expense|5030.*Salaries and Wages/i
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountNo: '5010', accountName: 'Payroll Expense (Gross Pay)' }),
      })
    );
  });

  it('creates 5010 when missing and create succeeds', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValueOnce(salaries5010);
    const r = await resolveSalariesAndWagesExpenseAccount(db());
    expect(r).toEqual(salaries5010);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountNo: '5010', naturalBalance: 'DEBIT' }),
      })
    );
  });
});
