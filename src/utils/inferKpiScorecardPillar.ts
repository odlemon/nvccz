/**
 * Infer Balanced Scorecard org pillar for a KPI row (for seeding, migration, and defaults).
 * Canonical values must match `ORG_BSC_PILLAR_META` keys in `performanceScorecardSupport`.
 */
export type KpiPillarInput = {
  name: string;
  code: string | null;
  catalogDescription: string | null;
  accountType: string | null;
  catalogDepartmentName: string | null;
  isFinancial: boolean;
  unitCategory: string | null;
};

const FINANCIAL = "Financial" as const;
const CUSTOMER = "Customer & Market" as const;
const INTERNAL = "Internal Operations" as const;
const LEARNING = "Learning, Growth & HR" as const;

export const SCORECARD_PILLAR_VALUES = [FINANCIAL, CUSTOMER, INTERNAL, LEARNING] as const;

/**
 * Heuristic: classify KPIs so finance-heavy catalog rows map to Financial,
 * HR/learning to Learning, customer/market/satisfaction to Customer & Market,
 * procurement/ops/IT to Internal Operations.
 */
export function inferKpiScorecardPillar(k: KpiPillarInput): (typeof SCORECARD_PILLAR_VALUES)[number] {
  const name = String(k.name || "").toLowerCase();
  const code = String(k.code || "").toLowerCase();
  const desc = String(k.catalogDescription || "").toLowerCase();
  const dept = String(k.catalogDepartmentName || "").toLowerCase();
  const unitCat = String(k.unitCategory || "").toLowerCase();
  const hay = `${name} ${code} ${desc} ${dept} ${unitCat}`;

  if (
    /\b(nps|net promoter|satisfaction|customer|client|stakeholder|market(ing)?\s+reach|brand|revenue\s+per\s+customer|retention|survey)\b/.test(
      hay
    ) &&
    !/\b(marketing expense|advertising spend)\b/.test(hay)
  ) {
    return CUSTOMER;
  }
  if (
    /\b(training|skill|hr |human resources|payroll|headcount|employee|learning|certificate|capacity|turnover|workforce|people)\b/.test(
      hay
    ) ||
    /\b(human resources|hr)\b/.test(dept)
  ) {
    return LEARNING;
  }
  if (
    /\b(procurement|purchase order|supplier|rfq|operations|compliance|legal|it |inventory|logistics|process)\b/.test(
      hay
    ) ||
    (dept.includes("procurement") && !hay.includes("marketing"))
  ) {
    return INTERNAL;
  }

  if (k.isFinancial) {
    if (
      /\b(advertis|market(ing)?\s+expense|branding|sales commission)\b/.test(hay) &&
      !/\b(net profit|ebit|roi|cash)\b/.test(hay)
    ) {
      return CUSTOMER;
    }
    return FINANCIAL;
  }

  if (k.accountType && ["Revenue", "Expense", "Asset", "Liability", "Equity"].includes(k.accountType)) {
    if (/\b(marketing|advertis|customer)\b/.test(hay) && !/\b(net profit|income tax)\b/.test(hay)) {
      return CUSTOMER;
    }
    return FINANCIAL;
  }

  if (dept.includes("human resources") || dept.includes("hr ")) {
    return LEARNING;
  }
  if (dept.includes("investments") || dept.includes("finance")) {
    if (/\b(fair value|unrealiz|gain|loss|portfolio|irr|aum)\b/.test(hay)) {
      return FINANCIAL;
    }
  }

  return INTERNAL;
}
