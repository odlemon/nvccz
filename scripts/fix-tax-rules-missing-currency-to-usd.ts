/**
 * Fix: some TaxRules have currencyId set to a non-existent Currency row, so API shows `currency: null`.
 * This script retargets those TaxRules to USD (safe to re-run).
 *
 * Usage:
 *   npm run db:fix:tax-rules-missing-currency-to-usd
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const usd = await prisma.currency.findFirst({ where: { code: "USD" }, select: { id: true } });
  if (!usd) throw new Error("USD currency not found");

  const currencies = await prisma.currency.findMany({ select: { id: true } });
  const currencyIds = currencies.map((c) => c.id);

  const missing = await prisma.taxRules.findMany({
    where: {
      currencyId: { not: null, notIn: currencyIds },
    },
    select: { id: true, name: true, type: true, currencyId: true, effectiveDate: true, endDate: true, isActive: true },
    orderBy: { effectiveDate: "asc" },
  });

  if (missing.length === 0) {
    console.log("No tax rules found with missing currency references. Nothing to do.");
    return;
  }

  const res = await prisma.taxRules.updateMany({
    where: { currencyId: { not: null, notIn: currencyIds } },
    data: { currencyId: usd.id },
  });

  console.log("fix-tax-rules-missing-currency-to-usd:", {
    updated: res.count,
    usdCurrencyId: usd.id,
    sample: missing.slice(0, 20).map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      wasCurrencyId: r.currencyId,
      isActive: r.isActive,
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

