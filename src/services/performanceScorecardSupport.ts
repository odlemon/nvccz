// @ts-nocheck

const DEFAULT_ALLOWABLE_VARIANCE = 0.1;

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

export const DEFAULT_ORG_PILLAR_WEIGHTS = {
  Financial: 25,
  "Customer & Market": 25,
  "Internal Operations": 25,
  "Learning, Growth & HR": 25
};

export function toNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

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

export function isBoardChair(user: any): boolean {
  return hasAnySignal(user, ["board_chair", "board chairman", "board chairperson"]);
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
}) {
  const actualValue = toNumber(input.actualValue, 0);
  const targetValue = toNumber(input.targetValue, 0);
  const isReverseKpi = Boolean(input.isReverseKpi);
  const stretchScoringEnabled = Boolean(input.stretchScoringEnabled);

  if (targetValue <= 0 || actualValue <= 0) {
    return {
      progressPct: 0,
      isMissing: actualValue <= 0
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
    const upperVarianceBound = targetValue + targetValue * allowableVariance;
    const fiftyPctUpperBound = targetValue * 1.5;

    if (actualValue <= targetValue) return 4;
    if (actualValue <= upperVarianceBound) return 3;
    if (actualValue <= fiftyPctUpperBound) return 2;
    return 1;
  }

  const lowerVarianceBound = targetValue - targetValue * allowableVariance;
  const fiftyPctOfTarget = targetValue * 0.5;

  if (actualValue >= targetValue) return 4;
  if (actualValue >= lowerVarianceBound) return 3;
  if (actualValue >= fiftyPctOfTarget) return 2;
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

export function redistributeWeights<T extends { isPendingApproval?: boolean; weight?: number }>(items: T[]) {
  const activeItems = items.filter((item) => !item.isPendingApproval);
  const totalOriginalWeight = activeItems.reduce((sum, item) => sum + toNumber(item.weight, 0), 0);

  return items.map((item) => {
    if (item.isPendingApproval) {
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

export function resolvePeriodLabel(input: { periodLabel?: string; periodStart: Date; periodEnd: Date }) {
  if (input.periodLabel) return input.periodLabel;
  return `${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}`;
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
  const actualValue = toNumber(goal.preciseCurrentValue ?? goal.currentValue, 0);
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
