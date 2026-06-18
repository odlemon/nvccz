// @ts-nocheck

export const FORECAST_SCENARIO_STATUSES = ["DRAFT", "ACTIVE", "LOCKED"] as const;
export type ForecastScenarioStatus = (typeof FORECAST_SCENARIO_STATUSES)[number];

export const FORECAST_GRANULARITIES = ["MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
export type ForecastGranularity = (typeof FORECAST_GRANULARITIES)[number];

export const FORECAST_DRIVER_TYPES = [
  "CAGR_DRIVEN",
  "HEADCOUNT_GROWTH",
  "INFLATION_MULTIPLIER",
  "FX_SCALAR",
  "LINEAR_REGRESSION",
  "MANUAL_OVERRIDE"
] as const;
export type ForecastDriverType = (typeof FORECAST_DRIVER_TYPES)[number];

export const FORECAST_DIMENSION_TYPES = ["ACCOUNT", "DEPT", "TAG", "PORTFOLIO_COMPANY"] as const;

export const FORECAST_AUDIT_ACTIONS = [
  "SCENARIO_CREATE",
  "SCENARIO_UPDATE",
  "SCENARIO_PROMOTE",
  "DRIVER_UPDATE",
  "CELL_EDIT",
  "CELL_BATCH_EDIT",
  "CELL_OVERRIDE_CLEAR",
  "COMPUTE",
  "GL_SYNC",
  "LOCK",
  "LOCK_VIOLATION",
  "VERSION_DUPLICATE",
  "GOAL_LINK_CREATE",
  "GOAL_LINK_DELETE",
  "PORTFOLIO_DISPATCH"
] as const;

export const FORECAST_AUDIT_PRIORITIES = ["NORMAL", "HIGH"] as const;

export const FORECAST_COMPUTE_EDIT_TYPES = [
  "CELL",
  "DRIVER",
  "SCENARIO_RECALC",
  "ACCOUNT_RANGE",
  "PERIOD_RANGE",
  "GL_SYNC"
] as const;

export const FORECAST_COMPUTE_JOB_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;

export const FORECAST_ERROR_CODES = {
  INVALID_FORMULA: "INVALID_FORMULA",
  INVALID_HORIZON: "INVALID_HORIZON",
  INVALID_PERIOD: "INVALID_PERIOD",
  INVALID_ACCOUNT: "INVALID_ACCOUNT",
  INVALID_COORDINATES: "INVALID_COORDINATES",
  FORECAST_LOCKED: "FORECAST_LOCKED",
  FORBIDDEN_ROLE: "FORBIDDEN_ROLE",
  SCENARIO_NOT_FOUND: "SCENARIO_NOT_FOUND",
  VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
  CIRCULAR_REFERENCE: "CIRCULAR_REFERENCE",
  DRIVER_RANGE_OVERLAP: "DRIVER_RANGE_OVERLAP",
  STALE_CELL_EDIT: "STALE_CELL_EDIT",
  COMPUTE_IN_PROGRESS: "COMPUTE_IN_PROGRESS",
  INVALID_CURRENCY: "INVALID_CURRENCY",
  EVENT_BUDGET_EXCEEDED: "EVENT_BUDGET_EXCEEDED",
  COMPUTE_TIMEOUT: "COMPUTE_TIMEOUT",
  FEATURE_DISABLED: "FEATURE_DISABLED"
} as const;

export const FORECAST_HORIZON_PRESETS_MONTHS = [12, 24, 60] as const;

export const FORECAST_ALLOWED_TX_CURRENCIES = ["USD", "ZIG", "ZWG"] as const;

export const COA_RANGE_PRESETS: Record<
  string,
  { rangeStart: number; rangeEnd: number; label: string }
> = {
  COA_RANGE_REVENUE: { rangeStart: 4000, rangeEnd: 4999, label: "Revenue" },
  COA_RANGE_OPEX: { rangeStart: 5000, rangeEnd: 5999, label: "Operating Expense" },
  COA_RANGE_COGS: { rangeStart: 6000, rangeEnd: 6999, label: "Cost of Goods Sold" },
  COA_RANGE_ASSETS: { rangeStart: 1000, rangeEnd: 1999, label: "Assets" },
  COA_RANGE_LIABILITIES: { rangeStart: 2000, rangeEnd: 2999, label: "Liabilities" },
  COA_RANGE_EQUITY: { rangeStart: 3000, rangeEnd: 3999, label: "Equity" }
};

export function parseCoaRangePreset(valueId: string): { rangeStart: number; rangeEnd: number } | null {
  const preset = COA_RANGE_PRESETS[valueId];
  if (!preset) return null;
  return { rangeStart: preset.rangeStart, rangeEnd: preset.rangeEnd };
}

export function parseAccountNo(accountNo: string | number | null | undefined): number | null {
  if (accountNo == null || accountNo === "") return null;
  const n = parseInt(String(accountNo).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function accountNoInRange(accountNo: string | number, start: number, end: number): boolean {
  const n = parseAccountNo(accountNo);
  if (n == null) return false;
  return n >= start && n <= end;
}

export function getForecastLockRoleCodes(): string[] {
  const env = process.env.FORECAST_LOCK_ROLE_CODES?.trim();
  if (env) {
    return env.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["FORECAST_LOCK", "CFO", "SYSADMIN"];
}

export function isForecastEnabled(): boolean {
  const v = process.env.FORECAST_ENABLED;
  if (v == null || v === "") return true;
  return !["0", "false", "FALSE", "no"].includes(v);
}

export const FORECAST_FORMULA_MAX_LENGTH = 4096;

export const FORECAST_BATCH_CELL_MAX = 500;

export const FORECAST_COMPUTE_TIMEOUT_MS = Number(process.env.FORECAST_COMPUTE_TIMEOUT_MS || 120000);
