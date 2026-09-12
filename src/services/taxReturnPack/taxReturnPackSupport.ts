// @ts-nocheck
export const TRP_PACK_STATUSES = {
  DRAFT: "DRAFT",
  COMPILING: "COMPILING",
  DRAFT_REVIEW: "DRAFT_REVIEW",
  SIGNED_OFF: "SIGNED_OFF",
  FAILED: "FAILED",
} as const;

export const TRP_TAX_PERIODS = {
  ANNUAL: "ANNUAL",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
} as const;

export const TRP_TAX_REGIMES = {
  ZIMRA_CIT: "ZIMRA_CIT",
  /** VAT return pack — real liability computed by reusing VATReportService's GL aggregation. */
  ZIMRA_VAT: "ZIMRA_VAT",
  /** Withholding tax — evidence/tracking pass only, no computed liability (see TaxReturnPackWhtCompileService). */
  ZIMRA_WHT: "ZIMRA_WHT",
  /** ZIMRA Audit Support File — pack-readiness tracking only, no file generated (see TaxReturnPackSaftCompileService). */
  ZIMRA_SAFT: "ZIMRA_SAFT",
} as const;

export const TRP_TAX_CATEGORIES = {
  BOOK: "BOOK",
  ADD_BACK: "ADD_BACK",
  DEDUCT: "DEDUCT",
  EXEMPT: "EXEMPT",
  /** VAT-only categories, used by TaxReturnPackVatCompileService reconciliation lines. */
  OUTPUT_TAX: "OUTPUT_TAX",
  INPUT_TAX: "INPUT_TAX",
} as const;

export const TRP_ENTITY_TYPES = {
  INTERNAL_SUBSIDIARY: "INTERNAL_SUBSIDIARY",
  EXTERNAL_STARTUP: "EXTERNAL_STARTUP",
} as const;

export const TRP_AUDIT_EVENTS = {
  PACK_CREATED: "PACK_CREATED",
  COMPILE_STARTED: "COMPILE_STARTED",
  COMPILED: "COMPILED",
  COMPILE_FAILED: "COMPILE_FAILED",
  LINE_OVERRIDE: "LINE_OVERRIDE",
  SUBMITTED_REVIEW: "SUBMITTED_REVIEW",
  SIGNED_OFF: "SIGNED_OFF",
  GL_POSTED: "GL_POSTED",
  PORTAL_PUBLISHED: "PORTAL_PUBLISHED",
} as const;

export const TRP_STATUTORY = {
  CIT_RATE: 0.24,
  CGT_RATE: 0.2,
  INDEXATION_PER_YEAR: 0.025,
} as const;

export type TaxPeriod = keyof typeof TRP_TAX_PERIODS;

export function taxPeriodBounds(taxYear: number, taxPeriod: string): { periodStart: Date; periodEnd: Date } {
  const period = String(taxPeriod || "ANNUAL").toUpperCase();
  if (period === "ANNUAL") {
    return {
      periodStart: new Date(Date.UTC(taxYear, 0, 1)),
      periodEnd: new Date(Date.UTC(taxYear, 11, 31)),
    };
  }
  const map: Record<string, { startMonth: number; endMonth: number; endDay: number }> = {
    Q1: { startMonth: 0, endMonth: 2, endDay: 31 },
    Q2: { startMonth: 3, endMonth: 5, endDay: 30 },
    Q3: { startMonth: 6, endMonth: 8, endDay: 30 },
    Q4: { startMonth: 9, endMonth: 11, endDay: 31 },
  };
  const m = map[period];
  if (!m) throw new Error(`Invalid tax period: ${taxPeriod}`);
  return {
    periodStart: new Date(Date.UTC(taxYear, m.startMonth, 1)),
    periodEnd: new Date(Date.UTC(taxYear, m.endMonth, m.endDay)),
  };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function holdingYearsBetween(acquired: Date, disposed: Date): number {
  const ms = disposed.getTime() - acquired.getTime();
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(years * 100) / 100);
}
