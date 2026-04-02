// @ts-nocheck

import path from "path";
import fs from "fs";

export const HARD_CODED_BSC_PILLARS = [
  "Financial",
  "Customer & Market",
  "Internal Operations",
  "Learning, Growth & HR"
];

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
 * Use 6-decimal sync + pending-approval path when formula/KPI/fieldPath indicates IRR, AUM, etc.
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

const MANAGER_RATING_ERROR = "Manager rating must be a whole number from 1 to 5.";

/** F.03 — single numeric manager scale (e.g. review.ratingValue). */
export function validateManagerScaleInteger(value: unknown): { valid: boolean; message: string } {
  if (value === undefined || value === null) {
    return { valid: true, message: "" };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    return { valid: false, message: MANAGER_RATING_ERROR };
  }
  return { valid: true, message: "" };
}

export function validateManagerRatings(scores: any[]) {
  const invalidEntries = (Array.isArray(scores) ? scores : []).filter((score) => {
    if (score?.managerRating === undefined || score?.managerRating === null) {
      return false;
    }

    const numeric = Number(score.managerRating);
    return !Number.isInteger(numeric) || numeric < 1 || numeric > 5;
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
}) {
  if (input.finalize) {
    return {
      status: "FINALIZED",
      stage: "FINALIZED"
    };
  }

  const currentStage = String(input.currentStage || "").toUpperCase();

  if (!currentStage || currentStage === "SELF_ASSESSMENT") {
    return {
      status: "SELF_REVIEW",
      stage: "SELF_REVIEW"
    };
  }

  if (currentStage === "SELF_REVIEW") {
    return {
      status: "MANAGER_REVIEW",
      stage: "MANAGER_REVIEW"
    };
  }

  if (currentStage === "MANAGER_REVIEW") {
    return {
      status: "FINAL_REVIEW",
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
