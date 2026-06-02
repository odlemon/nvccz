// @ts-nocheck
/**
 * Display `targetUnit` for API responses when the goal row has null but KPI / measureName do not.
 */

export type GoalTargetUnitKpi = {
  unit?: string | null;
  unitSymbol?: string | null;
  unitCategory?: string | null;
} | null;

export type GoalTargetUnitInput = {
  targetUnit?: string | null;
  measureName?: string | null;
  kpi?: GoalTargetUnitKpi;
};

function nonEmpty(s: unknown): string | null {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

/**
 * Resolved unit label for UI (GET goal, rollup, list enrichment).
 * Stored `targetUnit` wins; else KPI `unit` / `unitSymbol`; else goal `measureName`.
 */
export function resolveGoalTargetUnitForApi(
  goal: GoalTargetUnitInput,
  fallbackKpi?: GoalTargetUnitKpi
): string | null {
  const fromStored = nonEmpty(goal.targetUnit);
  if (fromStored) return fromStored;

  const kpi = goal.kpi ?? fallbackKpi ?? null;
  if (kpi) {
    const fromKpiUnit = nonEmpty(kpi.unit);
    if (fromKpiUnit) return fromKpiUnit;

    const fromSymbol = nonEmpty(kpi.unitSymbol);
    if (fromSymbol) return fromSymbol;

    const cat = String(kpi.unitCategory || "").toLowerCase();
    if (cat.includes("percent")) return "%";
  }

  const fromMeasure = nonEmpty(goal.measureName);
  if (fromMeasure) return fromMeasure;

  return null;
}
