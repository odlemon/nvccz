/**
 * Fix: assign USD currencyId to tax rules that have NULL currencyId.
 *
 * Payroll calculations filter TaxRules by payrollRun.currencyId, so NULL-currency rules are ignored.
 * Safe to re-run: only touches rows where currencyId IS NULL.
 *
 * Usage:
 *   npm run db:fix:tax-rules-null-currency-to-usd
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const usd = await prisma.currency.findFirst({ where: { code: "USD" }, select: { id: true, code: true } });
  if (!usd) throw new Error("USD currency not found");

  const candidates = await prisma.taxRules.findMany({
    where: { currencyId: null, isActive: true },
    select: { id: true, name: true, type: true, effectiveDate: true, endDate: true },
    orderBy: { effectiveDate: "asc" },
  });

  if (candidates.length === 0) {
    console.log("No active tax rules with NULL currencyId found. Nothing to do.");
    return;
  }

  const res = await prisma.taxRules.updateMany({
    where: { currencyId: null, isActive: true },
    data: { currencyId: usd.id },
  });

  console.log("set-tax-rules-null-currency-to-usd:", {
    updated: res.count,
    usdCurrencyId: usd.id,
    sample: candidates.slice(0, 10).map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      effective: r.effectiveDate.toISOString().slice(0, 10),
      end: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    })),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

