/**
 * Top up investment cash ledgers for testing (DEV nts only).
 * Ensures every LISTED_EQUITY fund (and any fund with a portfolio config)
 * has ACTIVE cash accounts with a large POSTED running balance.
 *
 * Usage:
 *   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
 *   npx ts-node --transpile-only -r dotenv/config scripts/topup-investments-cash-all-funds-nts.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;
const TARGET = new Decimal("100000000"); // 100M
const CURRENCIES = ["USD", "ZWG", "ZiG", "ZAR"] as const;

async function ensurePortfolioConfig(fundId: string, baseCurrency = "USD") {
  let config = await prisma.investmentPortfolioConfig.findUnique({ where: { fundId } });
  if (!config) {
    config = await prisma.investmentPortfolioConfig.create({
      data: {
        fundId,
        baseCurrencyCode: baseCurrency,
        isActive: true,
      },
    });
  }
  return config;
}

async function ensureCashAccount(portfolioConfigId: string, currencyCode: string) {
  const accountCode = `${currencyCode}_OPS`;
  let acct = await prisma.investmentCashAccount.findFirst({
    where: { portfolioConfigId, currencyCode, status: "ACTIVE" },
  });
  if (!acct) {
    acct = await prisma.investmentCashAccount.create({
      data: {
        portfolioConfigId,
        accountCode,
        currencyCode,
        status: "ACTIVE",
      },
    });
  }
  return acct;
}

async function topUpAccount(cashAccountId: string, currencyCode: string) {
  const last = await prisma.investmentCashLedgerEntry.findFirst({
    where: { cashAccountId, status: "POSTED" },
    orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
  });
  const current = new Decimal(last?.runningBalance ?? 0);
  if (current.gte(TARGET)) {
    return { action: "skip", balance: current.toString() };
  }

  // Prefer fixing a null/stale latest row, else post a new top-up entry
  if (last && (last.runningBalance == null || current.lt(TARGET))) {
    const key = `test-cash-topup-${cashAccountId}-${Date.now()}`;
    await prisma.investmentCashLedgerEntry.create({
      data: {
        cashAccountId,
        entryType: "MANUAL_ADJUSTMENT",
        amount: TARGET,
        runningBalance: TARGET,
        currencyCode,
        effectiveAt: new Date(),
        valueDate: new Date(),
        status: "POSTED",
        idempotencyKey: key,
      },
    });
    return { action: "topup", balance: TARGET.toString(), from: current.toString() };
  }

  if (!last) {
    await prisma.investmentCashLedgerEntry.create({
      data: {
        cashAccountId,
        entryType: "MANUAL_ADJUSTMENT",
        amount: TARGET,
        runningBalance: TARGET,
        currencyCode,
        effectiveAt: new Date(),
        valueDate: new Date(),
        status: "POSTED",
        idempotencyKey: `test-cash-open-${cashAccountId}`,
      },
    });
    return { action: "open", balance: TARGET.toString() };
  }

  return { action: "skip", balance: current.toString() };
}

async function main() {
  console.log("\n=== Top up investment cash (DEV nts) ===\n");
  await assertDevDatabase(prisma, "topup:investments-cash");

  const listed = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const configs = await prisma.investmentPortfolioConfig.findMany({
    select: { fundId: true },
  });
  const configFundIds = [...new Set(configs.map((c: { fundId: string }) => c.fundId))];
  const configFunds = configFundIds.length
    ? await prisma.fund.findMany({
        where: { id: { in: configFundIds } },
        select: { id: true, name: true },
      })
    : [];

  const byId = new Map<string, { id: string; name: string }>();
  for (const f of listed) byId.set(f.id, f);
  for (const f of configFunds) byId.set(f.id, f);
  const funds = [...byId.values()];
  console.log(`Funds to top up: ${funds.length}`);

  let topped = 0;
  let skipped = 0;

  for (const fund of funds) {
    const leCfg = await prisma.listedEquityFundConfig.findUnique({
      where: { fundId: fund.id },
      select: { baseCurrencyCode: true },
    });
    const base = String(leCfg?.baseCurrencyCode || "USD").toUpperCase();
    const config = await ensurePortfolioConfig(fund.id, base);

    const currencies = new Set<string>([base, "USD"]);
    for (const c of CURRENCIES) currencies.add(c);

    // Also top up any existing cash accounts on this portfolio
    const existing = await prisma.investmentCashAccount.findMany({
      where: { portfolioConfigId: config.id, status: "ACTIVE" },
      select: { id: true, currencyCode: true },
    });
    for (const e of existing) currencies.add(String(e.currencyCode).toUpperCase());

    console.log(`\n${fund.name} (${fund.id}) base=${base}`);
    for (const ccy of currencies) {
      const acct = await ensureCashAccount(config.id, ccy);
      const result = await topUpAccount(acct.id, ccy);
      if (result.action === "skip") {
        skipped += 1;
        console.log(`  [skip] ${ccy} ${acct.accountCode || acct.id} bal=${result.balance}`);
      } else {
        topped += 1;
        console.log(
          `  [${result.action}] ${ccy} ${acct.accountCode || acct.id} → ${result.balance}` +
            (result.from ? ` (was ${result.from})` : "")
        );
      }
    }
  }

  console.log(`\nDone. topped=${topped} already-ok=${skipped}`);
  console.log("Target balance per account: 100,000,000\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
