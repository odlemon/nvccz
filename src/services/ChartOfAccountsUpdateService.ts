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

export async function applyChartOfAccountsUpdate(
  id: string,
  patch: ChartOfAccountsUpdatePatch | null | undefined,
  tx?: Prisma.TransactionClient
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
