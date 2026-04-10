/**
 * Whitelisted operational / non-financial KPI fields (per reporting period).
 * Values are stored as numbers; churn may be entered as decimal (0.05 = 5%) or 0–100 — see normalize.
 */

export const OPERATIONAL_KPI_FIELD_KEYS = [
  "churnRate",
  "customerCountAtPeriodStart",
  "customerCountAtPeriodEnd",
  "customersLost",
  "newCustomersCount",
  "monthlyRecurringRevenue",
  "averageRevenuePerCustomerPerMonth",
  /** Overrides Sum(advertising + R&D) from income statement when set. */
  "salesAndMarketingSpend",
  "leadOrVisitorCount",
  "customersFromLeads",
  "averageSellingPricePerUnit",
  "variableCostPerUnit",
  /** For inventory turnover when not derivable from balance sheet averages. */
  "averageInventory",
  /** Net dollar retention numerator/denominator (same cohort). */
  "revenueFromExistingCustomersThisPeriod",
  "priorPeriodRevenueFromExistingCustomers",
] as const;

/** OpenAPI `properties` entries: descriptions + illustrative examples (use 0 in requests when N/A). */
export const OPERATIONAL_KPI_OPENAPI_PROPERTIES: Record<
  (typeof OPERATIONAL_KPI_FIELD_KEYS)[number],
  { type: "number"; description: string; example: number }
> = {
  churnRate: {
    type: "number",
    description:
      "Period churn as decimal (e.g. 0.05 = 5%). If you send a whole number > 1, it is treated as a percent (5 → 0.05). Use 0 if not applicable.",
    example: 0.02,
  },
  customerCountAtPeriodStart: {
    type: "number",
    description: "Customers / subscribers at the start of the reporting period (for cohort churn). Use 0 if N/A.",
    example: 1180,
  },
  customerCountAtPeriodEnd: {
    type: "number",
    description: "Customers / subscribers at period end. Use 0 if N/A.",
    example: 1245,
  },
  customersLost: {
    type: "number",
    description: "Customers lost during the period (gross churn count). Use 0 if N/A.",
    example: 24,
  },
  newCustomersCount: {
    type: "number",
    description: "New customers acquired in the period (CAC denominator). Use 0 if N/A.",
    example: 89,
  },
  monthlyRecurringRevenue: {
    type: "number",
    description: "MRR for subscription businesses (currency same as reporting). Use 0 if N/A.",
    example: 138500,
  },
  averageRevenuePerCustomerPerMonth: {
    type: "number",
    description: "ARPU per month (LTV inputs). Use 0 if N/A.",
    example: 425.5,
  },
  salesAndMarketingSpend: {
    type: "number",
    description:
      "Total sales & marketing spend for the period (CAC numerator). If > 0, overrides proxy from income statement line items. Use 0 to rely on statement-derived proxy or when N/A.",
    example: 192000,
  },
  leadOrVisitorCount: {
    type: "number",
    description: "Leads or visitors in funnel (conversion denominator). Use 0 if N/A.",
    example: 12500,
  },
  customersFromLeads: {
    type: "number",
    description: "New customers attributed to leads/visitors (conversion numerator). Use 0 if N/A.",
    example: 89,
  },
  averageSellingPricePerUnit: {
    type: "number",
    description: "Average sales price per unit (unit economics). Use 0 if N/A.",
    example: 149.99,
  },
  variableCostPerUnit: {
    type: "number",
    description: "Variable cost per unit (unit contribution). Use 0 if N/A.",
    example: 62.4,
  },
  averageInventory: {
    type: "number",
    description:
      "Average inventory for the period when COGS-based inventory turnover cannot use balance sheet alone. Use 0 if N/A.",
    example: 480000,
  },
  revenueFromExistingCustomersThisPeriod: {
    type: "number",
    description: "Revenue from the same existing-customer cohort this period (net dollar retention numerator). Use 0 if N/A.",
    example: 1060000,
  },
  priorPeriodRevenueFromExistingCustomers: {
    type: "number",
    description: "Revenue from that same cohort in the prior period (net dollar retention denominator). Use 0 if N/A.",
    example: 1000000,
  },
};

/** Reference body for docs and Swagger `example` (every key present; use 0 where not applicable). */
export const OPERATIONAL_KPI_FULL_EXAMPLE: Record<(typeof OPERATIONAL_KPI_FIELD_KEYS)[number], number> = {
  churnRate: 0.02,
  customerCountAtPeriodStart: 1180,
  customerCountAtPeriodEnd: 1245,
  customersLost: 24,
  newCustomersCount: 89,
  monthlyRecurringRevenue: 138500,
  averageRevenuePerCustomerPerMonth: 425.5,
  salesAndMarketingSpend: 192000,
  leadOrVisitorCount: 12500,
  customersFromLeads: 89,
  averageSellingPricePerUnit: 149.99,
  variableCostPerUnit: 62.4,
  averageInventory: 480000,
  revenueFromExistingCustomersThisPeriod: 1060000,
  priorPeriodRevenueFromExistingCustomers: 1000000,
};

export type OperationalKpiFieldKey = (typeof OPERATIONAL_KPI_FIELD_KEYS)[number];

/**
 * Full operational payload: every whitelisted key is stored. Missing keys default to `0`.
 * Churn: if value > 1, treat as percentage and divide by 100.
 * Unknown keys on `raw` are ignored.
 */
/** UAT: reject non-numeric text when the field is present (e.g. "Ten" for staff-related counts). */
export const OPERATIONAL_KPI_NUMERIC_INVALID =
  "Invalid Input: Please enter a numerical value for this KPI.";

export function normalizeOperationalKpiPayload(raw: unknown): Record<string, number> {
  const src =
    raw === null || raw === undefined
      ? {}
      : typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
  if (src === null) {
    throw new Error("operational KPIs must be a JSON object");
  }
  const out: Record<string, number> = {};
  for (const key of OPERATIONAL_KPI_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = 0;
      continue;
    }
    const rawVal = src[key];
    if (rawVal === null || rawVal === undefined || rawVal === "") {
      out[key] = 0;
      continue;
    }
    let v = typeof rawVal === "number" ? rawVal : Number(String(rawVal).trim());
    if (!Number.isFinite(v)) {
      throw new Error(OPERATIONAL_KPI_NUMERIC_INVALID);
    }
    if (key === "churnRate" && v > 1) v = v / 100;
    out[key] = v;
  }
  return out;
}
