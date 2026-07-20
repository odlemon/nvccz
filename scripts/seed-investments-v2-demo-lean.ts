/**
 * Rich Arcus Investments V2 demo (DEV nts only).
 * Fills trades, orders, positions, valuation, recon, accounting, docs, reports, blotters, models.
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
  { symbol: "CBZ", name: "CBZ Holdings Limited", sector: "Financials", price: 12.45, qty: 25000, wac: 11.2 },
  { symbol: "DLTA", name: "Delta Corporation Limited", sector: "Consumer Staples", price: 18.75, qty: 15000, wac: 16.5 },
  { symbol: "FBC", name: "FBC Holdings Limited", sector: "Financials", price: 8.3, qty: 20000, wac: 7.9 },
  { symbol: "ECO", name: "Econet Wireless Zimbabwe", sector: "Telecommunications", price: 4.55, qty: 40000, wac: 4.1 },
  { symbol: "SEED", name: "Seed Co International", sector: "Agriculture", price: 6.2, qty: 12000, wac: 5.8 },
  { symbol: "BAT", name: "British American Tobacco Zimbabwe", sector: "Consumer Staples", price: 85.0, qty: 2000, wac: 78.5 },
  { symbol: "OKZ", name: "OK Zimbabwe Limited", sector: "Consumer Discretionary", price: 3.15, qty: 30000, wac: 2.95 },
  { symbol: "INN", name: "Innscor Africa Limited", sector: "Consumer Staples", price: 42.1, qty: 5000, wac: 39.0 },
];

const SETTLED_TRADES = [
  { ref: "ALP-CBZ-2026", symbol: "CBZ", side: "BUY" as const, qty: 5000, price: 11.2, fees: 112, daysAgo: 45 },
  { ref: "ALP-DLTA-2026", symbol: "DLTA", side: "BUY" as const, qty: 3000, price: 16.5, fees: 99, daysAgo: 40 },
  { ref: "ALP-ECO-2026", symbol: "ECO", side: "BUY" as const, qty: 10000, price: 4.1, fees: 82, daysAgo: 35 },
  { ref: "ALP-FBC-2026", symbol: "FBC", side: "BUY" as const, qty: 4000, price: 7.9, fees: 63, daysAgo: 28 },
  { ref: "ALP-INN-2026", symbol: "INN", side: "BUY" as const, qty: 1500, price: 39.0, fees: 117, daysAgo: 21 },
  { ref: "ALP-BAT-2026", symbol: "BAT", side: "BUY" as const, qty: 500, price: 78.5, fees: 78.5, daysAgo: 14 },
  { ref: "ALP-OKZ-2026", symbol: "OKZ", side: "BUY" as const, qty: 8000, price: 2.95, fees: 47, daysAgo: 10 },
  { ref: "ALP-SEED-2026", symbol: "SEED", side: "BUY" as const, qty: 2500, price: 5.8, fees: 29, daysAgo: 7 },
  { ref: "ALP-ECO2-2026", symbol: "ECO", side: "BUY" as const, qty: 5000, price: 4.4, fees: 44, daysAgo: 3 },
  { ref: "ALP-CBZ2-2026", symbol: "CBZ", side: "SELL" as const, qty: 1000, price: 12.4, fees: 24.8, daysAgo: 1 },
];

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

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

async function ensureCountryMarketType() {
  await prisma.investmentCountry.upsert({
    where: { countryCode: "ZW" },
    create: { countryCode: "ZW", countryName: "Zimbabwe", region: "Southern Africa" },
    update: { countryName: "Zimbabwe" },
  });
  await prisma.investmentMarket.upsert({
    where: { marketCode: "ZSE" },
    create: {
      marketCode: "ZSE",
      marketName: "Zimbabwe Stock Exchange",
      countryCode: "ZW",
      exchangeCode: "ZSE",
    },
    update: { marketName: "Zimbabwe Stock Exchange" },
  });
  if (!(await prisma.investmentInstrumentType.findFirst({ where: { typeCode: "EQUITY" } }))) {
    await prisma.investmentInstrumentType.create({
      data: { typeCode: "EQUITY", displayName: "Listed Equity", isActive: true },
    });
  }
}

async function ensureStakeholder(profileType: string, name: string, contactEmail: string) {
  let row = await prisma.listedEquityStakeholderProfile.findFirst({ where: { profileType, name } });
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
      data: { legalName: name, sector },
    });
  }
  return row;
}

async function ensureSecurityAndInstrument(eq: (typeof EQUITIES)[0], issuerId: string, adminId: string) {
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
      data: { name: eq.name, isActive: true },
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
    instrument = await prisma.investmentInstrument.update({ where: { id: instrument.id }, data: base });
  }

  const tickKey = `seed-eod-${eq.symbol}`;
  const tick = await prisma.listedEquityPriceTick.findFirst({ where: { idempotencyKey: tickKey } });
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
        idempotencyKey: tickKey,
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
      lastValuationAt: new Date(),
    },
  });
  if (!(await prisma.listedEquityHoldingLot.count({ where: { fundId, securityId } }))) {
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
      brokerProfileId: opts.brokerId,
      custodianProfileId: opts.custodianId,
      trustBankId: opts.bankId,
    },
  });

  await prisma.fundManager.upsert({
    where: { fundId_userId: { fundId: fund.id, userId: opts.adminId } },
    create: { fundId: fund.id, userId: opts.adminId, role: "fund_manager", isActive: true },
    update: { isActive: true },
  });

  let cfg = await prisma.investmentPortfolioConfig.findFirst({ where: { fundId: fund.id } });
  if (!cfg) {
    cfg = await prisma.investmentPortfolioConfig.create({
      data: {
        fundId: fund.id,
        baseCurrencyCode: "USD",
        valuationPolicyJson: { method: "MARK_TO_MARKET" },
        settlementPolicyJson: { cycle: "T+2" },
        approvalPolicyJson: { fourEye: true },
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

  if (
    !(await prisma.investmentPortfolioAssignment.findFirst({
      where: {
        portfolioConfigId: cfg.id,
        userId: opts.adminId,
        assignmentRole: "PORTFOLIO_MANAGER",
      },
    }))
  ) {
    await prisma.investmentPortfolioAssignment.create({
      data: {
        portfolioConfigId: cfg.id,
        folderId: folder.id,
        userId: opts.adminId,
        assignmentRole: "PORTFOLIO_MANAGER",
        createdById: opts.adminId,
      },
    });
  }

  return { fund, cfg, folder };
}

async function ensureCashLedger(cfgId: string) {
  let acct = await prisma.investmentCashAccount.findFirst({
    where: { portfolioConfigId: cfgId, accountCode: "USD_OPS" },
  });
  if (!acct) {
    acct = await prisma.investmentCashAccount.create({
      data: {
        portfolioConfigId: cfgId,
        accountCode: "USD_OPS",
        currencyCode: "USD",
        status: "ACTIVE",
      },
    });
  }
  const key = `seed-cash-open-${acct.id}`;
  if (!(await prisma.investmentCashLedgerEntry.findFirst({ where: { idempotencyKey: key } }))) {
    await prisma.investmentCashLedgerEntry.create({
      data: {
        cashAccountId: acct.id,
        entryType: "MANUAL_ADJUSTMENT",
        amount: new Decimal("5000000"),
        currencyCode: "USD",
        effectiveAt: new Date("2025-01-01"),
        valueDate: new Date("2025-01-01"),
        status: "POSTED",
        idempotencyKey: key,
        runningBalance: new Decimal("5000000"),
      },
    });
  }
  return acct;
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
    trade = await prisma.listedEquityTrade.create({ data: { tradeRef: opts.tradeRef, ...data } });
  } else {
    trade = await prisma.listedEquityTrade.update({ where: { id: trade.id }, data });
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
      update: { status: "CONFIRMED", confirmedAt: opts.when },
    });
  }
  await prisma.listedEquityTradeSettlement.upsert({
    where: { tradeId: trade.id },
    create: { tradeId: trade.id, settlementDocumentRef: `settlement://${opts.tradeRef}` },
    update: { settlementDocumentRef: `settlement://${opts.tradeRef}` },
  });

  const acctId = `seed-acct-${opts.tradeRef}`.slice(0, 30);
  const existingAcct = await prisma.investmentAccountingEvent.findFirst({
    where: { OR: [{ id: acctId }, { tradeRef: opts.tradeRef, fundId: opts.fundId }] },
  });
  if (!existingAcct) {
    await prisma.investmentAccountingEvent.create({
      data: {
        id: acctId,
        fundId: opts.fundId,
        sourceType: "LISTED_EQUITY_TRADE",
        sourceId: trade.id,
        eventType: opts.side === "BUY" ? "PURCHASE" : "SALE",
        status: "POSTED",
        tradeRef: opts.tradeRef,
        amount: new Decimal(opts.qty * opts.price),
        currencyCode: "USD",
        postedAt: opts.when,
        idempotencyKey: `seed-acct-${opts.tradeRef}`,
      },
    });
  }
  return trade;
}

async function ensureRoutingTrade(opts: {
  fundId: string;
  securityId: string;
  tradeRef: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  adminId: string;
}) {
  const when = new Date(Date.now() - 4 * 3600000);
  let trade = await prisma.listedEquityTrade.findFirst({ where: { tradeRef: opts.tradeRef } });
  const data = {
    fundId: opts.fundId,
    securityId: opts.securityId,
    side: opts.side,
    quantity: new Decimal(opts.qty),
    executionPrice: new Decimal(opts.price),
    executionCurrencyCode: "USD",
    fees: new Decimal(25),
    status: "ROUTING",
    executedAt: when,
    executedById: opts.adminId,
  };
  if (!trade) {
    trade = await prisma.listedEquityTrade.create({ data: { tradeRef: opts.tradeRef, ...data } });
  } else {
    trade = await prisma.listedEquityTrade.update({ where: { id: trade.id }, data });
  }
  const hops: Array<{ target: string; status: string }> = [
    { target: "BROKER", status: "DISPATCHED" },
    { target: "CUSTODIAN", status: "STAGED" },
    { target: "CORE_BANKING", status: "STAGED" },
    { target: "ACCOUNTING_GL", status: "STAGED" },
  ];
  for (const h of hops) {
    await prisma.listedEquityTradeRoutingHop.upsert({
      where: { tradeId_target: { tradeId: trade.id, target: h.target } },
      create: {
        tradeId: trade.id,
        target: h.target,
        status: h.status,
        dispatchedAt: h.status === "DISPATCHED" ? when : null,
        externalRef: `SEED-${opts.tradeRef}-${h.target}`,
      },
      update: { status: h.status },
    });
  }
  return trade;
}

async function ensureOrder(opts: {
  fundId: string;
  instrumentId: string;
  securityId: string;
  brokerId: string;
  adminId: string;
  approverId: string;
  orderRef: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: string;
  tradeId?: string | null;
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
    complianceStatus: opts.status === "REJECTED" ? "BREACH" : "PASSED",
    createdById: opts.adminId,
    submittedAt: opts.status === "DRAFT" ? null : when,
    approvedAt: ["APPROVED", "EXECUTED", "SETTLED", "SENT_TO_BROKER"].includes(opts.status)
      ? when
      : null,
    tradeDate: when,
    valueDate: when,
    tradeId: opts.tradeId ?? null,
  };
  if (!order) {
    order = await prisma.investmentOrder.create({
      data: { orderRef: opts.orderRef, idempotencyKey: `seed-order-${opts.orderRef}`, ...data },
    });
  } else {
    order = await prisma.investmentOrder.update({
      where: { id: order.id },
      data: { ...data, idempotencyKey: order.idempotencyKey || `seed-order-${opts.orderRef}` },
    });
  }

  if (["APPROVED", "EXECUTED", "SETTLED", "SENT_TO_BROKER"].includes(opts.status)) {
    if (
      !(await prisma.investmentOrderApproval.findFirst({
        where: { orderId: order.id, approvalSequence: 1 },
      }))
    ) {
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
          idempotencyKey: `seed-appr-${opts.orderRef}`,
        },
      });
    }
  }
  if (["EXECUTED", "SETTLED"].includes(opts.status)) {
    const execRef = `${opts.orderRef}-FILL-1`;
    if (!(await prisma.investmentOrderExecution.findFirst({ where: { orderId: order.id, executionRef: execRef } }))) {
      const qty = new Decimal(opts.qty);
      const px = new Decimal(opts.price);
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
          idempotencyKey: `seed-fill-${opts.orderRef}`,
        },
      });
    }
  }
  return order;
}

async function ensureTransactionsFromTrades(fundId: string) {
  const trades = await prisma.listedEquityTrade.findMany({
    where: { fundId, status: "SETTLED" },
    orderBy: { executedAt: "desc" },
  });
  let n = 0;
  for (const t of trades) {
    const key = `seed-txn-${t.tradeRef}`;
    if (await prisma.investmentTransaction.findFirst({ where: { idempotencyKey: key } })) continue;
    const amt = Number(t.quantity) * Number(t.executionPrice);
    await prisma.investmentTransaction.create({
      data: {
        transactionRef: t.tradeRef,
        fundId,
        transactionType: t.side === "BUY" ? "PURCHASE" : "SALE",
        tradeDate: t.executedAt || new Date(),
        settlementDate: t.settledAt || t.executedAt,
        quantity: t.quantity,
        unitPrice: t.executionPrice,
        grossAmount: new Decimal(amt),
        netAmount: new Decimal(amt - Number(t.fees || 0)),
        currencyCode: "USD",
        status: "POSTED",
        idempotencyKey: key,
      },
    });
    n++;
  }
  console.log(`[ok] investmentTransactions created=${n} totalSettled=${trades.length}`);
}

async function ensureValuationWithItems(
  fundId: string,
  adminId: string,
  holdings: Array<{
    securityId: string;
    instrumentId: string;
    qty: number;
    price: number;
    wac: number;
    currency: string;
  }>
) {
  let run = await prisma.investmentValuationRun.findFirst({
    where: { fundId, idempotencyKey: "seed-val-run-primary" },
  });
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);
  let nav = 0;
  let unrealized = 0;
  for (const h of holdings) {
    const mv = h.qty * h.price;
    nav += mv;
    unrealized += h.qty * (h.price - h.wac);
  }
  if (!run) {
    run = await prisma.investmentValuationRun.create({
      data: {
        fundId,
        asOf,
        status: "COMPLETED",
        navBaseCurrency: new Decimal(nav),
        parametersJson: {
          method: "MARK_TO_MARKET",
          realizedPnl: "0",
          unrealizedPnl: String(unrealized),
          totalPnl: String(unrealized),
        },
        idempotencyKey: "seed-val-run-primary",
        startedById: adminId,
        completedAt: new Date(),
      },
    });
  } else {
    run = await prisma.investmentValuationRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        navBaseCurrency: new Decimal(nav),
        completedAt: new Date(),
        parametersJson: {
          method: "MARK_TO_MARKET",
          realizedPnl: "0",
          unrealizedPnl: String(unrealized),
          totalPnl: String(unrealized),
        },
      },
    });
  }

  await prisma.investmentValuationItemSnapshot.deleteMany({ where: { valuationRunId: run.id } });
  for (const h of holdings) {
    const mv = h.qty * h.price;
    const cost = h.qty * h.wac;
    const fp = sha(`${run.id}:${h.instrumentId}:${h.securityId}`);
    await prisma.investmentValuationItemSnapshot.create({
      data: {
        valuationRunId: run.id,
        fundId,
        instrumentId: h.instrumentId,
        securityId: h.securityId,
        quantity: new Decimal(h.qty),
        price: new Decimal(h.price),
        marketValue: new Decimal(mv),
        baseMarketValue: new Decimal(mv),
        costValue: new Decimal(cost),
        unrealizedPnl: new Decimal(mv - cost),
        currencyCode: h.currency || "USD",
        methodCode: "MARK_TO_MARKET",
        inputFingerprint: fp,
      },
    });
  }

  const seedEx = holdings.find((h) => h.instrumentId);
  const seedHolding = holdings.find((x) => EQUITIES.some((e) => e.symbol === "SEED"));
  // SEED exception
  const seedEq = EQUITIES.find((e) => e.symbol === "SEED")!;
  const seedInst = holdings.find((h) => h.securityId && seedEq);
  // find by matching qty of SEED
  const seedRow = holdings.find((h) => h.qty === seedEq.qty && Math.abs(h.price - seedEq.price) < 0.01);
  if (seedRow) {
    if (
      !(await prisma.investmentValuationException.findFirst({
        where: { fundId, exceptionType: "STALE_PRICE", status: "OPEN" },
      }))
    ) {
      await prisma.investmentValuationException.create({
        data: {
          valuationRunId: run.id,
          fundId,
          instrumentId: seedRow.instrumentId,
          securityId: seedRow.securityId,
          exceptionType: "STALE_PRICE",
          message: "Close price older than policy threshold for Seed Co International",
          status: "OPEN",
        },
      });
    }
  }

  await prisma.listedEquityValuationSnapshot.create({
    data: {
      fundId,
      asOf: new Date(),
      navBaseCurrency: new Decimal(nav),
      unrealizedPnlUsd: new Decimal(unrealized),
      unrealizedPnlZig: new Decimal(0),
      status: "OK",
    },
  }).catch(async () => {
    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId },
      orderBy: { asOf: "desc" },
    });
    if (snap) {
      await prisma.listedEquityValuationSnapshot.update({
        where: { id: snap.id },
        data: {
          asOf: new Date(),
          navBaseCurrency: new Decimal(nav),
          unrealizedPnlUsd: new Decimal(unrealized),
          status: "OK",
        },
      });
    }
  });

  console.log(`[ok] valuationRun=${run.id} items=${holdings.length} nav=${nav.toFixed(2)}`);
  return run;
}

async function ensureComplianceChain(opts: {
  fundId: string;
  orderId: string;
  adminId: string;
  approverId: string;
}) {
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
      where: { fundId: opts.fundId, ruleCode: rule.ruleCode },
    });
    if (!existing) {
      await prisma.investmentComplianceRule.create({
        data: { fundId: opts.fundId, ...rule, isActive: true },
      });
    }
  }

  const rule = await prisma.investmentComplianceRule.findFirst({
    where: { fundId: opts.fundId, ruleCode: "MAX_SINGLE_NAME_25" },
  });
  if (!rule) return;

  let run = await prisma.investmentComplianceRun.findFirst({
    where: { idempotencyKey: "seed-compliance-run-approved-dlta" },
  });
  if (!run) {
    run = await prisma.investmentComplianceRun.create({
      data: {
        fundId: opts.fundId,
        orderId: opts.orderId,
        runType: "PRE_TRADE",
        status: "COMPLETED",
        ruleSetVersion: 1,
        inputSnapshot: { seed: true },
        idempotencyKey: "seed-compliance-run-approved-dlta",
        startedById: opts.adminId,
        completedAt: new Date(),
      },
    });
  }

  let result = await prisma.investmentComplianceResult.findFirst({
    where: { orderId: opts.orderId, ruleId: rule.id },
  });
  if (!result) {
    result = await prisma.investmentComplianceResult.create({
      data: {
        orderId: opts.orderId,
        ruleId: rule.id,
        complianceRunId: run.id,
        outcome: "BREACH",
        message: "Projected ECO weight 28% exceeds 25% single-name limit",
      },
    });
  }

  if (!(await prisma.investmentComplianceOverride.findFirst({ where: { complianceResultId: result.id } }))) {
    await prisma.investmentComplianceOverride.create({
      data: {
        complianceResultId: result.id,
        status: "PENDING",
        reasonCode: "BOARD_WAIVER",
        reason: "Concentration waiver — board resolution 2026-06-12 pending CIO sign-off",
        requestedById: opts.adminId,
      },
    });
  }

  // Approved historical override on a synthetic second result if possible
  console.log(`[ok] compliance override seeded for order ${opts.orderId}`);
}

async function ensureRecon(fundId: string, adminId: string) {
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
        matchedCount: 6,
        unmatchedCount: 2,
        externalFileName: "cbz-custody-holdings-2026-07-18.csv",
        idempotencyKey: "seed-recon-holdings",
        createdById: adminId,
        completedAt: new Date(),
      },
    });
  }
  const items = [
    {
      externalRef: "CUST-ECO-QTY",
      internalRef: "HOLD-ECO",
      status: "UNMATCHED",
      internalAmount: 40000,
      externalAmount: 39950,
      variance: 50,
      message: "Quantity variance versus CBZ custody statement",
    },
    {
      externalRef: "CUST-DLTA-QTY",
      internalRef: "HOLD-DLTA",
      status: "MATCHED",
      internalAmount: 15000,
      externalAmount: 15000,
      variance: 0,
      message: "Matched",
    },
    {
      externalRef: "CUST-CBZ-QTY",
      internalRef: "HOLD-CBZ",
      status: "MATCHED",
      internalAmount: 25000,
      externalAmount: 25000,
      variance: 0,
      message: "Matched",
    },
    {
      externalRef: "CUST-FBC-QTY",
      internalRef: "HOLD-FBC",
      status: "INVESTIGATING",
      internalAmount: 20000,
      externalAmount: 19800,
      variance: 200,
      message: "Custodian lot roll pending broker confirm",
    },
    {
      externalRef: "CUST-OKZ-QTY",
      internalRef: "HOLD-OKZ",
      status: "UNMATCHED",
      internalAmount: 30000,
      externalAmount: 30120,
      variance: -120,
      message: "External quantity higher than book",
    },
  ];
  for (const it of items) {
    if (await prisma.investmentReconciliationItem.findFirst({ where: { batchId: batch.id, externalRef: it.externalRef } }))
      continue;
    await prisma.investmentReconciliationItem.create({
      data: {
        batchId: batch.id,
        status: it.status,
        internalRef: it.internalRef,
        externalRef: it.externalRef,
        internalAmount: new Decimal(it.internalAmount),
        externalAmount: new Decimal(it.externalAmount),
        variance: new Decimal(it.variance),
        message: it.message,
      },
    });
  }
  console.log(`[ok] reconBatch=${batch.id}`);
}

async function ensureDocsReports(fundId: string, adminId: string, orderId?: string) {
  const docs = [
    { title: "Arcus Listed Portfolio Mandate Pack", type: "MANDATE", file: "mandate.pdf" },
    { title: "Imara Edwards Broker Confirmation — ALP-ECO-2026", type: "CONFIRMATION", file: "broker-eco.pdf" },
    { title: "CBZ Custody Statement — June 2026", type: "CUSTODY_STATEMENT", file: "custody-jun.pdf" },
    { title: "Single-name Concentration Waiver Draft", type: "COMPLIANCE", file: "waiver.pdf" },
    { title: "Trade Ticket — ALP-DLTA-2026", type: "TRADE_CONFIRM", file: "ticket-dlta.pdf" },
  ];
  for (const d of docs) {
    if (await prisma.investmentDocument.findFirst({ where: { fundId, title: d.title } })) continue;
    const fileRef = `storage/local-upload-mock/investment-ops-docs/seed/${fundId}/${d.file}`;
    await prisma.investmentDocument.create({
      data: {
        fundId,
        documentType: d.type,
        title: d.title,
        fileRef,
        checksumSha256: sha(fileRef),
        classification: "CONFIDENTIAL",
        orderId: orderId ?? null,
        approvalStatus: "APPROVED",
        uploadedById: adminId,
      },
    });
  }

  const reports = [
    { type: "HOLDINGS_REPORT", format: "PDF" },
    { type: "TRADE_BLOTTER", format: "XLSX" },
    { type: "PORTFOLIO_VALUATION", format: "PDF" },
    { type: "PERFORMANCE_REPORT", format: "PDF" },
  ];
  for (const r of reports) {
    const existing = await prisma.investmentReportRun.findFirst({
      where: { fundId, reportType: r.type, status: "COMPLETED" },
    });
    if (existing) continue;
    const fileRef = `storage/local-upload-mock/investment-ops-reports/seed-${r.type.toLowerCase()}-${fundId}.${r.format.toLowerCase()}`;
    await prisma.investmentReportRun.create({
      data: {
        fundId,
        scopeType: "FUND",
        reportType: r.type,
        format: r.format,
        status: "COMPLETED",
        fileRef,
        parametersJson: { periodStart: "2026-01-01", periodEnd: "2026-07-20", seed: true },
        requestedById: adminId,
        completedAt: new Date(),
      },
    });
  }
  console.log(`[ok] documents + reports seeded`);
}

async function ensureBlotters(fundId: string, adminId: string, orderIds: string[]) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);

  for (const [date, status, key] of [
    [today, "OPEN", "seed-blotter-today"],
    [yesterday, "CLOSED", "seed-blotter-yday"],
  ] as const) {
    let blotter = await prisma.investmentBlotter.findFirst({
      where: { fundId, blotterDate: date, blotterType: "EQUITY" },
    });
    if (!blotter) {
      blotter = await prisma.investmentBlotter.create({
        data: {
          fundId,
          blotterDate: date,
          blotterType: "EQUITY",
          status,
          createdById: adminId,
          closedById: status === "CLOSED" ? adminId : null,
          closedAt: status === "CLOSED" ? new Date() : null,
        },
      });
    }
    let line = 1;
    for (const orderId of orderIds.slice(0, 4)) {
      if (await prisma.investmentBlotterItem.findFirst({ where: { blotterId: blotter.id, orderId } }))
        continue;
      const order = await prisma.investmentOrder.findUnique({ where: { id: orderId } });
      if (!order) continue;
      await prisma.investmentBlotterItem.create({
        data: {
          blotterId: blotter.id,
          orderId,
          lineNo: line++,
          snapshotJson: {
            orderRef: order.orderRef,
            side: order.side,
            quantity: String(order.quantity),
            status: order.status,
          },
        },
      });
    }
  }
  console.log(`[ok] blotters seeded`);
}

async function ensureModelsAndSims(fundId: string, adminId: string, _instrumentBySymbol: Record<string, string>) {
  let model = await prisma.investmentModelPortfolio.findFirst({
    where: { name: "Arcus ZSE Core Model" },
  });
  if (!model) {
    model = await prisma.investmentModelPortfolio.create({
      data: {
        name: "Arcus ZSE Core Model",
        strategyCode: "ZSE_CORE",
        baseCurrencyCode: "USD",
        linkedFundId: fundId,
        isActive: true,
      },
    });
  } else {
    model = await prisma.investmentModelPortfolio.update({
      where: { id: model.id },
      data: { linkedFundId: fundId, isActive: true },
    });
  }

  const weights: Array<[string, number]> = [
    ["ECO", 25],
    ["CBZ", 20],
    ["DLTA", 15],
    ["FBC", 15],
    ["INN", 10],
    ["SEED", 10],
    ["BAT", 5],
  ];
  await prisma.investmentModelPortfolioAllocation.deleteMany({ where: { modelPortfolioId: model.id } });
  for (const [sym, w] of weights) {
    await prisma.investmentModelPortfolioAllocation.create({
      data: {
        modelPortfolioId: model.id,
        allocationType: "INSTRUMENT",
        allocationKey: sym,
        targetWeightPct: new Decimal(w),
      },
    });
  }

  const sims = [
    { name: "+10% ECO shock", key: "seed-sim-eco-shock" },
    { name: "CBZ trim 5%", key: "seed-sim-cbz-trim" },
    { name: "Raise cash to 10%", key: "seed-sim-cash-10" },
  ];
  for (const s of sims) {
    const existing = await prisma.investmentSimulationRun.findFirst({
      where: {
        fundId,
        scenarioJson: { path: "$.seedKey", equals: s.key },
      },
    });
    if (existing) continue;
    // Prisma JSON path filter can flake — also check by scanning
    const all = await prisma.investmentSimulationRun.findMany({
      where: { fundId },
      take: 20,
    });
    if (all.some((r: any) => r.scenarioJson?.seedKey === s.key)) continue;
    await prisma.investmentSimulationRun.create({
      data: {
        fundId,
        scenarioJson: { name: s.name, seedKey: s.key, seed: true },
        resultJson: { ok: true, note: "Seeded demo scenario" },
        status: "COMPLETED",
        createdById: adminId,
      },
    });
  }
  console.log(`[ok] model + simulations seeded`);
}

async function ensurePriceQueue(securityBySymbol: Record<string, string>) {
  const pending = [
    { symbol: "ECO", price: 4.62, key: "seed-pending-review-eco" },
    { symbol: "FBC", price: 8.55, key: "seed-pending-review-fbc" },
  ];
  for (const p of pending) {
    const securityId = securityBySymbol[p.symbol];
    if (!securityId) continue;
    const existing = await prisma.listedEquityPriceTick.findFirst({ where: { idempotencyKey: p.key } });
    if (!existing) {
      await prisma.listedEquityPriceTick.create({
        data: {
          securityId,
          price: new Decimal(p.price),
          priceType: "CLOSE",
          validationStatus: "PENDING_REVIEW",
          pricedAt: new Date(),
          tickFrequency: "EOD",
          sourceStatus: "OK",
          sourceCode: "MANUAL",
          idempotencyKey: p.key,
        },
      });
    } else {
      await prisma.listedEquityPriceTick.update({
        where: { id: existing.id },
        data: { validationStatus: "PENDING_REVIEW", price: new Decimal(p.price) },
      });
    }
  }
  // Fix any old PENDING → PENDING_REVIEW for seed keys
  await prisma.listedEquityPriceTick.updateMany({
    where: { idempotencyKey: { startsWith: "seed-pending" }, validationStatus: "PENDING" },
    data: { validationStatus: "PENDING_REVIEW" },
  });
  console.log(`[ok] validation queue PENDING_REVIEW ticks`);
}

async function ensureSpCash(fund: { id: string; name: string }, adminId: string) {
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
        { providerId: provider.id, externalFingerprint: fp },
        { portfolioId: fund.id, accountType: "CUSTODY_CASH", currency: CURRENCY },
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
  if (!cash) cash = await prisma.spCashClientAccount.create({ data: { ...base, version: 1 } });
  else cash = await prisma.spCashClientAccount.update({ where: { id: cash.id }, data: base });
  return { provider, layout, cash };
}

async function main() {
  console.log("Seeding RICH Investments V2 demo (DEV nts)…\n");
  await assertDevDatabase(prisma, "seed:investments-v2-demo");

  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found");
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, select: { id: true } });
  const approver =
    (await prisma.user.findFirst({ where: { email: "ops.approver@arcus.co.zw" } })) || admin;

  await ensureCountryMarketType();
  const broker = await ensureStakeholder(
    "BROKER",
    "Imara Edwards Securities",
    "dealing@imaraedwards.co.zw"
  );
  await ensureStakeholder("BROKER", "Imara Capital", "dealing@imara.co.zw");
  const custodian = await ensureStakeholder(
    "CUSTODIAN",
    "CBZ Custodial Services",
    "custody@cbz.co.zw"
  );
  await ensureStakeholder("CUSTODIAN", "CABS Custody", "custody@cabs.co.zw");

  if (!(await prisma.investmentBrokerCommission.findFirst({ where: { stakeholderProfileId: broker.id } }))) {
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

  const { fund, cfg } = await ensureListedFund({
    name: "Arcus Listed Portfolio",
    description: "Listed equity mandate managed by Arcus Asset Management",
    adminId: admin.id,
    bankId: bank?.id ?? null,
    brokerId: broker.id,
    custodianId: custodian.id,
  });
  await ensureCashLedger(cfg.id);

  const holdMeta: Array<{
    securityId: string;
    instrumentId: string;
    qty: number;
    price: number;
    wac: number;
    currency: string;
  }> = [];
  for (const eq of EQUITIES) {
    await ensureHolding(fund.id, securityBySymbol[eq.symbol], eq.qty, eq.wac);
    holdMeta.push({
      securityId: securityBySymbol[eq.symbol],
      instrumentId: instrumentBySymbol[eq.symbol],
      qty: eq.qty,
      price: eq.price,
      wac: eq.wac,
      currency: "USD",
    });
  }

  for (const t of SETTLED_TRADES) {
    await ensureSettledTrade({
      fundId: fund.id,
      securityId: securityBySymbol[t.symbol],
      tradeRef: t.ref,
      side: t.side,
      qty: t.qty,
      price: t.price,
      fees: t.fees,
      when: new Date(Date.now() - t.daysAgo * 86400000),
      adminId: admin.id,
    });
  }
  const routingFbc = await ensureRoutingTrade({
    fundId: fund.id,
    securityId: securityBySymbol.FBC,
    tradeRef: "ALP-ROUTING-FBC",
    side: "BUY",
    qty: 1200,
    price: 8.2,
    adminId: admin.id,
  });
  const routingOkz = await ensureRoutingTrade({
    fundId: fund.id,
    securityId: securityBySymbol.OKZ,
    tradeRef: "ALP-ROUTING-OKZ",
    side: "SELL",
    qty: 2000,
    price: 3.12,
    adminId: admin.id,
  });
  console.log(`[ok] trades settled=${SETTLED_TRADES.length} routing=2`);

  const orderSpecs = [
    { ref: "ALP-ORD-DRAFT-ECO", symbol: "ECO", side: "BUY" as const, qty: 2000, price: 4.5, status: "DRAFT" },
    { ref: "ALP-ORD-SUBMIT-CBZ", symbol: "CBZ", side: "BUY" as const, qty: 1500, price: 12.3, status: "SUBMITTED" },
    { ref: "ALP-ORD-APPROVED-DLTA", symbol: "DLTA", side: "BUY" as const, qty: 800, price: 18.5, status: "APPROVED" },
    { ref: "ALP-ORD-REJECT-OKZ", symbol: "OKZ", side: "SELL" as const, qty: 500, price: 3.1, status: "REJECTED" },
    {
      ref: "ALP-ORD-EXEC-FBC",
      symbol: "FBC",
      side: "BUY" as const,
      qty: 1200,
      price: 8.2,
      status: "EXECUTED",
      tradeId: routingFbc.id,
    },
    { ref: "ALP-ORD-SETTLED-INN", symbol: "INN", side: "BUY" as const, qty: 400, price: 41.5, status: "SETTLED" },
    { ref: "ALP-ORD-SENT-BAT", symbol: "BAT", side: "BUY" as const, qty: 100, price: 84.0, status: "SENT_TO_BROKER" },
    {
      ref: "ALP-ORD-ROUTING-OKZ",
      symbol: "OKZ",
      side: "SELL" as const,
      qty: 2000,
      price: 3.12,
      status: "EXECUTED",
      tradeId: routingOkz.id,
    },
  ];
  const orderIds: string[] = [];
  let approvedOrderId = "";
  for (const s of orderSpecs) {
    const o = await ensureOrder({
      fundId: fund.id,
      instrumentId: instrumentBySymbol[s.symbol],
      securityId: securityBySymbol[s.symbol],
      brokerId: broker.id,
      adminId: admin.id,
      approverId: approver.id,
      orderRef: s.ref,
      side: s.side,
      qty: s.qty,
      price: s.price,
      status: s.status,
      tradeId: (s as any).tradeId,
    });
    orderIds.push(o.id);
    if (s.ref === "ALP-ORD-APPROVED-DLTA") approvedOrderId = o.id;
  }
  console.log(`[ok] orders=${orderSpecs.length}`);

  await ensureTransactionsFromTrades(fund.id);
  await ensureValuationWithItems(fund.id, admin.id, holdMeta);
  await ensureComplianceChain({
    fundId: fund.id,
    orderId: approvedOrderId || orderIds[2],
    adminId: admin.id,
    approverId: approver.id,
  });
  await ensureRecon(fund.id, admin.id);
  await ensureDocsReports(fund.id, admin.id, approvedOrderId || orderIds[0]);
  await ensureBlotters(fund.id, admin.id, orderIds);
  await ensureModelsAndSims(fund.id, admin.id, instrumentBySymbol);
  await ensurePriceQueue(securityBySymbol);
  const cash = await ensureSpCash(fund, admin.id);

  const summary = {
    portfolioId: fund.id,
    instruments: EQUITIES.length,
    holdings: await prisma.listedEquityHolding.count({ where: { fundId: fund.id } }),
    trades: await prisma.listedEquityTrade.count({ where: { fundId: fund.id } }),
    routingTrades: await prisma.listedEquityTrade.count({ where: { fundId: fund.id, status: "ROUTING" } }),
    orders: await prisma.investmentOrder.count({ where: { fundId: fund.id } }),
    transactions: await prisma.investmentTransaction.count({ where: { fundId: fund.id } }),
    valuationItems: await prisma.investmentValuationItemSnapshot.count({
      where: { fundId: fund.id },
    }),
    reconItems: await prisma.investmentReconciliationItem.count({
      where: { batch: { fundId: fund.id } },
    }),
    accountingEvents: await prisma.investmentAccountingEvent.count({ where: { fundId: fund.id } }),
    documents: await prisma.investmentDocument.count({ where: { fundId: fund.id } }),
    reports: await prisma.investmentReportRun.count({ where: { fundId: fund.id } }),
    blotters: await prisma.investmentBlotter.count({ where: { fundId: fund.id } }),
    cashAccountId: cash.cash.id,
  };

  console.log("\n=== Rich Investments V2 demo summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nDone. Refresh FE — blotter Confirm should show ROUTING trades.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
