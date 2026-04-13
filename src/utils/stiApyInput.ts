import { Decimal } from "@prisma/client/runtime/library";

/** Max stored annual rate as decimal (100 = 10,000% — stress-test range per UAT). */
const MAX_APY_DECIMAL = 100;

/**
 * Normalizes API/UI APY input to the decimal annual rate stored in DB (e.g. 0.05 = 5% p.a.).
 *
 * - **Decimal form** (typical): `|x| ≤ 1` → stored as-is (`0.05` → 5%, `-0.005` → −0.5%).
 * - **Whole percent form** (common mistake): `|x| > 1` and `|x| ≤ 10000` → divide by 100 (`8` → 8%, `80` → 80%, `1500` → 1500%).
 *
 * Set `STI_APY_STRICT_DECIMAL_ONLY=true` to disable percent interpretation (input must already be decimal).
 *
 * Note: `1` as decimal is **100%** APR; for **1%** use `0.01`.
 */
export function normalizeApyInputToDecimal(raw: string | number): Decimal {
  const s = String(raw).trim();
  if (s === "") {
    throw new Error("APY is required");
  }
  const d = new Decimal(s);
  if (!d.isFinite()) {
    throw new Error("APY must be a finite number");
  }

  const strict = process.env.STI_APY_STRICT_DECIMAL_ONLY === "true";
  let out: Decimal;

  if (strict) {
    out = d;
  } else {
    const abs = d.abs();
    if (abs.lte(1)) {
      out = d;
    } else if (abs.lte(10000)) {
      out = d.div(100);
    } else {
      throw new Error(
        "APY out of range: use a decimal between -1 and 1 (e.g. 0.05 for 5%), or a whole percent between -10000 and 10000 (e.g. 5 for 5%, 80 for 80%)."
      );
    }
  }

  if (out.abs().gt(MAX_APY_DECIMAL)) {
    throw new Error(
      `APY exceeds maximum allowed annual rate (${MAX_APY_DECIMAL} as stored decimal, i.e. ${MAX_APY_DECIMAL * 100}% when displayed as percent).`
    );
  }

  return out.toDecimalPlaces(12, Decimal.ROUND_HALF_UP);
}
