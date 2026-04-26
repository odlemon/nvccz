/**
 * Goal roll-up without schema changes:
 * - contributionWeightPercent lives in goal.activities JSON (object form).
 * - targetOperator on the goal drives "more is better" (>=) vs "less is better" (<=).
 */

export type SubGoalRollupInput = {
  id: string;
  activities: unknown;
  /** Same column as scorecard; used when activities JSON has no weight */
  scorecardWeight?: unknown;
  currentValue?: unknown;
  targetValue?: unknown;
  targetOperator?: string | null;
  /** When true, scoring matches scorecard reverse KPI (lower actual is better). */
  isReverseKpi?: boolean | null;
  progressPercentage?: unknown;
  stage?: string;
  status?: string;
};

/** Read sibling weight (0–100). activities must be a plain object; arrays are ignored. */
export function parseContributionWeightPercentFromActivities(activities: unknown): number | null {
  if (activities == null || typeof activities !== "object" || Array.isArray(activities)) {
    return null;
  }
  const o = activities as Record<string, unknown>;
  const w = o.contributionWeightPercent ?? o.weightPercent;
  if (w == null) return null;
  const n = typeof w === "number" ? w : parseFloat(String(w));
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function parseScorecardWeightPercent(scorecardWeight: unknown): number | null {
  if (scorecardWeight == null || scorecardWeight === "") return null;
  const n = typeof scorecardWeight === "number" ? scorecardWeight : parseFloat(String(scorecardWeight));
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function parseSiblingWeightPercent(s: SubGoalRollupInput): number | null {
  const fromActivities = parseContributionWeightPercentFromActivities(s.activities);
  if (fromActivities != null) return fromActivities;
  return parseScorecardWeightPercent(s.scorecardWeight);
}

/** Aligns with scorecard: explicit flag wins, else targetOperator "<=" means reverse. */
export function resolveReverseScoring(goal: {
  targetOperator?: string | null;
  isReverseKpi?: boolean | null;
}): boolean {
  if (goal.isReverseKpi === true) return true;
  if (goal.isReverseKpi === false) return false;
  return String(goal.targetOperator || ">=").trim() === "<=";
}

/**
 * Normalized weights summing to 1. Equal split if no weights set.
 * Partial weights: remaining share split among siblings without a weight; then scale to 100%.
 */
export function normalizedSiblingWeights(siblings: SubGoalRollupInput[]): Map<string, number> {
  const map = new Map<string, number>();
  const n = siblings.length;
  if (n === 0) return map;

  const raws = siblings.map((s) => parseSiblingWeightPercent(s));
  const hasAny = raws.some((r) => r != null);
  if (!hasAny) {
    const w = 1 / n;
    siblings.forEach((s) => map.set(s.id, w));
    return map;
  }

  let explicitSum = 0;
  let undefCount = 0;
  siblings.forEach((s, i) => {
    const r = raws[i];
    if (r == null) undefCount += 1;
    else explicitSum += r;
  });

  const remainder = 100 - explicitSum;
  const shareForUndef = undefCount > 0 ? remainder / undefCount : 0;

  siblings.forEach((s, i) => {
    const r = raws[i];
    const pct = r != null ? r : Math.max(0, shareForUndef);
    map.set(s.id, pct);
  });

  let sumPct = 0;
  map.forEach((v) => {
    sumPct += v;
  });
  if (sumPct <= 0) {
    map.clear();
    const w = 1 / n;
    siblings.forEach((s) => map.set(s.id, w));
    return map;
  }
  const scale = 100 / sumPct;
  map.forEach((v, k) => map.set(k, (v * scale) / 100));
  return map;
}

export function isTargetMet(
  current: number,
  target: number,
  targetOperator: string | null | undefined,
  isReverseKpi?: boolean | null
): boolean {
  if (target <= 0) return false;
  if (resolveReverseScoring({ targetOperator, isReverseKpi })) {
    return current <= target;
  }
  const op = (targetOperator || ">=").trim();
  if (op === "=") return Math.abs(current - target) <= target * 0.01;
  return current >= target;
}

/**
 * Achievement 0–100 for roll-up weighting (report-card style).
 * >= higher is better; <= lower actual vs cap is better; = near target.
 */
export function computeAchievementPercent(goal: {
  currentValue?: unknown;
  targetValue?: unknown;
  targetOperator?: string | null;
  isReverseKpi?: boolean | null;
  progressPercentage?: unknown;
}): number {
  const current =
    goal.currentValue != null && goal.currentValue !== ""
      ? parseFloat(String(goal.currentValue))
      : 0;
  const target =
    goal.targetValue != null && goal.targetValue !== ""
      ? parseFloat(String(goal.targetValue))
      : 0;
  const op = (goal.targetOperator || ">=").trim();
  const reverse = resolveReverseScoring(goal);

  if (target <= 0 || Number.isNaN(target)) {
    const pp =
      goal.progressPercentage != null && goal.progressPercentage !== ""
        ? parseFloat(String(goal.progressPercentage))
        : 0;
    if (Number.isNaN(pp)) return 0;
    return Math.min(100, Math.max(0, pp));
  }

  if (Number.isNaN(current)) return 0;

  if (reverse) {
    if (current <= target) return 100;
    return Math.max(0, Math.min(100, (target / current) * 100));
  }

  if (op === "=") {
    const diff = Math.abs(current - target);
    const tol = target * 0.01;
    if (diff <= tol) return 100;
    return Math.max(0, 100 - (diff / target) * 100);
  }

  return Math.max(0, Math.min(100, (current / target) * 100));
}

/**
 * Read numeric current/target for analytics & sync, preferring `precise*` when set.
 */
export function parseGoalCurrentAndTarget(goal: {
  currentValue?: unknown;
  targetValue?: unknown;
  preciseCurrentValue?: unknown;
  preciseTargetValue?: unknown;
}): { current: number; target: number } {
  const fromMainCur =
    goal.currentValue != null && String(goal.currentValue).trim() !== ""
      ? parseFloat(String(goal.currentValue))
      : NaN;
  const fromPreciseCur =
    goal.preciseCurrentValue != null && String(goal.preciseCurrentValue).trim() !== ""
      ? parseFloat(String(goal.preciseCurrentValue))
      : NaN;
  // Prefer precise when it is a meaningful number; if precise is 0 but legacy current is > 0, trust current (stale zero).
  let current = 0;
  if (Number.isFinite(fromPreciseCur) && fromPreciseCur !== 0) {
    current = fromPreciseCur;
  } else if (Number.isFinite(fromMainCur) && fromMainCur !== 0) {
    current = fromMainCur;
  } else if (Number.isFinite(fromPreciseCur)) {
    current = fromPreciseCur;
  } else if (Number.isFinite(fromMainCur)) {
    current = fromMainCur;
  }

  const fromMainTgt =
    goal.targetValue != null && String(goal.targetValue).trim() !== ""
      ? parseFloat(String(goal.targetValue))
      : NaN;
  const fromPreciseTgt =
    goal.preciseTargetValue != null && String(goal.preciseTargetValue).trim() !== ""
      ? parseFloat(String(goal.preciseTargetValue))
      : NaN;
  let target = 0;
  if (Number.isFinite(fromPreciseTgt) && fromPreciseTgt !== 0) {
    target = fromPreciseTgt;
  } else if (Number.isFinite(fromMainTgt) && fromMainTgt !== 0) {
    target = fromMainTgt;
  } else if (Number.isFinite(fromPreciseTgt)) {
    target = fromPreciseTgt;
  } else if (Number.isFinite(fromMainTgt)) {
    target = fromMainTgt;
  }

  return {
    current: Number.isFinite(current) ? current : 0,
    target: Number.isFinite(target) ? target : 0
  };
}

/**
 * 0–100 for a KPI line in analytics: respects reverse KPI, `computeAchievementPercent`,
 * and when there is a measured current value but no target, treats progress as 100% (not 0%),
 * so dashboards do not show 0% with real currents.
 */
export function computeKpiLineProgressPercent(
  goals: Array<{
    currentValue?: unknown;
    targetValue?: unknown;
    preciseCurrentValue?: unknown;
    preciseTargetValue?: unknown;
    targetOperator?: string | null;
    isReverseKpi?: boolean | null;
    progressPercentage?: unknown;
  }>,
  kpi: { isReverseKpi?: boolean | null } | null
): number {
  if (!goals.length) return 0;
  const parts: number[] = [];
  for (const goal of goals) {
    const { current, target } = parseGoalCurrentAndTarget(goal);
    if (target <= 0) {
      if (current > 0) {
        parts.push(100);
      } else {
        parts.push(
          computeAchievementPercent({
            currentValue: current,
            targetValue: target,
            targetOperator: goal.targetOperator,
            isReverseKpi: goal.isReverseKpi ?? kpi?.isReverseKpi,
            progressPercentage: goal.progressPercentage
          })
        );
      }
    } else {
      parts.push(
        computeAchievementPercent({
          currentValue: current,
          targetValue: target,
          targetOperator: goal.targetOperator,
          isReverseKpi: goal.isReverseKpi ?? kpi?.isReverseKpi,
          progressPercentage: goal.progressPercentage
        })
      );
    }
  }
  const s = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.max(0, Math.min(100, Number.isFinite(s) ? s : 0));
}

export function computeParentRollupFromChildren(
  subGoals: SubGoalRollupInput[],
  parentTargetValue: unknown
): {
  progressPercentage: number;
  suggestedCurrentValue: number;
  allCompleted: boolean;
  anyInProgress: boolean;
} {
  const weights = normalizedSiblingWeights(subGoals);
  let weighted = 0;
  let allCompleted = true;
  let anyInProgress = false;

  for (const s of subGoals) {
    const w = weights.get(s.id) ?? 0;
    const ach = computeAchievementPercent(s);
    const term = w * ach;
    weighted += Number.isFinite(term) ? term : 0;
    if (s.stage !== "completed") allCompleted = false;
    if (s.stage === "in_progress" || s.status === "active") anyInProgress = true;
  }

  const pt =
    parentTargetValue != null && parentTargetValue !== ""
      ? parseFloat(String(parentTargetValue))
      : 0;
  const progressPercentage = Math.min(
    100,
    Math.max(0, Number.isFinite(weighted) ? weighted : 0)
  );
  const sumChildCurrent = subGoals.reduce((sum, s) => {
    const x = parseFloat(String(s.currentValue ?? 0));
    return sum + (Number.isFinite(x) ? x : 0);
  }, 0);
  const scaledFromParent =
    pt > 0 && Number.isFinite(pt) ? (progressPercentage / 100) * pt : sumChildCurrent;
  const suggestedCurrentValue = Number.isFinite(scaledFromParent) ? scaledFromParent : sumChildCurrent;

  return {
    progressPercentage,
    suggestedCurrentValue,
    allCompleted,
    anyInProgress
  };
}

export function deriveParentStageFromRollup(args: {
  allCompleted: boolean;
  anyInProgress: boolean;
  weightedProgress: number;
  suggestedCurrentValue: number;
  subGoalCount: number;
  previousStage: string;
}): { stage: string; status: string } {
  const {
    allCompleted,
    anyInProgress,
    weightedProgress,
    suggestedCurrentValue,
    subGoalCount,
    previousStage
  } = args;
  if (allCompleted && subGoalCount > 0) {
    return { stage: "completed", status: "completed" };
  }
  if (anyInProgress || suggestedCurrentValue > 0 || weightedProgress > 0) {
    return { stage: "in_progress", status: "active" };
  }
  return { stage: previousStage || "planning", status: "active" };
}

/** Merge weight into activities JSON without schema migration. Preserves object keys; wraps legacy arrays. */
export function mergeContributionWeightIntoActivities(
  existing: unknown,
  contributionWeightPercent?: number | null
): Record<string, unknown> | null {
  if (contributionWeightPercent == null || Number.isNaN(Number(contributionWeightPercent))) {
    return null;
  }
  const w = Number(contributionWeightPercent);
  if (existing != null && typeof existing === "object" && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>), contributionWeightPercent: w };
  }
  if (Array.isArray(existing)) {
    return { entries: existing, contributionWeightPercent: w };
  }
  return { contributionWeightPercent: w };
}
