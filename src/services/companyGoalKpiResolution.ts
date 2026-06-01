// @ts-nocheck
/**
 * Company (organisational) goals must link to a row in `kpis`.
 * Resolves catalog KPI id from kpiId, kpiName, formulaType, and title heuristics.
 */
import { prisma } from "../utils/database";
import { getKPIByCode, HARDCODED_KPIS } from "../config/hardcodedKPIs";
import { inferKpiScorecardPillar } from "../utils/inferKpiScorecardPillar";
import { normalizeOrgBscScorecardPillar } from "./performanceScorecardSupport";
import { ScorecardPillarService } from "./ScorecardPillarService";

export type CompanyGoalKpiSource = {
  id?: string;
  title?: string | null;
  formulaType?: string | null;
  measureName?: string | null;
  scorecardPillar?: string | null;
  scorecardSection?: string | null;
  kpiId?: string | null;
  kpiName?: string | null;
};

function normFormula(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normTitle(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/** Formula type → catalog `code` (hardcoded or BSC governance). */
export const FORMULA_TYPE_TO_KPI_CODE: Record<string, string> = {
  DIRECT: "__TITLE__",
  REVENUE_GROWTH: "TOTAL_REVENUE",
  ACCOUNTING_GL_REVENUE_PERIOD: "TOTAL_REVENUE",
  ACCOUNTING_GL_NET_PROFIT_PERIOD: "NET_PROFIT",
  PAYROLL_EXPENSE: "PAYROLL_EXPENSE",
  OPERATING_EXPENSES: "OPERATING_EXPENSES",
  STRATEGIC_ALLOCATION_COMPLIANCE: "BUDGET_UTILISATION",
  ALLOCATION_COMPLIANCE: "BUDGET_UTILISATION",
  RESOURCE_BUDGET_ALIGNMENT: "BUDGET_UTILISATION",
  COUNT_VS_TARGET: "__TITLE__",
  STRATEGIC_PLANNING_REVIEWS: "STRATEGIC_PLANNING_REVIEWS",
  NDS2_PROGRAMME_ACHIEVEMENT: "NDS2_PROGRAMME_ACHIEVEMENT",
  CORPORATE_GOVERNANCE_INDEX: "CORPORATE_GOVERNANCE_INDEX",
  GOVERNANCE_INDEX: "CORPORATE_GOVERNANCE_INDEX",
  STATUTORY_REPORTS: "STATUTORY_REPORTS",
  ROI: "NET_PROFIT",
  BUSINESS_SURVIVAL_RATE: "PORTFOLIO_FAIR_VALUE",
  FUNDING_RATE: "PORTFOLIO_FAIR_VALUE",
  PROJECTS_FUNDED: "PORTFOLIO_FAIR_VALUE",
  CAPITAL_DISBURSED: "PORTFOLIO_FAIR_VALUE",
  RESOURCES_MOBILISED: "TOTAL_REVENUE",
  PROCUREMENT_PLAN_COMPLIANCE: "PROCUREMENT_BUDGET_UTILISATION",
  EASE_OF_DOING_BUSINESS: "EASE_OF_DOING_BUSINESS",
  E_GOVERNMENT_FLAGSHIPS: "EASE_OF_DOING_BUSINESS",
  CHARTER_SCORE: "SERVICE_DELIVERY_CUSTOMER_CHARTER",
  CUSTOMER_SATISFACTION_INDEX: "CUSTOMER_SATISFACTION_INDEX",
  CSR_PARTICIPATION_RATE: "CSR_PARTICIPATION_RATE",
  VC_CUSTOMER_ACQUISITION_COST: "VC_CUSTOMER_ACQUISITION_COST",
  AUM_REALTIME: "PORTFOLIO_FAIR_VALUE",
  RATIO: "__TITLE__",
  ALTERNATIVE_RESOURCES_MOBILISED: "TOTAL_REVENUE"
};

const TITLE_TO_KPI_CODE: Array<{ test: RegExp; code: string }> = [
  { test: /\brevenue\b|\btotal income\b|\bincome growth\b/i, code: "TOTAL_REVENUE" },
  { test: /\bebit\b/i, code: "NET_PROFIT" },
  { test: /\bnet profit\b|\bprofit margin\b/i, code: "NET_PROFIT" },
  { test: /\bdebt.*equity\b|\bequity ratio\b/i, code: "TOTAL_LIABILITIES" },
  { test: /\bcustomer satisfaction\b/i, code: "CUSTOMER_SATISFACTION_INDEX" },
  { test: /\bintegrity\b|\banti-corruption\b/i, code: "CORPORATE_GOVERNANCE_INDEX" },
  { test: /\bhealth\b|\bwellness\b/i, code: "TRAINING_EXPENSE" },
  { test: /\binclusive\b|\bclean environment\b|\bcsr\b/i, code: "CSR_PARTICIPATION_RATE" },
  { test: /\balternative resources\b|\bresources mobilised\b/i, code: "TOTAL_REVENUE" },
  { test: /\boperating expense\b|\bopex\b/i, code: "OPERATING_EXPENSES" },
  { test: /\bpayroll\b|\bsalaries\b/i, code: "PAYROLL_EXPENSE" },
  { test: /\bnds2\b|\bnational development strategy\b/i, code: "NDS2_PROGRAMME_ACHIEVEMENT" },
  {
    test: /\bstrategic planning\b|\bplanning review\b/i,
    code: "STRATEGIC_PLANNING_REVIEWS"
  },
  {
    test: /\bperformance levels\b|\blevels evaluated\b/i,
    code: "PERFORMANCE_LEVELS_EVALUATED"
  },
  {
    test: /\ballocation\b|\bbudget alignment\b|\bresource budget\b/i,
    code: "BUDGET_UTILISATION"
  },
  { test: /\bgovernance\b|\bcompliance index\b/i, code: "CORPORATE_GOVERNANCE_INDEX" },
  { test: /\bstatutory report/i, code: "STATUTORY_REPORTS" },
  { test: /\bcustomer acquisition\b|\bvc cac\b|\bacquisition cost\b/i, code: "VC_CUSTOMER_ACQUISITION_COST" },
  { test: /\bassets under management\b|\baum\b/i, code: "PORTFOLIO_FAIR_VALUE" },
  { test: /\bportfolio fair value\b|\bfair value\b/i, code: "PORTFOLIO_FAIR_VALUE" },
  { test: /\bprocurement\b/i, code: "PROCUREMENT_BUDGET_UTILISATION" },
  { test: /\btraining\b|\bskills development\b/i, code: "TRAINING_EXPENSE" },
  { test: /\bmarketing expense\b|\bmarketing spend\b/i, code: "MARKETING_EXPENSE" },
  { test: /\bcash flow\b/i, code: "CASH_FLOW_NET" },
  { test: /\bcash balance\b/i, code: "CASH_BALANCE" }
];

/** Display names for BSC-only catalog codes (not in HARDCODED_KPIS). */
const BSC_KPI_CATALOG_DEFAULTS: Record<
  string,
  { name: string; catalogDepartmentName: string; description: string }
> = {
  STRATEGIC_PLANNING_REVIEWS: {
    name: "Strategic Planning Reviews",
    catalogDepartmentName: "Operations",
    description: "Strategic planning reviews completed vs planned (BSC)"
  },
  NDS2_PROGRAMME_ACHIEVEMENT: {
    name: "NDS2 Programme Achievement",
    catalogDepartmentName: "Operations",
    description: "National Development Strategy programme KPI achievement (BSC)"
  },
  PERFORMANCE_LEVELS_EVALUATED: {
    name: "Performance Levels Evaluated",
    catalogDepartmentName: "Human Resources",
    description: "Organisational performance levels evaluated vs target (BSC)"
  },
  CORPORATE_GOVERNANCE_INDEX: {
    name: "Corporate Governance Index",
    catalogDepartmentName: "Legal",
    description: "Corporate governance checklist / index score (BSC)"
  },
  STATUTORY_REPORTS: {
    name: "Statutory Reports Produced",
    catalogDepartmentName: "Finance",
    description: "Statutory reports produced vs target (BSC)"
  },
  SERVICE_DELIVERY_CUSTOMER_CHARTER: {
    name: "Service Delivery Customer Charter",
    catalogDepartmentName: "Operations",
    description: "Customer charter service delivery score (BSC)"
  },
  EASE_OF_DOING_BUSINESS: {
    name: "Ease of Doing Business Progress",
    catalogDepartmentName: "Operations",
    description: "Ease of doing business / e-government progress (BSC)"
  },
  CSR_PARTICIPATION_RATE: {
    name: "CSR Participation Rate",
    catalogDepartmentName: "Marketing",
    description: "CSR and community participation rate (BSC)"
  },
  CUSTOMER_SATISFACTION_INDEX: {
    name: "Customer Satisfaction Index",
    catalogDepartmentName: "Sales",
    description: "Customer satisfaction survey index (BSC)"
  }
};

function humanizeCode(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function titleMatchCode(title: string): string | null {
  for (const { test, code } of TITLE_TO_KPI_CODE) {
    if (test.test(title)) return code;
  }
  return null;
}

/**
 * Resolve catalog KPI code from goal fields (no DB).
 */
export function resolveCompanyGoalKpiCode(goal: CompanyGoalKpiSource): string | null {
  const formula = normFormula(goal.formulaType);
  if (formula) {
    const mapped = FORMULA_TYPE_TO_KPI_CODE[formula];
    if (mapped && mapped !== "__TITLE__") return mapped;
    if (mapped === "__TITLE__" || !mapped) {
      const byTitle = titleMatchCode(String(goal.title || ""));
      if (byTitle) return byTitle;
      if (!mapped && /^[A-Z][A-Z0-9_]+$/.test(formula)) return formula;
    }
  }
  const byTitle = titleMatchCode(String(goal.title || ""));
  if (byTitle) return byTitle;
  return null;
}

function pillarForGoal(goal: CompanyGoalKpiSource, catalog: {
  name: string;
  code: string | null;
  catalogDescription: string | null;
  accountType: string | null;
  catalogDepartmentName: string | null;
  isFinancial: boolean;
  unitCategory: string | null;
}): string {
  const fromGoal = goal.scorecardPillar ? normalizeOrgBscScorecardPillar(goal.scorecardPillar) : null;
  if (fromGoal) return fromGoal;
  const section = String(goal.scorecardSection || "").toUpperCase();
  if (section === "A1" || section === "C") return "Financial";
  if (section === "D") return "Customer & Market";
  if (section === "B") return "Learning, Growth & HR";
  if (section === "A2") return "Internal Operations";
  return inferKpiScorecardPillar(catalog);
}

/**
 * Find or create a KPI catalog row by code.
 */
export async function ensureKpiCatalogByCode(
  code: string,
  goal: CompanyGoalKpiSource = {}
): Promise<{ id: string; name: string; code: string | null }> {
  const codeKey = String(code || "").trim().toUpperCase();
  if (!codeKey) throw new Error("KPI code is required");

  const displayName = BSC_KPI_CATALOG_DEFAULTS[codeKey]?.name ?? getKPIByCode(codeKey)?.name ?? humanizeCode(codeKey);
  const existing = await prisma.kPI.findFirst({
    where: { OR: [{ code: codeKey }, { name: displayName }] }
  });
  if (existing) return existing;

  const hardcoded = getKPIByCode(codeKey);
  const bsc = BSC_KPI_CATALOG_DEFAULTS[codeKey];
  const name = hardcoded?.name ?? bsc?.name ?? humanizeCode(codeKey);
  const catalogDepartmentName =
    hardcoded?.department ?? bsc?.catalogDepartmentName ?? "Operations";
  const catalogDescription =
    hardcoded?.description ?? bsc?.description ?? `BSC / performance KPI (${codeKey})`;
  const isFinancial = hardcoded?.isFinancial ?? false;
  const accountType = hardcoded?.accountType ?? null;
  const journalEntryType = hardcoded?.journalEntryType ?? null;
  const accountNumber = hardcoded?.accountNumber ?? null;

  const pillarInput = {
    name,
    code: codeKey,
    catalogDescription,
    accountType,
    catalogDepartmentName,
    isFinancial,
    unitCategory: isFinancial ? "Currency" : "Percentage"
  };
  const scorecardPillar = pillarForGoal(goal, pillarInput);
  await ScorecardPillarService.assertCanonicalExists(scorecardPillar);

  const hasUnit = true;
  const unitCategory = isFinancial ? "Currency" : "Percentage";
  const unit = isFinancial ? "USD" : "%";
  const unitSymbol = isFinancial ? "$" : "%";

  const created = await prisma.kPI.create({
    data: {
      name,
      code: codeKey,
      catalogDescription,
      catalogDepartmentName,
      accountType,
      accountNumber,
      journalEntryType,
      isFinancial,
      isReverseKpi:
        accountType === "Expense" || accountType === "Liability",
      hasUnit,
      unitCategory,
      unit,
      unitSymbol,
      unitPosition: "suffix",
      scorecardPillar,
      isActive: true
    }
  });
  return created;
}

/**
 * Resolve KPI id for an existing or incoming company goal.
 */
export async function resolveCompanyGoalKpiId(
  goal: CompanyGoalKpiSource,
  opts: { createIfMissing?: boolean } = {}
): Promise<string | null> {
  const createIfMissing = opts.createIfMissing !== false;

  if (goal.kpiId) {
    const row = await prisma.kPI.findUnique({ where: { id: goal.kpiId }, select: { id: true } });
    if (row) return row.id;
  }

  const kpiName = goal.kpiName != null ? String(goal.kpiName).trim() : "";
  if (kpiName) {
    const byName = await prisma.kPI.findFirst({
      where: { name: kpiName },
      select: { id: true }
    });
    if (byName) return byName.id;
  }

  const code = resolveCompanyGoalKpiCode(goal);
  if (!code) return null;

  const byCode = await prisma.kPI.findFirst({
    where: { code },
    select: { id: true }
  });
  if (byCode) return byCode.id;

  const hardcoded = HARDCODED_KPIS.find((k) => k.code === code);
  if (hardcoded) {
    const byHcName = await prisma.kPI.findFirst({
      where: { name: hardcoded.name },
      select: { id: true }
    });
    if (byHcName) return byHcName.id;
  }

  if (!createIfMissing) return null;
  const ensured = await ensureKpiCatalogByCode(code, goal);
  return ensured.id;
}

export async function requireCompanyGoalKpiId(
  input: CompanyGoalKpiSource
): Promise<string> {
  const id = await resolveCompanyGoalKpiId(input, { createIfMissing: true });
  if (!id) {
    throw new Error(
      "Organisational (company) goals must be linked to a KPI. Provide kpiId, kpiName, or a formulaType/title that maps to the KPI catalog."
    );
  }
  return id;
}
