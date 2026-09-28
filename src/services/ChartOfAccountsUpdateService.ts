import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { naturalBalanceForAccountType } from "../utils/chartOfAccountsNaturalBalance";
import {
  CHART_VALID_ACCOUNT_TYPES,
  CHART_VALID_FINANCIAL_STATEMENTS,
  validateChartAccountNumberForType,
} from "../utils/chartOfAccountsNumberRange";

/**
 * Shared Chart of Accounts update/validate logic — the single real implementation behind
 * PUT/PATCH /api/accounting/chart-of-accounts/:id (see ChartOfAccountsController.updateChartOfAccounts).
 *
 * Extracted so the privileged (direct-apply) controller path and the approval-gated path
 * (ApprovalService.updateEntityStatusAfterApproval, stageType "MASTER_DATA_COA") both run through
 * exactly the same validation and mutation instead of duplicating it. Accepts an optional Prisma
 * transaction client so it can participate in the approval transaction atomically.
 */

const VALID_ACCOUNT_TYPES = new Set<string>(CHART_VALID_ACCOUNT_TYPES);
const VALID_FINANCIAL_STATEMENTS = new Set<string>(CHART_VALID_FINANCIAL_STATEMENTS);

export interface ChartOfAccountsUpdatePatch {
  accountNo?: string;
  accountName?: string;
  accountType?: string;
  financialStatement?: string;
  notes?: string | null;
  parentId?: string | null;
  isActive?: boolean;
  naturalBalance?: string;
  [key: string]: unknown;
}

export type ChartOfAccountsUpdateResult =
  | { ok: true; data: any }
  | { ok: false; status: number; message: string };

const UPDATABLE_KEYS = [
  "accountNo",
  "accountName",
  "accountType",
  "financialStatement",
  "notes",
  "parentId",
  "isActive",
  "naturalBalance",
] as const;

/** Cheap shape check shared by the direct-apply path and the pending-approval path (avoids queuing an empty change). */
export function hasChartOfAccountsUpdatableField(patch: ChartOfAccountsUpdatePatch | null | undefined): boolean {
  return UPDATABLE_KEYS.some((k) => patch != null && Object.prototype.hasOwnProperty.call(patch, k));
}

/** Every check applyChartOfAccountsUpdate makes, without changing anything (a change sent for approval is checked now). */
export function validateChartOfAccountsUpdate(id: string, patch: ChartOfAccountsUpdatePatch | null | undefined) {
  return applyChartOfAccountsUpdate(id, patch, undefined, true);
}

export async function applyChartOfAccountsUpdate(
  id: string,
  patch: ChartOfAccountsUpdatePatch | null | undefined,
  tx?: Prisma.TransactionClient,
  dryRun = false
): Promise<ChartOfAccountsUpdateResult> {
  const db: any = tx ?? prisma;
  const {
    accountNo,
    accountName,
    accountType,
    financialStatement,
    notes,
    parentId,
    isActive,
    naturalBalance: bodyNaturalBalance,
  } = patch || ({} as ChartOfAccountsUpdatePatch);

  if (!hasChartOfAccountsUpdatableField(patch)) {
    return {
      ok: false,
      status: 422,
      message:
        "No updatable fields provided. Send at least one of: accountNo, accountName, accountType, financialStatement, notes, parentId, isActive.",
    };
  }

  const existingAccount = await db.chartOfAccounts.findUnique({ where: { id } });
  if (!existingAccount) {
    return { ok: false, status: 404, message: "Chart of accounts not found" };
  }

  const typeForNaturalBalance = accountType || existingAccount.accountType;
  const expectedNaturalBalance = naturalBalanceForAccountType(typeForNaturalBalance);
  if (
    bodyNaturalBalance != null &&
    bodyNaturalBalance !== "" &&
    bodyNaturalBalance !== expectedNaturalBalance
  ) {
    return {
      ok: false,
      status: 400,
      message: `Natural balance for "${typeForNaturalBalance}" is ${expectedNaturalBalance} and cannot be changed.`,
    };
  }

  if (accountType) {
    if (!VALID_ACCOUNT_TYPES.has(accountType)) {
      return {
        ok: false,
        status: 400,
        message:
          "Invalid account type. Must be one of: Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income",
      };
    }
  }

  const typeChanging = Boolean(accountType && accountType !== existingAccount.accountType);
  const financialStatementChanging = Boolean(
    financialStatement && financialStatement !== existingAccount.financialStatement
  );

  if (typeChanging || financialStatementChanging) {
    const journalLineCount = await db.journalEntryLine.count({
      where: { chartOfAccountId: id },
    });
    if (journalLineCount > 0) {
      if (typeChanging) {
        return {
          ok: false,
          status: 409,
          message:
            `Cannot change account type from "${existingAccount.accountType}" to "${accountType}" because this account has ${journalLineCount} journal line(s). ` +
            `Reclassifying would misstate historical profit and loss and balance sheet reporting. ` +
            `Create a new chart account and post a transfer journal if reclassification is required.`,
        };
      }
      return {
        ok: false,
        status: 409,
        message:
          `Cannot change financial statement classification because this account has ${journalLineCount} journal line(s). ` +
          `Historical statements would no longer tie to the original presentation. ` +
          `Create a new account and transfer balances if presentation must change.`,
      };
    }
  }

  const accountNoToValidate = accountNo || existingAccount.accountNo;
  const accountTypeToValidate = accountType || existingAccount.accountType;
  const accountNumberValidation = validateChartAccountNumberForType(accountNoToValidate, accountTypeToValidate);
  if (!accountNumberValidation.valid) {
    return {
      ok: false,
      status: 400,
      message: accountNumberValidation.message || "Account number range does not match account type",
    };
  }

  if (financialStatement) {
    if (!VALID_FINANCIAL_STATEMENTS.has(financialStatement)) {
      return {
        ok: false,
        status: 400,
        message:
          "Invalid financial statement. Must be one of: Balance Sheet, Income Statement, Cash Flow / Tracking, Income Statement / Cash Flow",
      };
    }
  }

  if (accountNo && accountNo !== existingAccount.accountNo) {
    const duplicateAccount = await db.chartOfAccounts.findUnique({ where: { accountNo } });
    if (duplicateAccount) {
      return { ok: false, status: 409, message: "Account number already exists" };
    }
  }

  if (parentId !== undefined) {
    if (parentId === id) {
      return { ok: false, status: 400, message: "Account cannot be its own parent" };
    }
    if (parentId) {
      const parentAccount = await db.chartOfAccounts.findUnique({ where: { id: parentId } });
      if (!parentAccount) {
        return { ok: false, status: 400, message: "Parent account not found" };
      }
    }
  }

  // switching an account off: nothing may still depend on it
  if (isActive === false && existingAccount.isActive !== false) {
    // per currency: amounts are not translated to one currency yet (FX-01)
    const bals: any[] = await db.$queryRawUnsafe(
      `SELECT c.code AS code, COALESCE(SUM(l.debitAmount),0) - COALESCE(SUM(l.creditAmount),0) AS net
         FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journalEntryId
         LEFT JOIN currencies c ON c.id = COALESCE(l.recorded_currency_id, j.currencyId)
        WHERE l.chartOfAccountId = ? AND j.status = 'POSTED'
        GROUP BY c.code`, id);
    const open = bals.filter((b) => Math.abs(Number(b.net || 0)) > 0.005);
    if (open.length) {
      return { ok: false, status: 409, message: `${existingAccount.accountNo} ${existingAccount.accountName} still has a balance (${open.map((b) => `${b.code || ""} ${Number(b.net).toFixed(2)}`.trim()).join(", ")}); move it to another account before switching this one off.` };
    }
    const drafts = await db.journalEntryLine.count({ where: { chartOfAccountId: id, journalEntry: { status: "PENDING" } } });
    if (drafts > 0) {
      return { ok: false, status: 409, message: `${drafts} journal line(s) waiting to be posted use this account; post or withdraw them first.` };
    }
    const banks = await db.bank.count({ where: { glAccountId: id, isActive: true } });
    if (banks > 0) {
      return { ok: false, status: 409, message: "An active bank account posts to this account; switch the bank off first." };
    }
    const children = await db.chartOfAccounts.count({ where: { parentId: id, isActive: true } });
    if (children > 0) {
      return { ok: false, status: 409, message: `${children} active account(s) sit under this one; switch them off or move them first.` };
    }
  }

  if (dryRun) return { ok: true, data: existingAccount };

  const updatedChartOfAccounts = await db.chartOfAccounts.update({
    where: { id },
    data: {
      ...(accountNo && { accountNo }),
      ...(accountName && { accountName }),
      ...(accountType && { accountType }),
      ...(financialStatement && { financialStatement }),
      ...(notes !== undefined && { notes }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return { ok: true, data: updatedChartOfAccounts };
}
