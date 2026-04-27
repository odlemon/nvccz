// @ts-nocheck

const DEFAULT_ALLOWABLE_VARIANCE = 0.1;

/** Raw indicator and matrix ratings use this integer range (weighted finals are ~1–6). */
export const PERFORMANCE_RATING_SCALE = { min: 1, max: 6 } as const;

export const EMPLOYEE_PERSONAL_ATTRIBUTES = [
  "Judgement in decision making",
  "Leadership and Management",
  "Ethics",
  "Teamwork",
  "Communication Skills",
  "Creativity and Innovation",
  "Knowledge of Standard Operating Procedures",
  "Quality of Work",
  "Interpersonal Relations",
  "Technical Skills"
];

export const CEO_SECTION_WEIGHTS = {
  A1: 30,
  A2: 20,
  B: 20,
  C: 25,
  D: 5
};

export const BOARD_SECTION_WEIGHTS = {
  A1: 30,
  A2: 20,
  B: 20,
  C: 22,
  D: 8
};

/** Board scorecard section headings (contract review — spec Part 1). */
export const BOARD_SECTION_LABELS: Record<string, string> = {
  A1: "Outcomes",
  A2: "Outputs (Strategy and Reporting)",
  B: "Governance",
  C: "Management of Organisational Resources",
  D: "Programmes and Projects"
};

/** API / dashboard pillar codes keyed by canonical `scorecardPillar` name. */
export const ORG_BSC_PILLAR_META: Record<string, { pillarCode: string; pillarLabel: string }> = {
  Financial: { pillarCode: "FINANCIAL", pillarLabel: "Financial" },
  "Customer & Market": { pillarCode: "CUSTOMER", pillarLabel: "Customer and Market" },
  "Internal Operations": { pillarCode: "INTERNAL_OPS", pillarLabel: "Internal Operations" },
  "Learning, Growth & HR": { pillarCode: "LEARNING_GROWTH", pillarLabel: "Learning, Growth and HR" }
};

export const DEFAULT_ORG_PILLAR_WEIGHTS = {
  Financial: 25,
  "Customer & Market": 25,
  "Internal Operations": 25,
  "Learning, Growth & HR": 25
};

/** Stable DB slug aligned with `run-performance-goal-pillar-id-migration.ts`. */
export const ORG_BSC_CANONICAL_TO_PILLAR_ID: Record<string, string> = {
  Financial: "bsc_financial",
  "Customer & Market": "bsc_customer_market",
  "Internal Operations": "bsc_internal_operations",
  "Learning, Growth & HR": "bsc_learning_growth_hr"
};

const ORG_BSC_PILLAR_CODE_ALIASES: Record<string, string> = {
  FINANCIAL: "Financial",
  CUSTOMER: "Customer & Market",
  CUSTOMER_MARKET: "Customer & Market",
  INTERNAL_OPS: "Internal Operations",
  INTERNAL_OPERATIONS: "Internal Operations",
  LEARNING_GROWTH: "Learning, Growth & HR",
  LEARNING_GROWTH_HR: "Learning, Growth & HR"
};

/** Map API codes / casing variants to canonical `scorecardPillar` for organisational BSC. */
export function normalizeOrgBscScorecardPillar(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (ORG_BSC_PILLAR_META[s]) return s;
  const compact = s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const fromCode = ORG_BSC_PILLAR_CODE_ALIASES[compact];
  if (fromCode && ORG_BSC_PILLAR_META[fromCode]) return fromCode;
  const ci = (Object.keys(ORG_BSC_PILLAR_META) as string[]).find(
    (k) => k.toLowerCase() === s.toLowerCase()
  );
  return ci || null;
}

export function toNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Canonical stored actual for scorecards / escalation. Both DB columns may be populated;
 * `preciseCurrentValue ?? currentValue` wrongly treats `0` as authoritative. When both exist,
 * precise is 0, current is non-zero, and the KPI is forward (not reverse), prefer current as stale-precise drift.
 */
export function resolveStoredGoalActual(goal: {
  preciseCurrentValue?: unknown;
  currentValue?: unknown;
  isReverseKpi?: boolean | null;
}): { value: number; hasExplicitStored: boolean } {
  const preciseRaw = goal.preciseCurrentValue;
  const currentRaw = goal.currentValue;
  const hasPrecise = preciseRaw != null && preciseRaw !== "";
  const hasCurrent = currentRaw != null && currentRaw !== "";

  const preciseNum = hasPrecise ? toNumber(preciseRaw, NaN) : NaN;
  const currentNum = hasCurrent ? toNumber(currentRaw, NaN) : NaN;

  if (!hasPrecise && !hasCurrent) {
    return { value: 0, hasExplicitStored: false };
  }
  if (!hasPrecise) {
    return { value: currentNum, hasExplicitStored: true };
  }
  if (!hasCurrent) {
    return { value: preciseNum, hasExplicitStored: true };
  }
  const isReverse = Boolean(goal.isReverseKpi);
  if (!isReverse && preciseNum === 0 && currentNum !== 0) {
    return { value: currentNum, hasExplicitStored: true };
  }
  return { value: preciseNum, hasExplicitStored: true };
}

/** True when both stored actual columns are absent, non-numeric, or zero (UAT: avoid contradicting hasRecordedPerformance). */
export function isEmployeeGoalStoredActualMissing(goal: {
  preciseCurrentValue?: unknown;
  currentValue?: unknown;
}): boolean {
  const empty = (v: unknown) => {
    if (v == null || v === "") return true;
    const n = Number(v);
    return !Number.isFinite(n) || n === 0;
  };
  return empty(goal.preciseCurrentValue) && empty(goal.currentValue);
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Weighted BSC / roll-up layers (dept sub-goals, org pillar, org score, parent–child goals)
 * use this precision so totals align with manual Excel to several decimal places.
 */
export const BSC_WEIGHTED_AGGREGATION_DECIMALS = 4;

export function normaliseVariance(value: any): number {
  const numeric = toNumber(value, DEFAULT_ALLOWABLE_VARIANCE);
  if (numeric <= 0) return DEFAULT_ALLOWABLE_VARIANCE;
  if (numeric > 1) return numeric / 100;
  return numeric;
}

export function getRoleSignals(user: any): string[] {
  return [
    user?.role?.name,
    user?.roleCode,
    user?.departmentRole,
    user?.userDepartment
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

export function hasAnySignal(user: any, fragments: string[]): boolean {
  const signals = getRoleSignals(user);
  return fragments.some((fragment) =>
    signals.some((signal) => signal.includes(fragment.toLowerCase()))
  );
}

export function isCEO(user: any): boolean {
  return hasAnySignal(user, ["ceo", "chief executive"]);
}

/**
 * Board scorecard access: Board Chairperson only (role code `BOARD_CHAIR` or wording signals).
 * SysAdmin and other roles do not override.
 */
export function isBoardChair(user: any): boolean {
  const code = String(user?.roleCode || "")
    .trim()
    .toUpperCase();
  if (code === "BOARD_CHAIR" || code === "BOARD_CHAIRPERSON") {
    return true;
  }
  return hasAnySignal(user, ["board_chair", "board chairman", "board chairperson"]);
}

/** Org BSC dashboard: CEO, Executive, M&E, HR, Compliance, SysAdmin — not Board Chair, not plain employees. */
export function canViewOrgBscDashboard(user: any): boolean {
  if (!user?.id) return false;
  if (isBoardChair(user)) return false;
  if (isCEO(user) || isSysAdmin(user) || isHRLeader(user)) return true;
  if (isMonitoringAndEvaluationLeader(user) || isComplianceLeader(user)) return true;
  if (isExecutive(user)) return true;
  return false;
}

/** Pillar weights from settings must sum to 100; if not, scale proportionally (spec Part 2). */
export function normalisePillarWeightsTo100(weights: Record<string, number>): {
  normalised: Record<string, number>;
  didNormalise: boolean;
} {
  const keys = Object.keys(weights);
  const sum = keys.reduce((s, k) => s + toNumber(weights[k], 0), 0);
  if (sum <= 0 || Math.abs(sum - 100) < 0.0001) {
    return { normalised: { ...weights }, didNormalise: false };
  }
  const normalised: Record<string, number> = {};
  for (const k of keys) {
    normalised[k] = round((toNumber(weights[k], 0) / sum) * 100, 4);
  }
  return { normalised, didNormalise: true };
}

export function isHRLeader(user: any): boolean {
  return hasAnySignal(user, ["hr_mgr", "hr manager", "hr head", "human resources head"]);
}

export function isDepartmentManager(user: any, departmentName?: string): boolean {
  const manages = hasAnySignal(user, ["_mgr", " manager"]);
  if (!departmentName) {
    return manages;
  }

  return manages && String(user?.userDepartment || "").toLowerCase() === String(departmentName).toLowerCase();
}

export function isComplianceLeader(user: any): boolean {
  return hasAnySignal(user, ["compliance head", "compliance officer", "compliance"]);
}

export function isMonitoringAndEvaluationLeader(user: any): boolean {
  return hasAnySignal(user, ["m&e", "monitoring", "evaluation"]);
}

export function isExecutive(user: any): boolean {
  return isCEO(user) || hasAnySignal(user, ["cfo", "cio", "chief ", "executive"]);
}

export function isSysAdmin(user: any): boolean {
  return hasAnySignal(user, ["sysadmin", "system administrator"]);
}

/** Application / platform admin — may view all employee scorecards (and similar cross-user reads). */
export function isAdminViewer(user: any): boolean {
  if (isSysAdmin(user)) return true;
  return hasAnySignal(user, ["admin", "super_admin", "superadmin", "administrator"]);
}

/** Optional stretch target (e.g. 120) stored on `PerformanceGoal.activities` alongside contract target (e.g. 100). BSC % uses target as denominator; see `computeGoalProgress` + `stretchScoringEnabled`. */
export function parseStretchTargetValueFromActivities(activities: unknown): number | null {
  if (activities == null || typeof activities !== "object" || Array.isArray(activities)) {
    return null;
  }
  const o = activities as Record<string, unknown>;
  const v = o.stretchTargetValue ?? o.stretchTarget;
  if (v == null || v === "") {
    return null;
  }
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

export function computeGoalProgress(input: {
  actualValue: any;
  targetValue: any;
  isReverseKpi?: boolean;
  stretchScoringEnabled?: boolean;
  /** When set with `stretchScoringEnabled`, forward KPIs use actual/stretchTarget (capped at 150%). */
  stretchTargetValue?: number | null;
}) {
  const actualValue = toNumber(input.actualValue, 0);
  const targetValue = toNumber(input.targetValue, 0);
  const isReverseKpi = Boolean(input.isReverseKpi);
  const stretchScoringEnabled = Boolean(input.stretchScoringEnabled);
  const stretchTarget = input.stretchTargetValue != null ? toNumber(input.stretchTargetValue, 0) : 0;

  if (isReverseKpi && actualValue <= 0) {
    return { progressPct: 0, isMissing: true };
  }

  if (targetValue <= 0 || actualValue <= 0) {
    return {
      progressPct: 0,
      isMissing: !isReverseKpi && actualValue <= 0
    };
  }

  if (stretchScoringEnabled && stretchTarget > 0 && !isReverseKpi) {
    const stretchProgress = (actualValue / stretchTarget) * 100;
    return {
      progressPct: round(Math.min(stretchProgress, 150), 2),
      isMissing: false
    };
  }

  let progressPct = isReverseKpi
    ? (targetValue / actualValue) * 100
    : (actualValue / targetValue) * 100;

  if (!stretchScoringEnabled) {
    progressPct = Math.min(progressPct, 100);
  }

  return {
    progressPct: round(progressPct, 2),
    isMissing: false
  };
}

/** True when `a` and `b` are the same for scorecard target/actual comparisons (floating-safe). */
function nearEqualTargetActual(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= Math.max(scale * 1e-9, 1e-6);
}

/**
 * Raw indicator rating on a **1–6** scale (BSC / client spec).
 * Standard KPI: higher actual is better. Reverse KPI: lower actual is better (e.g. cost ceiling).
 */
export function computeRawRating(input: {
  actualValue: any;
  targetValue: any;
  allowableVariance?: any;
  isReverseKpi?: boolean;
}) {
  const actualValue = toNumber(input.actualValue, 0);
  const targetValue = toNumber(input.targetValue, 0);
  const allowableVariance = normaliseVariance(input.allowableVariance);
  const isReverseKpi = Boolean(input.isReverseKpi);

  if (targetValue <= 0 || actualValue <= 0) {
    return 1;
  }

  if (isReverseKpi) {
    const upperVarianceBound = targetValue * (1 + allowableVariance);
    const lowerVarianceBound = targetValue * (1 - allowableVariance);
    const oneFiftyPctOfTarget = targetValue * 1.5;

    if (actualValue < lowerVarianceBound) return 6;
    if (actualValue < targetValue && !nearEqualTargetActual(actualValue, targetValue)) return 5;
    if (nearEqualTargetActual(actualValue, targetValue)) return 4;
    if (actualValue > targetValue && actualValue <= upperVarianceBound) return 3;
    if (actualValue > upperVarianceBound && actualValue <= oneFiftyPctOfTarget) return 2;
    return 1;
  }

  const upperVarianceBound = targetValue * (1 + allowableVariance);
  const lowerVarianceBound = targetValue * (1 - allowableVariance);
  const fiftyPctOfTarget = targetValue * 0.5;

  if (actualValue > upperVarianceBound) return 6;
  if (actualValue > targetValue && actualValue <= upperVarianceBound) return 5;
  if (nearEqualTargetActual(actualValue, targetValue)) return 4;
  if (actualValue >= lowerVarianceBound && actualValue < targetValue) return 3;
  if (actualValue >= fiftyPctOfTarget && actualValue < lowerVarianceBound) return 2;
  return 1;
}

export function computeStatus(input: {
  actualValue: any;
  targetValue: any;
  allowableVariance?: any;
  isReverseKpi?: boolean;
}) {
  const actualValue = toNumber(input.actualValue, 0);
  const targetValue = toNumber(input.targetValue, 0);
  const allowableVariance = normaliseVariance(input.allowableVariance);
  const isReverseKpi = Boolean(input.isReverseKpi);

  if (targetValue <= 0 || actualValue <= 0) {
    return "RED";
  }

  if (isReverseKpi) {
    if (actualValue <= targetValue) return "GREEN";
    if (actualValue <= targetValue + targetValue * allowableVariance) return "AMBER";
    return "RED";
  }

  if (actualValue >= targetValue) return "GREEN";
  if (actualValue >= targetValue - targetValue * allowableVariance) return "AMBER";
  return "RED";
}

/**
 * Department scorecard document matrix: traffic-light from **variance** (actual − target),
 * with reverse-KPI direction and explicit handling for missing values (audit Finding 1).
 */
export function departmentMatrixVarianceStatus(input: {
  variance: number;
  targetValue: number;
  allowableVariance?: any;
  isReverseKpi?: boolean;
  missingValue?: boolean;
}): "GREEN" | "AMBER" | "RED" {
  const targetValue = toNumber(input.targetValue, 0);
  const variance = toNumber(input.variance, 0);
  const av = normaliseVariance(input.allowableVariance);
  const band = targetValue * av;

  if (input.missingValue) {
    return "RED";
  }

  if (!input.isReverseKpi) {
    if (variance >= 0) return "GREEN";
    if (variance >= -band) return "AMBER";
    return "RED";
  }

  if (variance <= 0) return "GREEN";
  if (variance <= band) return "AMBER";
  return "RED";
}

/**
 * Roll-up weights for individual goals under a department goal. Does **not** use
 * `scorecardWeight` (that is for the employee matrix, not parent roll-up). Option B:
 * equal split when no explicit `contributionWeightPercent` / `rollupWeightPercent`;
 * otherwise split remainder among unset children; then normalise to 100%.
 */
export function resolveDepartmentRollupChildWeights(
  eligibleChildren: any[],
  departmentGoalTitle: string
): { weights: number[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!eligibleChildren.length) {
    return { weights: [], warnings };
  }
  const n = eligibleChildren.length;
  const explicit = eligibleChildren.map((cg) => {
    const act = cg?.activities && typeof cg.activities === "object" ? cg.activities : {};
    return toNumber(act.contributionWeightPercent ?? act.rollupWeightPercent, 0);
  });
  const sumExplicit = explicit.reduce((a, b) => a + b, 0);
  let raw: number[];
  if (sumExplicit <= 0.01) {
    raw = explicit.map(() => 100 / n);
  } else {
    const numZero = explicit.filter((e) => e <= 0).length;
    const remainder = Math.max(0, 100 - sumExplicit);
    const share = numZero > 0 ? remainder / numZero : 0;
    raw = explicit.map((e) => (e > 0 ? e : share));
  }
  const s = raw.reduce((a, b) => a + b, 0);
  let weights =
    s > 0
      ? raw.map((w) => round((w / s) * 100, 6))
      : raw.map(() => round(100 / n, 6));

  const sumW = weights.reduce((a, b) => a + b, 0);
  if (weights.length && Math.abs(sumW - 100) > 0.001) {
    weights = [...weights];
    weights[weights.length - 1] = round(weights[weights.length - 1] + (100 - sumW), 6);
  }

  weights.forEach((w, i) => {
    if (w < 0.01) {
      const cg = eligibleChildren[i];
      const employeeName = cg?.assignedTo
        ? `${cg.assignedTo.firstName} ${cg.assignedTo.lastName}`.trim()
        : "Unknown";
      warnings.push(
        `Warning: ${employeeName} has a rollup weight of 0 for goal "${departmentGoalTitle}". Their score will not contribute to the department roll-up.`
      );
    }
  });

  return { weights, warnings };
}

export function deriveActualFromProgress(targetValue: any, progressPct: number, isReverseKpi?: boolean) {
  const target = toNumber(targetValue, 0);
  if (target <= 0 || progressPct <= 0) return 0;

  if (isReverseKpi) {
    return round(target / (progressPct / 100), 4);
  }

  return round(target * (progressPct / 100), 4);
}

export function resolveWeight(value: any, fallback: number) {
  const numeric = toNumber(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

export function redistributeWeights<
  T extends { isPendingApproval?: boolean; excludedFromScoring?: boolean; weight?: number }
>(items: T[]) {
  const activeItems = items.filter((item) => !item.isPendingApproval && !item.excludedFromScoring);
  const totalOriginalWeight = activeItems.reduce((sum, item) => sum + toNumber(item.weight, 0), 0);

  return items.map((item) => {
    if (item.isPendingApproval || item.excludedFromScoring) {
      return {
        ...item,
        effectiveWeight: 0
      };
    }

    const baseWeight = toNumber(item.weight, 0);
    const effectiveWeight = totalOriginalWeight > 0
      ? (baseWeight / totalOriginalWeight) * 100
      : 0;

    return {
      ...item,
      effectiveWeight: round(effectiveWeight, 4)
    };
  });
}

/**
 * Budget utilisation % (actual spend ÷ allocated × 100) on **1–6** scale.
 * Treats 100% of budget as target with symmetric variance; lower spend is better (reverse-style).
 */
export function computeBudgetUtilisationRating(utilisationPct: number): number {
  const u = round(toNumber(utilisationPct, 0), 4);
  return computeRawRating({
    actualValue: u,
    targetValue: 100,
    allowableVariance: 0.1,
    isReverseKpi: true
  });
}

/** Shared **1–6** weighted final score → performance label (employee, department, CEO, Board). */
export function performanceLabelFromScore(finalScore: number): string {
  const s = toNumber(finalScore, 0);
  if (s >= 5.5) return "Exceptional";
  if (s >= 4.5) return "Exceeds Expectations";
  if (s >= 3.5) return "Meets Expectations";
  if (s >= 2.5) return "Satisfactory";
  if (s >= 2) return "Requires Improvement";
  if (s >= 1) return "Unsatisfactory";
  return "Unsatisfactory";
}

/** @deprecated Use {@link performanceLabelFromScore} — same bands as employee scorecard since 1–6 scale. */
export function performanceLabelFromDepartmentScore(departmentScore: number): string {
  return performanceLabelFromScore(departmentScore);
}

/** @deprecated Use {@link performanceLabelFromScore} — same bands as employee scorecard since 1–6 scale. */
export function performanceLabelFromCEOFinalScore(score: number): string {
  return performanceLabelFromScore(score);
}

/** Part 1 spec: human-readable label for each integer raw rating (1–6). */
export function rawRatingBandLabel(rating: number | null | undefined): string | null {
  if (rating == null || Number.isNaN(Number(rating))) return null;
  const r = Math.round(Number(rating));
  const labels: Record<number, string> = {
    1: "Unsatisfactory",
    2: "Requires Improvement",
    3: "Within Variance",
    4: "Meets Target",
    5: "Exceeds — Within Variance",
    6: "Exceeds — Beyond Variance"
  };
  return labels[r] ?? null;
}

/**
 * Rule 4-style banner from period end + latest persisted scorecard row (if any).
 * Does not imply auto-finalisation (see compliance tracker).
 */
export function resolveScorecardLifecycleBanner(
  periodEnd: Date,
  record?: { status?: string | null; isLocked?: boolean | null; archivedAt?: Date | null } | null
): { phase: string; bannerMessage: string } {
  const now = new Date();
  if (record?.archivedAt) {
    return { phase: "ARCHIVED", bannerMessage: "Archived." };
  }
  const st = String(record?.status ?? "").toUpperCase();
  if (record?.isLocked && st === "FINAL") {
    return { phase: "FINAL_LOCKED", bannerMessage: "Final — signed and locked." };
  }
  if (periodEnd.getTime() > now.getTime()) {
    return {
      phase: "LIVE",
      bannerMessage: "Live — period in progress. Scores reflect performance to date."
    };
  }
  if (!record || st === "DRAFT") {
    return {
      phase: "AWAITING_SIGNOFF",
      bannerMessage: "Finalised — awaiting sign-off."
    };
  }
  if (st === "FINAL") {
    return {
      phase: "FINAL_UNLOCKED",
      bannerMessage: "Finalised — awaiting sign-off."
    };
  }
  return {
    phase: "PERIOD_ENDED",
    bannerMessage: "Review period has ended. Scores reflect performance through the period end date."
  };
}

/**
 * UI / PDF row colour token from raw rating **1–6** (client colour mapping).
 * Returns `neutral` when rating is null/unknown.
 */
export function rawRatingToRowSeverity(rawRating: number | null | undefined): string {
  if (rawRating == null || rawRating === undefined || Number.isNaN(Number(rawRating))) {
    return "neutral";
  }
  const r = Math.round(Number(rawRating));
  switch (r) {
    case 6:
      return "dark_green";
    case 5:
      return "green";
    case 4:
      return "light_green";
    case 3:
      return "amber";
    case 2:
      return "orange";
    case 1:
      return "red";
    default:
      return "neutral";
  }
}

/**
 * When a section has no indicators, or all indicators are excluded/missing (no scoreable data),
 * score 0 must not be labelled Unsatisfactory (audit B1).
 * @param scoreableIndicatorCount — rows with excludedFromScoring false; omit to treat all `indicatorCountInSection` as scoreable (legacy 2-arg calls).
 */
export function ceoPerformanceLabelForSection(
  sectionScore: number,
  indicatorCountInSection: number,
  scoreableIndicatorCount?: number
): string {
  const score = toNumber(sectionScore, 0);
  const total = Math.max(0, Math.floor(toNumber(indicatorCountInSection, 0)));
  const scoreable =
    scoreableIndicatorCount === undefined
      ? total
      : Math.max(0, Math.floor(toNumber(scoreableIndicatorCount, 0)));

  if (total === 0 && score === 0) return "No Data";
  if (total > 0 && scoreable === 0 && score === 0) return "No Data";
  return performanceLabelFromCEOFinalScore(sectionScore);
}

/**
 * Overall CEO/Board label: no linked indicators, or none scoreable, + zero final score => No Data (audit B3).
 * @param scoreableIndicatorCount — omit to treat all `totalIndicatorCount` as scoreable (legacy).
 */
export function ceoPerformanceLabelOverall(
  finalScore: number,
  totalIndicatorCount: number,
  scoreableIndicatorCount?: number
): string {
  const score = toNumber(finalScore, 0);
  const total = Math.max(0, Math.floor(toNumber(totalIndicatorCount, 0)));
  const scoreable =
    scoreableIndicatorCount === undefined
      ? total
      : Math.max(0, Math.floor(toNumber(scoreableIndicatorCount, 0)));

  if (total === 0 && score === 0) return "No Data";
  if (total > 0 && scoreable === 0 && score === 0) return "No Data";
  return performanceLabelFromCEOFinalScore(finalScore);
}

export const CEO_SECTION_LABELS: Record<string, string> = {
  A1: "Outcomes",
  A2: "Outputs",
  B: "Service Delivery Standards",
  C: "Management of Resources and Organisational Capacity",
  D: "Cross-Cutting Government Priorities"
};

/** Traffic-light status from selected progress % (department scorecard v2 Step 11). */
export function departmentProgressTrafficStatus(
  progressPct: number,
  allowableVariance: unknown
): "GREEN" | "AMBER" | "RED" {
  const v = normaliseVariance(allowableVariance);
  const amberFloor = 100 - v * 100;
  if (progressPct >= 100) return "GREEN";
  if (progressPct >= amberFloor) return "AMBER";
  return "RED";
}

/** Includes AMBER_ZONE / RED_ZONE escalation from period end (C.05-style). */
export function departmentGoalRowStatus(
  progressPct: number,
  allowableVariance: unknown,
  periodEnd: Date
): string {
  const base = departmentProgressTrafficStatus(progressPct, allowableVariance);
  return buildEscalationStatus(base, periodEnd, { progressPct, isReverseKpi: false });
}

export const EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS = [
  "Excellent",
  "Very Good",
  "Satisfactory",
  "Requires Improvement",
  "Unsatisfactory"
] as const;

export function buildPersonalAttributesRatingGrid(template?: any) {
  const configuredAttributes = Array.isArray(template?.personalAttributes)
    ? template.personalAttributes
    : EMPLOYEE_PERSONAL_ATTRIBUTES;

  const ratings = template?.personalAttributeRatings && typeof template.personalAttributeRatings === "object"
    ? template.personalAttributeRatings
    : {};

  return configuredAttributes.map((attribute: string) => ({
    attribute,
    columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label) => ({
      label,
      selected: ratings[attribute]?.[label] ?? null
    }))
  }));
}

const EMPLOYEE_WEIGHT_SUM_TOLERANCE = 0.01;

/**
 * When the client requests period "2026" but the contract row uses "FY 2026", "2026 Annual", etc.,
 * still match on the same calendar year so scorecards resolve after UAT-style data entry.
 */
export function periodLabelMatches(stored: string | null | undefined, requested: string): boolean {
  if (stored == null || requested == null) return false;
  const s = String(stored).trim().toLowerCase();
  const r = String(requested).trim().toLowerCase();
  if (s === r) return true;
  const m1 = r.match(/(\d{4})/);
  const m2 = s.match(/(\d{4})/);
  return Boolean(m1 && m2 && m1[1] === m2[1]);
}

/**
 * Scales declared weights proportionally so they sum to 100% (in-memory mutation on goal rows).
 * Call before scoring when legacy data has rounding drift or mis-keyed totals.
 */
export function normalizeEmployeeGoalWeightsForScorecard(goals: any[], warningsOut: string[]): void {
  if (!goals?.length) return;
  const fallback = 100 / goals.length;
  const sum = goals.reduce((acc, g) => acc + resolveWeight(g?.scorecardWeight, fallback), 0);
  if (Math.abs(sum - 100) <= EMPLOYEE_WEIGHT_SUM_TOLERANCE) return;
  if (sum <= 0) return;
  const scale = 100 / sum;
  for (const g of goals) {
    const w = resolveWeight(g.scorecardWeight, fallback);
    const scaled = round(w * scale, 4);
    g.scorecardWeight = scaled as any;
  }
  warningsOut.push(
    `Individual goal weights were scaled to sum to 100% (declared total was ${round(sum, 2)}%).`
  );
}

/** Declared/fallback weights for individual goals must sum to ~100% (spec §5). */
export function assertIndividualGoalWeightsSum100(goals: any[]): void {
  if (!goals || goals.length === 0) {
    throw new Error(
      "No individual performance goals found for this employee in the selected period. Create goals linked to the contract or align goal dates with the period."
    );
  }
  const fallbackWeight = 100 / goals.length;
  const sum = goals.reduce(
    (acc, g) => acc + resolveWeight(g?.scorecardWeight, fallbackWeight),
    0
  );
  if (Math.abs(sum - 100) > EMPLOYEE_WEIGHT_SUM_TOLERANCE) {
    throw new Error("Goal weights do not sum to 100%. Scorecard cannot be generated.");
  }
}

/**
 * Results delivery: weighted mean of raw ratings on **1–6** scale —
 * Σ(effectiveWeight × rawRating / 100) re-scaled when Σ effectiveWeight = 100.
 */
export function summariseEmployeeResultsDelivery(rows: {
  isPendingApproval?: boolean;
  excludedFromScoring?: boolean;
  effectiveWeight?: number;
  weightedScore?: number | null;
}[]): { resultsDeliveryScore: number; pendingApprovalCount: number; excludedFromScoringCount: number } {
  const activeRows = rows.filter((row) => !row.isPendingApproval && !row.excludedFromScoring);
  const weightTotal = activeRows.reduce((sum, row) => sum + toNumber(row.effectiveWeight, 0), 0);
  const weightedTotal = activeRows.reduce((sum, row) => sum + toNumber(row.weightedScore, 0), 0);
  const resultsDeliveryScore =
    weightTotal > 0 ? round((weightedTotal * 100) / weightTotal, 4) : 0;
  return {
    resultsDeliveryScore,
    pendingApprovalCount: rows.filter((row) => row.isPendingApproval).length,
    excludedFromScoringCount: rows.filter((row) => row.excludedFromScoring).length
  };
}

export function getContributionWeight(goal: any, fallbackWeight: number) {
  const activities = goal?.activities && typeof goal.activities === "object" ? goal.activities : {};
  const contributionWeight = toNumber(
    activities?.contributionWeightPercent ?? goal?.scorecardWeight,
    fallbackWeight
  );

  return contributionWeight > 0 ? contributionWeight : fallbackWeight;
}

export function resolveSectionWeights(config: any, defaults: Record<string, number>) {
  const resolved: Record<string, number> = {};

  for (const [key, defaultValue] of Object.entries(defaults)) {
    resolved[key] = round(toNumber(config?.[key], defaultValue), 4);
  }

  return resolved;
}

export function buildPersonalAttributes(template?: any) {
  const configuredAttributes = Array.isArray(template?.personalAttributes)
    ? template.personalAttributes
    : EMPLOYEE_PERSONAL_ATTRIBUTES;

  return configuredAttributes.map((attribute: string) => ({
    attribute,
    rating: null
  }));
}

export function buildTrainingSection(template?: any) {
  return {
    beginningOfCycle: Array.isArray(template?.beginningOfCycle)
      ? template.beginningOfCycle
      : [],
    endOfCycle: Array.isArray(template?.endOfCycle)
      ? template.endOfCycle
      : [],
    interventions: Array.isArray(template?.interventions)
      ? template.interventions
      : []
  };
}

export function resolvePeriodLabel(input: {
  periodLabel?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
}) {
  if (input?.periodLabel) return input.periodLabel;
  const start = input?.periodStart != null ? new Date(input.periodStart as Date) : null;
  const end = input?.periodEnd != null ? new Date(input.periodEnd as Date) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  }
  return "—";
}

export function daysRemaining(endDate: Date) {
  const now = new Date();
  return Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function buildEscalationStatus(
  baseStatus: string,
  periodEnd: Date,
  options?: { progressPct?: number; isReverseKpi?: boolean }
) {
  const remaining = daysRemaining(periodEnd);
  const isReverse = Boolean(options?.isReverseKpi);
  const pct = options?.progressPct;

  // C.05 — forward KPI: meaningful progress but below on-target band; deadline within ~2 days.
  if (
    !isReverse &&
    pct != null &&
    pct >= 50 &&
    pct < 100 &&
    remaining <= 2 &&
    remaining >= 0 &&
    baseStatus === "RED"
  ) {
    return "AMBER ZONE";
  }

  if (baseStatus === "AMBER" && remaining < 14 && remaining >= 0) {
    return "AMBER ZONE";
  }

  if (baseStatus === "RED" && remaining < 0) {
    return "RED ZONE";
  }

  return baseStatus;
}

/** Single source for org BSC rows and persisted `performanceRiskZone` on goals. */
export function resolveGoalEscalationStatus(goal: {
  preciseCurrentValue?: unknown;
  currentValue?: unknown;
  preciseTargetValue?: unknown;
  targetValue?: unknown;
  allowableVariance?: unknown;
  isReverseKpi?: boolean | null;
  endDate: Date;
  stretchScoringEnabled?: boolean;
}): string {
  const { value: actualValue } = resolveStoredGoalActual(goal);
  const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
  const isReverseKpi = Boolean(goal.isReverseKpi);
  const { progressPct } = computeGoalProgress({
    actualValue,
    targetValue,
    isReverseKpi,
    stretchScoringEnabled: Boolean(goal.stretchScoringEnabled)
  });
  const base = computeStatus({
    actualValue,
    targetValue,
    allowableVariance: goal.allowableVariance,
    isReverseKpi
  });
  return buildEscalationStatus(base, goal.endDate, { progressPct, isReverseKpi });
}

export function isFinalOrArchived(status?: string) {
  return ["FINAL", "ARCHIVED"].includes(String(status || "").toUpperCase());
}
