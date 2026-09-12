/**
 * Map persisted payroll deduction rows to PAYE vs NSSA/Pension buckets for GL (2150 / 2160).
 * Handles naming drift ("Pay As You Earn", "PAYE", "Payee" typos near tax, NSSA vs NSSF, etc.).
 */
export type PayrollJournalLiabilityBucket = "PAYE" | "NSSA_PENSION" | "SDL";

export function classifyDeductionForPayrollJournal(dt: { name: string; code?: string | null }): PayrollJournalLiabilityBucket | null {
  const code = String(dt.code || "").toUpperCase();
  const name = String(dt.name || "").toLowerCase();

  const payeLike =
    code.includes("PAYE") ||
    code === "ITF" ||
    code.includes("WITHHOLD") ||
    name.includes("paye") ||
    name.includes("pay as you earn") ||
    name.includes("p.a.y.e") ||
    name.includes("pay-as-you-earn") ||
    name.includes("income tax") ||
    name.includes("withholding tax") ||
    (name.includes("zimra") && name.includes("tax")) ||
    name.includes("aids levy") ||
    code.includes("AIDS") ||
    (name.includes("payee") && (name.includes("tax") || name.includes("paye")));

  if (payeLike) return "PAYE";

  const nssaLike =
    code.includes("NSSA") ||
    code.includes("NSSF") ||
    name.includes("nssa") ||
    (name.includes("social") && name.includes("security")) ||
    name.includes("national social");

  const pensionLike =
    code.includes("PENSION") || name.includes("pension") || name.includes("provident") || name.includes("nec");

  if (nssaLike || pensionLike) return "NSSA_PENSION";

  const sdlLike =
    code.includes("SDL") ||
    name.includes("sdl") ||
    name.includes("standards development") ||
    name.includes("development levy");

  if (sdlLike) return "SDL";

  return null;
}
