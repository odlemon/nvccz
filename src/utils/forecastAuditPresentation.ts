// @ts-nocheck
import { formatForecastAuditUserName } from "./forecastUserDisplay";

export const FORECAST_AUDIT_ACTION_LABELS: Record<string, string> = {
  SCENARIO_CREATE: "Scenario created",
  SCENARIO_UPDATE: "Scenario updated",
  SCENARIO_PROMOTE: "Scenario activated",
  DRIVER_UPDATE: "Planning driver updated",
  CELL_EDIT: "Forecast cell updated",
  CELL_BATCH_EDIT: "Forecast cells updated",
  CELL_OVERRIDE_CLEAR: "Manual override cleared",
  COMPUTE: "Forecast recalculated",
  GL_SYNC: "GL actuals synced",
  LOCK: "Scenario locked",
  LOCK_VIOLATION: "Edit blocked on locked scenario",
  VERSION_DUPLICATE: "Working copy created",
  GOAL_LINK_CREATE: "OPM goal linked",
  GOAL_LINK_DELETE: "OPM goal unlinked",
  PORTFOLIO_DISPATCH: "Portfolio report imported",
  OPM_AT_RISK: "Performance goal at risk"
};

const COMPUTE_TRIGGER_LABELS: Record<string, string> = {
  CELL: "manual cell edit",
  DRIVER: "driver change",
  SCENARIO_RECALC: "portfolio import",
  GL_SYNC: "GL sync",
  ACCOUNT_RANGE: "account range change",
  PERIOD_RANGE: "period range change"
};

const DRIVER_TYPE_LABELS: Record<string, string> = {
  CAGR_DRIVEN: "CAGR growth",
  HEADCOUNT_GROWTH: "Headcount growth",
  INFLATION_MULTIPLIER: "Inflation multiplier",
  FX_SCALAR: "FX scalar",
  LINEAR_REGRESSION: "Linear regression",
  MANUAL_OVERRIDE: "Manual override"
};

export type AuditPresentation = {
  action_label: string;
  summary: string;
  actor_label: string;
};

export function formatAuditMoney(value: unknown, currency = "USD"): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(n);
  return `${formatted} ${String(currency || "USD").toUpperCase()}`;
}

export function formatAuditPeriod(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    return input.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const s = String(input).trim();
  const periodKey = s.match(/^(\d{4})-(\d{2})/);
  if (periodKey) {
    const d = new Date(Date.UTC(Number(periodKey[1]), Number(periodKey[2]) - 1, 1));
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return s.slice(0, 10);
}

function payload(p: unknown): Record<string, unknown> {
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function accountLabel(p: Record<string, unknown>): string | null {
  const no = str(p.account_no);
  const name = str(p.account_name);
  if (no && name) return `${no} ${name}`;
  return no || name;
}

function computeTriggerLabel(editType: unknown): string {
  const key = String(editType || "").toUpperCase();
  return COMPUTE_TRIGGER_LABELS[key] || "model change";
}

function driverTypeLabel(driverType: unknown): string {
  const key = String(driverType || "").toUpperCase();
  return DRIVER_TYPE_LABELS[key] || key.replace(/_/g, " ").toLowerCase() || "driver";
}

function joinSummaryParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

async function getPrisma() {
  const { prisma } = await import("./database");
  return prisma;
}

async function resolvePortfolioCompanyName(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const prisma = await getPrisma();
  const row = await prisma.portfolioCompany.findUnique({ where: { id }, select: { name: true } });
  return row?.name ?? null;
}

async function resolveAccountMeta(accountId: string | null | undefined): Promise<{
  account_no: string | null;
  account_name: string | null;
}> {
  if (!accountId) return { account_no: null, account_name: null };
  const prisma = await getPrisma();
  const row = await prisma.entityChartOfAccount.findUnique({
    where: { id: accountId },
    select: { accountNo: true, accountName: true }
  });
  return row
    ? { account_no: row.accountNo, account_name: row.accountName }
    : { account_no: null, account_name: null };
}

async function resolveGoalTitle(goalId: string | null | undefined): Promise<string | null> {
  if (!goalId) return null;
  const prisma = await getPrisma();
  const row = await prisma.performanceGoal.findUnique({ where: { id: goalId }, select: { title: true } });
  return row?.title ?? null;
}

async function resolveReportMeta(reportId: string | null | undefined): Promise<{
  title: string | null;
  reporting_period: string | null;
  total_revenue: number | null;
  net_profit: number | null;
}> {
  if (!reportId) {
    return { title: null, reporting_period: null, total_revenue: null, net_profit: null };
  }
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<
    Array<{ title: string | null; reportingPeriod: unknown; totalRevenue: unknown; netProfit: unknown }>
  >(
    `SELECT title, reportingPeriod, totalRevenue, netProfit FROM financial_reports WHERE id = ? LIMIT 1`,
    reportId
  );
  const r = rows[0];
  if (!r) {
    return { title: null, reporting_period: null, total_revenue: null, net_profit: null };
  }
  const rp = r.reportingPeriod;
  const reporting_period =
    rp instanceof Date ? rp.toISOString().slice(0, 10) : String(rp || "").slice(0, 10) || null;
  return {
    title: r.title ?? null,
    reporting_period,
    total_revenue: num(r.totalRevenue),
    net_profit: num(r.netProfit)
  };
}

async function hydratePayload(
  actionType: string,
  raw: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const p = { ...raw };

  if (!p.portfolio_company_name && p.portfolio_company_id) {
    p.portfolio_company_name = await resolvePortfolioCompanyName(str(p.portfolio_company_id));
  }

  if ((!p.account_no || !p.account_name) && p.account_id) {
    const acct = await resolveAccountMeta(str(p.account_id));
    if (!p.account_no) p.account_no = acct.account_no;
    if (!p.account_name) p.account_name = acct.account_name;
  }

  if (actionType === "PORTFOLIO_DISPATCH" && p.report_id) {
    const report = await resolveReportMeta(str(p.report_id));
    if (!p.report_title && report.title) p.report_title = report.title;
    if (!p.reporting_period && report.reporting_period) p.reporting_period = report.reporting_period;
    if (!p.period_key && report.reporting_period) {
      const d = new Date(report.reporting_period);
      if (!Number.isNaN(d.getTime())) {
        p.period_key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }
    }
    if (p.total_revenue == null && report.total_revenue != null) p.total_revenue = report.total_revenue;
    if (p.net_profit == null && report.net_profit != null) p.net_profit = report.net_profit;
  }

  if (!p.performance_goal_title && p.performance_goal_id) {
    p.performance_goal_title = await resolveGoalTitle(str(p.performance_goal_id));
  }

  return p;
}

function buildPresentationFromPayload(
  actionType: string,
  p: Record<string, unknown>,
  actorLabel: string
): AuditPresentation {
  const action_label = FORECAST_AUDIT_ACTION_LABELS[actionType] || actionType.replace(/_/g, " ");
  let summary = action_label;

  switch (actionType) {
    case "PORTFOLIO_DISPATCH": {
      const company = str(p.portfolio_company_name) || "Portfolio company";
      const period = formatAuditPeriod(p.period_key || p.reporting_period) || "reporting period";
      const rev = formatAuditMoney(p.total_revenue, str(p.tx_currency) || "USD");
      const profit = formatAuditMoney(p.net_profit, str(p.tx_currency) || "USD");
      const amounts =
        rev && profit ? `Revenue ${rev}, Net profit ${profit}` : rev || profit || null;
      const reportTitle = str(p.report_title);
      summary = joinSummaryParts([
        `${company} · ${period}: accepted investee report applied to forecast`,
        amounts,
        reportTitle ? `Report: ${reportTitle}` : null
      ]);
      break;
    }
    case "CELL_EDIT": {
      const acct = accountLabel(p) || "Account";
      const period = formatAuditPeriod(p.period_key) || "period";
      const currency = str(p.tx_currency) || "USD";
      const before = formatAuditMoney(p.before_value ?? p.before?.tx_currency_value, currency);
      const after = formatAuditMoney(p.after_value ?? p.new_value ?? p.after?.tx_currency_value, currency);
      const overrideNote = p.is_manual_override ? "manual override" : null;
      const companyNote = p.portfolio_company_name ? `company ${p.portfolio_company_name}` : null;
      if (before && after) {
        summary = joinSummaryParts([`${acct} · ${period}: ${before} → ${after}`, overrideNote, companyNote]);
      } else if (after) {
        summary = joinSummaryParts([`${acct} · ${period}: set to ${after}`, overrideNote, companyNote]);
      } else {
        summary = joinSummaryParts([`${acct} · ${period}: forecast value updated`, overrideNote]);
      }
      break;
    }
    case "CELL_OVERRIDE_CLEAR": {
      const acct = accountLabel(p) || "Account";
      const period = formatAuditPeriod(p.period_key) || "period";
      summary = `${acct} · ${period}: manual override cleared — reverts to driver or calculated value`;
      break;
    }
    case "CELL_BATCH_EDIT": {
      const count = num(p.edit_count) ?? num(p.edits) ?? 0;
      summary = `${count} forecast cell${count === 1 ? "" : "s"} updated in batch`;
      break;
    }
    case "DRIVER_UPDATE": {
      const drivers = Array.isArray(p.drivers) ? p.drivers : [];
      if (drivers.length === 1) {
        const d = drivers[0] as Record<string, unknown>;
        const dtype = driverTypeLabel(d.driver_type);
        const start = d.target_account_range_start ?? d.range_start;
        const end = d.target_account_range_end ?? d.range_end;
        const params = (d.parameters || {}) as Record<string, unknown>;
        const extras: string[] = [];
        if (params.cagr_scalar != null) {
          extras.push(`${(Number(params.cagr_scalar) * 100).toFixed(1)}% growth`);
        }
        if (params.inflation_rate != null) {
          extras.push(`${(Number(params.inflation_rate) * 100).toFixed(1)}% inflation`);
        }
        const base = formatAuditMoney(params.historical_base, str(params.tx_currency) || "USD");
        if (base) extras.push(`base ${base}`);
        summary = joinSummaryParts([
          `${dtype} driver applied to accounts ${start}–${end}`,
          extras.length ? extras.join(", ") : null
        ]);
      } else {
        const count = num(p.driver_count) ?? drivers.length;
        summary = `${count} planning driver${count === 1 ? "" : "s"} saved and model recalculated`;
      }
      break;
    }
    case "COMPUTE": {
      const affected = num(p.affected_cell_count) ?? num(p.affected) ?? 0;
      const editType = String(p.edit_type || "").toUpperCase();
      const trigger = p.internal_event
        ? String(p.internal_event).replace(/_/g, " ").toLowerCase()
        : computeTriggerLabel(p.edit_type);
      if (affected > 0) {
        summary = `${affected} forecast cell${affected === 1 ? "" : "s"} recalculated after ${trigger}`;
      } else if (editType === "CELL") {
        summary = `Model rechecked after ${trigger}; no other cells changed`;
      } else {
        summary = `Recalculation after ${trigger}; no cells changed`;
      }
      break;
    }
    case "GL_SYNC": {
      const updated = num(p.updated_cells) ?? 0;
      const periods = Array.isArray(p.elapsed_periods) ? p.elapsed_periods : [];
      const periodText = periods.length ? periods.join(", ") : null;
      summary = joinSummaryParts([
        `${updated} forecast cell${updated === 1 ? "" : "s"} updated from posted GL actuals`,
        periodText ? `Periods: ${periodText}` : null
      ]);
      break;
    }
    case "SCENARIO_CREATE": {
      const name = str(p.name) || "Scenario";
      const entity = str(p.entity_name) || "entity";
      const horizon =
        p.horizon_start && p.horizon_end
          ? `${p.horizon_start} → ${p.horizon_end}`
          : str(p.horizon) || "";
      summary = joinSummaryParts([
        `${name} created for ${entity}`,
        horizon || null,
        p.fund_name ? `Fund: ${p.fund_name}` : null
      ]);
      break;
    }
    case "SCENARIO_PROMOTE": {
      const before = str(p.before?.status) || str(p.from) || "DRAFT";
      const after = str(p.after?.status) || str(p.to) || "ACTIVE";
      summary = `Scenario activated: status ${before} → ${after}`;
      break;
    }
    case "SCENARIO_UPDATE": {
      const before = payload(p.before);
      const after = payload(p.after);
      const changes: string[] = [];
      if (before.status && after.status && before.status !== after.status) {
        changes.push(`status ${before.status} → ${after.status}`);
      }
      if (before.name && after.name && before.name !== after.name) {
        changes.push(`name updated`);
      }
      summary = changes.length ? `Scenario updated: ${changes.join(", ")}` : "Scenario metadata updated";
      break;
    }
    case "LOCK": {
      const label = str(p.version_label) || "board-approved version";
      summary = `Scenario locked as ${label}`;
      break;
    }
    case "VERSION_DUPLICATE": {
      const source = str(p.source_version_label) || str(p.source_version_id) || "locked version";
      const name = str(p.new_scenario_name);
      summary = name
        ? `Working copy created: ${name}`
        : `Working copy created from ${source}`;
      break;
    }
    case "GOAL_LINK_CREATE":
    case "GOAL_LINK_DELETE": {
      const goal = str(p.performance_goal_title) || "performance goal";
      summary =
        actionType === "GOAL_LINK_CREATE"
          ? `Forecast linked to OPM goal: ${goal}`
          : `OPM goal link removed: ${goal}`;
      break;
    }
    case "LOCK_VIOLATION": {
      const attempted = str(p.attempted_action);
      summary = attempted
        ? `Edit rejected — scenario is locked (attempted: ${attempted})`
        : "Edit rejected — scenario is locked";
      break;
    }
    default:
      break;
  }

  return {
    action_label,
    summary,
    actor_label: actorLabel
  };
}

export async function buildAuditPresentation(row: {
  actionType: string;
  deltaPayload: unknown;
  userId?: string | null;
  user?: { firstName?: string | null; lastName?: string | null; email?: string } | null;
}): Promise<AuditPresentation> {
  const userName = formatForecastAuditUserName(row.user ?? null);
  const actor_label = userName || (row.userId ? "User" : "System");
  const hydrated = await hydratePayload(row.actionType, payload(row.deltaPayload));
  return buildPresentationFromPayload(row.actionType, hydrated, actor_label);
}

export function buildAuditPresentationSync(
  actionType: string,
  deltaPayload: Record<string, unknown>,
  actorLabel = "System"
): AuditPresentation {
  return buildPresentationFromPayload(actionType, deltaPayload, actorLabel);
}
