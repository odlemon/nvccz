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

const JE_LOOKUP_TTL_MS = 5 * 60 * 1000;

type JeLookupCache = {
  bankGlAccountId: string;
  currencyId: string;
  loadedAt: number;
};

const kpiAccountIdCache = new Map<string, { id: string; loadedAt: number }>();
let jeLookupCache: JeLookupCache | null = null;

async function resolvePerformanceJournalAccounts(accountNo: string): Promise<{
  bankGlAccountId: string;
  currencyId: string;
  kpiAccountId: string;
} | null> {
  const now = Date.now();
  let bankGlAccountId: string | undefined;
  let currencyId: string | undefined;

  const counterSetting = await prisma.performanceSetting.findUnique({ where: { settingKey: "accounting.performanceCounterAccount" } }).catch(() => null);
  const counterNo = counterSetting && counterSetting.value ? String(counterSetting.value).trim() : "";
  if (counterNo) {
    const acc = await prisma.chartOfAccounts.findFirst({ where: { accountNo: counterNo, isActive: true }, select: { id: true } });
    if (!acc) throw new Error(`The counter-account ${counterNo} set in Performance settings is not an active account.`);
    const currency = (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } })) || (await prisma.currency.findFirst({ where: { code: "USD", isActive: true }, select: { id: true } })) || (await prisma.currency.findFirst({ where: { isActive: true }, select: { id: true } }));
    if (!currency) return null;
    bankGlAccountId = acc.id;
    currencyId = currency.id;
  } else if (jeLookupCache && now - jeLookupCache.loadedAt < JE_LOOKUP_TTL_MS) {
    bankGlAccountId = jeLookupCache.bankGlAccountId;
    currencyId = jeLookupCache.currencyId;
  } else {
    const [bank, defaultCurrency, usdCurrency, anyCurrency] = await Promise.all([
      prisma.bank.findFirst({
        where: { isActive: true, glAccountId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { glAccountId: true }
      }),
      prisma.currency.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } }),
      prisma.currency.findFirst({ where: { code: "USD", isActive: true }, select: { id: true } }),
      prisma.currency.findFirst({ where: { isActive: true }, select: { id: true } })
    ]);
    const currency = defaultCurrency || usdCurrency || anyCurrency;
    if (!bank?.glAccountId || !currency?.id) {
      return null;
    }
    bankGlAccountId = bank.glAccountId;
    currencyId = currency.id;
    jeLookupCache = { bankGlAccountId, currencyId, loadedAt: now };
  }

  const cachedAccount = kpiAccountIdCache.get(accountNo);
  let kpiAccountId: string | undefined;
  if (cachedAccount && now - cachedAccount.loadedAt < JE_LOOKUP_TTL_MS) {
    kpiAccountId = cachedAccount.id;
  } else {
    const kpiAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo, isActive: true },
      select: { id: true }
    });
    if (!kpiAccount?.id) {
      return null;
    }
    kpiAccountId = kpiAccount.id;
    kpiAccountIdCache.set(accountNo, { id: kpiAccountId, loadedAt: now });
  }

  return { bankGlAccountId: bankGlAccountId!, currencyId: currencyId!, kpiAccountId: kpiAccountId! };
}

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
    // Posting is per progress event now (PerformanceGlPostingService). Completion no longer posts the whole achieved
    // value on top of what the events already posted (a double count): it records any progress that never went through
    // the event ledger as one catch-up event (not posted: its origin is unknown and may be the GL itself), then posts every
    // Performance-originated event not yet posted.
    try {
      const { PerformanceGlPostingService } = await import("./PerformanceGlPostingService");
      const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId }, select: { id: true, createdById: true, parentGoalId: true } });
      if (!goal || goal.parentGoalId) return;
      const agg = await prisma.performanceGoalProgressEvent.aggregate({ where: { goalId }, _sum: { amount: true } });
      const outstanding = Math.round((Number(achievedValue) - Number(agg._sum.amount || 0)) * 100) / 100;
      if (outstanding > 0.005) {
        await prisma.performanceGoalProgressEvent.create({ data: { goalId, amount: outstanding, recordedAt: new Date(), source: "catchup", sourceRef: `kpi_completion_catchup:${Date.now()}`, createdById: createdById || goal.createdById } });
      }
      const pending = await prisma.$queryRawUnsafe<Array<{ id: string }>>("SELECT `id` FROM `performance_goal_progress_events` WHERE `goal_id` = ? AND (`journal_status` IS NULL OR `journal_status` = 'failed') AND `amount` <> 0 ORDER BY `recorded_at`", goalId);
      for (const p of pending) await PerformanceGlPostingService.postEvent(p.id, createdById || goal.createdById);
      return;
    } catch (error) {
      console.error(`❌ KPI completion posting failed for goal ${goalId}:`, error);
      return;
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
    /** Skip goal re-fetch when caller already loaded goal + kpi. */
    preloadedGoal?: { kpi: Record<string, unknown>; parentGoalId?: string | null; formulaType?: string | null; title?: string; targetUnit?: string | null; createdById?: string };
    /** Return { journalEntryId, skipReason } instead of the id alone (PerformanceGlPostingService). */
    detailed?: boolean;
  }): Promise<any> {
    const done = (journalEntryId: string | null, skipReason: string | null = null) => (params.detailed ? { journalEntryId, skipReason } : journalEntryId);
    // a negative amount is a correction: the same two accounts with the sides swapped
    const signed = Math.round(Number(params.amount) * 100) / 100;
    const reversing = signed < 0;
    const goal =
      params.preloadedGoal ??
      (await prisma.performanceGoal.findUnique({
        where: { id: params.goalId },
        include: { kpi: true }
      }));
    if (!goal?.kpi) return done(null, "The goal has no KPI.");

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
    let ref = performanceProgressJournalReference(params.goalId, params.eventId);

    const existingPosted = await prisma.journalEntry.findFirst({
      where: { referenceNumber: ref, status: "POSTED" },
      select: { id: true }
    });
    if (existingPosted) {
      console.log(`⏭️ Performance progress journal already posted: ${ref}`);
      return done(existingPosted.id);
    }
    // the event's journal was voided in Accounting and is being posted again: the reference is unique, so re-post under a suffix
    const voidedBefore = await prisma.journalEntry.count({ where: { referenceNumber: { startsWith: ref }, status: "VOID" } });
    if (voidedBefore) ref = `${ref}-R${voidedBefore + 1}`.slice(0, 191);

    const skipReason = getKpiProgressJournalSkipReasonFromProfile(profile, {
      parentGoalId: goal.parentGoalId,
      formulaType: goal.formulaType,
      amount: Math.abs(signed)
    });
    if (skipReason) {
      console.log(`⏭️ Performance progress journal skipped for goal ${params.goalId}: ${skipReason}`);
      return done(null, skipReason);
    }

    const accountNo = profile.accountNumber;
    const journalEntryType = reversing ? (profile.journalEntryType === "Debit" ? "Credit" : "Debit") : profile.journalEntryType;
    if (!accountNo || !journalEntryType) {
      throw new Error(`KPI ${profile.code} has no GL account mapping for progress journals.`);
    }

    const accounts = await resolvePerformanceJournalAccounts(accountNo);
    if (!accounts) {
      throw new Error(`GL account ${accountNo} is not active in the chart of accounts, or no active bank has a GL account and no counter-account is set in Performance settings.`);
    }
    const { bankGlAccountId, currencyId, kpiAccountId } = accounts;

    const amount = Math.abs(signed);
    const posterId = params.actorId || goal.createdById;

    const journalEntry = await createJournalEntryWithAuditSequence({
      transactionDate: params.recordedAt,
      referenceNumber: ref,
      description:
        `${reversing ? "Performance correction (reversal)" : "Performance"}: ${goal.title} — ${goal.kpi.name} — ${reversing ? "-" : ""}${amount} ${goal.targetUnit || ""}`.trim(),
      totalAmount: amount,
      currencyId,
      status: "POSTED",
      createdById: posterId,
      // The KPI's account takes the KPI's side (revenue credited, expense debited); the counter-account takes the other.
      // (The previous line layout put a Credit-side KPI's amount on the debit of its own account, inverting every
      // revenue / liability posting.)
      journalEntryLines: {
        create: [
          {
            chartOfAccountId: kpiAccountId,
            debitAmount: journalEntryType === "Debit" ? amount : 0,
            creditAmount: journalEntryType === "Credit" ? amount : 0,
            description: `Performance KPI: ${goal.kpi.name}`
          },
          {
            chartOfAccountId: bankGlAccountId,
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
    return done(journalEntry.id);
  }
}
