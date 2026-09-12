/**
 * Unblock Place Equity Order on DEV nts:
 * - Top up cash (USD/ZWG/…) for Arcus Listed Portfolio (and all LE funds)
 * - Ensure APPROVED FX snapshots for ZWG↔USD (and ZiG aliases)
 *
 *   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
 *   npx ts-node --transpile-only -r dotenv/config scripts/fix-investments-order-preview-blockers-nts.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;
const TARGET = new Decimal("100000000");
const CURRENCIES = ["USD", "ZWG", "ZiG", "ZAR"] as const;

async function ensureFx(base: string, quote: string, rate: string) {
  const existing = await prisma.investmentFxRateSnapshot.findFirst({
    where: { baseCurrencyCode: base, quoteCurrencyCode: quote, approvalStatus: "APPROVED" },
    orderBy: { sourceObservedAt: "desc" },
  });
  if (existing) {
    console.log(`[skip] FX ${base}/${quote} already APPROVED rate=${existing.rate}`);
    return existing;
  }
  const key = `ui-fix-fx-${base}-${quote}-${Date.now()}`;
  const row = await prisma.investmentFxRateSnapshot.create({
    data: {
      baseCurrencyCode: base,
      quoteCurrencyCode: quote,
      rate: new Decimal(rate),
      rateType: "SPOT",
      sourceCode: "UI_TEST_FIX",
      sourceObservedAt: new Date(),
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      idempotencyKey: key,
    },
  });
  console.log(`[ok] FX ${base}/${quote} = ${rate} (${row.id})`);
  return row;
}

async function topUpFund(fundId: string, fundName: string) {
  let config = await prisma.investmentPortfolioConfig.findUnique({ where: { fundId } });
  if (!config) {
    config = await prisma.investmentPortfolioConfig.create({
      data: { fundId, baseCurrencyCode: "USD", isActive: true },
    });
  }
  for (const ccy of CURRENCIES) {
    let acct = await prisma.investmentCashAccount.findFirst({
      where: { portfolioConfigId: config.id, currencyCode: ccy, status: "ACTIVE" },
    });
    if (!acct) {
      acct = await prisma.investmentCashAccount.create({
        data: {
          portfolioConfigId: config.id,
          accountCode: `${ccy}_OPS`,
          currencyCode: ccy,
          status: "ACTIVE",
        },
      });
    }
    const last = await prisma.investmentCashLedgerEntry.findFirst({
      where: { cashAccountId: acct.id, status: "POSTED" },
      orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
    });
    const current = new Decimal(last?.runningBalance ?? 0);
    if (current.gte(TARGET)) {
      console.log(`[skip] ${fundName} ${ccy} balance=${current}`);
      continue;
    }
    await prisma.investmentCashLedgerEntry.create({
      data: {
        cashAccountId: acct.id,
        entryType: "MANUAL_ADJUSTMENT",
        amount: TARGET,
        runningBalance: TARGET,
        currencyCode: ccy,
        effectiveAt: new Date(),
        valueDate: new Date(),
        status: "POSTED",
        idempotencyKey: `ui-fix-cash-${acct.id}-${Date.now()}`,
      },
    });
    console.log(`[ok] ${fundName} ${ccy} topped ${current} → ${TARGET}`);
  }
}

async function main() {
  await assertDevDatabase(prisma, "fix:order-preview-blockers");

  // FX: trade ZWG vs fund base USD (and reverse)
  await ensureFx("ZWG", "USD", "0.0028");
  await ensureFx("USD", "ZWG", "357.14");
  await ensureFx("ZiG", "USD", "0.0028");
  await ensureFx("USD", "ZiG", "357.14");
  await ensureFx("USD", "USD", "1");

  const funds = await prisma.fund.findMany({
    where: {
      OR: [
        { name: { contains: "Arcus Listed" } },
        { listedEquityFundConfig: { isNot: null } },
      ],
    },
    select: { id: true, name: true },
  });
  if (!funds.length) {
    const any = await prisma.fund.findMany({ take: 20, select: { id: true, name: true } });
    console.log("No LE funds matched; topping first funds:", any.map((f: any) => f.name));
    for (const f of any) await topUpFund(f.id, f.name);
  } else {
    for (const f of funds) await topUpFund(f.id, f.name);
  }

  console.log("\nDone. Refresh Place Order → Review Order. Cash should be > 0 and FX warning gone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
