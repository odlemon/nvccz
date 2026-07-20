/**
 * Lean real Investments V2 demo seed (DEV nts only).
 * One Arcus listed portfolio, 4 ZSE names, light trades/orders, cash masters.
 *
 * Usage: npm run db:seed:investments-v2-demo
 * Reset:  npm run db:reset:investments-v2-demo
 */
import "dotenv/config";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  CURRENCY,
  LEGAL_ENTITY_ID,
  TENANT_ID,
  fingerprint,
} from "./lib/stock-picker-cash-uat-helpers";

const prisma = new PrismaClient() as any;

const EQUITIES = [
  { symbol: "DLTA", name: "Delta Corporation Limited", sector: "Consumer Staples", price: 18.75, qty: 15000, wac: 16.5 },
  { symbol: "ECO", name: "Econet Wireless Zimbabwe", sector: "Telecommunications", price: 4.55, qty: 40000, wac: 4.1 },
  { symbol: "CBZ", name: "CBZ Holdings Limited", sector: "Financials", price: 12.45, qty: 25000, wac: 11.2 },
  { symbol: "INN", name: "Innscor Africa Limited", sector: "Consumer Staples", price: 42.1, qty: 5000, wac: 39.0 },
];

function encryptExternalId(plain: string): string {
  const secret =
    process.env.SP_CASH_ENCRYPTION_KEY ||
    process.env.VENDOR_ARTIFACTS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "dev-only-sp-cash-key";
  const key = createHash("sha256").update(String(secret)).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function ensureCountry() {
  await prisma.investmentCountry.upsert({
    where: { countryCode: "ZW" },
    create: { countryCode: "ZW", countryName: "Zimbabwe", region: "Southern Africa" },
    update: { countryName: "Zimbabwe" },
  });
}

async function ensureMarket() {
  await prisma.investmentMarket.upsert({
    where: { marketCode: "ZSE" },
    create: {
      marketCode: "ZSE",
      marketName: "Zimbabwe Stock Exchange",
      countryCode: "ZW",
      exchangeCode: "ZSE",
    },
    update: { marketName: "Zimbabwe Stock Exchange", countryCode: "ZW" },
  });
}

async function ensureInstrumentType() {
  const existing = await prisma.investmentInstrumentType.findFirst({ where: { typeCode: "EQUITY" } });
  if (!existing) {
    await prisma.investmentInstrumentType.create({
      data: { typeCode: "EQUITY", displayName: "Listed Equity", isActive: true },
    });
  }
}

async function ensureStakeholder(profileType: string, name: string, contactEmail: string) {
  let row = await prisma.listedEquityStakeholderProfile.findFirst({
    where: { profileType, name },
  });
  if (!row) {
    row = await prisma.listedEquityStakeholderProfile.create({
      data: { profileType, name, contactEmail, isActive: true },
    });
  } else {
    row = await prisma.listedEquityStakeholderProfile.update({
      where: { id: row.id },
      data: { contactEmail, isActive: true },
    });
  }
  return row;
}

async function ensureIssuer(symbol: string, name: string, sector: string) {
  const code = `ISS-${symbol}`;
  let row = await prisma.investmentIssuer.findFirst({ where: { issuerCode: code } });
  if (!row) {
    row = await prisma.investmentIssuer.create({
      data: { issuerCode: code, legalName: name, countryCode: "ZW", sector },
    });
  } else {
    row = await prisma.investmentIssuer.update({
      where: { id: row.id },
      data: { legalName: name, sector, countryCode: "ZW" },
    });
  }
  return row;
}

async function ensureSecurityAndInstrument(
  eq: (typeof EQUITIES)[number],
  issuerId: string,
  adminId: string
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
  const base = {
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
  };
  if (!instrument) {
    instrument = await prisma.investmentInstrument.create({
      data: {
        instrumentCode: code,
        ...base,
        createdById: adminId,
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
  } else {
    instrument = await prisma.investmentInstrument.update({
      where: { id: instrument.id },
      data: base,
    });
  }

  const tick = await prisma.listedEquityPriceTick.findFirst({
    where: { securityId: security.id, validationStatus: "APPROVED", sourceCode: "SEED_EOD" },
    orderBy: { pricedAt: "desc" },
  });
  if (!tick) {
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
      where: { id: tick.id },
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

async function ensureListedFund(opts: {
  name: string;
  description: string;
  adminId: string;
  bankId: string | null;
  brokerId: string;
  custodianId: string;
}) {
  let fund = await prisma.fund.findFirst({
    where: { name: opts.name, fundPurpose: "LISTED_EQUITY" },
  });
  const now = new Date();
  if (!fund) {
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
  } else {
    fund = await prisma.fund.update({
      where: { id: fund.id },
      data: { description: opts.description, fundPurpose: "LISTED_EQUITY", status: "OPEN" },
    });
  }

  await prisma.listedEquityFundConfig.upsert({
    where: { fundId: fund.id },
    create: {
      fundId: fund.id,
      baseCurrencyCode: "USD",
      trustBankId: opts.bankId,
      coaMappingJson: {
        listedSecuritiesAsset: "1501",
        bankClearing: "1100",
        realizedGain: "4010",
        realizedLoss: "5200",
      },
      brokerProfileId: opts.brokerId,
      custodianProfileId: opts.custodianId,
    },
    update: {
      baseCurrencyCode: "USD",
      trustBankId: opts.bankId,
      brokerProfileId: opts.brokerId,
      custodianProfileId: opts.custodianId,
    },
  });

  await prisma.fundManager.upsert({
    where: { fundId_userId: { fundId: fund.id, userId: opts.adminId } },
    create: { fundId: fund.id, userId: opts.adminId, role: "fund_manager", isActive: true },
    update: { isActive: true },
  });

  let portfolioCfg = await prisma.investmentPortfolioConfig.findFirst({ where: { fundId: fund.id } });
  if (!portfolioCfg) {
    portfolioCfg = await prisma.investmentPortfolioConfig.create({
      data: {
        fundId: fund.id,
        baseCurrencyCode: "USD",
        isActive: true,
        createdById: opts.adminId,
      },
    });
  }

  const folderPath = "/Listed Equities";
  let folder = await prisma.investmentPortfolioFolder.findFirst({
    where: { fundId: fund.id, path: folderPath },
  });
  if (!folder) {
    folder = await prisma.investmentPortfolioFolder.create({
      data: {
        fundId: fund.id,
        name: "Listed Equities",
        path: folderPath,
        sortOrder: 1,
        createdById: opts.adminId,
      },
    });
  }

  const assign = await prisma.investmentPortfolioAssignment.findFirst({
    where: {
      portfolioConfigId: portfolioCfg.id,
      userId: opts.adminId,
      assignmentRole: "PORTFOLIO_MANAGER",
    },
  });
  if (!assign) {
    await prisma.investmentPortfolioAssignment.create({
      data: {
        portfolioConfigId: portfolioCfg.id,
        folderId: folder.id,
        userId: opts.adminId,
        assignmentRole: "PORTFOLIO_MANAGER",
        createdById: opts.adminId,
      },
    });
  }

  return fund;
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
  adminId: string;
}) {
  let trade = await prisma.listedEquityTrade.findFirst({ where: { tradeRef: opts.tradeRef } });
  const data = {
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
    executedById: opts.adminId,
  };
  if (!trade) {
    trade = await prisma.listedEquityTrade.create({
      data: { tradeRef: opts.tradeRef, ...data },
    });
  } else {
    trade = await prisma.listedEquityTrade.update({ where: { id: trade.id }, data });
  }

  for (const target of ["BROKER", "CUSTODIAN"]) {
    await prisma.listedEquityTradeRoutingHop.upsert({
      where: { tradeId_target: { tradeId: trade.id, target } },
      create: {
        tradeId: trade.id,
        target,
        status: "CONFIRMED",
        confirmedAt: opts.when,
        externalRef: `SEED-${opts.tradeRef}-${target}`,
      },
      update: { status: "CONFIRMED", confirmedAt: opts.when },
    });
  }
  await prisma.listedEquityTradeSettlement.upsert({
    where: { tradeId: trade.id },
    create: {
      tradeId: trade.id,
      settlementDocumentRef: `settlement://${opts.tradeRef}`,
    },
    update: { settlementDocumentRef: `settlement://${opts.tradeRef}` },
  });
  return trade;
}

async function ensureOrder(opts: {
  fundId: string;
  instrumentId: string;
  securityId: string;
  brokerId: string;
  adminId: string;
  orderRef: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: string;
}) {
  let order = await prisma.investmentOrder.findFirst({ where: { orderRef: opts.orderRef } });
  const when = new Date(Date.now() - 2 * 86400000);
  const data: any = {
    fundId: opts.fundId,
    instrumentId: opts.instrumentId,
    securityId: opts.securityId,
    side: opts.side,
    quantity: new Decimal(opts.qty),
    orderType: "LIMIT",
    limitPrice: new Decimal(opts.price),
    executionPrice: new Decimal(opts.price),
    tradeCurrency: "USD",
    settlementCurrency: "USD",
    brokerProfileId: opts.brokerId,
    status: opts.status,
    complianceStatus: "PASSED",
    createdById: opts.adminId,
    submittedAt: opts.status === "DRAFT" ? null : when,
    approvedAt: ["APPROVED", "EXECUTED", "SETTLED"].includes(opts.status) ? when : null,
    tradeDate: when,
    valueDate: when,
    idempotencyKey: `seed-order-${opts.orderRef}`,
  };
  if (!order) {
    order = await prisma.investmentOrder.create({ data: { orderRef: opts.orderRef, ...data } });
  } else {
    order = await prisma.investmentOrder.update({
      where: { id: order.id },
      data: { ...data, idempotencyKey: undefined },
    });
  }
  return order;
}

async function ensureCashMasters(fund: { id: string; name: string }, adminId: string) {
  let provider = await prisma.spCashProvider.findFirst({ where: { code: "CBZ_CUSTODY" } });
  if (!provider) {
    provider = await prisma.spCashProvider.create({
      data: {
        tenantId: TENANT_ID,
        code: "CBZ_CUSTODY",
        displayName: "CBZ Custody / CBZ Bank",
        providerType: "CUSTODIAN",
        status: "ACTIVE",
        version: 1,
      },
    });
  } else if (provider.status !== "ACTIVE") {
    provider = await prisma.spCashProvider.update({
      where: { id: provider.id },
      data: { status: "ACTIVE", displayName: "CBZ Custody / CBZ Bank" },
    });
  }

  let layout = await prisma.spCashFileLayout.findFirst({ where: { providerId: provider.id } });
  if (!layout) {
    layout = await prisma.spCashFileLayout.create({
      data: {
        providerId: provider.id,
        layoutCode: "CBZ_CSV_V1",
        versionNo: 1,
        signMapJson: { Debit: "NEGATIVE", Credit: "POSITIVE" },
        dateMapJson: { valueDate: "value_date", tradeDate: "trade_date" },
        status: "ACTIVE",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
  }

  let tolerance = await prisma.spCashTolerancePolicy.findFirst({
    where: { code: "SP-CASH-USD-DEFAULT" },
  });
  if (!tolerance) {
    tolerance = await prisma.spCashTolerancePolicy.create({
      data: {
        code: "SP-CASH-USD-DEFAULT",
        currency: CURRENCY,
        amountTolerance: new Decimal("0.01"),
        dateToleranceDays: 2,
        status: "ACTIVE",
        version: 1,
        effectiveFrom: new Date("2020-01-01"),
      },
    });
  }

  const externalId = `ARCS-LISTED-${fund.id}`;
  const fp = fingerprint([provider.id, externalId, CURRENCY]);
  let cash = await prisma.spCashClientAccount.findFirst({
    where: {
      OR: [
        { providerId: provider.id, externalFingerprint: fp, currency: CURRENCY },
        { portfolioId: fund.id, currency: CURRENCY, accountType: "CUSTODY_CASH" },
      ],
    },
  });
  const base = {
    tenantId: TENANT_ID,
    legalEntityId: LEGAL_ENTITY_ID,
    clientOrVehicleId: `vehicle:${fund.id}`,
    portfolioId: fund.id,
    ownerModel: "SEGREGATED",
    moneyClass: "CLIENT_CASH",
    accountType: "CUSTODY_CASH",
    providerId: provider.id,
    externalIdentifierEncrypted: encryptExternalId(externalId),
    externalFingerprint: fp,
    maskedIdentifier: "****ARCS",
    accountNumberMasked: "****ARCS",
    currency: CURRENCY,
    status: "ACTIVE",
    effectiveFrom: new Date("2020-01-01"),
    tolerancePolicyId: tolerance.id,
    clientName: fund.name,
    createdById: adminId,
    approvedById: adminId,
  };
  if (!cash) {
    cash = await prisma.spCashClientAccount.create({ data: { ...base, version: 1 } });
  } else {
    cash = await prisma.spCashClientAccount.update({
      where: { id: cash.id },
      data: { ...base, status: "ACTIVE" },
    });
  }

  return { provider, layout, cash };
}

async function main() {
  console.log("Seeding lean Investments V2 demo (DEV nts)…\n");
  await assertDevDatabase(prisma, "seed:investments-v2-demo");

  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found");
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, select: { id: true } });

  await ensureCountry();
  await ensureMarket();
  await ensureInstrumentType();

  const broker = await ensureStakeholder(
    "BROKER",
    "Imara Edwards Securities",
    "dealing@imaraedwards.co.zw"
  );
  const custodian = await ensureStakeholder(
    "CUSTODIAN",
    "CBZ Custodial Services",
    "custody@cbz.co.zw"
  );

  const commission = await prisma.investmentBrokerCommission.findFirst({
    where: { stakeholderProfileId: broker.id },
  });
  if (!commission) {
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

  const securityBySymbol: Record<string, string> = {};
  const instrumentBySymbol: Record<string, string> = {};
  for (const eq of EQUITIES) {
    const issuer = await ensureIssuer(eq.symbol, eq.name, eq.sector);
    const { security, instrument } = await ensureSecurityAndInstrument(eq, issuer.id, admin.id);
    securityBySymbol[eq.symbol] = security.id;
    instrumentBySymbol[eq.symbol] = instrument.id;
  }
  console.log(`[ok] instruments=${EQUITIES.length}`);

  const fund = await ensureListedFund({
    name: "Arcus Listed Portfolio",
    description: "Listed equity mandate managed by Arcus Asset Management",
    adminId: admin.id,
    bankId: bank?.id ?? null,
    brokerId: broker.id,
    custodianId: custodian.id,
  });

  const holdMeta: Array<{ qty: number; price: number; wac: number }> = [];
  for (const eq of EQUITIES) {
    await ensureHolding(fund.id, securityBySymbol[eq.symbol], eq.qty, eq.wac);
    holdMeta.push({ qty: eq.qty, price: eq.price, wac: eq.wac });
  }

  for (const rule of [
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
  ]) {
    const existing = await prisma.investmentComplianceRule.findFirst({
      where: { fundId: fund.id, ruleCode: rule.ruleCode },
    });
    if (!existing) {
      await prisma.investmentComplianceRule.create({
        data: { fundId: fund.id, ...rule, isActive: true },
      });
    }
  }

  const nav = holdMeta.reduce((s, h) => s + h.qty * h.price, 0);
  const cost = holdMeta.reduce((s, h) => s + h.qty * h.wac, 0);
  const snap = await prisma.listedEquityValuationSnapshot.findFirst({
    where: { fundId: fund.id },
    orderBy: { asOf: "desc" },
  });
  const snapData = {
    asOf: new Date(),
    navBaseCurrency: new Decimal(nav),
    unrealizedPnlUsd: new Decimal(nav - cost),
    unrealizedPnlZig: new Decimal(0),
    status: "OK",
  };
  if (snap) {
    await prisma.listedEquityValuationSnapshot.update({ where: { id: snap.id }, data: snapData });
  } else {
    await prisma.listedEquityValuationSnapshot.create({ data: { fundId: fund.id, ...snapData } });
  }

  await ensureSettledTrade({
    fundId: fund.id,
    securityId: securityBySymbol.DLTA,
    tradeRef: "ALP-DLTA-2026",
    side: "BUY",
    qty: 3000,
    price: 16.5,
    fees: 99,
    when: new Date(Date.now() - 40 * 86400000),
    adminId: admin.id,
  });
  await ensureSettledTrade({
    fundId: fund.id,
    securityId: securityBySymbol.ECO,
    tradeRef: "ALP-ECO-2026",
    side: "BUY",
    qty: 10000,
    price: 4.1,
    fees: 82,
    when: new Date(Date.now() - 14 * 86400000),
    adminId: admin.id,
  });
  console.log("[ok] settled trades=2");

  await ensureOrder({
    fundId: fund.id,
    instrumentId: instrumentBySymbol.ECO,
    securityId: securityBySymbol.ECO,
    brokerId: broker.id,
    adminId: admin.id,
    orderRef: "ALP-ORD-DRAFT-ECO",
    side: "BUY",
    qty: 2000,
    price: 4.5,
    status: "DRAFT",
  });
  await ensureOrder({
    fundId: fund.id,
    instrumentId: instrumentBySymbol.DLTA,
    securityId: securityBySymbol.DLTA,
    brokerId: broker.id,
    adminId: admin.id,
    orderRef: "ALP-ORD-APPROVED-DLTA",
    side: "BUY",
    qty: 800,
    price: 18.5,
    status: "APPROVED",
  });
  await ensureOrder({
    fundId: fund.id,
    instrumentId: instrumentBySymbol.INN,
    securityId: securityBySymbol.INN,
    brokerId: broker.id,
    adminId: admin.id,
    orderRef: "ALP-ORD-SETTLED-INN",
    side: "BUY",
    qty: 400,
    price: 41.5,
    status: "SETTLED",
  });
  console.log("[ok] sample orders=3");

  // One pending price for validation queue demos
  const ecoSec = securityBySymbol.ECO;
  const pendingKey = "seed-pending-eco";
  const pending = await prisma.listedEquityPriceTick.findFirst({
    where: { idempotencyKey: pendingKey },
  });
  if (!pending) {
    await prisma.listedEquityPriceTick.create({
      data: {
        securityId: ecoSec,
        price: new Decimal(4.62),
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

  const cash = await ensureCashMasters(fund, admin.id);
  console.log(`[ok] cash account=${cash.cash.id} provider=${cash.provider.id}`);

  const doc = await prisma.investmentDocument.findFirst({
    where: { fundId: fund.id, title: "Arcus Listed Portfolio Mandate Pack" },
  });
  if (!doc) {
    await prisma.investmentDocument.create({
      data: {
        fundId: fund.id,
        title: "Arcus Listed Portfolio Mandate Pack",
        documentType: "MANDATE",
        fileRef: "storage/local-upload-mock/investment-ops-docs/arcus-mandate-pack.pdf",
        classification: "CONFIDENTIAL",
        approvalStatus: "APPROVED",
        uploadedById: admin.id,
      },
    });
  }

  console.log("\n=== Investments V2 lean demo summary ===");
  console.log(`portfolioId: ${fund.id}  ${fund.name}`);
  console.log(`instruments: ${EQUITIES.map((e) => e.symbol).join(", ")}`);
  console.log(`broker: ${broker.name}`);
  console.log(`custodian: ${custodian.name}`);
  console.log(`cashAccountId: ${cash.cash.id}`);
  console.log(`providerId: ${cash.provider.id}`);
  console.log(`fileLayoutId: ${cash.layout.id}`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
