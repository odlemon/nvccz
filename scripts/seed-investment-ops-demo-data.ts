/**
 * Seed realistic Investment Ops demo data for Arcus Listed Portfolio.
 * Idempotent — safe to re-run. No UAT/Verify/timestamp display names.
 *
 * Usage: npm run db:seed:investment-ops-demo
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

const FUND_NAME = "Arcus Listed Portfolio";
const DEFAULT_COA = {
  listedSecuritiesAsset: "1501",
  bankClearing: "1100",
  realizedGain: "4010",
  realizedLoss: "5200",
};

const DEMO_EQUITIES = [
  { symbol: "CBZ", name: "CBZ Holdings Limited", sector: "Financials", price: 12.45, qty: 25000, wac: 11.2 },
  { symbol: "DLTA", name: "Delta Corporation Limited", sector: "Consumer Staples", price: 18.75, qty: 15000, wac: 16.5 },
  { symbol: "FBC", name: "FBC Holdings Limited", sector: "Financials", price: 8.3, qty: 20000, wac: 7.9 },
  { symbol: "ECO", name: "Econet Wireless Zimbabwe", sector: "Telecommunications", price: 4.55, qty: 40000, wac: 4.1 },
  { symbol: "SEED", name: "Seed Co International", sector: "Agriculture", price: 6.2, qty: 12000, wac: 5.8 },
  { symbol: "BAT", name: "British American Tobacco Zimbabwe", sector: "Consumer Staples", price: 85.0, qty: 2000, wac: 78.5 },
  { symbol: "OKZ", name: "OK Zimbabwe Limited", sector: "Consumer Discretionary", price: 3.15, qty: 30000, wac: 2.95 },
  { symbol: "INN", name: "Innscor Africa Limited", sector: "Consumer Staples", price: 42.1, qty: 5000, wac: 39.0 },
];

async function ensureCountry() {
  await prisma.investmentCountry.upsert({
    where: { countryCode: "ZW" },
    create: { countryCode: "ZW", countryName: "Zimbabwe", region: "Southern Africa" },
    update: { countryName: "Zimbabwe", region: "Southern Africa" },
  });
}

async function ensureMarket() {
  await prisma.investmentMarket.upsert({
    where: { marketCode: "ZSE" },
    create: { marketCode: "ZSE", marketName: "Zimbabwe Stock Exchange", countryCode: "ZW" },
    update: { marketName: "Zimbabwe Stock Exchange", countryCode: "ZW" },
  });
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

async function ensureFund() {
  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found");
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, select: { id: true } });

  let fund = await prisma.fund.findFirst({ where: { name: FUND_NAME } });
  if (!fund) {
    fund = await prisma.fund.findFirst({
      where: { fundPurpose: "LISTED_EQUITY", listedEquityFundConfig: { isNot: null } },
    });
  }

  if (!fund) {
    const now = new Date();
    fund = await prisma.fund.create({
      data: {
        name: FUND_NAME,
        description: "Listed equity mandate managed by Arcus Asset Management",
        totalAmount: new Decimal(0),
        remainingAmount: new Decimal(0),
        minInvestment: new Decimal(0),
        maxInvestment: new Decimal(0),
        focusIndustries: [],
        applicationStart: now,
        applicationEnd: new Date("2099-12-31"),
        status: "OPEN",
        fundPurpose: "LISTED_EQUITY",
        createdById: admin.id,
      },
    });
    console.log(`[ok] Created fund ${fund.id}`);
  } else {
    fund = await prisma.fund.update({
      where: { id: fund.id },
      data: {
        name: FUND_NAME,
        fundPurpose: "LISTED_EQUITY",
        description: "Listed equity mandate managed by Arcus Asset Management",
        status: "OPEN",
      },
    });
    console.log(`[ok] Updated fund ${fund.id}`);
  }

  const broker = await ensureStakeholder("BROKER", "Imara Edwards Securities", "dealing@imaraedwards.co.zw");
  const custodian = await ensureStakeholder("CUSTODIAN", "CBZ Custodial Services", "custody@cbz.co.zw");

  const existingComm = await prisma.investmentBrokerCommission.findFirst({
    where: { stakeholderProfileId: broker.id, instrumentTypeCode: "EQUITY" },
  });
  if (!existingComm) {
    await prisma.investmentBrokerCommission.create({
      data: {
        stakeholderProfileId: broker.id,
        instrumentTypeCode: "EQUITY",
        rateBps: new Decimal(20),
        currencyCode: "USD",
        isActive: true,
      },
    });
  }

  const config = await prisma.listedEquityFundConfig.upsert({
    where: { fundId: fund.id },
    create: {
      fundId: fund.id,
      baseCurrencyCode: "USD",
      trustBankId: bank?.id ?? null,
      coaMappingJson: DEFAULT_COA,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
    },
    update: {
      baseCurrencyCode: "USD",
      trustBankId: bank?.id ?? null,
      coaMappingJson: DEFAULT_COA,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
    },
  });

  await prisma.fundManager.upsert({
    where: { fundId_userId: { fundId: fund.id, userId: admin.id } },
    create: { fundId: fund.id, userId: admin.id, role: "fund_manager", isActive: true },
    update: { isActive: true },
  });

  return { fund, config, broker, custodian, adminId: admin.id };
}

async function ensureSecurityAndInstrument(eq: (typeof DEMO_EQUITIES)[0], issuerId: string, createdById?: string) {
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
        purchasedAt: new Date(),
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

async function ensureValuationSnapshot(fundId: string, holdings: Array<{ qty: number; price: number; wac: number }>) {
  const nav = holdings.reduce((s, h) => s + h.qty * h.price, 0);
  const cost = holdings.reduce((s, h) => s + h.qty * h.wac, 0);
  const unrealized = nav - cost;
  const existing = await prisma.listedEquityValuationSnapshot.findFirst({
    where: { fundId },
    orderBy: { asOf: "desc" },
  });
  if (existing) {
    await prisma.listedEquityValuationSnapshot.update({
      where: { id: existing.id },
      data: {
        asOf: new Date(),
        navBaseCurrency: new Decimal(nav),
        unrealizedPnlUsd: new Decimal(unrealized),
        unrealizedPnlZig: new Decimal(0),
        status: "OK",
      },
    });
  } else {
    await prisma.listedEquityValuationSnapshot.create({
      data: {
        fundId,
        asOf: new Date(),
        navBaseCurrency: new Decimal(nav),
        unrealizedPnlUsd: new Decimal(unrealized),
        unrealizedPnlZig: new Decimal(0),
        status: "OK",
      },
    });
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
    console.log(`[ok] Created demo client ${client.id}`);
  } else {
    client = await prisma.client.update({
      where: { id: client.id },
      data: { legalName: "Harare Pension Fund Trustees", email, country: "ZW", status: "ACTIVE" },
    });
    console.log(`[ok] Updated demo client ${client.id}`);
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

async function ensureSampleTrade(fundId: string, securityId: string, adminId?: string) {
  const existing = await prisma.listedEquityTrade.findFirst({
    where: { fundId, tradeRef: { startsWith: "ALP-DEMO-" } },
  });
  if (existing) return existing;

  const trade = await prisma.listedEquityTrade.create({
    data: {
      tradeRef: `ALP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      fundId,
      securityId,
      side: "BUY",
      quantity: new Decimal(1000),
      executionPrice: new Decimal(12.45),
      executionCurrencyCode: "USD",
      fees: new Decimal(24.9),
      status: "SETTLED",
      executedAt: new Date(),
      settledAt: new Date(),
      executedById: adminId ?? null,
    },
  });
  for (const target of ["BROKER", "CUSTODIAN", "CORE_BANKING", "ACCOUNTING_GL"]) {
    await prisma.listedEquityTradeRoutingHop.create({
      data: {
        tradeId: trade.id,
        target,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        externalRef: "DEMO_SEEDED",
      },
    });
  }
  return trade;
}

async function main() {
  console.log("Seeding Investment Ops demo data…\n");

  await ensureCountry();
  await ensureMarket();
  await ensureInstrumentType();

  const { fund, adminId } = await ensureFund();

  const holdingMeta: Array<{ qty: number; price: number; wac: number }> = [];
  let firstSecurityId: string | null = null;

  for (const eq of DEMO_EQUITIES) {
    const issuer = await ensureIssuer(eq.symbol, eq.name, eq.sector);
    const { security } = await ensureSecurityAndInstrument(eq, issuer.id, adminId);
    await ensureHolding(fund.id, security.id, eq.qty, eq.wac);
    holdingMeta.push({ qty: eq.qty, price: eq.price, wac: eq.wac });
    if (!firstSecurityId) firstSecurityId = security.id;
    console.log(`[ok] ${eq.symbol} — instrument, security, price, holding`);
  }

  await ensureComplianceRules(fund.id);
  await ensureValuationSnapshot(fund.id, holdingMeta);
  if (firstSecurityId) await ensureSampleTrade(fund.id, firstSecurityId, adminId);
  const client = await ensureDemoClient(fund.id);

  const nav = holdingMeta.reduce((s, h) => s + h.qty * h.price, 0);
  console.log(`\nDemo seed complete.`);
  console.log(`  Fund: ${FUND_NAME} (${fund.id})`);
  console.log(`  Positions: ${DEMO_EQUITIES.length}`);
  console.log(`  Approx NAV: USD ${nav.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  console.log(`  Client: ${client.legalName} (${client.id})`);
  console.log(`  Broker: Imara Edwards Securities`);
  console.log(`  Custodian: CBZ Custodial Services`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
