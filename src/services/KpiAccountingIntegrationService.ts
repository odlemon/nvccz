// @ts-nocheck
import { prisma } from "../utils/database";
import { createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";
import { resolveKpiAccountingConfig } from "../utils/kpiCatalogMetadata";

/** Stable reference — one posted JE per performance goal. */
export function kpiGoalJournalReference(goalId: string): string {
  return `KPI-GOAL-${goalId}`;
}

const PAYROLL_KPI_CODE = "PAYROLL_EXPENSE";

export type KpiJournalSkipInput = {
  parentGoalId: string | null;
  kpiCode: string | null;
  formulaType: string | null;
  isFinancial: boolean;
  accountNumber?: string | null;
  achievedValue: number;
  hasPostedJournalForGoal: boolean;
};

/** Pure rules for when KPI completion must not create a GL journal. */
export function getKpiJournalSkipReason(input: KpiJournalSkipInput): string | null {
  if (input.hasPostedJournalForGoal) {
    return "journal already posted for this goal";
  }
  if (input.parentGoalId) {
    return "sub-goal; accounting posts at parent rollup only";
  }
  const code = (input.kpiCode || "").toUpperCase();
  const formula = (input.formulaType || "").toUpperCase();
  if (code === PAYROLL_KPI_CODE || formula === PAYROLL_KPI_CODE) {
    return "payroll expense is recorded by PayrollService, not KPI achievement";
  }
  if (!input.isFinancial || !input.accountNumber) {
    return "KPI is not financial or has no GL account mapping";
  }
  if (!Number.isFinite(input.achievedValue) || input.achievedValue <= 0) {
    return "non-positive achieved value";
  }
  return null;
}

/**
 * Posts a single idempotent journal when a financial KPI goal is achieved.
 * Payroll KPIs are excluded (PayrollService owns 5010/5030). Sub-goals never post.
 */
export class KpiAccountingIntegrationService {
  static async triggerKpiAchievementJournal(
    goalId: string,
    achievedValue: number,
    createdById?: string
  ): Promise<void> {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: { kpi: true },
      });

      if (!goal?.kpi) {
        return;
      }

      const kpiConfig = resolveKpiAccountingConfig(goal.kpi);
      const ref = kpiGoalJournalReference(goalId);

      const existingPosted = await prisma.journalEntry.findFirst({
        where: { referenceNumber: ref, status: "POSTED" },
        select: { id: true },
      });

      const skipReason = getKpiJournalSkipReason({
        parentGoalId: goal.parentGoalId,
        kpiCode: goal.kpi.code,
        formulaType: goal.formulaType,
        isFinancial: Boolean(kpiConfig?.isFinancial),
        accountNumber: kpiConfig?.accountNumber,
        achievedValue,
        hasPostedJournalForGoal: Boolean(existingPosted),
      });

      if (skipReason) {
        console.log(`⏭️ KPI journal skipped for goal ${goalId}: ${skipReason}`);
        return;
      }

      const bank = await prisma.bank.findFirst({
        where: { isActive: true, glAccountId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { glAccountId: true },
      });
      if (!bank?.glAccountId) {
        throw new Error("No active bank with a GL account linked (banks.glAccountId).");
      }

      const kpiAccount = await prisma.chartOfAccounts.findFirst({
        where: { accountNo: kpiConfig!.accountNumber, isActive: true },
        select: { id: true },
      });
      if (!kpiAccount) {
        throw new Error(`No active chart account found for KPI account number ${kpiConfig!.accountNumber}.`);
      }

      const currency =
        (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } })) ||
        (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } })) ||
        (await prisma.currency.findFirst({ where: { isActive: true } }));

      if (!currency) {
        throw new Error("No active currency found for KPI journal entry.");
      }

      const posterId = createdById || goal.createdById;
      const amount = achievedValue;
      const journalEntryType = kpiConfig!.journalEntryType;

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: ref,
        description: `KPI Achievement: ${goal.title} - ${amount} ${goal.targetUnit || ""}`.trim(),
        totalAmount: amount,
        currencyId: currency.id,
        status: "POSTED",
        createdById: posterId,
        journalEntryLines: {
          create: [
            {
              chartOfAccountId: journalEntryType === "Debit" ? kpiAccount.id : bank.glAccountId,
              debitAmount: journalEntryType === "Debit" ? amount : 0,
              creditAmount: journalEntryType === "Credit" ? amount : 0,
              description: `KPI: ${goal.kpi.name}`,
            },
            {
              chartOfAccountId: journalEntryType === "Credit" ? kpiAccount.id : bank.glAccountId,
              debitAmount: journalEntryType === "Credit" ? amount : 0,
              creditAmount: journalEntryType === "Debit" ? amount : 0,
              description: `KPI: ${goal.kpi.name}`,
            },
          ],
        },
      });

      console.log(
        `✅ KPI journal posted for goal ${goalId}: ${journalEntry.referenceNumber} (${journalEntry.id})`
      );
    } catch (error) {
      console.error(`❌ Failed to post KPI journal for goal ${goalId}:`, error);
    }
  }
}
