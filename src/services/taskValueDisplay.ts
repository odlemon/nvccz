/** Frontend: whether to show target/achieved and which symbol to use (from linked goal). */

export type TaskValueDisplay = {
  showValue: boolean;
  unitSymbol: string | null;
};

function isPercentageTargetUnit(unit: string): boolean {
  const u = unit.toLowerCase().trim();
  return u === "percentage" || u === "%" || u === "percent" || u.endsWith(" percent");
}

function kpiTracksPercent(kpi: { unitCategory?: string | null; type?: string | null } | null | undefined): boolean {
  if (!kpi) return false;
  const legacy = String((kpi as { type?: string }).type || "").toLowerCase();
  if (legacy === "percentage") return true;
  return String(kpi.unitCategory ?? "")
    .toLowerCase()
    .includes("percent");
}

function hasPositiveAmount(value: unknown): boolean {
  if (value == null || value === "") return false;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0;
}

function kpiUnitSymbol(
  kpi: { unitSymbol?: string | null } | null | undefined
): string | null {
  const s = kpi?.unitSymbol != null ? String(kpi.unitSymbol).trim() : "";
  return s || null;
}

/**
 * Uses linked goal `targetUnit` (and KPI symbol when present). Workflow tasks without targets → hide values.
 */
export function resolveTaskValueDisplay(task: {
  goalId?: string | null;
  goal?: {
    id?: string | null;
    targetUnit?: string | null;
    targetValue?: unknown;
    kpi?: { unitSymbol?: string | null; unitCategory?: string | null; hasUnit?: boolean | null } | null;
  } | null;
  monetaryValue?: unknown;
  percentValue?: unknown;
  kpi?: unknown;
  fromDueDiligence?: boolean;
  category?: string | null;
}): TaskValueDisplay {
  const goal = task.goal;
  const taskKpi = task.kpi && typeof task.kpi === "object" ? (task.kpi as Record<string, unknown>) : null;
  const goalKpi = goal?.kpi ?? null;

  const workflowOnly =
    !goal?.id &&
    !task.goalId &&
    (task.fromDueDiligence === true ||
      task.category === "PMS_ACTIVE_DD_ENTRY" ||
      (!hasPositiveAmount(task.monetaryValue) && !hasPositiveAmount(task.percentValue) && !taskKpi?.id));

  if (workflowOnly) {
    return { showValue: false, unitSymbol: null };
  }

  const targetUnit = goal?.targetUnit != null ? String(goal.targetUnit).trim() : "";
  const percentStyle =
    isPercentageTargetUnit(targetUnit) ||
    kpiTracksPercent(goalKpi) ||
    kpiTracksPercent(taskKpi as { unitCategory?: string; type?: string });

  const hasTarget =
    hasPositiveAmount(goal?.targetValue) ||
    hasPositiveAmount(task.monetaryValue) ||
    hasPositiveAmount(task.percentValue);

  if (!goal?.id && !task.goalId) {
    if (!hasTarget) return { showValue: false, unitSymbol: null };
    if (percentStyle) {
      return {
        showValue: true,
        unitSymbol: kpiUnitSymbol(goalKpi) ?? kpiUnitSymbol(taskKpi as { unitSymbol?: string }) ?? "%"
      };
    }
    return {
      showValue: true,
      unitSymbol: kpiUnitSymbol(goalKpi) ?? kpiUnitSymbol(taskKpi as { unitSymbol?: string }) ?? null
    };
  }

  if (!targetUnit && !hasTarget) {
    return { showValue: false, unitSymbol: null };
  }

  if (percentStyle) {
    return {
      showValue: hasTarget,
      unitSymbol: hasTarget
        ? kpiUnitSymbol(goalKpi) ?? kpiUnitSymbol(taskKpi as { unitSymbol?: string }) ?? "%"
        : null
    };
  }

  const symbol =
    kpiUnitSymbol(goalKpi) ??
    kpiUnitSymbol(taskKpi as { unitSymbol?: string }) ??
    (targetUnit && !isPercentageTargetUnit(targetUnit) ? targetUnit : null);

  return {
    showValue: Boolean(targetUnit || hasTarget),
    unitSymbol: symbol
  };
}

/** Omit misleading zero targets/achieved when the UI should not show value metrics. */
export function applyValueDisplayHardening<T extends Record<string, unknown>>(
  task: T,
  valueDisplay: TaskValueDisplay
): T {
  if (valueDisplay.showValue) return task;
  return {
    ...task,
    monetaryValue: null,
    monetaryValueAchieved: null,
    percentValue: null,
    percentValueAchieved: null
  };
}
