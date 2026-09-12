import { prisma } from "../../utils/database";

const ZIG_FAMILY = new Set(["ZWG", "ZIG", "ZWL"]);

/** Resolve a currency row for journal posting (ZWG/ZIG/ZWL are treated as equivalent). */
export async function resolveJournalCurrency(
  code: string,
  fundBaseCurrencyCode?: string | null
) {
  const normalized = String(code || "").trim().toUpperCase();
  const candidates: string[] = [];

  if (ZIG_FAMILY.has(normalized)) {
    candidates.push("ZWG", "ZIG", "ZWL");
  } else if (normalized) {
    candidates.push(normalized);
  }
  if (fundBaseCurrencyCode) {
    const base = String(fundBaseCurrencyCode).trim().toUpperCase();
    if (base && !candidates.includes(base)) candidates.push(base);
  }

  for (const c of candidates) {
    const row = await prisma.currency.findFirst({ where: { code: c } });
    if (row) return row;
  }

  if (ZIG_FAMILY.has(normalized)) {
    return prisma.currency.create({
      data: {
        code: "ZWG",
        name: "Zimbabwe Gold",
        symbol: "ZWG",
        isActive: true,
      },
    });
  }

  throw new Error(`Currency not found: ${code || "(empty)"}`);
}
