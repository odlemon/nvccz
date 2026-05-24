// @ts-nocheck
import { prisma } from "../utils/database";
import { createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";
import { resolveKpiAccountingConfig } from "../utils/kpiCatalogMetadata";
import {
  getKpiProgressJournalSkipReasonFromProfile,
  resolveKpiFinancialProfile
} from "./kpiFinancialAccountingRules";

/** Stable reference — one posted JE per performance goal (legacy completion path). */
export function kpiGoalJournalReference(goalId: string): string {
  return `KPI-GOAL-${goalId}`;
}

/** One posted JE per progress event (performance module). */
export function performanceProgressJournalReference(goalId: string, eventId: string): string {
  const ref = `PERF-GOAL-${goalId}-${eventId}`;
  return ref.length > 191 ? ref.slice(0, 191) : ref;
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

export type KpiProgressJournalSkipInput = {
  parentGoalId: string | null;
  kpiCode: string | null;
  formulaType: string | null;
  isFinancial: boolean;
  accountNumber?: string | null;
  amount: number;
};

export function getKpiProgressJournalSkipReason(input: KpiProgressJournalSkipInput): string | null {
  const profile = resolveKpiFinancialProfile({
    name: "",
    code: input.kpiCode,
    catalogDescription: null,
    catalogDepartmentName: null,
    accountType: null,
    accountNumber: input.accountNumber ?? null,
    journalEntryType: null,
    isFinancial: input.isFinancial
  });
  if (input.formulaType) {
    const formula = String(input.formulaType).toUpperCase();
    if (formula === PAYROLL_KPI_CODE || formula === "NET_PROFIT") {
      const formulaProfile = resolveKpiFinancialProfile({
        name: "",
        code: formula,
        catalogDescription: null,
        catalogDepartmentName: null,
        accountType: null,
        accountNumber: input.accountNumber ?? null,
        journalEntryType: null,
        isFinancial: true
      });
      return getKpiProgressJournalSkipReasonFromProfile(formulaProfile, {
        parentGoalId: input.parentGoalId,
        formulaType: input.formulaType,
        amount: input.amount
      });
    }
  }
  return getKpiProgressJournalSkipReasonFromProfile(profile, {
    parentGoalId: input.parentGoalId,
    formulaType: input.formulaType,
    amount: input.amount
  });
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

  /**
   * Posts an incremental journal for a single progress event (task / activity / manual).
   * Returns journal entry id when posted.
   */
  static async postPerformanceProgressJournal(params: {
    goalId: string;
    eventId: string;
    amount: number;
    recordedAt: Date;
    actorId: string;
  }): Promise<string | null> {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: params.goalId },
      include: { kpi: true }
    });
    if (!goal?.kpi) return null;

    const profile = resolveKpiFinancialProfile({
      name: goal.kpi.name,
      code: goal.kpi.code,
      catalogDescription: goal.kpi.catalogDescription ?? null,
      catalogDepartmentName: goal.kpi.catalogDepartmentName ?? null,
      accountType: goal.kpi.accountType,
      accountNumber: goal.kpi.accountNumber,
      journalEntryType: goal.kpi.journalEntryType,
      isFinancial: goal.kpi.isFinancial
    });
    const ref = performanceProgressJournalReference(params.goalId, params.eventId);

    const existingPosted = await prisma.journalEntry.findFirst({
      where: { referenceNumber: ref, status: "POSTED" },
      select: { id: true }
    });
    if (existingPosted) {
      console.log(`⏭️ Performance progress journal already posted: ${ref}`);
      return existingPosted.id;
    }

    const skipReason = getKpiProgressJournalSkipReasonFromProfile(profile, {
      parentGoalId: goal.parentGoalId,
      formulaType: goal.formulaType,
      amount: params.amount
    });
    if (skipReason) {
      console.log(`⏭️ Performance progress journal skipped for goal ${params.goalId}: ${skipReason}`);
      return null;
    }

    const bank = await prisma.bank.findFirst({
      where: { isActive: true, glAccountId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { glAccountId: true }
    });
    if (!bank?.glAccountId) {
      throw new Error("No active bank with a GL account linked (banks.glAccountId).");
    }

    const accountNo = profile.accountNumber;
    const journalEntryType = profile.journalEntryType;
    if (!accountNo || !journalEntryType) {
      throw new Error(`KPI ${profile.code} has no GL account mapping for progress journals.`);
    }

    const kpiAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo, isActive: true },
      select: { id: true }
    });
    if (!kpiAccount) {
      throw new Error(`No active chart account found for KPI account number ${accountNo}.`);
    }

    const currency =
      (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } })) ||
      (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } })) ||
      (await prisma.currency.findFirst({ where: { isActive: true } }));

    if (!currency) {
      throw new Error("No active currency found for KPI journal entry.");
    }

    const amount = params.amount;
    const posterId = params.actorId || goal.createdById;

    const journalEntry = await createJournalEntryWithAuditSequence({
      transactionDate: params.recordedAt,
      referenceNumber: ref,
      description:
        `Performance: ${goal.title} — ${goal.kpi.name} — ${amount} ${goal.targetUnit || ""}`.trim(),
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
            description: `Performance KPI: ${goal.kpi.name}`
          },
          {
            chartOfAccountId: journalEntryType === "Credit" ? kpiAccount.id : bank.glAccountId,
            debitAmount: journalEntryType === "Credit" ? amount : 0,
            creditAmount: journalEntryType === "Debit" ? amount : 0,
            description: `Performance KPI: ${goal.kpi.name}`
          }
        ]
      }
    });

    console.log(
      `✅ Performance progress journal posted for goal ${params.goalId}: ${journalEntry.referenceNumber} (${journalEntry.id})`
    );
    return journalEntry.id;
  }
}
