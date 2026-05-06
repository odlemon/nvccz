// @ts-nocheck

import path from "path";
import fs from "fs";
import { PERFORMANCE_RATING_SCALE } from "./performanceScorecardSupport";

export const HARD_CODED_BSC_PILLARS = [
  "Financial",
  "Customer & Market",
  "Internal Operations",
  "Learning, Growth & HR"
];

/** Stable `performance_goals.pillar_id` values (UAT / integrations). */
export const BSC_PILLAR_SLUG_BY_NAME: Record<string, string> = {
  Financial: "bsc_financial",
  "Customer & Market": "bsc_customer_market",
  "Internal Operations": "bsc_internal_operations",
  "Learning, Growth & HR": "bsc_learning_growth_hr"
};

/** UAT document wording vs internal canonical pillar names. */
export const BSC_PILLAR_UAT_LABEL: Record<string, string> = {
  Financial: "Financial",
  "Customer & Market": "Customer",
  "Internal Operations": "Internal Ops",
  "Learning, Growth & HR": "Learning & Growth"
};

/**
 * PE ↔ Performance UAT: **Portfolio IRR** is stored and synced with **4** decimal places (e.g. 0.1878)
 * through the pending-approval path. AUM and other high-precision integration metrics use **6**.
 */
export const PORTFOLIO_IRR_PE_SYNC_DECIMALS = 4;

export function pillarSlugForScorecardPillar(
  scorecardPillar: string | null | undefined
): string | null {
  if (!scorecardPillar || typeof scorecardPillar !== "string") return null;
  const slug = BSC_PILLAR_SLUG_BY_NAME[scorecardPillar.trim()];
  return slug || null;
}

export function roundTo(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function asNumber(value: any, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validateWeightTotal(weights: Array<number | string>, expectedTotal = 100) {
  const total = roundTo(weights.reduce((sum, weight) => sum + asNumber(weight, 0), 0), 4);
  return {
    total,
    valid: total === expectedTotal
  };
}

export function validateFixedPillarSet(weights: Record<string, number>) {
  const keys = Object.keys(weights);
  const missing = HARD_CODED_BSC_PILLARS.filter((pillar) => !keys.includes(pillar));
  const unexpected = keys.filter((pillar) => !HARD_CODED_BSC_PILLARS.includes(pillar));
  const totals = validateWeightTotal(HARD_CODED_BSC_PILLARS.map((pillar) => weights[pillar] ?? 0));

  return {
    valid: missing.length === 0 && unexpected.length === 0 && totals.valid,
    missing,
    unexpected,
    total: totals.total
  };
}

export function buildExponentialBackoffSchedule(maxAttempts = 5) {
  return Array.from({ length: maxAttempts }, (_, index) => 2 ** index * 1000);
}

export function normaliseSyncedDecimal(value: any, digits = 6) {
  return roundTo(asNumber(value, 0), digits).toFixed(digits);
}

export function extractValueFromPayload(payload: any, fieldPath?: string) {
  if (!fieldPath) {
    if (payload?.value !== undefined) return payload.value;
    if (payload?.data?.value !== undefined) return payload.data.value;
    return payload;
  }

  return String(fieldPath)
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => current?.[key], payload);
}

export function isPrecisionSensitiveFormula(formulaType?: string) {
  const normalized = String(formulaType || "").toUpperCase();
  return ["PORTFOLIO_IRR_PCT", "AUM_TOTAL", "IRR", "AUM"].includes(normalized);
}

/**
 * Goals eligible for `POST .../sync-pe-portfolio-irr`. Uses KPI name and/or formulaType only
 * (not fieldPath — otherwise any goal would match `data.metrics.irr`).
 */
export function isPortfolioIrrCompatibleGoal(goal: {
  formulaType?: string | null;
  kpi?: { name?: string | null } | null;
}): boolean {
  const ft = String(goal.formulaType || "").toUpperCase().trim();
  if (ft === "PORTFOLIO_IRR_PCT" || ft === "IRR") return true;
  if (ft === "AUM_TOTAL" || ft === "AUM") return false;

  const kn = String(goal.kpi?.name || "").toLowerCase();
  if (/\birr\b|internal rate|portfolio irr|gross irr|net irr|fund irr|pe irr/.test(kn)) return true;

  return false;
}

/**
 * Goals eligible for `POST .../sync-pe-portfolio-aum`. Inverse of IRR eligibility — AUM KPI / formula only.
 */
export function isPortfolioAumCompatibleGoal(goal: {
  formulaType?: string | null;
  kpi?: { name?: string | null } | null;
}): boolean {
  const ft = String(goal.formulaType || "").toUpperCase().trim();
  if (ft === "PORTFOLIO_IRR_PCT" || ft === "IRR") return false;
  if (ft === "AUM_TOTAL" || ft === "AUM") return true;

  const kn = String(goal.kpi?.name || "").toLowerCase();
  if (/\birr\b|internal rate|portfolio irr|gross irr|net irr|fund irr|pe irr/.test(kn)) return false;
  if (/\baum\b|assets under management|aum total|total aum/.test(kn)) return true;

  return false;
}

/**
 * Goals eligible for `POST .../sync-payroll-turnover-rate` (Payroll `Employee` roster: active vs inactive headcount).
 */
export function isPayrollTurnoverCompatibleGoal(goal: {
  formulaType?: string | null;
  kpi?: { name?: string | null } | null;
}): boolean {
  if (isPortfolioIrrCompatibleGoal(goal) || isPortfolioAumCompatibleGoal(goal)) {
    return false;
  }
  const ft = String(goal.formulaType || "").toUpperCase().trim();
  if (ft === "TURNOVER_RATE" || ft === "EMPLOYEE_TURNOVER") return true;

  const kn = String(goal.kpi?.name || "").toLowerCase();
  if (/\bturnover rate\b|employee turnover|staff turnover|attrition rate|headcount turnover/.test(kn)) {
    return true;
  }
  return false;
}

/** Goals eligible for portfolio total revenue sync (sum of portfolio company `financialKpis.latestKpiValues.TOTAL_REVENUE`). */
export function isPortfolioTotalRevenueCompatibleGoal(goal: {
  formulaType?: string | null;
  kpi?: { name?: string | null } | null;
}): boolean {
  if (
    isPortfolioIrrCompatibleGoal(goal) ||
    isPortfolioAumCompatibleGoal(goal) ||
    isPayrollTurnoverCompatibleGoal(goal)
  ) {
    return false;
  }
  const ft = String(goal.formulaType || "").toUpperCase().trim();
  if (ft === "TOTAL_REVENUE" || ft === "REVENUE_TARGET" || ft === "SALES_REVENUE") return true;
  const kn = String(goal.kpi?.name || "").toLowerCase();
  if (
    /\btotal revenue\b|\brevenue contribution\b|\bindividual revenue\b|\bgross revenue\b|\bnet revenue\b/.test(kn)
  ) {
    return true;
  }
  return false;
}

/**
 * Use high-precision sync + pending-approval path when formula/KPI/fieldPath indicates IRR, AUM, etc.
 * Portfolio IRR values use `PORTFOLIO_IRR_PE_SYNC_DECIMALS` (4) on write; AUM/others use 6.
 * (Goals created via API often have null formulaType — infer from linked KPI name or fieldPath.)
 */
export function isHighPrecisionPerformanceSync(
  goal: { formulaType?: string | null; kpi?: { name?: string | null } | null },
  fieldPath?: string | null
): boolean {
  if (isPrecisionSensitiveFormula(goal.formulaType)) return true;
  const fp = String(fieldPath || "").toLowerCase();
  if (fp.includes("irr") || fp.includes("aum")) return true;
  const kn = String(goal.kpi?.name || "").toLowerCase();
  if (/\birr\b|internal rate|portfolio irr/.test(kn)) return true;
  if (/\baum\b|assets under management|fair value|unrealized/.test(kn)) return true;
  return false;
}

type GoalLike = { formulaType?: string | null; kpi?: { name?: string | null } | null };

/** Digits for `normaliseSyncedDecimal` on a multi-goal sync batch (PE IRR → 4 dp; AUM/IRR-high-precision → 6; else 2). */
export function syncDecimalPlacesForIntegrationBatch(
  goals: GoalLike[],
  effectiveFieldPath?: string | null
): number {
  if (
    goals.some(
      (g) => isPortfolioIrrCompatibleGoal(g) && isHighPrecisionPerformanceSync(g, effectiveFieldPath)
    )
  ) {
    return PORTFOLIO_IRR_PE_SYNC_DECIMALS;
  }
  if (goals.some((g) => isHighPrecisionPerformanceSync(g, effectiveFieldPath))) {
    return 6;
  }
  return 2;
}

export function shouldRaiseDataQualityAlert(params: {
  currentValue: any;
  lastApprovedValue: any;
  formulaType?: string;
}) {
  const currentValue = asNumber(params.currentValue, 0);
  const lastApprovedValue = asNumber(params.lastApprovedValue, 0);

  if (!isPrecisionSensitiveFormula(params.formulaType) || lastApprovedValue === 0) {
    return false;
  }

  const absoluteDiff = Math.abs(currentValue - lastApprovedValue);
  const percentDiff = Math.abs((absoluteDiff / lastApprovedValue) * 100);

  return absoluteDiff > 0.0001 || percentDiff > 0.5;
}

function managerRatingRangeMessage(): string {
  const { min, max } = PERFORMANCE_RATING_SCALE;
  return `Manager rating must be a whole number from ${min} to ${max}.`;
}

/** F.03 — integer rating aligned with BSC / scorecard `PERFORMANCE_RATING_SCALE` (e.g. review.ratingValue, dimension rows). */
export function validateManagerScaleInteger(value: unknown): { valid: boolean; message: string } {
  if (value === undefined || value === null) {
    return { valid: true, message: "" };
  }
  const numeric = Number(value);
  const { min, max } = PERFORMANCE_RATING_SCALE;
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < min || numeric > max) {
    return { valid: false, message: managerRatingRangeMessage() };
  }
  return { valid: true, message: "" };
}

/** Validates numeric rating fields on each score row (manager / self / generic `rating`). */
export function validateManagerRatings(scores: any[]) {
  const { min, max } = PERFORMANCE_RATING_SCALE;
  const keys = ["managerRating", "rating", "selfRating"] as const;
  const invalidEntries = (Array.isArray(scores) ? scores : []).filter((score) => {
    if (!score || typeof score !== "object") return false;
    for (const key of keys) {
      const raw = score[key];
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      const numeric = Number(raw);
      if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
        return true;
      }
    }
    return false;
  });

  return {
    valid: invalidEntries.length === 0,
    invalidEntries
  };
}

export function validateQualitativeFeedbackMinimum(feedback?: string, minimumLength = 50) {
  const normalized = String(feedback || "").trim();
  return {
    valid: normalized.length >= minimumLength,
    length: normalized.length,
    minimumLength
  };
}

export function resolveReviewWorkflowStatus(input: {
  currentStatus?: string;
  currentStage?: string;
  finalize?: boolean;
  /**
   * When the review has an external stakeholder, progression is:
   * SELF_REVIEW → PEER_REVIEW (external) → HR_REVIEW → MANAGER_REVIEW → FINAL_REVIEW → finalize → FINALIZED.
   * Without this flag, SELF_REVIEW → MANAGER_REVIEW (legacy path).
   */
  hasExternalStakeholder?: boolean;
}) {
  if (input.finalize) {
    return {
      status: "FINALIZED",
      stage: "FINALIZED"
    };
  }

  const currentStage = String(input.currentStage || "").toUpperCase();
  const extended = Boolean(input.hasExternalStakeholder);

  if (!currentStage || currentStage === "SELF_ASSESSMENT") {
    return {
      status: "SELF_REVIEW",
      stage: "SELF_REVIEW"
    };
  }

  if (currentStage === "SELF_REVIEW") {
    if (extended) {
      return { status: "PEER_REVIEW", stage: "PEER_REVIEW" };
    }
    return { status: "MANAGER_REVIEW", stage: "MANAGER_REVIEW" };
  }

  if (currentStage === "PEER_REVIEW") {
    if (extended) {
      return { status: "HR_REVIEW", stage: "HR_REVIEW" };
    }
    return { status: "MANAGER_REVIEW", stage: "MANAGER_REVIEW" };
  }

  if (currentStage === "HR_REVIEW") {
    return { status: "MANAGER_REVIEW", stage: "MANAGER_REVIEW" };
  }

  if (currentStage === "MANAGER_REVIEW") {
    return { status: "FINAL_REVIEW", stage: "FINAL_REVIEW" };
  }

  if (currentStage === "FINAL_REVIEW") {
    return {
      status: String(input.currentStatus || "PENDING").toUpperCase(),
      stage: "FINAL_REVIEW"
    };
  }

  return {
    status: String(input.currentStatus || "PENDING").toUpperCase(),
    stage: currentStage || "PENDING"
  };
}

export function uniqueGoalIdsForTaskBatch(tasks: Array<{ goalId?: string | null }>) {
  return Array.from(new Set(tasks.map((task) => task.goalId).filter(Boolean)));
}

export function ensureDirectoryForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function toSafeFileName(value: string) {
  return String(value || "document")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Merge `task.assets` JSON and attachment entries stored on `task.activities` (base64 upload path). */
export function buildTaskAttachmentsList(task: any): any[] {
  const fromActivities = Array.isArray(task?.activities)
    ? task.activities
        .map((entry: any) => entry?.attachment)
        .filter((a: any) => a && typeof a === "object")
    : [];
  if (!task?.assets) return fromActivities;
  try {
    const fromAssets = Array.isArray(task.assets) ? task.assets : JSON.parse(task.assets);
    return [...fromAssets, ...fromActivities];
  } catch {
    return fromActivities;
  }
}
