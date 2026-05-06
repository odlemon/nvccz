/**
 * Clone active TaxRules from the most-populated currency to USD (idempotent).
 *
 * Why: payroll deductions only calculate from TaxRules filtered by payrollRun.currencyId.
 *
 * Usage:
 *   npm run db:fix:clone-tax-rules-to-usd
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";

function toDec(x: any): Decimal {
  if (x == null) return new Decimal(0);
  if (x instanceof Decimal) return x;
  return new Decimal(x);
}

async function main() {
  const usd = await prisma.currency.findFirst({ where: { code: "USD" } });
  if (!usd) throw new Error("USD currency not found");

  const all = await prisma.taxRules.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true, rate: true, threshold: true, ceiling: true, currencyId: true, effectiveDate: true, endDate: true, createdById: true },
  });

  const byCurrency: Record<string, any[]> = {};
  for (const r of all) {
    const cid = String(r.currencyId || "");
    if (!cid) continue;
    (byCurrency[cid] ||= []).push(r);
  }

  const currencies = Object.entries(byCurrency)
    .map(([cid, rows]) => ({ currencyId: cid, count: rows.length }))
    .sort((a, b) => b.count - a.count);

  if (currencies.length === 0) {
    console.log("No active tax rules exist to clone.");
    return;
  }

  const sourceCurrencyId = currencies[0].currencyId;
  const sourceRules = byCurrency[sourceCurrencyId] || [];

  if (sourceCurrencyId === usd.id) {
    console.log("USD already has active tax rules; nothing to clone.", { usdCurrencyId: usd.id, count: sourceRules.length });
    return;
  }

  // Prefer a real user for createdById (keep the same creator as the source rule if possible).
  const fallbackUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!fallbackUser) throw new Error("No user found for createdById fallback");

  let created = 0;
  let skipped = 0;

  for (const r of sourceRules) {
    const exists = await prisma.taxRules.findFirst({
      where: {
        currencyId: usd.id,
        isActive: true,
        name: r.name,
        type: r.type,
        effectiveDate: r.effectiveDate,
      },
      select: { id: true },
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    await prisma.taxRules.create({
      data: {
        name: r.name,
        type: r.type,
        rate: toDec(r.rate),
        threshold: r.threshold == null ? null : toDec(r.threshold),
        ceiling: r.ceiling == null ? null : toDec(r.ceiling),
        isActive: true,
        effectiveDate: r.effectiveDate,
        endDate: r.endDate,
        currencyId: usd.id,
        createdById: r.createdById || fallbackUser.id,
      },
    });
    created += 1;
  }

  console.log("clone-tax-rules-to-usd:", {
    usdCurrencyId: usd.id,
    sourceCurrencyId,
    sourceRuleCount: sourceRules.length,
    created,
    skipped,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

