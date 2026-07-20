/**
 * DEV-only Investment Ops presentation seed (nts).
 * Idempotent / non-destructive where possible: upserts named Arcus fixtures,
 * does not wipe unrelated funds or users.
 *
 * Requires schema hardening migrations:
 *   npm run db:migrate:investment-ops-v2
 *   npm run db:migrate:investment-ops-gap
 *   npm run db:migrate:investment-ops-schema-hardening
 *
 * Usage: npm run db:seed:investment-ops-demo
 */
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

const FORBIDDEN_VISIBLE = /\b(?:uat|test|demo|placeholder)\b|[\u2013\u2014]/i;

const DEFAULT_COA = {
  listedSecuritiesAsset: "1501",
  bankClearing: "1100",
  realizedGain: "4010",
  realizedLoss: "5200",
};

const COUNTRIES = [
  { countryCode: "ZW", countryName: "Zimbabwe", region: "Southern Africa" },
  { countryCode: "ZA", countryName: "South Africa", region: "Southern Africa" },
  { countryCode: "BW", countryName: "Botswana", region: "Southern Africa" },
  { countryCode: "ZM", countryName: "Zambia", region: "Southern Africa" },
  { countryCode: "KE", countryName: "Kenya", region: "East Africa" },
  { countryCode: "NG", countryName: "Nigeria", region: "West Africa" },
  { countryCode: "MU", countryName: "Mauritius", region: "Indian Ocean" },
  { countryCode: "US", countryName: "United States", region: "Americas" },
  { countryCode: "GB", countryName: "United Kingdom", region: "Europe" },
  { countryCode: "AU", countryName: "Australia", region: "Asia Pacific" },
];

const MARKETS = [
  { marketCode: "ZSE", marketName: "Zimbabwe Stock Exchange", countryCode: "ZW", exchangeCode: "ZSE" },
  { marketCode: "VFEX", marketName: "Victoria Falls Stock Exchange", countryCode: "ZW", exchangeCode: "VFEX" },
  { marketCode: "JSE", marketName: "Johannesburg Stock Exchange", countryCode: "ZA", exchangeCode: "JSE" },
  { marketCode: "NASDAQ", marketName: "NASDAQ", countryCode: "US", exchangeCode: "NASDAQ" },
  { marketCode: "NYSE", marketName: "New York Stock Exchange", countryCode: "US", exchangeCode: "NYSE" },
  { marketCode: "LSE", marketName: "London Stock Exchange", countryCode: "GB", exchangeCode: "LSE" },
];

const PRIMARY_EQUITIES = [
  { symbol: "CBZ", name: "CBZ Holdings Limited", sector: "Financials", price: 12.45, qty: 25000, wac: 11.2 },
  { symbol: "DLTA", name: "Delta Corporation Limited", sector: "Consumer Staples", price: 18.75, qty: 15000, wac: 16.5 },
  { symbol: "FBC", name: "FBC Holdings Limited", sector: "Financials", price: 8.3, qty: 20000, wac: 7.9 },
  { symbol: "ECO", name: "Econet Wireless Zimbabwe", sector: "Telecommunications", price: 4.55, qty: 40000, wac: 4.1 },
  { symbol: "SEED", name: "Seed Co International", sector: "Agriculture", price: 6.2, qty: 12000, wac: 5.8 },
  { symbol: "BAT", name: "British American Tobacco Zimbabwe", sector: "Consumer Staples", price: 85.0, qty: 2000, wac: 78.5 },
  { symbol: "OKZ", name: "OK Zimbabwe Limited", sector: "Consumer Discretionary", price: 3.15, qty: 30000, wac: 2.95 },
  { symbol: "INN", name: "Innscor Africa Limited", sector: "Consumer Staples", price: 42.1, qty: 5000, wac: 39.0 },
];

const EXTRA_FUNDS: Array<{
  name: string;
  description: string;
  holdings: Array<{ symbol: string; qty: number; wac: number }>;
}> = [
  {
    name: "Arcus Growth Equity Fund",
    description: "Growth-oriented listed equity mandate focused on ZSE financials and telecoms",
    holdings: [
      { symbol: "ECO", qty: 80000, wac: 4.0 },
      { symbol: "CBZ", qty: 12000, wac: 11.0 },
      { symbol: "FBC", qty: 15000, wac: 7.5 },
    ],
  },
  {
    name: "Arcus Income Mandate",
    description: "Dividend-focused listed equity sleeve for institutional income clients",
    holdings: [
      { symbol: "DLTA", qty: 22000, wac: 16.0 },
      { symbol: "BAT", qty: 3500, wac: 76.0 },
      { symbol: "INN", qty: 8000, wac: 38.0 },
    ],
  },
  {
    name: "Harare Pension CIS",
    description: "Collective investment scheme book for Harare Pension Fund Trustees",
    holdings: [
      { symbol: "CBZ", qty: 40000, wac: 10.8 },
      { symbol: "OKZ", qty: 50000, wac: 2.8 },
      { symbol: "SEED", qty: 18000, wac: 5.5 },
    ],
  },
  {
    name: "NSSA Equity Sleeve",
    description: "National Social Security Authority listed equity allocation",
    holdings: [
      { symbol: "ECO", qty: 100000, wac: 3.9 },
      { symbol: "DLTA", qty: 10000, wac: 15.8 },
      { symbol: "FBC", qty: 25000, wac: 7.6 },
    ],
  },
  {
    name: "Arcus Balanced Listed Book",
    description: "Balanced multi-sector ZSE portfolio for discretionary mandates",
    holdings: [
      { symbol: "INN", qty: 6000, wac: 38.5 },
      { symbol: "CBZ", qty: 18000, wac: 11.1 },
      { symbol: "BAT", qty: 1500, wac: 79.0 },
      { symbol: "ECO", qty: 35000, wac: 4.2 },
    ],
  },
  {
    name: "Arcus VFEX Opportunity Fund",
    description: "USD-denominated Victoria Falls Exchange opportunity sleeve",
    holdings: [
      { symbol: "ECO", qty: 45000, wac: 4.3 },
      { symbol: "SEED", qty: 9000, wac: 5.9 },
    ],
  },
  {
    name: "Employee Provident Listed Book",
    description: "Staff provident fund listed equity allocation",
    holdings: [
      { symbol: "OKZ", qty: 20000, wac: 2.9 },
      { symbol: "FBC", qty: 8000, wac: 7.8 },
      { symbol: "DLTA", qty: 5000, wac: 16.2 },
    ],
  },
  {
    name: "Arcus Regional Equity",
    description: "Regional listed equity satellite with ZSE core holdings",
    holdings: [
      { symbol: "CBZ", qty: 9000, wac: 11.3 },
      { symbol: "INN", qty: 4000, wac: 39.5 },
      { symbol: "BAT", qty: 800, wac: 80.0 },
    ],
  },
];

const TRADE_SPECS = [
  { refPrefix: "ALP-CBZ", symbol: "CBZ", side: "BUY" as const, qty: 5000, price: 11.2, fees: 112, daysAgo: 45 },
  { refPrefix: "ALP-DLTA", symbol: "DLTA", side: "BUY" as const, qty: 3000, price: 16.5, fees: 99, daysAgo: 40 },
  { refPrefix: "ALP-ECO", symbol: "ECO", side: "BUY" as const, qty: 10000, price: 4.1, fees: 82, daysAgo: 35 },
  { refPrefix: "ALP-FBC", symbol: "FBC", side: "BUY" as const, qty: 4000, price: 7.9, fees: 63, daysAgo: 28 },
  { refPrefix: "ALP-INN", symbol: "INN", side: "BUY" as const, qty: 1500, price: 39.0, fees: 117, daysAgo: 21 },
  { refPrefix: "ALP-BAT", symbol: "BAT", side: "BUY" as const, qty: 500, price: 78.5, fees: 78.5, daysAgo: 14 },
  { refPrefix: "ALP-OKZ", symbol: "OKZ", side: "BUY" as const, qty: 8000, price: 2.95, fees: 47, daysAgo: 10 },
  { refPrefix: "ALP-SEED", symbol: "SEED", side: "BUY" as const, qty: 2500, price: 5.8, fees: 29, daysAgo: 7 },
  { refPrefix: "ALP-ECO2", symbol: "ECO", side: "BUY" as const, qty: 5000, price: 4.4, fees: 44, daysAgo: 3 },
  { refPrefix: "ALP-CBZ2", symbol: "CBZ", side: "SELL" as const, qty: 1000, price: 12.4, fees: 24.8, daysAgo: 1 },
];

function inspectVisible(value: unknown, path = "payload"): void {
  if (typeof value === "string" && FORBIDDEN_VISIBLE.test(value)) {
    throw new Error(`Forbidden visible content at ${path}: ${JSON.stringify(value)}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectVisible(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      inspectVisible(child, `${path}.${key}`);
    }
  }
}

function sha(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    name
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function assertSchemaReady() {
  const required = [
    "investment_instruments",
    "investment_orders",
    "investment_valuation_runs",
    "investment_reconciliation_batches",
    "investment_documents",
    "investment_jobs",
    "investment_audit_events",
    "investment_portfolio_configs",
  ];
  const missing: string[] = [];
  for (const t of required) {
    if (!(await tableExists(t))) missing.push(t);
  }
  if (missing.length) {
    console.error(
      `[seed:investment-ops] Missing tables: ${missing.join(", ")}\n` +
        `  Run before seeding:\n` +
        `    npm run db:migrate:investment-ops-v2\n` +
        `    npm run db:migrate:investment-ops-gap\n` +
        `    npm run db:migrate:investment-ops-schema-hardening\n` +
        `  Then: Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue`
    );
    process.exit(1);
  }
}

async function ensureCountries() {
  for (const c of COUNTRIES) {
    inspectVisible(c);
    await prisma.investmentCountry.upsert({
      where: { countryCode: c.countryCode },
      create: { ...c, isActive: true },
      update: { countryName: c.countryName, region: c.region, isActive: true },
    });
  }
  console.log(`[ok] countries=${COUNTRIES.length}`);
}

async function ensureMarkets() {
  for (const m of MARKETS) {
    inspectVisible(m);
    await prisma.investmentMarket.upsert({
      where: { marketCode: m.marketCode },
      create: { ...m, isActive: true },
      update: {
        marketName: m.marketName,
        countryCode: m.countryCode,
        exchangeCode: m.exchangeCode,
        isActive: true,
      },
    });
  }
  console.log(`[ok] markets=${MARKETS.length}`);
}

async function ensureInstrumentType() {
  await prisma.investmentInstrumentType.upsert({
    where: { typeCode: "EQUITY" },
    create: { typeCode: "EQUITY", displayName: "Listed Equity", isActive: true },
    update: { displayName: "Listed Equity", isActive: true },
  });
}

async function ensureIssuer(code: string, legalName: string, sector: string) {
  const existing = await prisma.investmentIssuer.findUnique({ where: { issuerCode: code } });
  if (existing) {
    return prisma.investmentIssuer.update({
      where: { id: existing.id },
      data: { legalName, countryCode: "ZW", sector, isActive: true },
    });
  }
  return prisma.investmentIssuer.create({
    data: { issuerCode: code, legalName, countryCode: "ZW", sector, isActive: true },
  });
}

async function ensureStakeholder(profileType: "BROKER" | "CUSTODIAN", name: string, email: string) {
  inspectVisible({ name, email });
  const existing = await prisma.listedEquityStakeholderProfile.findFirst({
    where: { profileType, name },
  });
  if (existing) {
    return prisma.listedEquityStakeholderProfile.update({
      where: { id: existing.id },
      data: { contactEmail: email, isActive: true, deliveryMode: "EMAIL" },
    });
  }
  return prisma.listedEquityStakeholderProfile.create({
    data: { profileType, name, contactEmail: email, isActive: true, deliveryMode: "EMAIL" },
  });
}

async function ensureCommission(brokerId: string, rateBps: number, instrumentTypeCode: string | null = "EQUITY") {
  const existing = await prisma.investmentBrokerCommission.findFirst({
    where: { stakeholderProfileId: brokerId, instrumentTypeCode },
  });
  if (!existing) {
    await prisma.investmentBrokerCommission.create({
      data: {
        stakeholderProfileId: brokerId,
        instrumentTypeCode,
        rateBps: new Decimal(rateBps),
        currencyCode: "USD",
        isActive: true,
      },
    });
  } else {
    await prisma.investmentBrokerCommission.update({
      where: { id: existing.id },
      data: { rateBps: new Decimal(rateBps), isActive: true },
    });
  }
}

async function ensureListedFund(opts: {
  name: string;
  description: string;
  adminId: string;
  bankId: string | null;
  brokerId: string;
  custodianId: string;
}) {
  inspectVisible({ name: opts.name, description: opts.description });
  let fund = await prisma.fund.findFirst({ where: { name: opts.name } });
  if (!fund) {
    const now = new Date();
    fund = await prisma.fund.create({
      data: {
        name: opts.name,
        description: opts.description,
        totalAmount: new Decimal(0),
        remainingAmount: new Decimal(0),
        minInvestment: new Decimal(0),
        maxInvestment: new Decimal(0),
        focusIndustries: [],
        applicationStart: now,
        applicationEnd: new Date("2099-12-31"),
        status: "OPEN",
        fundPurpose: "LISTED_EQUITY",
        createdById: opts.adminId,
      },
    });
    console.log(`[ok] created fund id=${fund.id} name=${opts.name}`);
  } else {
    fund = await prisma.fund.update({
      where: { id: fund.id },
      data: {
        description: opts.description,
        fundPurpose: "LISTED_EQUITY",
        status: "OPEN",
      },
    });
  }

  await prisma.listedEquityFundConfig.upsert({
    where: { fundId: fund.id },
    create: {
      fundId: fund.id,
      baseCurrencyCode: "USD",
      trustBankId: opts.bankId,
      coaMappingJson: DEFAULT_COA,
      brokerProfileId: opts.brokerId,
      custodianProfileId: opts.custodianId,
    },
    update: {
      baseCurrencyCode: "USD",
      trustBankId: opts.bankId,
      coaMappingJson: DEFAULT_COA,
      brokerProfileId: opts.brokerId,
      custodianProfileId: opts.custodianId,
    },
  });

  await prisma.fundManager.upsert({
    where: { fundId_userId: { fundId: fund.id, userId: opts.adminId } },
    create: { fundId: fund.id, userId: opts.adminId, role: "fund_manager", isActive: true },
    update: { isActive: true },
  });

  return fund;
}

async function ensureSecurityAndInstrument(
  eq: { symbol: string; name: string; sector: string; price: number },
  issuerId: string,
  createdById?: string
) {
  let security = await prisma.listedEquitySecurity.findFirst({
    where: { symbol: eq.symbol, exchangeCode: "ZSE" },
  });
  if (!security) {
    security = await prisma.listedEquitySecurity.create({
      data: {
        symbol: eq.symbol,
        exchangeCode: "ZSE",
        name: eq.name,
        listingCurrencyCode: "USD",
        isActive: true,
      },
    });
  } else {
    security = await prisma.listedEquitySecurity.update({
      where: { id: security.id },
      data: { name: eq.name, isActive: true, listingCurrencyCode: "USD" },
    });
  }

  const code = `ZSE-${eq.symbol}`;
  let instrument = await prisma.investmentInstrument.findFirst({
    where: { OR: [{ instrumentCode: code }, { ticker: eq.symbol, exchangeCode: "ZSE" }] },
  });
  if (!instrument) {
    instrument = await prisma.investmentInstrument.create({
      data: {
        instrumentCode: code,
        shortName: eq.symbol,
        fullName: eq.name,
        ticker: eq.symbol,
        exchangeCode: "ZSE",
        marketCode: "ZSE",
        countryCode: "ZW",
        issuerName: eq.name,
        issuerId,
        instrumentTypeCode: "EQUITY",
        sector: eq.sector,
        listingCurrencyCode: "USD",
        valuationMethod: "MARK_TO_MARKET",
        status: "ACTIVE",
        listedEquitySecurityId: security.id,
        createdById: createdById ?? null,
        approvedById: createdById ?? null,
        approvedAt: new Date(),
      },
    });
  } else {
    instrument = await prisma.investmentInstrument.update({
      where: { id: instrument.id },
      data: {
        shortName: eq.symbol,
        fullName: eq.name,
        ticker: eq.symbol,
        exchangeCode: "ZSE",
        marketCode: "ZSE",
        countryCode: "ZW",
        issuerName: eq.name,
        issuerId,
        sector: eq.sector,
        status: "ACTIVE",
        instrumentTypeCode: "EQUITY",
        listedEquitySecurityId: security.id,
      },
    });
  }

  const existingTick = await prisma.listedEquityPriceTick.findFirst({
    where: { securityId: security.id, validationStatus: "APPROVED", sourceCode: "SEED_EOD" },
    orderBy: { pricedAt: "desc" },
  });
  if (!existingTick) {
    await prisma.listedEquityPriceTick.create({
      data: {
        securityId: security.id,
        price: new Decimal(eq.price),
        priceType: "CLOSE",
        validationStatus: "APPROVED",
        pricedAt: new Date(),
        tickFrequency: "EOD",
        sourceStatus: "OK",
        sourceCode: "SEED_EOD",
        idempotencyKey: `seed-eod-${eq.symbol}`,
      },
    });
  } else {
    await prisma.listedEquityPriceTick.update({
      where: { id: existingTick.id },
      data: { price: new Decimal(eq.price), validationStatus: "APPROVED", pricedAt: new Date() },
    });
  }

  return { security, instrument };
}

async function ensureHolding(fundId: string, securityId: string, qty: number, wac: number) {
  await prisma.listedEquityHolding.upsert({
    where: { fundId_securityId: { fundId, securityId } },
    create: {
      fundId,
      securityId,
      quantity: new Decimal(qty),
      wac: new Decimal(wac),
      wacCurrencyCode: "USD",
      lastValuationAt: new Date(),
    },
    update: {
      quantity: new Decimal(qty),
      wac: new Decimal(wac),
      wacCurrencyCode: "USD",
      lastValuationAt: new Date(),
    },
  });

  const lots = await prisma.listedEquityHoldingLot.count({ where: { fundId, securityId } });
  if (!lots) {
    await prisma.listedEquityHoldingLot.create({
      data: {
        fundId,
        securityId,
        quantity: new Decimal(qty),
        executionPrice: new Decimal(wac),
        currencyCode: "USD",
        purchasedAt: new Date(Date.now() - 30 * 86400000),
      },
    });
  }
}

async function ensureComplianceRules(fundId: string) {
  const rules = [
    {
      ruleCode: "MAX_SINGLE_NAME_25",
      ruleName: "Maximum single security weight 25%",
      ruleType: "MAX_SINGLE_SECURITY_WEIGHT",
      thresholdValue: new Decimal(25),
      thresholdUnit: "PCT",
    },
    {
      ruleCode: "MIN_CASH_5",
      ruleName: "Minimum cash balance 5%",
      ruleType: "MIN_CASH_BALANCE",
      thresholdValue: new Decimal(5),
      thresholdUnit: "PCT",
    },
  ];
  for (const r of rules) {
    const existing = await prisma.investmentComplianceRule.findFirst({
      where: { fundId, ruleCode: r.ruleCode },
    });
    if (!existing) {
      await prisma.investmentComplianceRule.create({ data: { fundId, ...r, isActive: true } });
    } else {
      await prisma.investmentComplianceRule.update({
        where: { id: existing.id },
        data: { ruleName: r.ruleName, thresholdValue: r.thresholdValue, isActive: true },
      });
    }
  }
}

function isTransientDbError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "P1001" || code === "P1017" || code === "P2024";
}

async function withDbRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientDbError(err) || i === attempts) throw err;
      const waitMs = 1500 * i;
      console.warn(`[retry] ${label} attempt ${i}/${attempts} after transient DB error; wait ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw last;
}

async function ensureValuationSnapshot(
  fundId: string,
  holdings: Array<{ qty: number; price: number; wac: number }>
) {
  const nav = holdings.reduce((s, h) => s + h.qty * h.price, 0);
  const cost = holdings.reduce((s, h) => s + h.qty * h.wac, 0);
  const unrealized = nav - cost;
  await withDbRetry(`valuationSnapshot:${fundId}`, async () => {
    const existing = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId },
      orderBy: { asOf: "desc" },
    });
    const data = {
      asOf: new Date(),
      navBaseCurrency: new Decimal(nav),
      unrealizedPnlUsd: new Decimal(unrealized),
      unrealizedPnlZig: new Decimal(0),
      status: "OK",
    };
    if (existing) {
      await prisma.listedEquityValuationSnapshot.update({ where: { id: existing.id }, data });
    } else {
      await prisma.listedEquityValuationSnapshot.create({ data: { fundId, ...data } });
    }
  });
}

async function ensurePortfolioClient(fundId: string) {
  const email = "portfolio.client@arcus.co.zw";
  let client = await prisma.client.findFirst({
    where: { OR: [{ email }, { legalName: "Harare Pension Fund Trustees" }] },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        investorId: `INV-ALP-${Date.now().toString(36).toUpperCase()}`,
        type: "institutional",
        legalName: "Harare Pension Fund Trustees",
        email,
        country: "ZW",
        status: "ACTIVE",
      },
    });
  } else {
    client = await prisma.client.update({
      where: { id: client.id },
      data: { legalName: "Harare Pension Fund Trustees", email, country: "ZW", status: "ACTIVE" },
    });
  }

  const commitment = await prisma.investmentCommitment.findFirst({
    where: { clientId: client.id, fundId },
  });
  if (!commitment) {
    await prisma.investmentCommitment.create({
      data: {
        clientId: client.id,
        fundId,
        amount: new Decimal(2500000),
        currency: "USD",
        effectiveDate: new Date("2025-01-01"),
        status: "ACTIVE",
      },
    });
  }
  return client;
}

async function ensureSettledTrade(opts: {
  fundId: string;
  securityId: string;
  tradeRef: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fees: number;
  when: Date;
  adminId?: string;
}) {
  let trade = await prisma.listedEquityTrade.findFirst({ where: { tradeRef: opts.tradeRef } });
  if (!trade) {
    trade = await prisma.listedEquityTrade.create({
      data: {
        tradeRef: opts.tradeRef,
        fundId: opts.fundId,
        securityId: opts.securityId,
        side: opts.side,
        quantity: new Decimal(opts.qty),
        executionPrice: new Decimal(opts.price),
        executionCurrencyCode: "USD",
        fees: new Decimal(opts.fees),
        status: "SETTLED",
        executedAt: opts.when,
        settledAt: opts.when,
        executedById: opts.adminId ?? null,
      },
    });
  } else {
    trade = await prisma.listedEquityTrade.update({
      where: { id: trade.id },
      data: {
        securityId: opts.securityId,
        side: opts.side,
        quantity: new Decimal(opts.qty),
        executionPrice: new Decimal(opts.price),
        fees: new Decimal(opts.fees),
        status: "SETTLED",
        executedAt: opts.when,
        settledAt: opts.when,
        executedById: opts.adminId ?? null,
      },
    });
  }

  for (const target of ["BROKER", "CUSTODIAN", "CORE_BANKING", "ACCOUNTING_GL"]) {
    await prisma.listedEquityTradeRoutingHop.upsert({
      where: { tradeId_target: { tradeId: trade.id, target } },
      create: {
        tradeId: trade.id,
        target,
        status: "CONFIRMED",
        confirmedAt: opts.when,
        externalRef: `SEED-${opts.tradeRef}-${target}`,
      },
      update: {
        status: "CONFIRMED",
        confirmedAt: opts.when,
        externalRef: `SEED-${opts.tradeRef}-${target}`,
      },
    });
  }

  const realized =
    opts.side === "SELL" ? new Decimal((opts.price - opts.price * 0.95) * opts.qty) : null;
  await prisma.listedEquityTradeSettlement.upsert({
    where: { tradeId: trade.id },
    create: {
      tradeId: trade.id,
      realizedPnl: realized,
      settlementDocumentRef: `settlement://${opts.tradeRef}`,
    },
    update: {
      realizedPnl: realized,
      settlementDocumentRef: `settlement://${opts.tradeRef}`,
    },
  });

  const amount = opts.qty * opts.price;
  const acctId = `seed-acct-${opts.tradeRef}`.slice(0, 30);
  await prisma.investmentAccountingEvent
    .upsert({
      where: { id: acctId },
      create: {
        id: acctId,
        fundId: opts.fundId,
        sourceType: "LISTED_EQUITY_TRADE",
        sourceId: trade.id,
        eventType: opts.side === "BUY" ? "PURCHASE" : "SALE",
        status: "POSTED",
        tradeRef: opts.tradeRef,
        amount: new Decimal(amount),
        currencyCode: "USD",
        postedAt: opts.when,
        idempotencyKey: `seed-acct-${opts.tradeRef}`,
      },
      update: {
        status: "POSTED",
        sourceId: trade.id,
        amount: new Decimal(amount),
        postedAt: opts.when,
      },
    })
    .catch(async () => {
      const existing = await prisma.investmentAccountingEvent.findFirst({
        where: { tradeRef: opts.tradeRef, fundId: opts.fundId },
      });
      if (!existing) {
        await prisma.investmentAccountingEvent.create({
          data: {
            fundId: opts.fundId,
            sourceType: "LISTED_EQUITY_TRADE",
            sourceId: trade.id,
            eventType: opts.side === "BUY" ? "PURCHASE" : "SALE",
            status: "POSTED",
            tradeRef: opts.tradeRef,
            amount: new Decimal(amount),
            currencyCode: "USD",
            postedAt: opts.when,
            idempotencyKey: `seed-acct-${opts.tradeRef}-${randomBytes(4).toString("hex")}`,
          },
        });
      }
    });

  return trade;
}

async function ensureOrders(opts: {
  fundId: string;
  instrumentBySymbol: Record<string, string>;
  securityBySymbol: Record<string, string>;
  brokerId: string;
  adminId: string;
  approverId: string;
}) {
  const specs = [
    { ref: "ALP-ORD-DRAFT-ECO", symbol: "ECO", side: "BUY" as const, qty: 2000, price: 4.5, status: "DRAFT" },
    { ref: "ALP-ORD-SUBMIT-CBZ", symbol: "CBZ", side: "BUY" as const, qty: 1500, price: 12.3, status: "SUBMITTED" },
    { ref: "ALP-ORD-APPROVED-DLTA", symbol: "DLTA", side: "BUY" as const, qty: 800, price: 18.5, status: "APPROVED" },
    { ref: "ALP-ORD-REJECT-OKZ", symbol: "OKZ", side: "SELL" as const, qty: 500, price: 3.1, status: "REJECTED" },
    { ref: "ALP-ORD-EXEC-FBC", symbol: "FBC", side: "BUY" as const, qty: 1200, price: 8.2, status: "EXECUTED" },
    { ref: "ALP-ORD-SETTLED-INN", symbol: "INN", side: "BUY" as const, qty: 400, price: 41.5, status: "SETTLED" },
  ];

  for (const s of specs) {
    const instrumentId = opts.instrumentBySymbol[s.symbol];
    const securityId = opts.securityBySymbol[s.symbol];
    if (!instrumentId || !securityId) continue;
    const when = new Date(Date.now() - 2 * 86400000);
    let order = await prisma.investmentOrder.findFirst({ where: { orderRef: s.ref } });
    if (order) {
      order = await prisma.investmentOrder.update({
        where: { id: order.id },
        data: {
          fundId: opts.fundId,
          instrumentId,
          securityId,
          side: s.side,
          quantity: new Decimal(s.qty),
          limitPrice: new Decimal(s.price),
          executionPrice: new Decimal(s.price),
          brokerProfileId: opts.brokerId,
          status: s.status,
          complianceStatus: "PASSED",
          submittedAt: when,
          approvedAt: ["APPROVED", "EXECUTED", "SETTLED"].includes(s.status) ? when : null,
          tradeDate: when,
          valueDate: when,
        },
      });
    } else {
      order = await prisma.investmentOrder.create({
        data: {
          orderRef: s.ref,
          fundId: opts.fundId,
          instrumentId,
          securityId,
          side: s.side,
          quantity: new Decimal(s.qty),
          orderType: "LIMIT",
          limitPrice: new Decimal(s.price),
          executionPrice: new Decimal(s.price),
          tradeCurrency: "USD",
          settlementCurrency: "USD",
          brokerProfileId: opts.brokerId,
          status: s.status,
          complianceStatus: "PASSED",
          createdById: opts.adminId,
          submittedAt: when,
          approvedAt: ["APPROVED", "EXECUTED", "SETTLED"].includes(s.status) ? when : null,
          tradeDate: when,
          valueDate: when,
          createdAt: when,
          idempotencyKey: `seed-order-${s.ref}`,
        },
      });
    }

    if (["APPROVED", "EXECUTED", "SETTLED"].includes(s.status)) {
      const approval = await prisma.investmentOrderApproval.findFirst({
        where: { orderId: order.id, approvalSequence: 1 },
      });
      if (!approval) {
        await prisma.investmentOrderApproval.create({
          data: {
            orderId: order.id,
            approvalType: "ORDER",
            status: "APPROVED",
            approverId: opts.approverId,
            oldStatus: "SUBMITTED",
            newStatus: "APPROVED",
            approvalSequence: 1,
            revisionNo: 1,
            decidedAt: when,
            idempotencyKey: `seed-appr-${s.ref}`,
          },
        });
      }
    }

    if (["EXECUTED", "SETTLED"].includes(s.status)) {
      const execRef = `${s.ref}-FILL-1`;
      const existingExec = await prisma.investmentOrderExecution.findFirst({
        where: { orderId: order.id, executionRef: execRef },
      });
      if (!existingExec) {
        const qty = new Decimal(s.qty);
        const px = new Decimal(s.price);
        await prisma.investmentOrderExecution.create({
          data: {
            orderId: order.id,
            executionRef: execRef,
            quantity: qty,
            price: px,
            grossAmount: qty.mul(px),
            feeAmount: new Decimal(25),
            taxAmount: new Decimal(0),
            currencyCode: "USD",
            executedAt: when,
            settlementDate: when,
            idempotencyKey: `seed-fill-${s.ref}`,
          },
        });
      }
    }
  }
  console.log(`[ok] sample orders seeded`);
}

async function ensureDisjointUsers(adminId: string) {
  const role = await prisma.role.findFirst({
    where: { OR: [{ name: { contains: "Admin" } }, { name: { contains: "admin" } }] },
  });
  if (!role) return { pmId: adminId, approverId: adminId };

  const people = [
    {
      email: "pm.growth@arcus.co.zw",
      firstName: "Grace",
      lastName: "Moyo",
      roleCode: "PORTFOLIO_MANAGER",
    },
    {
      email: "pm.income@arcus.co.zw",
      firstName: "Isaac",
      lastName: "Ncube",
      roleCode: "PORTFOLIO_MANAGER",
    },
    {
      email: "ops.approver@arcus.co.zw",
      firstName: "Amina",
      lastName: "Chirwa",
      roleCode: "INVESTMENT_APPROVER",
    },
  ];

  const ids: string[] = [];
  for (const p of people) {
    inspectVisible(p);
    let user = await prisma.user.findUnique({ where: { email: p.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: p.email,
          password: "$2a$10$seedhashnotusedforlogin000000000000000000000000000",
          firstName: p.firstName,
          lastName: p.lastName,
          roleId: role.id,
          roleCode: p.roleCode,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: p.firstName,
          lastName: p.lastName,
          roleId: role.id,
          roleCode: p.roleCode,
        },
      });
    }
    ids.push(user.id);
  }
  return { pmGrowthId: ids[0], pmIncomeId: ids[1], approverId: ids[2] };
}

async function ensurePortfolioConfigAndAssignments(opts: {
  fundId: string;
  adminId: string;
  pmId: string;
  otherFundId: string;
  otherPmId: string;
}) {
  const config = await prisma.investmentPortfolioConfig.upsert({
    where: { fundId: opts.fundId },
    create: {
      fundId: opts.fundId,
      baseCurrencyCode: "USD",
      valuationPolicyJson: { method: "MARK_TO_MARKET" },
      settlementPolicyJson: { cycle: "T+2" },
      approvalPolicyJson: { fourEye: true },
      createdById: opts.adminId,
    },
    update: {
      baseCurrencyCode: "USD",
      isActive: true,
    },
  });

  await prisma.investmentPortfolioConfig.upsert({
    where: { fundId: opts.otherFundId },
    create: {
      fundId: opts.otherFundId,
      baseCurrencyCode: "USD",
      createdById: opts.adminId,
    },
    update: { isActive: true },
  });

  const folderPath = "/Listed Equities";
  let folder = await prisma.investmentPortfolioFolder.findFirst({
    where: { fundId: opts.fundId, path: folderPath },
  });
  if (!folder) {
    folder = await prisma.investmentPortfolioFolder.create({
      data: {
        fundId: opts.fundId,
        name: "Listed Equities",
        path: folderPath,
        sortOrder: 1,
        createdById: opts.adminId,
      },
    });
  }

  const existingAssign = await prisma.investmentPortfolioAssignment.findFirst({
    where: {
      portfolioConfigId: config.id,
      userId: opts.pmId,
      assignmentRole: "PORTFOLIO_MANAGER",
    },
  });
  if (!existingAssign) {
    await prisma.investmentPortfolioAssignment.create({
      data: {
        portfolioConfigId: config.id,
        folderId: folder.id,
        userId: opts.pmId,
        assignmentRole: "PORTFOLIO_MANAGER",
        createdById: opts.adminId,
      },
    });
  }

  await prisma.fundManager.upsert({
    where: { fundId_userId: { fundId: opts.fundId, userId: opts.pmId } },
    create: { fundId: opts.fundId, userId: opts.pmId, role: "portfolio_manager", isActive: true },
    update: { isActive: true },
  });
  await prisma.fundManager.upsert({
    where: { fundId_userId: { fundId: opts.otherFundId, userId: opts.otherPmId } },
    create: {
      fundId: opts.otherFundId,
      userId: opts.otherPmId,
      role: "portfolio_manager",
      isActive: true,
    },
    update: { isActive: true },
  });

  console.log(
    `[ok] portfolio config id=${config.id} folderId=${folder.id} pm=${opts.pmId} disjointPm=${opts.otherPmId}`
  );
  return { config, folder };
}

async function ensurePriceAndFxLifecycle(securityId: string, adminId: string, approverId: string) {
  const pendingKey = "seed-tick-pending-eco";
  let pending = await prisma.listedEquityPriceTick.findFirst({
    where: { idempotencyKey: pendingKey },
  });
  if (!pending) {
    pending = await prisma.listedEquityPriceTick.create({
      data: {
        securityId,
        price: new Decimal(4.9),
        priceType: "CLOSE",
        validationStatus: "PENDING",
        pricedAt: new Date(),
        tickFrequency: "EOD",
        sourceStatus: "OK",
        sourceCode: "MANUAL",
        idempotencyKey: pendingKey,
      },
    });
  }

  const rejectedKey = "seed-tick-rejected-eco";
  let rejected = await prisma.listedEquityPriceTick.findFirst({
    where: { idempotencyKey: rejectedKey },
  });
  if (!rejected) {
    rejected = await prisma.listedEquityPriceTick.create({
      data: {
        securityId,
        price: new Decimal(9.99),
        priceType: "CLOSE",
        validationStatus: "REJECTED",
        pricedAt: new Date(Date.now() - 86400000),
        tickFrequency: "EOD",
        sourceStatus: "OK",
        sourceCode: "MANUAL",
        approvalReason: "Outlier versus prior close",
        reviewedById: approverId,
        reviewedAt: new Date(),
        idempotencyKey: rejectedKey,
      },
    });
  }

  const fxApprovedKey = "seed-fx-usd-zwg-approved";
  let fxApproved = await prisma.investmentFxRateSnapshot.findFirst({
    where: { idempotencyKey: fxApprovedKey },
  });
  if (!fxApproved) {
    fxApproved = await prisma.investmentFxRateSnapshot.create({
      data: {
        baseCurrencyCode: "USD",
        quoteCurrencyCode: "ZWG",
        rate: new Decimal(26.5),
        rateType: "SPOT",
        sourceCode: "RBZ",
        sourceObservedAt: new Date(),
        approvalStatus: "APPROVED",
        approvedById: approverId,
        approvedAt: new Date(),
        idempotencyKey: fxApprovedKey,
      },
    });
  }

  const fxPendingKey = "seed-fx-usd-zar-pending";
  let fxPending = await prisma.investmentFxRateSnapshot.findFirst({
    where: { idempotencyKey: fxPendingKey },
  });
  if (!fxPending) {
    fxPending = await prisma.investmentFxRateSnapshot.create({
      data: {
        baseCurrencyCode: "USD",
        quoteCurrencyCode: "ZAR",
        rate: new Decimal(18.2),
        rateType: "SPOT",
        sourceCode: "MANUAL",
        sourceObservedAt: new Date(),
        approvalStatus: "PENDING",
        idempotencyKey: fxPendingKey,
      },
    });
  }

  console.log(
    `[ok] price ticks pending=${pending.id} rejected=${rejected.id}; fx approved=${fxApproved.id} pending=${fxPending.id}`
  );
}

async function ensureValuationLifecycle(fundId: string, instrumentId: string, securityId: string, adminId: string) {
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);
  let run = await prisma.investmentValuationRun.findFirst({
    where: { fundId, idempotencyKey: "seed-val-run-primary" },
  });
  if (!run) {
    run = await prisma.investmentValuationRun.create({
      data: {
        fundId,
        asOf,
        status: "COMPLETED",
        navBaseCurrency: new Decimal(1850000),
        parametersJson: { method: "MARK_TO_MARKET" },
        idempotencyKey: "seed-val-run-primary",
        startedById: adminId,
        completedAt: new Date(),
      },
    });
  }

  const openEx = await prisma.investmentValuationException.findFirst({
    where: { fundId, exceptionType: "STALE_PRICE", status: "OPEN" },
  });
  if (!openEx) {
    await prisma.investmentValuationException.create({
      data: {
        valuationRunId: run.id,
        fundId,
        instrumentId,
        securityId,
        exceptionType: "STALE_PRICE",
        message: "Close price older than policy threshold for Seed Co International",
        status: "OPEN",
      },
    });
  }

  console.log(`[ok] valuationRunId=${run.id}`);
  return run;
}

async function ensureReconciliation(fundId: string, adminId: string) {
  let batch = await prisma.investmentReconciliationBatch.findFirst({
    where: { fundId, idempotencyKey: "seed-recon-holdings" },
  });
  if (!batch) {
    batch = await prisma.investmentReconciliationBatch.create({
      data: {
        fundId,
        reconType: "HOLDINGS",
        asOfDate: new Date(),
        status: "COMPLETED",
        matchedCount: 7,
        unmatchedCount: 1,
        externalFileName: "custodian-holdings-pack.csv",
        idempotencyKey: "seed-recon-holdings",
        createdById: adminId,
        completedAt: new Date(),
      },
    });
  }

  let item = await prisma.investmentReconciliationItem.findFirst({
    where: { batchId: batch.id, externalRef: "CUST-ECO-QTY" },
  });
  if (!item) {
    item = await prisma.investmentReconciliationItem.create({
      data: {
        batchId: batch.id,
        status: "UNMATCHED",
        internalRef: "HOLD-ECO",
        externalRef: "CUST-ECO-QTY",
        internalAmount: new Decimal(40000),
        externalAmount: new Decimal(39950),
        variance: new Decimal(50),
        message: "Quantity variance versus custodian statement",
      },
    });
  }

  console.log(`[ok] reconBatchId=${batch.id} reconItemId=${item.id}`);
  return { batch, item };
}

async function ensureDocumentsReportsJobsAudit(opts: {
  fundId: string;
  adminId: string;
  orderId?: string;
}) {
  const storageRef = `storage/local-upload-mock/investment-ops-docs/seed/${opts.fundId}/mandate.pdf`;
  let doc = await prisma.investmentDocument.findFirst({
    where: { fundId: opts.fundId, title: "Arcus Listed Portfolio Mandate Pack" },
  });
  if (!doc) {
    doc = await prisma.investmentDocument.create({
      data: {
        fundId: opts.fundId,
        documentType: "MANDATE",
        title: "Arcus Listed Portfolio Mandate Pack",
        fileRef: storageRef,
        checksumSha256: sha(storageRef),
        classification: "CONFIDENTIAL",
        orderId: opts.orderId ?? null,
        approvalStatus: "APPROVED",
        uploadedById: opts.adminId,
      },
    });
  }

  let report = await prisma.investmentReportRun.findFirst({
    where: { fundId: opts.fundId, reportType: "HOLDINGS_REPORT", status: "COMPLETED" },
  });
  if (!report) {
    report = await prisma.investmentReportRun.create({
      data: {
        fundId: opts.fundId,
        scopeType: "FUND",
        reportType: "HOLDINGS_REPORT",
        format: "PDF",
        status: "COMPLETED",
        fileRef: `storage/local-upload-mock/investment-ops-reports/seed-holdings-${opts.fundId}.pdf`,
        parametersJson: { periodStart: "2026-01-01", periodEnd: "2026-06-30" },
        requestedById: opts.adminId,
        completedAt: new Date(),
      },
    });
  }

  let job = await prisma.investmentJob.findFirst({
    where: { idempotencyKey: "seed-job-report-holdings" },
  });
  if (!job) {
    job = await prisma.investmentJob.create({
      data: {
        jobType: "REPORT_GENERATE",
        aggregateType: "InvestmentReportRun",
        aggregateId: report.id,
        payloadJson: { reportRunId: report.id },
        status: "COMPLETED",
        idempotencyKey: "seed-job-report-holdings",
        attemptCount: 1,
        completedAt: new Date(),
      },
    });
  }

  const auditKey = sha(`seed-audit-${opts.fundId}-portfolio-seeded`);
  const existingAudit = await prisma.investmentAuditEvent.findFirst({
    where: { eventHash: auditKey },
  });
  if (!existingAudit) {
    await prisma.investmentAuditEvent.create({
      data: {
        aggregateType: "Fund",
        aggregateId: opts.fundId,
        sequenceNo: 1,
        eventType: "PORTFOLIO_SEEDED",
        actorId: opts.adminId,
        afterJson: { name: "Arcus Listed Portfolio" },
        eventHash: auditKey,
      },
    });
  }

  const outboxKey = "seed-outbox-valuation-completed";
  const existingOutbox = await prisma.investmentOutboxEvent.findFirst({
    where: { idempotencyKey: outboxKey },
  });
  if (!existingOutbox) {
    await prisma.investmentOutboxEvent.create({
      data: {
        aggregateType: "InvestmentValuationRun",
        aggregateId: opts.fundId,
        aggregateVersion: 1,
        eventType: "VALUATION_COMPLETED",
        payloadJson: { fundId: opts.fundId },
        idempotencyKey: outboxKey,
        status: "PENDING",
      },
    });
  }

  console.log(`[ok] documentId=${doc.id} reportRunId=${report.id} jobId=${job.id}`);
}

async function ensureSettings() {
  await prisma.investmentOpsSetting.upsert({
    where: { settingKey: "four_eye_orders" },
    create: { settingKey: "four_eye_orders", settingValue: { enabled: true } },
    update: { settingValue: { enabled: true } },
  });
}

async function main() {
  console.log("Seeding Investment Ops presentation data (DEV nts only)…\n");
  await assertDevDatabase(prisma, "seed:investment-ops-demo");
  await assertSchemaReady();

  await ensureCountries();
  await ensureMarkets();
  await ensureInstrumentType();
  await ensureSettings();

  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found");
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, select: { id: true } });

  const users = await ensureDisjointUsers(admin.id);
  const approverId = users.approverId || admin.id;
  const pmGrowthId = users.pmGrowthId || admin.id;
  const pmIncomeId = users.pmIncomeId || admin.id;

  const broker = await ensureStakeholder(
    "BROKER",
    "Imara Edwards Securities",
    "dealing@imaraedwards.co.zw"
  );
  const broker2 = await ensureStakeholder("BROKER", "Imara Capital", "dealing@imara.co.zw");
  const custodian = await ensureStakeholder(
    "CUSTODIAN",
    "CBZ Custodial Services",
    "custody@cbz.co.zw"
  );
  await ensureStakeholder("CUSTODIAN", "CABS Custody", "custody@cabs.co.zw");
  await ensureCommission(broker.id, 20, "EQUITY");
  await ensureCommission(broker2.id, 25, "EQUITY");

  const priceBySymbol = Object.fromEntries(PRIMARY_EQUITIES.map((e) => [e.symbol, e]));
  const securityBySymbol: Record<string, string> = {};
  const instrumentBySymbol: Record<string, string> = {};

  for (const eq of PRIMARY_EQUITIES) {
    const issuer = await ensureIssuer(eq.symbol, eq.name, eq.sector);
    const { security, instrument } = await ensureSecurityAndInstrument(eq, issuer.id, admin.id);
    securityBySymbol[eq.symbol] = security.id;
    instrumentBySymbol[eq.symbol] = instrument.id;
  }
  console.log(`[ok] instrument master count=${PRIMARY_EQUITIES.length}`);

  // Draft / pending instrument lifecycle samples
  const draftCode = "ZSE-DRAFT-NEWCO";
  if (!(await prisma.investmentInstrument.findFirst({ where: { instrumentCode: draftCode } }))) {
    await prisma.investmentInstrument.create({
      data: {
        instrumentCode: draftCode,
        shortName: "NEWCO",
        fullName: "Newco Holdings Limited",
        ticker: "NEWCO",
        exchangeCode: "ZSE",
        marketCode: "ZSE",
        countryCode: "ZW",
        instrumentTypeCode: "EQUITY",
        listingCurrencyCode: "USD",
        status: "DRAFT",
        createdById: admin.id,
      },
    });
  }
  const pendingCode = "ZSE-PENDING-MEIK";
  if (!(await prisma.investmentInstrument.findFirst({ where: { instrumentCode: pendingCode } }))) {
    await prisma.investmentInstrument.create({
      data: {
        instrumentCode: pendingCode,
        shortName: "MEIK",
        fullName: "Meikles Limited",
        ticker: "MEIK",
        exchangeCode: "ZSE",
        marketCode: "ZSE",
        countryCode: "ZW",
        instrumentTypeCode: "EQUITY",
        listingCurrencyCode: "USD",
        status: "PENDING_APPROVAL",
        createdById: admin.id,
      },
    });
  }

  const primary = await ensureListedFund({
    name: "Arcus Listed Portfolio",
    description: "Listed equity mandate managed by Arcus Asset Management",
    adminId: admin.id,
    bankId: bank?.id ?? null,
    brokerId: broker.id,
    custodianId: custodian.id,
  });

  const primaryHoldMeta: Array<{ qty: number; price: number; wac: number }> = [];
  for (const eq of PRIMARY_EQUITIES) {
    await ensureHolding(primary.id, securityBySymbol[eq.symbol], eq.qty, eq.wac);
    primaryHoldMeta.push({ qty: eq.qty, price: eq.price, wac: eq.wac });
  }
  await ensureComplianceRules(primary.id);
  await ensureValuationSnapshot(primary.id, primaryHoldMeta);

  for (const spec of TRADE_SPECS) {
    const secId = securityBySymbol[spec.symbol];
    if (!secId) continue;
    await ensureSettledTrade({
      fundId: primary.id,
      securityId: secId,
      tradeRef: `${spec.refPrefix}-2026`,
      side: spec.side,
      qty: spec.qty,
      price: spec.price,
      fees: spec.fees,
      when: new Date(Date.now() - spec.daysAgo * 86400000),
      adminId: admin.id,
    });
  }
  console.log(`[ok] settled trades=${TRADE_SPECS.length}`);

  await ensureOrders({
    fundId: primary.id,
    instrumentBySymbol,
    securityBySymbol,
    brokerId: broker.id,
    adminId: admin.id,
    approverId,
  });

  const client = await ensurePortfolioClient(primary.id);

  const seededExtra: string[] = [];
  for (const extra of EXTRA_FUNDS) {
    const fund = await ensureListedFund({
      name: extra.name,
      description: extra.description,
      adminId: admin.id,
      bankId: bank?.id ?? null,
      brokerId: broker.id,
      custodianId: custodian.id,
    });
    seededExtra.push(fund.id);
    const holdMeta: Array<{ qty: number; price: number; wac: number }> = [];
    for (const h of extra.holdings) {
      const eq = priceBySymbol[h.symbol];
      if (!eq || !securityBySymbol[h.symbol]) continue;
      await ensureHolding(fund.id, securityBySymbol[h.symbol], h.qty, h.wac);
      holdMeta.push({ qty: h.qty, price: eq.price, wac: h.wac });
    }
    await ensureComplianceRules(fund.id);
    await ensureValuationSnapshot(fund.id, holdMeta);
  }

  const growthFund = await prisma.fund.findFirst({
    where: { name: "Arcus Growth Equity Fund" },
    select: { id: true },
  });
  const incomeFund = await prisma.fund.findFirst({
    where: { name: "Arcus Income Mandate" },
    select: { id: true },
  });
  if (growthFund && incomeFund) {
    await ensurePortfolioConfigAndAssignments({
      fundId: growthFund.id,
      adminId: admin.id,
      pmId: pmGrowthId,
      otherFundId: incomeFund.id,
      otherPmId: pmIncomeId,
    });
  }

  await ensurePriceAndFxLifecycle(securityBySymbol.ECO, admin.id, approverId);
  await ensureValuationLifecycle(
    primary.id,
    instrumentBySymbol.SEED,
    securityBySymbol.SEED,
    admin.id
  );
  await ensureReconciliation(primary.id, admin.id);

  const settledOrder = await prisma.investmentOrder.findFirst({
    where: { orderRef: "ALP-ORD-SETTLED-INN" },
    select: { id: true },
  });
  await ensureDocumentsReportsJobsAudit({
    fundId: primary.id,
    adminId: admin.id,
    orderId: settledOrder?.id,
  });

  const funds = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const tradeCount = await prisma.listedEquityTrade.count({ where: { fundId: primary.id } });
  const orderCount = await prisma.investmentOrder.count({ where: { fundId: primary.id } });
  const acctCount = await prisma.investmentAccountingEvent.count({ where: { fundId: primary.id } });

  console.log(`\nPresentation seed complete.`);
  console.log(`  Primary: Arcus Listed Portfolio id=${primary.id}`);
  console.log(`  LISTED_EQUITY funds: ${funds.length}`);
  for (const f of funds) console.log(`    - ${f.name} (${f.id})`);
  console.log(`  Trades (primary): ${tradeCount}`);
  console.log(`  Orders (primary): ${orderCount}`);
  console.log(`  Accounting events (primary): ${acctCount}`);
  console.log(`  Client: ${client.legalName} (${client.id})`);
  console.log(`  PM growth: ${pmGrowthId}`);
  console.log(`  PM income: ${pmIncomeId}`);
  console.log(`  Approver: ${approverId}`);
  console.log(`  Brokers: Imara Edwards Securities, Imara Capital`);
  console.log(`  Custodians: CBZ Custodial Services, CABS Custody`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
