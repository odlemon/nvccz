// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import {
  deriveGoalProgressState
} from "./performanceGoalRollupUtils";
import {
  diversitySpreadFromPercents,
  safeGrowthPercent,
  safeRatioPercent,
  toPositiveNumber
} from "./bscDigitalEntryMath";
import {
  legacyProgressFieldsForGoal,
  parseProgressBaseline,
  PerformanceGoalService
} from "./PerformanceGoalService";
import { resolveGoalEscalationStatus, round, toNumber } from "./performanceScorecardSupport";
import { getPostedPeriodRevenueExpenseNetProfit } from "./AccountingGlPeriodTotalsService";

const BSC_FREQ = new Set(["MONTHLY", "QUARTERLY", "ANNUAL", "YEARLY", "ANNUALLY"]);

/** Same calendar window one year earlier (for YoY revenue growth %). */
function priorYearSameWindow(periodStart: Date, periodEnd: Date): { priorStart: Date; priorEnd: Date } {
  return {
    priorStart: new Date(
      Date.UTC(
        periodStart.getUTCFullYear() - 1,
        periodStart.getUTCMonth(),
        periodStart.getUTCDate(),
        periodStart.getUTCHours(),
        periodStart.getUTCMinutes(),
        periodStart.getUTCSeconds(),
        periodStart.getUTCMilliseconds()
      )
    ),
    priorEnd: new Date(
      Date.UTC(
        periodEnd.getUTCFullYear() - 1,
        periodEnd.getUTCMonth(),
        periodEnd.getUTCDate(),
        periodEnd.getUTCHours(),
        periodEnd.getUTCMinutes(),
        periodEnd.getUTCSeconds(),
        periodEnd.getUTCMilliseconds()
      )
    )
  };
}

/** Columns needed for BSC apply path (avoids loading full goal rows). */
const GOAL_APPLY_SELECT = {
  id: true,
  parentGoalId: true,
  kpiId: true,
  startDate: true,
  endDate: true,
  targetValue: true,
  targetOperator: true,
  isReverseKpi: true,
  progressPercentage: true,
  syncConfig: true,
  activities: true,
  monetaryValue: true,
  percentValue: true,
  targetUnit: true,
  preciseTargetValue: true,
  preciseCurrentValue: true,
  currentValue: true,
  allowableVariance: true,
  performanceRiskZone: true
} as const;

function normalizeFrequency(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  const u = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (u === "YEARLY" || u === "ANNUALLY") return "ANNUAL";
  return BSC_FREQ.has(u) ? u : String(raw).trim();
}

function mergeSyncConfig(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

type EntryValidationRule = {
  expectedLabel: string;
  formulaTypes?: string[];
  kpiNameHints?: string[];
  kpiTypeHints?: string[];
  textHints?: string[];
};

const ENTRY_VALIDATION_RULES: Record<string, EntryValidationRule> = {
  FINANCIAL_OUTCOME_ROI: {
    expectedLabel: "ROI / return on investment",
    formulaTypes: ["ROI"],
    kpiNameHints: ["roi", "return on investment", "total revenue", "net profit"],
    textHints: ["roi", "return on investment"]
  },
  INTERNAL_PROCESS_FUNDING_RATE: {
    expectedLabel: "funding-rate style KPI",
    formulaTypes: ["FUNDING_RATE", "PROJECTS_FUNDED", "CAPITAL_DISBURSED"],
    kpiNameHints: ["funding", "disburs", "projects funded", "capital"],
    textHints: ["funding rate", "projects funded", "capital disbursed", "disbursement"]
  },
  STAKEHOLDER_SURVEY: {
    expectedLabel: "survey / satisfaction KPI",
    formulaTypes: ["SURVEY_AVERAGE", "STAKEHOLDER_SATISFACTION_INDEX", "CUSTOMER_SATISFACTION_INDEX"],
    kpiNameHints: ["survey", "satisfaction", "stakeholder", "customer satisfaction"],
    textHints: ["survey", "satisfaction", "stakeholder"]
  },
  PARTNERSHIPS_SIGNED: {
    expectedLabel: "partnership / MOU counter",
    textHints: ["partnership", "mou", "memorandum"]
  },
  SERVICE_DELIVERY_CUSTOMER_CHARTER: {
    expectedLabel: "customer charter KPI",
    formulaTypes: ["CHARTER_SCORE"],
    textHints: ["charter", "service delivery"]
  },
  JOBS_CREATED_AGGREGATE: {
    expectedLabel: "jobs-created KPI",
    textHints: ["jobs created", "employment", "full-time hires", "national impact"]
  },
  RESOURCE_BUDGET_ALIGNMENT: {
    expectedLabel: "budget alignment / strategic allocation KPI",
    formulaTypes: ["STRATEGIC_ALLOCATION_COMPLIANCE", "ALLOCATION_COMPLIANCE"],
    kpiNameHints: ["budget", "allocation", "expense", "utilisation", "utilization"],
    textHints: ["budget", "allocation", "variance", "compliance"]
  },
  INCLUSION_DIVERSITY_REPORTING: {
    expectedLabel: "inclusion / diversity KPI",
    /** Avoid matching **Debt–equity ratio** (contains "equity" but is a financial ratio, not D&I). */
    textHints: ["inclusion", "diversity", "inclusive", "inclusivity", "gender"]
  },
  ACCOUNTING_GL_REVENUE_PERIOD: {
    expectedLabel: "revenue KPI",
    kpiNameHints: ["revenue", "income"],
    textHints: ["revenue", "income"]
  },
  ACCOUNTING_GL_NET_PROFIT_PERIOD: {
    expectedLabel: "net-profit KPI",
    kpiNameHints: ["net profit", "profit", "ebit", "earnings"],
    textHints: ["net profit", "profit", "earnings"]
  },
  STATUTORY_REPORTS_OUTPUT: {
    expectedLabel: "statutory reports KPI",
    formulaTypes: ["STATUTORY_REPORTS"],
    textHints: ["statutory", "reports produced", "compliance report"]
  },
  GOVERNANCE_CHECKLIST_INDEX: {
    expectedLabel: "governance index KPI",
    formulaTypes: ["CORPORATE_GOVERNANCE_INDEX", "GOVERNANCE_INDEX"],
    textHints: ["governance", "checklist"]
  },
  PROCUREMENT_PLAN_COMPLIANCE: {
    expectedLabel: "procurement compliance KPI",
    kpiNameHints: ["procurement", "purchase order", "supplier"],
    textHints: ["procurement", "purchase order", "po compliance"]
  },
  EASE_OF_DOING_BUSINESS_PROGRESS: {
    expectedLabel: "ease-of-doing-business KPI",
    formulaTypes: ["EASE_OF_DOING_BUSINESS", "E_GOVERNMENT_FLAGSHIPS"],
    textHints: ["ease of doing business", "innovation", "e-government"]
  },
  SKILLS_DEVELOPMENT_PROGRESS: {
    expectedLabel: "skills development KPI",
    kpiNameHints: ["skills", "training", "capacity"],
    textHints: ["skills", "training", "certificate", "capacity"]
  },
  CSR_PARTICIPATION_RATE: {
    expectedLabel: "CSR participation KPI",
    kpiNameHints: ["csr", "inclusive", "environment", "community", "participation"],
    textHints: ["csr", "participation", "community", "clean environment", "inclusive programming"]
  },
  PAYROLL_NEW_HIRE_COUNTER: {
    expectedLabel: "vacant-post/new-hire KPI",
    textHints: ["vacant post", "new hire", "headcount", "recruitment"]
  },
  HR_TRAINING_CERTIFICATE_APPROVED: {
    expectedLabel: "training certificate / skills KPI",
    textHints: ["training", "certificate", "skills development"]
  }
};

function normaliseFormulaType(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

async function assertGoalMatchesEntryKind(goalId: string, entryKind: string): Promise<void> {
  const rule = ENTRY_VALIDATION_RULES[entryKind];
  if (!rule) return;

  const goal = await prisma.performanceGoal.findUnique({
    where: { id: goalId },
    select: {
      id: true,
      title: true,
      formulaType: true,
      kpi: { select: { name: true, unitCategory: true } }
    }
  });
  if (!goal) throw new Error("Performance goal not found");

  const goalFormula = normaliseFormulaType(goal.formulaType);
  const formulas = (rule.formulaTypes || []).map((f) => normaliseFormulaType(f));
  const hasFormulaMatch = formulas.length > 0 && formulas.includes(goalFormula);

  const haystack = [goal.title, goal.kpi?.name, goal.kpi?.unitCategory]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" | ");
  const hints = (rule.textHints || []).map((h) => String(h).toLowerCase());
  const hasTextHintMatch = hints.length > 0 && hints.some((h) => haystack.includes(h));

  const kpiName = String(goal.kpi?.name || "").toLowerCase();
  const kpiUnitCat = String(goal.kpi?.unitCategory || "").toLowerCase();
  const kpiNameHints = (rule.kpiNameHints || []).map((h) => String(h).toLowerCase());
  const kpiTypeHints = (rule.kpiTypeHints || []).map((h) => String(h).toLowerCase());
  const hasKpiNameMatch = kpiNameHints.length > 0 && kpiNameHints.some((h) => kpiName.includes(h));
  const hasKpiTypeMatch = kpiTypeHints.length > 0 && kpiTypeHints.some((h) => kpiUnitCat.includes(h));

  const formulaOrKpi = hasFormulaMatch || hasKpiNameMatch || hasKpiTypeMatch;
  const passes = formulas.length > 0 ? formulaOrKpi || hasTextHintMatch : hasKpiNameMatch || hasTextHintMatch;
  if (passes) return;

  const goalName = String(goal.title || "this goal");
  throw new Error(
    `This goal does not match this endpoint. "${goalName}" is not set up for ${rule.expectedLabel}. Please choose a goal aligned to this KPI.`
  );
}

async function applyNumericActualToGoal(params: {
  goalId: string;
  currentValue: number;
  responsibleUserId: string | null | undefined;
  entryKind: string;
  frequency?: string;
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  performanceRiskZone?: string | null;
  syncExtra?: Record<string, unknown>;
  currencyCode?: string | null;
  monetaryFieldsForAudit?: Record<string, unknown>;
  /** When set, skips a duplicate findUnique (callers that already loaded the same select). */
  preloadedGoal?: Record<string, unknown> | null;
}) {
  await assertGoalMatchesEntryKind(params.goalId, params.entryKind);

  const goal =
    params.preloadedGoal ??
    (await prisma.performanceGoal.findUnique({
      where: { id: params.goalId },
      select: GOAL_APPLY_SELECT
    }));
  if (!goal) throw new Error("Performance goal not found");

  const progressState = deriveGoalProgressState({
    currentValue: params.currentValue,
    targetValue: goal.targetValue,
    targetOperator: goal.targetOperator,
    isReverseKpi: goal.isReverseKpi,
    previousStage: goal.stage,
    progressPercentage: goal.progressPercentage
  });
  const progressPercentage = progressState.progressPercentageNum;
  const stage = progressState.stage;
  const status = progressState.status;
  const met = progressState.isTargetMet;

  const syncConfig = mergeSyncConfig(goal.syncConfig, {
    bscEntryKind: params.entryKind,
    bscFrequency: params.frequency,
    bscPeriodLabel: params.periodLabel,
    bscPeriodStart: params.periodStart,
    bscPeriodEnd: params.periodEnd,
    bscUpdatedAt: new Date().toISOString(),
    bscResponsibleUserId: params.responsibleUserId,
    ...(params.currencyCode ? { bscCurrency: params.currencyCode } : {}),
    ...(params.syncExtra || {})
  });

  const legacy = legacyProgressFieldsForGoal(goal, params.currentValue);

  const riskZoneResolved =
    params.performanceRiskZone !== undefined
      ? params.performanceRiskZone
      : resolveGoalEscalationStatus({
          preciseCurrentValue: String(params.currentValue),
          currentValue: params.currentValue,
          preciseTargetValue: goal.preciseTargetValue,
          targetValue: goal.targetValue,
          allowableVariance: goal.allowableVariance,
          isReverseKpi: goal.isReverseKpi,
          endDate: goal.endDate as Date
        });

  /** Keep CEO/Board formula inputs aligned with BSC counter + goal target (same ratio as scorecard). */
  let activitiesPatch: Record<string, unknown> | undefined;
  if (params.entryKind === "STATUTORY_REPORTS_OUTPUT") {
    const existingActs =
      goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : {};
    const targetCount =
      toNumber(goal.preciseTargetValue, 0) ||
      toNumber(goal.targetValue, 0) ||
      toNumber(existingActs.targetCount, 0);
    activitiesPatch = {
      ...existingActs,
      completedCount: params.currentValue,
      ...(targetCount > 0 ? { targetCount } : {})
    };
  } else if (params.entryKind === "GOVERNANCE_CHECKLIST_INDEX") {
    const ex = params.syncExtra || {};
    const met = Math.max(0, Math.floor(toNumber(ex.complianceItemsMet, 0)));
    const tot = Math.max(0, Math.floor(toNumber(ex.totalGovernanceRequirements, 0)));
    const existingActs =
      goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : {};
    if (tot > 0) {
      activitiesPatch = {
        ...existingActs,
        complianceItemsMet: met,
        totalGovernanceRequirements: tot
      };
    }
  } else if (params.entryKind === "EASE_OF_DOING_BUSINESS_PROGRESS") {
    const ex = params.syncExtra || {};
    const innov = Math.max(0, Math.floor(toNumber(ex.innovationsCompleted, 0)));
    const targ = Math.max(0, Math.floor(toNumber(ex.targetInnovations, 0)));
    const existingActs =
      goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : {};
    if (targ > 0 || innov > 0) {
      activitiesPatch = {
        ...existingActs,
        innovationsCompleted: innov,
        targetInnovations: targ
      };
    }
  } else if (params.entryKind === "SKILLS_DEVELOPMENT_PROGRESS") {
    const ex = params.syncExtra || {};
    const done = Math.max(0, Math.floor(toNumber(ex.completedCount, 0)));
    const plan = Math.max(0, Math.floor(toNumber(ex.targetCount, 0)));
    const existingActs =
      goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : {};
    if (plan > 0 || done > 0) {
      activitiesPatch = {
        ...existingActs,
        completedCount: done,
        targetCount: plan
      };
    }
  } else if (params.entryKind === "CSR_PARTICIPATION_RATE") {
    const ex = params.syncExtra || {};
    const done = Math.max(0, Math.floor(toNumber(ex.participantsCompleted, 0)));
    const elig = Math.max(0, Math.floor(toNumber(ex.participantsEligible, 0)));
    const existingActs =
      goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
        ? { ...(goal.activities as Record<string, unknown>) }
        : {};
    if (elig > 0 || done > 0) {
      activitiesPatch = {
        ...existingActs,
        participantsCompleted: done,
        participantsEligible: elig
      };
    }
  } else if (params.entryKind === "ACCOUNTING_GL_REVENUE_PERIOD") {
    const ex = params.syncExtra || {};
    const currR = toNumber(ex.glCurrentPeriodRevenue, NaN);
    const prevR = toNumber(ex.glPriorPeriodRevenue, NaN);
    if (Number.isFinite(currR) && Number.isFinite(prevR)) {
      const existingActs =
        goal.activities && typeof goal.activities === "object" && !Array.isArray(goal.activities)
          ? { ...(goal.activities as Record<string, unknown>) }
          : {};
      activitiesPatch = {
        ...existingActs,
        currentRevenue: currR,
        previousRevenue: prevR
      };
    }
  }

  const updated = await prisma.performanceGoal.update({
    where: { id: params.goalId },
    data: {
      currentValue: new Decimal(params.currentValue),
      preciseCurrentValue: String(params.currentValue),
      progressPercentage: new Decimal(progressPercentage),
      stage,
      status,
      performanceRiskZone: riskZoneResolved,
      performanceRiskZoneAt: new Date(),
      syncConfig,
      ...legacy,
      ...(activitiesPatch ? { activities: activitiesPatch } : {}),
      updatedAt: new Date()
    }
  });

  await AuditService.log({
    userId: params.responsibleUserId || null,
    action: `BSC_ENTRY_${params.entryKind}`,
    entityType: "PerformanceGoal",
    entityId: params.goalId,
    oldValues: {
      currentValue: goal.currentValue?.toString?.() ?? goal.currentValue,
      preciseCurrentValue: goal.preciseCurrentValue,
      progressPercentage: goal.progressPercentage?.toString?.() ?? goal.progressPercentage,
      performanceRiskZone: goal.performanceRiskZone
    },
    newValues: {
      currentValue: params.currentValue,
      preciseCurrentValue: String(params.currentValue),
      progressPercentage,
      performanceRiskZone: riskZoneResolved,
      frequency: params.frequency,
      periodLabel: params.periodLabel,
      responsibleUserId: params.responsibleUserId,
      ...params.monetaryFieldsForAudit,
      ...params.syncExtra
    }
  });

  const parentId = (goal as { parentGoalId?: string | null }).parentGoalId;
  if (parentId) {
    await PerformanceGoalService.updateParentGoalProgress(parentId).catch((err: Error) =>
      console.warn(`[BSC_ENTRY] parent rollup failed for ${params.goalId}:`, err?.message)
    );
  }
  const linkedKpiId = (goal as { kpiId?: string | null }).kpiId;
  if (linkedKpiId) {
    await PerformanceGoalService.recalculateKPIProgress(linkedKpiId).catch((err: Error) =>
      console.warn(`[BSC_ENTRY] KPI recalc failed for ${params.goalId}:`, err?.message)
    );
  }

  return { goal: updated, progressPercentage };
}

/**
 * After BSC ROI on a departmental / company leaf, push the same % onto CEO & Board
 * `formulaType: ROI` indicators for the overlapping contract period (SRD financial perspective).
 */
async function mirrorFinancialRoiToCeoBoardIndicators(params: {
  sourceGoalId: string;
  roiPercent: number;
  responsibleUserId: string | null | undefined;
  frequency?: string;
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  currencyCode?: string | null;
  netProfit: unknown;
  totalCapitalInvested: unknown;
}): Promise<{ mirroredGoalIds: string[] }> {
  const source = await prisma.performanceGoal.findUnique({
    where: { id: params.sourceGoalId },
    select: {
      startDate: true,
      endDate: true,
      performanceContract: { select: { contractType: true } }
    }
  });
  if (!source) return { mirroredGoalIds: [] };
  const srcCt = source.performanceContract?.contractType;
  if (srcCt === "CEO" || srcCt === "BOARD") {
    return { mirroredGoalIds: [] };
  }

  const mirroredGoalIds: string[] = [];
  for (const contractType of ["CEO", "BOARD"] as const) {
    const target = await prisma.performanceGoal.findFirst({
      where: {
        id: { not: params.sourceGoalId },
        formulaType: "ROI",
        performanceContract: {
          contractType,
          status: { notIn: ["ARCHIVED", "CANCELLED"] },
          periodStart: { lte: source.endDate },
          periodEnd: { gte: source.startDate }
        }
      },
      orderBy: [{ scorecardSection: "asc" }, { displayOrder: "asc" }],
      select: { id: true }
    });
    if (!target) continue;

    await applyNumericActualToGoal({
      goalId: target.id,
      currentValue: params.roiPercent,
      responsibleUserId: params.responsibleUserId ?? null,
      entryKind: "FINANCIAL_OUTCOME_ROI",
      frequency: normalizeFrequency(params.frequency),
      periodLabel: params.periodLabel,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      currencyCode: params.currencyCode,
      monetaryFieldsForAudit: {
        netProfit: params.netProfit,
        totalCapitalInvested: params.totalCapitalInvested,
        currencyCode: params.currencyCode
      },
      syncExtra: {
        computedRoiPercent: params.roiPercent,
        mirroredFromGoalId: params.sourceGoalId,
        divisionByZeroOrInvalid: false
      }
    });
    mirroredGoalIds.push(target.id);
  }
  return { mirroredGoalIds };
}

async function aggregateStrategicSpendAcrossModules(periodStart: Date, periodEnd: Date) {
  const gl = await getPostedPeriodRevenueExpenseNetProfit(periodStart, periodEnd);

  const [procRows, eventRows] = await Promise.all([
    prisma.procurementInvoice.findMany({
      where: {
        paymentStatus: { in: ["PAID", "PARTIALLY_PAID"] },
        OR: [
          { paymentDate: { gte: periodStart, lte: periodEnd } },
          { paymentDate: null, approvedAt: { gte: periodStart, lte: periodEnd } }
        ]
      },
      select: { totalAmount: true }
    }),
    prisma.eventExpense.findMany({
      where: {
        status: { in: ["APPROVED", "PAID"] },
        OR: [
          { paymentDate: { gte: periodStart, lte: periodEnd } },
          { paymentDate: null, createdAt: { gte: periodStart, lte: periodEnd } }
        ]
      },
      select: { amount: true }
    })
  ]);

  const procurementSpend = procRows.reduce(
    (sum, r) => sum + toPositiveNumber(r.totalAmount, 0),
    0
  );
  const eventsSpend = eventRows.reduce((sum, r) => sum + toPositiveNumber(r.amount, 0), 0);
  const accountingExpense = toPositiveNumber(gl.totalExpense, 0);
  const totalSpend = accountingExpense + procurementSpend + eventsSpend;

  return {
    totalSpend,
    accountingExpense,
    procurementSpend,
    eventsSpend
  };
}

export class BscDigitalEntryService {
  /** Financial outcome / ROI: (Net profit ÷ capital invested) × 100; null-safe. */
  static async submitFinancialOutcomeRoi(input: {
    goalId: string;
    netProfit: unknown;
    totalCapitalInvested: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
    periodStart?: string;
    periodEnd?: string;
    currencyCode?: string | null;
    /** When true, do not copy ROI % onto CEO/Board `ROI` indicators. */
    skipCeoBoardMirror?: boolean;
  }) {
    const net = toPositiveNumber(input.netProfit, NaN);
    const cap = toPositiveNumber(input.totalCapitalInvested, NaN);
    const roi = safeRatioPercent(net, cap);
    const currentValue = roi == null ? 0 : roi;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "FINANCIAL_OUTCOME_ROI",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currencyCode: input.currencyCode,
      monetaryFieldsForAudit: {
        netProfit: input.netProfit,
        totalCapitalInvested: input.totalCapitalInvested,
        currencyCode: input.currencyCode
      },
      syncExtra: {
        computedRoiPercent: roi,
        divisionByZeroOrInvalid: roi == null
      }
    });

    let mirroredGoalIds: string[] = [];
    if (!input.skipCeoBoardMirror && roi != null) {
      const m = await mirrorFinancialRoiToCeoBoardIndicators({
        sourceGoalId: input.goalId,
        roiPercent: currentValue,
        responsibleUserId: input.responsibleUserId,
        frequency: input.frequency,
        periodLabel: input.periodLabel,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currencyCode: input.currencyCode,
        netProfit: input.netProfit,
        totalCapitalInvested: input.totalCapitalInvested
      });
      mirroredGoalIds = m.mirroredGoalIds;
    }

    return { ...res, computedRoiPercent: roi, mirroredGoalIds };
  }

  /** Internal process funding rate: (projects funded ÷ board-approved) × 100; auto-count includes disbursements initiated (PENDING+). */
  static async submitInternalProcessFundingRate(input: {
    goalId: string;
    projectsFunded?: unknown;
    projectsApproved?: unknown;
    fundId?: string;
    periodStart?: string | Date;
    periodEnd?: string | Date;
    targetPercent?: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    let fundedN: number;
    let approvedN: number;
    let source = "manual";
    const manualProvided =
      input.projectsFunded != null &&
      input.projectsFunded !== "" &&
      input.projectsApproved != null &&
      input.projectsApproved !== "";

    // If caller supplies explicit numerator/denominator, always trust manual values.
    // Auto-count mode is only for omitted manual values.
    if (!manualProvided && input.fundId && input.periodStart && input.periodEnd) {
      source = "auto";
      const start = new Date(input.periodStart);
      const end = new Date(input.periodEnd);
      const disb = await prisma.fundDisbursement.findMany({
        where: {
          fundId: input.fundId,
          disbursementDate: { gte: start, lte: end },
          status: { in: ["PENDING", "APPROVED", "DISBURSED"] }
        },
        distinct: ["investmentImplementationId"],
        select: { investmentImplementationId: true }
      });
      fundedN = disb.length;

      const approvedRows = await prisma.boardReview.findMany({
        where: {
          investmentApproved: true,
          completedAt: { gte: start, lte: end },
          application: { fundId: input.fundId }
        },
        select: { applicationId: true }
      });
      const appSet = new Set(approvedRows.map((r) => r.applicationId));
      approvedN = appSet.size;
    } else {
      fundedN = toPositiveNumber(input.projectsFunded, 0);
      approvedN = toPositiveNumber(input.projectsApproved, 0);
    }

    const rate = safeRatioPercent(fundedN, approvedN);
    const currentValue = rate == null ? 0 : rate;
    const targetP = toPositiveNumber(input.targetPercent, NaN);
    const fundingBelowTarget =
      Number.isFinite(targetP) && rate != null && rate < targetP;

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "INTERNAL_PROCESS_FUNDING_RATE",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      periodStart:
        input.periodStart != null ? new Date(input.periodStart).toISOString() : undefined,
      periodEnd: input.periodEnd != null ? new Date(input.periodEnd).toISOString() : undefined,
      ...(fundingBelowTarget ? { performanceRiskZone: "RED" as const } : {}),
      syncExtra: {
        projectsFunded: fundedN,
        projectsApproved: approvedN,
        fundingRatePercent: rate,
        targetPercent: Number.isFinite(targetP) ? targetP : undefined,
        countSource: source,
        fundId: input.fundId
      }
    });
    return {
      ...res,
      computedFundingRatePercent: rate,
      projectsFunded: fundedN,
      projectsApproved: approvedN,
      countSource: source
    };
  }

  /** Stakeholder / M&E survey: (score ÷ scale total) × 100; optional prior period for satisfaction drop signal. */
  static async submitStakeholderSurvey(input: {
    goalId: string;
    averageScore: unknown;
    scoreTotal: unknown;
    previousAverageScore?: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
    periodStart?: string;
    periodEnd?: string;
  }) {
    if (input.averageScore == null || input.averageScore === "") {
      throw new Error("averageScore (or alias surveyAverageScore / meanScore) is required");
    }
    if (input.scoreTotal == null || input.scoreTotal === "") {
      throw new Error(
        "scoreTotal (or alias scaleMaximum / totalScalePoints / maxScore) is required"
      );
    }

    const pct = safeRatioPercent(input.averageScore, input.scoreTotal);
    const currentValue = pct == null ? 0 : pct;
    const prev = toPositiveNumber(input.previousAverageScore, NaN);
    const prevPct =
      input.previousAverageScore != null && !Number.isNaN(prev)
        ? safeRatioPercent(prev, input.scoreTotal)
        : null;
    const satisfactionDropped =
      prevPct != null && pct != null ? pct < prevPct - 0.0001 : false;

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "STAKEHOLDER_SURVEY",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      syncExtra: {
        averageScore: toPositiveNumber(input.averageScore, 0),
        scoreTotal: toPositiveNumber(input.scoreTotal, 0),
        normalizedPercent: pct,
        previousNormalizedPercent: prevPct,
        satisfactionDropped
      }
    });

    if (satisfactionDropped && input.responsibleUserId) {
      await prisma.activityLog
        .create({
          data: {
            userId: input.responsibleUserId,
            activityType: "bsc_stakeholder_satisfaction_drop",
            title: "Stakeholder satisfaction decreased",
            description: `BSC survey actual dropped vs previous period (goal ${input.goalId}).`,
            goalId: input.goalId,
            status: "completed",
            percentValueAchieved: pct != null ? new Decimal(pct) : undefined
          }
        })
        .catch(() => undefined);
    }

    return { ...res, normalizedPercent: pct, satisfactionDropped };
  }

  /** Signed MOU (outputs): increment Partnerships Signed counter on the linked goal. */
  static async submitPartnershipsSigned(input: {
    goalId: string;
    incrementBy?: unknown;
    mouDocumentUrl?: string | null;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const url = input.mouDocumentUrl != null ? String(input.mouDocumentUrl).trim() : "";
    if (!url) {
      throw new Error(
        "signedMouDocumentUrl or mouDocumentUrl is required when recording a signed MOU"
      );
    }

    const goal = await prisma.performanceGoal.findUnique({
      where: { id: input.goalId },
      select: GOAL_APPLY_SELECT
    });
    if (!goal) throw new Error("Performance goal not found");
    const delta = Math.max(1, Math.floor(toPositiveNumber(input.incrementBy, 1)));
    const baseline = parseProgressBaseline(goal);
    const currentValue = baseline + delta;

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "PARTNERSHIPS_SIGNED",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      preloadedGoal: goal,
      syncExtra: {
        incrementBy: delta,
        signedMouDocumentUrl: url,
        previousCounter: baseline
      }
    });
    return { ...res, newTotal: currentValue, incrementBy: delta };
  }

  /** Service delivery: Customer Charter in local languages + evidence → adds weighted % (default 5) to charter score. */
  static async submitServiceDeliveryCustomerCharter(input: {
    goalId: string;
    addPercent?: unknown;
    charterAvailableLocalLanguages?: boolean;
    supportingDocumentUrls?: string[];
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    if (!input.charterAvailableLocalLanguages) {
      throw new Error(
        "charterAvailableLocalLanguages must be true when the charter is confirmed in local languages"
      );
    }
    const urls = Array.isArray(input.supportingDocumentUrls) ? input.supportingDocumentUrls : [];
    const hasDoc = urls.some((u) => typeof u === "string" && u.trim() !== "");
    if (!hasDoc) {
      throw new Error(
        "supportingDocumentUrls must include at least one URL for uploaded supporting documents"
      );
    }

    // SRD requirement: fixed +5 percentage points per accepted evidence submission.
    // We keep caller input only for audit transparency, but business increment is always 5.
    const requestedAdd = toPositiveNumber(input.addPercent, 5);
    const add = 5;
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: input.goalId },
      select: GOAL_APPLY_SELECT
    });
    if (!goal) throw new Error("Performance goal not found");
    const baseline = parseProgressBaseline(goal);
    const currentValue = baseline + add;

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "SERVICE_DELIVERY_CUSTOMER_CHARTER",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      preloadedGoal: goal,
      syncExtra: {
        addPercent: add,
        requestedAddPercent: requestedAdd,
        charterAvailableLocalLanguages: !!input.charterAvailableLocalLanguages,
        supportingDocumentUrls: urls
      }
    });
    return { ...res, addPercent: add, newActual: currentValue };
  }

  /** Jobs created (national / portfolio): manual FTE total or sum of active portfolio `employeeCount`. */
  static async submitJobsCreatedAggregate(input: {
    goalId: string;
    totalFullTimeJobs?: unknown;
    fundId?: string | null;
    excludeStatuses?: string[];
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    let total: number;
    let source = "manual";
    if (input.totalFullTimeJobs != null && input.totalFullTimeJobs !== "") {
      total = Math.max(0, Math.floor(toPositiveNumber(input.totalFullTimeJobs, 0)));
    } else {
      source = "portfolio_employeeCount";
      const exclude = input.excludeStatuses?.length
        ? input.excludeStatuses
        : ["PENDING", "DRAFT", "REJECTED"];
      const rows = await prisma.portfolioCompany.findMany({
        where: {
          ...(input.fundId ? { fundId: input.fundId } : {}),
          status: { notIn: exclude },
          employeeCount: { not: null }
        },
        select: { employeeCount: true }
      });
      total = rows.reduce((s, r) => s + (r.employeeCount || 0), 0);
    }

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue: total,
      responsibleUserId: input.responsibleUserId,
      entryKind: "JOBS_CREATED_AGGREGATE",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      syncExtra: {
        totalFullTimeJobs: total,
        aggregateSource: source,
        fundId: input.fundId
      }
    });
    return { ...res, totalFullTimeJobs: total, aggregateSource: source };
  }

  /**
   * Resource management: (actual spend ÷ strategic allocation) × 100; null-safe.
   * SRD Flow 6: optional `criticalOverspendPercent` (default 15) — if actual spend exceeds
   * allocation × (1 + threshold/100), sets RED zone and writes an activity log for follow-up.
   */
  static async submitResourceBudgetAlignment(input: {
    goalId: string;
    actualSpend?: unknown;
    strategicAllocation: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
    periodStart?: string;
    periodEnd?: string;
    currencyCode?: string | null;
    /** Default 15 — triggers critical overspend when actualSpend > allocation × (1 + p/100). */
    criticalOverspendPercent?: unknown;
  }) {
    let actualSpend = input.actualSpend;
    let spendSource = "manual";
    let moduleBreakdown:
      | {
          accountingExpense: number;
          procurementSpend: number;
          eventsSpend: number;
        }
      | undefined;

    const hasManualSpend =
      input.actualSpend != null && String(input.actualSpend).trim() !== "";
    if (!hasManualSpend && input.periodStart && input.periodEnd) {
      const ps = new Date(input.periodStart);
      const pe = new Date(input.periodEnd);
      if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
        throw new Error("periodStart and periodEnd must be valid dates for module spend aggregation");
      }
      const agg = await aggregateStrategicSpendAcrossModules(ps, pe);
      actualSpend = agg.totalSpend;
      spendSource = "accounting+procurement+events";
      moduleBreakdown = {
        accountingExpense: agg.accountingExpense,
        procurementSpend: agg.procurementSpend,
        eventsSpend: agg.eventsSpend
      };
    }

    const alignment = safeRatioPercent(actualSpend, input.strategicAllocation);
    const currentValue = alignment == null ? 0 : alignment;
    const alloc = toPositiveNumber(input.strategicAllocation, NaN);
    const spend = toPositiveNumber(actualSpend, NaN);
    const thresh = toPositiveNumber(input.criticalOverspendPercent ?? 15, 15);
    const criticalOverspend =
      Number.isFinite(alloc) &&
      alloc > 0 &&
      Number.isFinite(spend) &&
      thresh > 0 &&
      spend > alloc * (1 + thresh / 100);

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "RESOURCE_BUDGET_ALIGNMENT",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currencyCode: input.currencyCode,
      ...(criticalOverspend ? { performanceRiskZone: "RED" as const } : {}),
      monetaryFieldsForAudit: {
        actualSpend,
        strategicAllocation: input.strategicAllocation,
        currencyCode: input.currencyCode
      },
      syncExtra: {
        alignmentPercent: alignment,
        spendSource,
        ...(moduleBreakdown ? { moduleBreakdown } : {}),
        divisionByZeroOrInvalid: alignment == null,
        criticalOverspend,
        criticalOverspendThresholdPercent: thresh
      }
    });

    if (criticalOverspend && input.responsibleUserId) {
      await prisma.activityLog
        .create({
          data: {
            userId: input.responsibleUserId,
            activityType: "bsc_budget_critical_overspend",
            title: "Strategic allocation variance exceeded critical threshold",
            description: `Budget alignment goal ${input.goalId}: spend vs allocation exceeded ${thresh}% threshold.`,
            goalId: input.goalId,
            status: "completed",
            percentValueAchieved: alignment != null ? new Decimal(alignment) : undefined
          }
        })
        .catch(() => undefined);
    }

    return { ...res, alignmentPercent: alignment, criticalOverspend };
  }

  /**
   * SRD §4.1 / Flow 1: push posted GL revenue & net profit for a period onto one or two goals
   * (cron or “5th business day” job can call this). Omit both goal IDs to only return `glTotals`.
   */
  static async submitAccountingPeriodFromGl(input: {
    periodStart: string | Date;
    periodEnd: string | Date;
    netProfitGoalId?: string | null;
    revenueGoalId?: string | null;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
    currencyCode?: string | null;
  }) {
    const coercePeriodBoundary = (value: string | Date, mode: "start" | "end") => {
      if (value instanceof Date) {
        return value;
      }
      const raw = String(value || "").trim();
      // When callers send YYYY-MM-DD, JS parses as midnight at the start of that UTC day.
      // For period windows, treat start as 00:00:00.000Z and end as 23:59:59.999Z.
      const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (dateOnly) {
        const y = Number(dateOnly[1]);
        const m = Number(dateOnly[2]);
        const d = Number(dateOnly[3]);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
          return new Date(raw);
        }
        if (mode === "start") {
          return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        }
        return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      }
      return new Date(raw);
    };

    const ps = coercePeriodBoundary(input.periodStart, "start");
    const pe = coercePeriodBoundary(input.periodEnd, "end");
    if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
      throw new Error("periodStart and periodEnd must be valid dates");
    }
    if (ps.getTime() > pe.getTime()) {
      throw new Error("periodStart must be before periodEnd");
    }
    const glTotals = await getPostedPeriodRevenueExpenseNetProfit(ps, pe);
    const goalUpdates: Array<{ role: string; goalId: string }> = [];

    const freq = normalizeFrequency(input.frequency);
    const label = input.periodLabel ?? glTotals.periodStart.slice(0, 10);

    if (input.revenueGoalId != null && String(input.revenueGoalId).trim() !== "") {
      const gid = String(input.revenueGoalId).trim();
      const revGoal = await prisma.performanceGoal.findUnique({
        where: { id: gid },
        select: { formulaType: true }
      });
      const revFormula = normaliseFormulaType(revGoal?.formulaType);
      const { priorStart, priorEnd } = priorYearSameWindow(ps, pe);
      const priorGl = await getPostedPeriodRevenueExpenseNetProfit(priorStart, priorEnd);
      const currRev = glTotals.revenue;
      const prevRev = priorGl.revenue;
      let revenueActualValue: number;
      if (revFormula === "REVENUE_GROWTH") {
        if (prevRev > 0) {
          revenueActualValue = round(((currRev - prevRev) / prevRev) * 100, 4);
        } else if (prevRev <= 0 && currRev > 0) {
          revenueActualValue = 100;
        } else {
          revenueActualValue = 0;
        }
      } else {
        revenueActualValue = currRev;
      }
      await applyNumericActualToGoal({
        goalId: gid,
        currentValue: revenueActualValue,
        responsibleUserId: input.responsibleUserId,
        entryKind: "ACCOUNTING_GL_REVENUE_PERIOD",
        frequency: freq,
        periodLabel: label,
        periodStart: glTotals.periodStart,
        periodEnd: glTotals.periodEnd,
        currencyCode: input.currencyCode,
        monetaryFieldsForAudit: {
          glRevenue: glTotals.revenue,
          glPriorYearRevenue: priorGl.revenue,
          glRevenueYoYPercent: revFormula === "REVENUE_GROWTH" ? revenueActualValue : undefined,
          currencyCode: input.currencyCode
        },
        syncExtra: {
          source: "posted_journal_lines",
          totalExpense: glTotals.totalExpense,
          glCurrentPeriodRevenue: currRev,
          glPriorPeriodRevenue: prevRev,
          ...(revFormula === "REVENUE_GROWTH" ? { glRevenueYearOnYearPercent: revenueActualValue } : {})
        }
      });
      goalUpdates.push({ role: "revenue", goalId: gid });
    }

    if (input.netProfitGoalId != null && String(input.netProfitGoalId).trim() !== "") {
      const gid = String(input.netProfitGoalId).trim();
      await applyNumericActualToGoal({
        goalId: gid,
        currentValue: glTotals.netProfit,
        responsibleUserId: input.responsibleUserId,
        entryKind: "ACCOUNTING_GL_NET_PROFIT_PERIOD",
        frequency: freq,
        periodLabel: label,
        periodStart: glTotals.periodStart,
        periodEnd: glTotals.periodEnd,
        currencyCode: input.currencyCode,
        monetaryFieldsForAudit: {
          glNetProfit: glTotals.netProfit,
          currencyCode: input.currencyCode
        },
        syncExtra: {
          source: "posted_journal_lines",
          glRevenue: glTotals.revenue,
          glTotalExpense: glTotals.totalExpense
        }
      });
      goalUpdates.push({ role: "netProfit", goalId: gid });
    }

    return { glTotals, goalUpdates };
  }

  /**
   * Counter KPI: baseline from {@link parseProgressBaseline} + increment (minimum 1).
   * Used by statutory entry, payroll new-hire, and HR training hooks.
   */
  static async submitIncrementalCounterGoal(input: {
    goalId: string;
    incrementBy?: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
    entryKind: string;
    syncExtra?: Record<string, unknown>;
  }) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: input.goalId },
      select: GOAL_APPLY_SELECT
    });
    if (!goal) throw new Error("Performance goal not found");
    const delta = Math.max(1, Math.floor(toPositiveNumber(input.incrementBy, 1)));
    const baseline = parseProgressBaseline(goal);
    const currentValue = baseline + delta;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: input.entryKind,
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      preloadedGoal: goal,
      syncExtra: {
        incrementBy: delta,
        previousCounter: baseline,
        ...(input.syncExtra || {})
      }
    });
    return { ...res, newTotal: currentValue, incrementBy: delta };
  }

  /** SRD Flow 3: statutory / mandated report output counter (+ optional evidence URL). */
  static async submitStatutoryReportsOutput(input: {
    goalId: string;
    incrementBy?: unknown;
    evidenceDocumentUrl?: string | null;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const url =
      input.evidenceDocumentUrl != null ? String(input.evidenceDocumentUrl).trim() : "";
    return this.submitIncrementalCounterGoal({
      goalId: input.goalId,
      incrementBy: input.incrementBy,
      responsibleUserId: input.responsibleUserId,
      frequency: input.frequency,
      periodLabel: input.periodLabel,
      entryKind: "STATUTORY_REPORTS_OUTPUT",
      syncExtra: {
        evidenceDocumentUrl: url || undefined,
        ceoFormulaHint: "STATUTORY_REPORTS uses activities.completedCount / targetCount when configured"
      }
    });
  }

  /** SRD §4.2: optional auto-increment when payroll finalises a new hire (env or explicit goalId). */
  static async submitPayrollNewHireCounter(input: {
    goalId: string;
    incrementBy?: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    return this.submitIncrementalCounterGoal({
      goalId: input.goalId,
      incrementBy: input.incrementBy,
      responsibleUserId: input.responsibleUserId,
      frequency: input.frequency,
      periodLabel: input.periodLabel,
      entryKind: "PAYROLL_NEW_HIRE_COUNTER",
      syncExtra: {
        source: "payroll_employee_create",
        ceoFormulaHint: "Vacant posts filled / headcount KPI"
      }
    });
  }

  /** SRD §4.2: call when HR approves a training certificate (explicit goalId or integration). */
  static async submitTrainingCertificateCounter(input: {
    goalId: string;
    incrementBy?: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    return this.submitIncrementalCounterGoal({
      goalId: input.goalId,
      incrementBy: input.incrementBy,
      responsibleUserId: input.responsibleUserId,
      frequency: input.frequency,
      periodLabel: input.periodLabel,
      entryKind: "HR_TRAINING_CERTIFICATE_APPROVED",
      syncExtra: {
        source: "hr_training_certificate",
        ceoFormulaHint: "Skills development plan completion"
      }
    });
  }

  /** SRD Flow 7: governance checklist → index % (e.g. 45/50 → 90%). */
  static async submitGovernanceChecklistScore(input: {
    goalId: string;
    complianceItemsMet: unknown;
    totalGovernanceRequirements: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const met = Math.max(0, Math.floor(toPositiveNumber(input.complianceItemsMet, 0)));
    const tot = Math.max(0, Math.floor(toPositiveNumber(input.totalGovernanceRequirements, 0)));
    const pct = safeRatioPercent(met, tot);
    const currentValue = pct == null ? 0 : pct;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "GOVERNANCE_CHECKLIST_INDEX",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      syncExtra: {
        complianceItemsMet: met,
        totalGovernanceRequirements: tot,
        governanceIndexPercent: pct,
        ceoFormulaHint: "CORPORATE_GOVERNANCE_INDEX / governance_index"
      }
    });
    return { ...res, governanceIndexPercent: pct, complianceItemsMet: met, totalGovernanceRequirements: tot };
  }

  /** SRD §4.3: procurement actual vs annual plan (Actual procured / planned) × 100. */
  static async submitProcurementPlanCompliance(input: {
    goalId: string;
    actualProcured: unknown;
    annualPlanned: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
    currencyCode?: string | null;
  }) {
    const pct = safeRatioPercent(input.actualProcured, input.annualPlanned);
    const currentValue = pct == null ? 0 : pct;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "PROCUREMENT_PLAN_COMPLIANCE",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      currencyCode: input.currencyCode,
      monetaryFieldsForAudit: {
        actualProcured: input.actualProcured,
        annualPlanned: input.annualPlanned,
        currencyCode: input.currencyCode
      },
      syncExtra: {
        compliancePercent: pct,
        ceoFormulaHint: "STRATEGIC_ALLOCATION_COMPLIANCE or custom procurement KPI"
      }
    });
    return { ...res, compliancePercent: pct };
  }

  /** SRD Flow 5: Ease of Doing Business / innovation milestones (completed ÷ target) × 100. */
  static async submitEaseOfDoingBusinessProgress(input: {
    goalId: string;
    innovationsCompleted: unknown;
    targetInnovations: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const pct = safeRatioPercent(input.innovationsCompleted, input.targetInnovations);
    const currentValue = pct == null ? 0 : pct;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "EASE_OF_DOING_BUSINESS_PROGRESS",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      syncExtra: {
        innovationsCompleted: toPositiveNumber(input.innovationsCompleted, 0),
        targetInnovations: toPositiveNumber(input.targetInnovations, 0),
        ceoFormulaHint: "EASE_OF_DOING_BUSINESS"
      }
    });
    return { ...res, innovationCompletionPercent: pct };
  }

  /** SRD Flow 2 / §4.2: skills development plan (e.g. certs completed ÷ target) × 100. */
  static async submitSkillsDevelopmentProgress(input: {
    goalId: string;
    completedCount: unknown;
    targetCount: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const pct = safeRatioPercent(input.completedCount, input.targetCount);
    const currentValue = pct == null ? 0 : pct;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "SKILLS_DEVELOPMENT_PROGRESS",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      syncExtra: {
        completedCount: toPositiveNumber(input.completedCount, 0),
        targetCount: toPositiveNumber(input.targetCount, 0)
      }
    });
    return { ...res, skillsPlanPercent: pct };
  }

  /** SRD Flow 8: CSR / participation (e.g. attended ÷ eligible) × 100. */
  static async submitCsrParticipationRate(input: {
    goalId: string;
    participantsCompleted: unknown;
    participantsEligible: unknown;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const pct = safeRatioPercent(input.participantsCompleted, input.participantsEligible);
    const currentValue = pct == null ? 0 : pct;
    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue,
      responsibleUserId: input.responsibleUserId,
      entryKind: "CSR_PARTICIPATION_RATE",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      syncExtra: {
        participantsCompleted: toPositiveNumber(input.participantsCompleted, 0),
        participantsEligible: toPositiveNumber(input.participantsEligible, 0)
      }
    });
    return { ...res, participationPercent: pct };
  }

  /** Inclusion & diversity: group counts → % distribution + spread index on goal (board dashboard). */
  static async submitInclusionDiversityReporting(input: {
    goalId: string;
    groupCounts: Record<string, unknown>;
    responsibleUserId?: string | null;
    frequency?: string;
    periodLabel?: string;
  }) {
    const raw = input.groupCounts || {};
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Math.max(0, Math.floor(toPositiveNumber(v, 0)));
      counts[k] = n;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const groupPercents: Record<string, number> = {};
    if (total > 0) {
      for (const [k, v] of Object.entries(counts)) {
        groupPercents[k] = Math.round((v / total) * 100000) / 1000;
      }
    }
    const spread = diversitySpreadFromPercents(groupPercents);

    const res = await applyNumericActualToGoal({
      goalId: input.goalId,
      currentValue: spread,
      responsibleUserId: input.responsibleUserId,
      entryKind: "INCLUSION_DIVERSITY_REPORTING",
      frequency: normalizeFrequency(input.frequency),
      periodLabel: input.periodLabel,
      syncExtra: {
        groupCounts: counts,
        groupPercents,
        totalInvestmentsTagged: total,
        diversitySpreadIndex: spread
      }
    });
    return {
      ...res,
      groupCounts: counts,
      groupPercents,
      totalInvestmentsTagged: total,
      diversitySpreadIndex: spread
    };
  }

  /** Optional: growth rate helper for future KPIs (previous revenue, etc.). */
  static computeSafeGrowthPercent(current: unknown, previous: unknown) {
    return safeGrowthPercent(current, previous);
  }
}
