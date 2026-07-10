/**
 * Seed realistic Investment Ops demo data for client presentations.
 * Idempotent — safe to re-run. No UAT/Verify/timestamp display names.
 *
 * Usage: npm run db:seed:investment-ops-demo
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

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

/** Primary book — full ZSE sleeve */
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

const TRADE_SPECS: Array<{
  refPrefix: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fees: number;
  daysAgo: number;
}> = [
  { refPrefix: "ALP-CBZ", symbol: "CBZ", side: "BUY", qty: 5000, price: 11.2, fees: 112, daysAgo: 45 },
  { refPrefix: "ALP-DLTA", symbol: "DLTA", side: "BUY", qty: 3000, price: 16.5, fees: 99, daysAgo: 40 },
  { refPrefix: "ALP-ECO", symbol: "ECO", side: "BUY", qty: 10000, price: 4.1, fees: 82, daysAgo: 35 },
  { refPrefix: "ALP-FBC", symbol: "FBC", side: "BUY", qty: 4000, price: 7.9, fees: 63, daysAgo: 28 },
  { refPrefix: "ALP-INN", symbol: "INN", side: "BUY", qty: 1500, price: 39.0, fees: 117, daysAgo: 21 },
  { refPrefix: "ALP-BAT", symbol: "BAT", side: "BUY", qty: 500, price: 78.5, fees: 78.5, daysAgo: 14 },
  { refPrefix: "ALP-OKZ", symbol: "OKZ", side: "BUY", qty: 8000, price: 2.95, fees: 47, daysAgo: 10 },
  { refPrefix: "ALP-SEED", symbol: "SEED", side: "BUY", qty: 2500, price: 5.8, fees: 29, daysAgo: 7 },
  { refPrefix: "ALP-ECO2", symbol: "ECO", side: "BUY", qty: 5000, price: 4.4, fees: 44, daysAgo: 3 },
  { refPrefix: "ALP-CBZ2", symbol: "CBZ", side: "SELL", qty: 1000, price: 12.4, fees: 24.8, daysAgo: 1 },
];

async function ensureCountries() {
  for (const c of COUNTRIES) {
    await prisma.investmentCountry.upsert({
      where: { countryCode: c.countryCode },
      create: { ...c, isActive: true },
      update: { countryName: c.countryName, region: c.region, isActive: true },
    });
  }
  console.log(`[ok] countries: ${COUNTRIES.length}`);
}

async function ensureMarkets() {
  for (const m of MARKETS) {
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
  console.log(`[ok] markets: ${MARKETS.length}`);
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

async function purgeOrphanCommissions() {
  const rows = await prisma.investmentBrokerCommission.findMany({ select: { id: true, stakeholderProfileId: true } });
  const ids = [...new Set(rows.map((r) => r.stakeholderProfileId))];
  const existing = await prisma.listedEquityStakeholderProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const ok = new Set(existing.map((e) => e.id));
  const orphanIds = rows.filter((r) => !ok.has(r.stakeholderProfileId)).map((r) => r.id);
  if (orphanIds.length) {
    await prisma.investmentBrokerCommission.deleteMany({ where: { id: { in: orphanIds } } });
    console.log(`[ok] deleted orphan commissions: ${orphanIds.length}`);
  }
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
    console.log(`[ok] created fund ${opts.name}`);
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
        status: "APPROVED",
        createdById: createdById ?? null,
        approvedById: createdById ?? null,
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
        status: "APPROVED",
        instrumentTypeCode: "EQUITY",
      },
    });
  }

  const existingTick = await prisma.listedEquityPriceTick.findFirst({
    where: { securityId: security.id, validationStatus: "APPROVED" },
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

async function ensureValuationSnapshot(
  fundId: string,
  holdings: Array<{ qty: number; price: number; wac: number }>
) {
  const nav = holdings.reduce((s, h) => s + h.qty * h.price, 0);
  const cost = holdings.reduce((s, h) => s + h.qty * h.wac, 0);
  const unrealized = nav - cost;
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
}

async function ensureDemoClient(fundId: string) {
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
        externalRef: "DEMO_SEEDED",
      },
      update: {
        status: "CONFIRMED",
        confirmedAt: opts.when,
        externalRef: "DEMO_SEEDED",
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
      settlementDocumentRef: `demo-settlement://${opts.tradeRef}`,
    },
    update: {
      realizedPnl: realized,
      settlementDocumentRef: `demo-settlement://${opts.tradeRef}`,
    },
  });

  const amount = opts.qty * opts.price;
  await prisma.investmentAccountingEvent.upsert({
    where: { id: `demo-acct-${opts.tradeRef}` },
    create: {
      id: `demo-acct-${opts.tradeRef}`,
      fundId: opts.fundId,
      sourceType: "LISTED_EQUITY_TRADE",
      sourceId: trade.id,
      eventType: opts.side === "BUY" ? "PURCHASE" : "SALE",
      status: "POSTED",
      tradeRef: opts.tradeRef,
      amount: new Decimal(amount),
      currencyCode: "USD",
      postedAt: opts.when,
    },
    update: {
      status: "POSTED",
      sourceId: trade.id,
      amount: new Decimal(amount),
      postedAt: opts.when,
    },
  }).catch(async () => {
    const exists = await prisma.investmentAccountingEvent.findFirst({
      where: { sourceId: trade.id, sourceType: "LISTED_EQUITY_TRADE" },
    });
    if (!exists) {
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
        },
      });
    } else {
      await prisma.investmentAccountingEvent.update({
        where: { id: exists.id },
        data: { status: "POSTED", amount: new Decimal(amount), postedAt: opts.when },
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
}) {
  const specs = [
    { ref: "ORD-ALP-CBZ-001", symbol: "CBZ", side: "BUY", qty: 2000, price: 12.4, status: "SETTLED", daysAgo: 5 },
    { ref: "ORD-ALP-ECO-001", symbol: "ECO", side: "BUY", qty: 8000, price: 4.5, status: "EXECUTED", daysAgo: 2 },
    { ref: "ORD-ALP-DLTA-001", symbol: "DLTA", side: "BUY", qty: 1500, price: 18.7, status: "APPROVED", daysAgo: 1 },
    { ref: "ORD-ALP-FBC-001", symbol: "FBC", side: "SELL", qty: 500, price: 8.25, status: "SUBMITTED", daysAgo: 0 },
  ];
  for (const s of specs) {
    const instrumentId = opts.instrumentBySymbol[s.symbol];
    const securityId = opts.securityBySymbol[s.symbol];
    if (!instrumentId || !securityId) continue;
    const when = new Date(Date.now() - s.daysAgo * 86400000);
    const existing = await prisma.investmentOrder.findFirst({ where: { orderRef: s.ref } });
    if (existing) {
      await prisma.investmentOrder.update({
        where: { id: existing.id },
        data: {
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
      continue;
    }
    await prisma.investmentOrder.create({
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
      },
    });
  }
  console.log(`[ok] sample orders seeded`);
}

async function main() {
  console.log("Seeding Investment Ops demo data…\n");

  await ensureCountries();
  await ensureMarkets();
  await ensureInstrumentType();
  await purgeOrphanCommissions();

  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found");
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, select: { id: true } });

  const broker = await ensureStakeholder("BROKER", "Imara Edwards Securities", "dealing@imaraedwards.co.zw");
  const broker2 = await ensureStakeholder("BROKER", "Imara Capital", "dealing@imara.co.zw");
  const custodian = await ensureStakeholder("CUSTODIAN", "CBZ Custodial Services", "custody@cbz.co.zw");
  const custodian2 = await ensureStakeholder("CUSTODIAN", "CABS Custody", "custody@cabs.co.zw");
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
    console.log(`[ok] master ${eq.symbol}`);
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
  console.log(`[ok] settled trades: ${TRADE_SPECS.length}`);

  await ensureOrders({
    fundId: primary.id,
    instrumentBySymbol,
    securityBySymbol,
    brokerId: broker.id,
    adminId: admin.id,
  });

  const client = await ensureDemoClient(primary.id);

  for (const extra of EXTRA_FUNDS) {
    const fund = await ensureListedFund({
      name: extra.name,
      description: extra.description,
      adminId: admin.id,
      bankId: bank?.id ?? null,
      brokerId: broker.id,
      custodianId: custodian.id,
    });
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

  // Keep only realistic stakeholders
  const keepNames = new Set([
    "Imara Edwards Securities",
    "Imara Capital",
    "CBZ Custodial Services",
    "CABS Custody",
  ]);
  const allStakeholders = await prisma.listedEquityStakeholderProfile.findMany();
  for (const s of allStakeholders) {
    if (keepNames.has(s.name)) continue;
    await prisma.listedEquityFundConfig.updateMany({
      where: { brokerProfileId: s.id },
      data: { brokerProfileId: broker.id },
    });
    await prisma.listedEquityFundConfig.updateMany({
      where: { custodianProfileId: s.id },
      data: { custodianProfileId: custodian.id },
    });
    await prisma.investmentBrokerCommission.deleteMany({ where: { stakeholderProfileId: s.id } });
    await prisma.listedEquityStakeholderProfile.delete({ where: { id: s.id } });
    console.log(`[ok] removed junk stakeholder ${s.name}`);
  }

  const funds = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const tradeCount = await prisma.listedEquityTrade.count({ where: { fundId: primary.id } });
  const orderCount = await prisma.investmentOrder.count({ where: { fundId: primary.id } });
  const acctCount = await prisma.investmentAccountingEvent.count({ where: { fundId: primary.id } });

  console.log(`\nDemo seed complete.`);
  console.log(`  Primary: Arcus Listed Portfolio (${primary.id})`);
  console.log(`  LISTED_EQUITY funds: ${funds.length}`);
  for (const f of funds) console.log(`    - ${f.name}`);
  console.log(`  Trades (primary): ${tradeCount}`);
  console.log(`  Orders (primary): ${orderCount}`);
  console.log(`  Accounting events (primary): ${acctCount}`);
  console.log(`  Client: ${client.legalName}`);
  console.log(`  Brokers: Imara Edwards Securities, Imara Capital`);
  console.log(`  Custodians: CBZ Custodial Services, CABS Custody`);
  console.log(`  Markets: ${MARKETS.map((m) => m.marketCode).join(", ")}`);
  console.log(`  Countries: ${COUNTRIES.map((c) => c.countryCode).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
