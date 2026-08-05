/**
 * Rich Arcus Investments V2 demo (DEV nts only).
 * Fills trades, orders, positions, valuation, recon, accounting, docs, reports, blotters, models.
 *
 * Usage: npm run db:seed:investments-v2-demo
 * Reset:  npm run db:reset:investments-v2-demo
 */
import "dotenv/config";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
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

const EXTRA_PORTFOLIOS = [
  {
    name: "Arcus Growth Equity Fund",
    description: "Growth-oriented listed equity mandate focused on ZSE financials and telecoms",
    holdings: [
      { symbol: "ECO", qty: 80000, wac: 4.0, price: 4.55 },
      { symbol: "CBZ", qty: 12000, wac: 11.0, price: 12.45 },
      { symbol: "FBC", qty: 15000, wac: 7.5, price: 8.3 },
    ],
  },
  {
    name: "Arcus Income Mandate",
    description: "Dividend-focused listed equity sleeve for institutional income clients",
    holdings: [
      { symbol: "DLTA", qty: 22000, wac: 16.0, price: 18.75 },
      { symbol: "BAT", qty: 3500, wac: 76.0, price: 85.0 },
      { symbol: "INN", qty: 8000, wac: 38.0, price: 42.1 },
    ],
  },
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

async function writeSeedMockFile(relativePath: string, content: string) {
  const absolute = path.resolve(process.cwd(), relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
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
        // ZSE board trades in ZWG (Mansa / domestic source of truth)
        listingCurrencyCode: "ZWG",
        isActive: true,
      },
    });
  } else {
    security = await prisma.listedEquitySecurity.update({
      where: { id: security.id },
      data: { name: eq.name, isActive: true, listingCurrencyCode: "ZWG" },
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
    listingCurrencyCode: "ZWG",
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

  // Order preview/submit reads the latest POSTED ledger runningBalance. Later settle/exec
  // rows often leave runningBalance null → cashBefore=0 and Place Order fails. Heal on seed.
  const latest = await prisma.investmentCashLedgerEntry.findFirst({
    where: { cashAccountId: acct.id, status: "POSTED" },
    orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
  });
  const bal = latest?.runningBalance != null ? Number(latest.runningBalance) : NaN;
  if (!latest || !Number.isFinite(bal) || bal < 100000) {
    if (latest) {
      await prisma.investmentCashLedgerEntry.update({
        where: { id: latest.id },
        data: { runningBalance: new Decimal("5000000") },
      });
    } else {
      await prisma.investmentCashLedgerEntry.create({
        data: {
          cashAccountId: acct.id,
          entryType: "MANUAL_ADJUSTMENT",
          amount: new Decimal("5000000"),
          currencyCode: "USD",
          effectiveAt: new Date(),
          valueDate: new Date(),
          status: "POSTED",
          idempotencyKey: `seed-cash-topup-${acct.id}`,
          runningBalance: new Decimal("5000000"),
        },
      });
    }
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
  /** Override default ROUTING — e.g. EXECUTED for rare cases. */
  status?: string;
}) {
  const when = new Date(Date.now() - 4 * 3600000);
  let trade = await prisma.listedEquityTrade.findFirst({ where: { tradeRef: opts.tradeRef } });
  const status = opts.status || "ROUTING";
  const data = {
    fundId: opts.fundId,
    securityId: opts.securityId,
    side: opts.side,
    quantity: new Decimal(opts.qty),
    executionPrice: new Decimal(opts.price),
    executionCurrencyCode: "USD",
    fees: new Decimal(25),
    status,
    executedAt: when,
    settledAt: status === "SETTLED" ? when : null,
    executedById: opts.adminId,
  };
  if (!trade) {
    trade = await prisma.listedEquityTrade.create({ data: { tradeRef: opts.tradeRef, ...data } });
  } else {
    trade = await prisma.listedEquityTrade.update({ where: { id: trade.id }, data });
  }
  const hops: Array<{ target: string; status: string }> =
    status === "SETTLED"
      ? [
          { target: "BROKER", status: "CONFIRMED" },
          { target: "CUSTODIAN", status: "CONFIRMED" },
          { target: "CORE_BANKING", status: "CONFIRMED" },
          { target: "ACCOUNTING_GL", status: "CONFIRMED" },
        ]
      : [
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
        dispatchedAt: h.status === "DISPATCHED" || h.status === "CONFIRMED" ? when : null,
        confirmedAt: h.status === "CONFIRMED" ? when : null,
        externalRef: `SEED-${opts.tradeRef}-${h.target}`,
      },
      update: {
        status: h.status,
        dispatchedAt: h.status === "DISPATCHED" || h.status === "CONFIRMED" ? when : null,
        confirmedAt: h.status === "CONFIRMED" ? when : null,
      },
    });
  }
  if (status === "SETTLED") {
    await prisma.listedEquityTradeSettlement.upsert({
      where: { tradeId: trade.id },
      create: { tradeId: trade.id, settlementDocumentRef: `settlement://${opts.tradeRef}` },
      update: { settlementDocumentRef: `settlement://${opts.tradeRef}` },
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
    complianceStatus: opts.status === "REJECTED" || opts.status === "FAILED" ? "FAILED" : "PASSED",
    createdById: opts.adminId,
    submittedAt: opts.status === "DRAFT" ? null : when,
    approvedAt: ["APPROVED", "EXECUTED", "SETTLED", "SENT_TO_BROKER", "PARTIALLY_EXECUTED", "PENDING_SETTLEMENT", "FAILED"].includes(opts.status)
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

  if (["APPROVED", "EXECUTED", "SETTLED", "SENT_TO_BROKER", "PARTIALLY_EXECUTED", "PENDING_SETTLEMENT", "FAILED"].includes(opts.status)) {
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
  if (["EXECUTED", "SETTLED", "PARTIALLY_EXECUTED", "PENDING_SETTLEMENT"].includes(opts.status)) {
    const execRef = `${opts.orderRef}-FILL-1`;
    if (!(await prisma.investmentOrderExecution.findFirst({ where: { orderId: order.id, executionRef: execRef } }))) {
      const qty =
        opts.status === "PARTIALLY_EXECUTED"
          ? new Decimal(opts.qty).mul(new Decimal("0.4"))
          : new Decimal(opts.qty);
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
          settlementDate: opts.status === "SETTLED" ? when : null,
          idempotencyKey: `seed-fill-${opts.orderRef}`,
        },
      });
    }
  }

  // Broker route is required for POST /trades/:id/confirm (order trade-confirmation alias).
  // Live flow: APPROVED → route() creates InvestmentOrderRoute → SENT_TO_BROKER → confirm.
  // Seed previously jumped past that and left confirm broken.
  await ensureOrderBrokerRoute(order, opts);

  return order;
}

async function ensureOrderBrokerRoute(
  order: { id: string; orderRef: string; brokerProfileId?: string | null; side?: string; quantity?: any },
  opts: { status: string; brokerId: string; qty: number; price: number; orderRef: string; side: string }
) {
  const needsRoute = [
    "SENT_TO_BROKER",
    "PARTIALLY_EXECUTED",
    "EXECUTED",
    "PENDING_SETTLEMENT",
    "SETTLED",
    "FAILED",
  ].includes(opts.status);
  if (!needsRoute) return null;

  const existing = await prisma.investmentOrderRoute.findFirst({
    where: { orderId: order.id },
    orderBy: { routeSequence: "desc" },
  });
  // Still waiting for blotter Confirm → leave ROUTED so POST /trades/:id/confirm works.
  const when = new Date(Date.now() - 2 * 86400000);
  const routeStatus = "ROUTED";
  if (existing) {
    return prisma.investmentOrderRoute.update({
      where: { id: existing.id },
      data: {
        status: routeStatus,
        brokerProfileId: existing.brokerProfileId || opts.brokerId,
        venueCode: existing.venueCode || "ZSE",
        externalOrderRef: existing.externalOrderRef || `SEED-BRK-${opts.orderRef}`,
        routedAt: existing.routedAt || when,
      },
    });
  }
  return prisma.investmentOrderRoute.create({
    data: {
      orderId: order.id,
      routeSequence: 1,
      venueCode: "ZSE",
      brokerProfileId: opts.brokerId,
      status: routeStatus,
      externalOrderRef: `SEED-BRK-${opts.orderRef}`,
      requestPayload: {
        orderRef: opts.orderRef,
        side: opts.side,
        quantity: opts.qty,
        limitPrice: opts.price,
        seeded: true,
      },
      idempotencyKey: `seed-route-${opts.orderRef}`,
      routedAt: when,
    },
  });
}

async function cleanupOrphanComplianceResults() {
  const orphans = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM investment_compliance_results r
    LEFT JOIN investment_orders o ON o.id = r.order_id
    WHERE o.id IS NULL
  `;
  if (orphans.length) {
    await prisma.investmentComplianceResult.deleteMany({
      where: { id: { in: orphans.map((r) => r.id) } },
    });
    console.log(`[ok] removed ${orphans.length} orphan compliance result(s)`);
  }
}

async function upsertSettingCatalog(
  type: string,
  items: Array<Record<string, unknown>>,
  adminId: string
) {
  const key = `reference.${type}`;
  await prisma.investmentOpsSetting.upsert({
    where: { settingKey: key },
    create: {
      settingKey: key,
      settingValue: { version: 1, items },
      updatedById: adminId,
    },
    update: {
      settingValue: { version: 1, items },
      updatedById: adminId,
    },
  });
}

async function ensureSetupCatalogs(adminId: string) {
  const now = new Date().toISOString();
  const mk = (name: string, extra: Record<string, unknown> = {}) => ({
    id: `seed-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    version: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
  await upsertSettingCatalog(
    "tags",
    [
      mk("Core ZSE", { code: "CORE_ZSE", color: "#1e40af" }),
      mk("Income Sleeve", { code: "INCOME", color: "#047857" }),
      mk("Watchlist", { code: "WATCH", color: "#b45309" }),
    ],
    adminId
  );
  await upsertSettingCatalog(
    "coupon-frequencies",
    [
      mk("Semi-Annual", { code: "SEMI_ANNUAL", periodsPerYear: 2 }),
      mk("Quarterly", { code: "QUARTERLY", periodsPerYear: 4 }),
      mk("Annual", { code: "ANNUAL", periodsPerYear: 1 }),
    ],
    adminId
  );
  await upsertSettingCatalog(
    "instrument-subcategories",
    [
      mk("Large Cap Financials", { code: "LC_FIN", instrumentTypeCode: "EQUITY" }),
      mk("Telecoms", { code: "TELCO", instrumentTypeCode: "EQUITY" }),
      mk("Consumer Staples", { code: "CONS_STAP", instrumentTypeCode: "EQUITY" }),
    ],
    adminId
  );
  await upsertSettingCatalog(
    "corporate-action-mappings",
    [
      mk("Cash Dividend", { actionType: "DIVIDEND_CASH", glDebit: "1200", glCredit: "4010" }),
      mk("Stock Split", { actionType: "SPLIT", glDebit: "1501", glCredit: "1501" }),
      mk("Rights Issue", { actionType: "RIGHTS", glDebit: "1501", glCredit: "3010" }),
    ],
    adminId
  );
  await upsertSettingCatalog(
    "icons",
    EQUITIES.slice(0, 5).map((eq) =>
      mk(`${eq.symbol} Logo`, {
        code: eq.symbol,
        imageUrl: `storage/local-upload-mock/investment-ops-icons/${eq.symbol.toLowerCase()}.png`,
        mimeType: "image/png",
        linkedTicker: eq.symbol,
      })
    ),
    adminId
  );
  console.log(`[ok] setup catalogs (tags, coupons, subcategories, corp actions, icons)`);
}

async function ensurePortfolioFolders(
  fundId: string,
  cfgId: string,
  adminId: string,
  folderSpecs: Array<{ path: string; name: string; sortOrder: number }>
) {
  const folders = [];
  for (const spec of folderSpecs) {
    let folder = await prisma.investmentPortfolioFolder.findFirst({
      where: { fundId, path: spec.path },
    });
    if (!folder) {
      folder = await prisma.investmentPortfolioFolder.create({
        data: {
          fundId,
          name: spec.name,
          path: spec.path,
          sortOrder: spec.sortOrder,
          createdById: adminId,
        },
      });
    }
    folders.push(folder);
  }
  const primaryFolder = folders[0];
  if (primaryFolder) {
    const existing = await prisma.investmentPortfolioAssignment.findFirst({
      where: {
        portfolioConfigId: cfgId,
        userId: adminId,
        assignmentRole: "PORTFOLIO_MANAGER",
      },
    });
    if (!existing) {
      await prisma.investmentPortfolioAssignment.create({
        data: {
          portfolioConfigId: cfgId,
          folderId: primaryFolder.id,
          userId: adminId,
          assignmentRole: "PORTFOLIO_MANAGER",
          createdById: adminId,
        },
      });
    } else if (!existing.folderId) {
      await prisma.investmentPortfolioAssignment.update({
        where: { id: existing.id },
        data: { folderId: primaryFolder.id },
      });
    }
  }
  return folders;
}

async function ensurePriceAndFxLifecycle(
  securityBySymbol: Record<string, string>,
  adminId: string,
  approverId: string
) {
  const ecoId = securityBySymbol.ECO;
  if (ecoId) {
    for (const [key, status, price] of [
      ["seed-tick-pending-eco", "PENDING_REVIEW", 4.62],
      ["seed-tick-rejected-eco", "REJECTED", 9.99],
    ] as const) {
      const existing = await prisma.listedEquityPriceTick.findFirst({ where: { idempotencyKey: key } });
      if (!existing) {
        await prisma.listedEquityPriceTick.create({
          data: {
            securityId: ecoId,
            price: new Decimal(price),
            priceType: "CLOSE",
            validationStatus: status,
            pricedAt: new Date(),
            tickFrequency: "EOD",
            sourceStatus: "OK",
            sourceCode: "MANUAL",
            idempotencyKey: key,
            ...(status === "REJECTED"
              ? { reviewedById: approverId, reviewedAt: new Date(), approvalReason: "Outlier vs prior close" }
              : {}),
          },
        });
      }
    }
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
  if (!(await prisma.investmentFxRateSnapshot.findFirst({ where: { idempotencyKey: fxPendingKey } }))) {
    await prisma.investmentFxRateSnapshot.create({
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
  console.log(`[ok] FX snapshots + price validation ticks`);
  return fxApproved;
}

async function ensureValuationInputs(
  runId: string,
  holdings: Array<{ instrumentId: string; price: number; securityId: string }>,
  fxSnapshotId?: string
) {
  for (const h of holdings) {
    const tick = await prisma.listedEquityPriceTick.findFirst({
      where: { securityId: h.securityId, validationStatus: "APPROVED" },
      orderBy: { pricedAt: "desc" },
    });
    const valueJson = { price: h.price, ticker: EQUITIES.find((e) => e.price === h.price)?.symbol };
    const contentHash = sha(`${runId}:PRICE:${h.instrumentId}:${h.price}`);
    await prisma.investmentValuationInputSnapshot.upsert({
      where: {
        valuationRunId_inputType_instrumentId: {
          valuationRunId: runId,
          inputType: "PRICE",
          instrumentId: h.instrumentId,
        },
      },
      create: {
        valuationRunId: runId,
        inputType: "PRICE",
        instrumentId: h.instrumentId,
        priceTickId: tick?.id ?? null,
        sourceCode: tick?.sourceCode ?? "SEED_EOD",
        sourceObservedAt: tick?.pricedAt ?? new Date(),
        valueJson,
        contentHash,
      },
      update: {
        priceTickId: tick?.id ?? null,
        valueJson,
        contentHash,
      },
    });
  }
  if (fxSnapshotId) {
    const contentHash = sha(`${runId}:FX:${fxSnapshotId}`);
    const existingFx = await prisma.investmentValuationInputSnapshot.findFirst({
      where: { valuationRunId: runId, inputType: "FX" },
    });
    if (!existingFx) {
      await prisma.investmentValuationInputSnapshot.create({
        data: {
          valuationRunId: runId,
          inputType: "FX",
          fxSnapshotId,
          sourceCode: "RBZ",
          sourceObservedAt: new Date(),
          valueJson: { base: "USD", quote: "ZWG", rate: "26.5" },
          contentHash,
        },
      });
    } else {
      await prisma.investmentValuationInputSnapshot.update({
        where: { id: existingFx.id },
        data: {
          fxSnapshotId,
          valueJson: { base: "USD", quote: "ZWG", rate: "26.5" },
          contentHash,
        },
      });
    }
  }
  console.log(`[ok] valuation input snapshots for run ${runId}`);
}

async function ensureAccountingDemo(opts: {
  fundId: string;
  adminId: string;
  approverId: string;
  tradeRef: string;
  tradeId: string;
  amount: number;
}) {
  const usd = await prisma.currency.findFirst({ where: { code: "USD", isActive: true } });
  const assetAcct = await prisma.chartOfAccounts.findFirst({
    where: { OR: [{ accountNo: "1501" }, { accountName: { contains: "Portfolio" } }], isActive: true },
  });
  const bankAcct = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: { in: ["1100", "1010", "1000"] }, isActive: true },
  });
  if (!usd || !assetAcct || !bankAcct) {
    console.log("[skip] accounting journals — chart of accounts / USD currency missing");
    return;
  }

  const jeRef = `IO-SEED-${opts.tradeRef}`.slice(0, 60);
  let journal = await prisma.journalEntry.findFirst({ where: { referenceNumber: jeRef } });
  if (!journal) {
    journal = await prisma.journalEntry.create({
      data: {
        transactionDate: new Date(),
        referenceNumber: jeRef,
        description: `Listed equity purchase — ${opts.tradeRef}`,
        totalAmount: new Decimal(opts.amount),
        currencyId: usd.id,
        status: "POSTED",
        createdById: opts.adminId,
        journalEntryLines: {
          create: [
            {
              chartOfAccountId: assetAcct.id,
              debitAmount: new Decimal(opts.amount),
              creditAmount: new Decimal(0),
              description: "Dr Listed securities",
            },
            {
              chartOfAccountId: bankAcct.id,
              debitAmount: new Decimal(0),
              creditAmount: new Decimal(opts.amount),
              description: "Cr Bank clearing",
            },
          ],
        },
      },
    });
  }

  const acctEvent = await prisma.investmentAccountingEvent.findFirst({
    where: { tradeRef: opts.tradeRef, fundId: opts.fundId },
  });
  if (acctEvent) {
    await prisma.investmentAccountingEvent.update({
      where: { id: acctEvent.id },
      data: { journalEntryId: journal.id, status: "POSTED", postedAt: new Date() },
    });
    await prisma.listedEquityTradeSettlement.updateMany({
      where: { tradeId: opts.tradeId },
      data: { journalEntryId: journal.id },
    });

    if (
      !(await prisma.investmentAccountingJournalWorkflow.findFirst({
        where: { accountingEventId: acctEvent.id, action: "POST" },
      }))
    ) {
      await prisma.investmentAccountingJournalWorkflow.create({
        data: {
          accountingEventId: acctEvent.id,
          journalEntryId: journal.id,
          workflowStatus: "POSTED",
          sequenceNo: 1,
          action: "POST",
          actorId: opts.adminId,
          idempotencyKey: `seed-wf-post-${acctEvent.id}`,
        },
      });
      await prisma.investmentAccountingJournalWorkflow.create({
        data: {
          accountingEventId: acctEvent.id,
          journalEntryId: journal.id,
          workflowStatus: "APPROVED",
          sequenceNo: 2,
          action: "APPROVE",
          actorId: opts.approverId,
          idempotencyKey: `seed-wf-appr-${acctEvent.id}`,
        },
      });
    }

    const failedEvent = await prisma.investmentAccountingEvent.findFirst({
      where: { fundId: opts.fundId, status: "FAILED" },
    });
    if (!failedEvent) {
      await prisma.investmentAccountingEvent.create({
        data: {
          fundId: opts.fundId,
          sourceType: "LISTED_EQUITY_TRADE",
          sourceId: opts.tradeId,
          eventType: "PURCHASE",
          status: "FAILED",
          tradeRef: `${opts.tradeRef}-RETRY`,
          amount: new Decimal(opts.amount),
          currencyCode: "USD",
          idempotencyKey: `seed-acct-failed-${opts.tradeRef}`,
        },
      });
    }

    const pendingEvent = await prisma.investmentAccountingEvent.findFirst({
      where: { fundId: opts.fundId, status: "NOT_POSTED" },
    });
    if (!pendingEvent) {
      await prisma.investmentAccountingEvent.create({
        data: {
          fundId: opts.fundId,
          sourceType: "INVESTMENT_ORDER",
          sourceId: opts.tradeId,
          eventType: "SETTLEMENT",
          status: "NOT_POSTED",
          tradeRef: `${opts.tradeRef}-PENDING`,
          amount: new Decimal(opts.amount * 0.5),
          currencyCode: "USD",
          idempotencyKey: `seed-acct-pending-${opts.tradeRef}`,
        },
      });
    }

    if (
      !(await prisma.investmentAccountingReversal.findFirst({
        where: { accountingEventId: acctEvent.id },
      }))
    ) {
      await prisma.investmentAccountingReversal.create({
        data: {
          accountingEventId: acctEvent.id,
          originalJournalEntryId: journal.id,
          status: "REQUESTED",
          reason: "Demo reversal — duplicate settlement posting review",
          requestedById: opts.adminId,
          idempotencyKey: `seed-reversal-${acctEvent.id}`,
        },
      });
    }

    const exportRef = `SEED-GL-EXPORT-${opts.fundId.slice(0, 8)}`;
    const exportPath = `storage/local-upload-mock/investment-ops-ledger-exports/${exportRef}.json`;
    if (
      !(await prisma.investmentAccountingExportLink.findFirst({
        where: { exportBatchRef: exportRef },
      }))
    ) {
      await writeSeedMockFile(
        exportPath,
        JSON.stringify(
          {
            fundId: opts.fundId,
            exportBatchRef: exportRef,
            exportedAt: new Date().toISOString(),
            note: "Seed ledger export for Investments V2 demo",
            accountingEventId: acctEvent.id,
          },
          null,
          2
        )
      );
      await prisma.investmentAccountingExportLink.create({
        data: {
          accountingEventId: acctEvent.id,
          exportSystem: "CORE_GL",
          exportBatchRef: exportRef,
          externalRef: path.resolve(process.cwd(), exportPath),
          status: "COMPLETED",
          payloadHash: sha(exportRef),
          exportedAt: new Date(),
          idempotencyKey: `seed-export-${acctEvent.id}`,
        },
      });
    }
    console.log(`[ok] accounting journals/workflows/reversal/export for ${opts.tradeRef}`);
  }
}

async function ensureSpCashRich(opts: {
  fund: { id: string; name: string };
  cashAccountId: string;
  adminId: string;
  approverId: string;
}) {
  const { fund, cashAccountId, adminId, approverId } = opts;
  const valueDate = new Date("2025-06-01");
  const openingKey = `seed:opening:${cashAccountId}`;

  if (!(await prisma.spCashJournal.findFirst({ where: { idempotencyKey: openingKey } }))) {
    await prisma.spCashJournal.create({
      data: {
        sourceSystem: "SEED",
        sourceEventId: `OPENING-${fund.id.slice(0, 8)}`,
        postingPurpose: "OPENING",
        idempotencyKey: openingKey,
        valueDate,
        settlementDate: valueDate,
        postingBusinessDate: valueDate,
        currency: CURRENCY,
        status: "POSTED",
        makerId: adminId,
        checkerId: approverId !== adminId ? approverId : adminId,
        cashAccountId,
        portfolioId: fund.id,
        postedAt: new Date(),
        version: 1,
        lines: {
          create: [
            {
              ledgerAccountCode: "CASH",
              cashAccountId,
              debit: new Decimal("2500000"),
              credit: new Decimal(0),
              signedCashAmount: new Decimal("2500000"),
              currency: CURRENCY,
              description: `Opening cash — ${fund.name}`,
              matchStatus: "UNMATCHED",
            },
            {
              ledgerAccountCode: "OPENING_EQUITY",
              debit: new Decimal(0),
              credit: new Decimal("2500000"),
              signedCashAmount: new Decimal(0),
              currency: CURRENCY,
              description: "Opening equity balancing line",
              matchStatus: null,
            },
          ],
        },
      },
    });
  }

  const tradeKey = `seed:trade-settle:${fund.id.slice(0, 8)}`;
  if (!(await prisma.spCashJournal.findFirst({ where: { idempotencyKey: tradeKey } }))) {
    await prisma.spCashJournal.create({
      data: {
        sourceSystem: "SEED",
        sourceEventId: `TRADE-SETTLE-${fund.id.slice(0, 8)}`,
        postingPurpose: "TRADE_SETTLEMENT",
        idempotencyKey: tradeKey,
        valueDate: new Date(),
        settlementDate: new Date(),
        postingBusinessDate: new Date(),
        currency: CURRENCY,
        status: "POSTED",
        makerId: adminId,
        checkerId: approverId !== adminId ? approverId : adminId,
        cashAccountId,
        portfolioId: fund.id,
        postedAt: new Date(),
        version: 1,
        lines: {
          create: [
            {
              ledgerAccountCode: "CASH",
              cashAccountId,
              debit: new Decimal(0),
              credit: new Decimal("125000"),
              signedCashAmount: new Decimal("-125000"),
              currency: CURRENCY,
              description: "CBZ purchase settlement",
              matchStatus: "UNMATCHED",
            },
            {
              ledgerAccountCode: "TRADE_PAYABLE",
              debit: new Decimal("125000"),
              credit: new Decimal(0),
              signedCashAmount: new Decimal(0),
              currency: CURRENCY,
              description: "Trade payable clearing",
              matchStatus: null,
            },
          ],
        },
      },
    });
  }

  let reconBatch = await prisma.spCashReconciliationBatch.findFirst({
    where: { cashAccountId, fundId: fund.id },
  });
  if (!reconBatch) {
    reconBatch = await prisma.spCashReconciliationBatch.create({
      data: {
        cashAccountId,
        currency: CURRENCY,
        periodFrom: new Date("2025-06-01"),
        periodTo: new Date(),
        reconType: "BANK",
        openingInternal: new Decimal("2500000"),
        closingInternal: new Decimal("2375000"),
        openingExternal: new Decimal("2500000"),
        closingExternal: new Decimal("2374800"),
        variance: new Decimal("200"),
        toleranceAmount: new Decimal("500"),
        status: "IN_PROGRESS",
        makerId: adminId,
        checkerId: approverId,
        fundId: fund.id,
        autoMatchEnabled: true,
        version: 1,
      },
    });
  }

  if (
    !(await prisma.spCashReconciliationException.findFirst({
      where: { cashAccountId, category: "TIMING", source: "SEED_WALKTHROUGH:EX-1" },
    }))
  ) {
    await prisma.spCashReconciliationException.create({
      data: {
        batchId: reconBatch.id,
        cashAccountId,
        clientOrVehicleId: `vehicle:${fund.id}`,
        category: "TIMING",
        severity: "MEDIUM",
        status: "OPEN",
        amountTxn: new Decimal("200"),
        currencyTxn: CURRENCY,
        assignedToId: adminId,
        source: "SEED_WALKTHROUGH:EX-1",
        counterparty: "CBZ Custody",
        version: 1,
      },
    });
  }

  if (!(await prisma.spCashBrokerCustodianItem.findFirst({ where: { portfolioId: fund.id } }))) {
    await prisma.spCashBrokerCustodianItem.create({
      data: {
        portfolioId: fund.id,
        instrumentIsin: "ZW000901RFT6",
        instrumentName: "Delta Corporation",
        symbol: "DLTA",
        quantity: new Decimal("800"),
        price: new Decimal("18.75"),
        tradeDate: new Date(),
        settleDate: new Date(),
        internalStatus: "MATCHED",
        brokerStatus: "MATCHED",
        custodianStatus: "PENDING",
        overallStatus: "POTENTIAL",
        differenceAmount: new Decimal("0"),
        currency: CURRENCY,
        version: 1,
      },
    });
    await prisma.spCashBrokerCustodianItem.create({
      data: {
        portfolioId: fund.id,
        instrumentIsin: "ZW000901ECO1",
        instrumentName: "Econet Wireless",
        symbol: "ECO",
        quantity: new Decimal("5000"),
        price: new Decimal("4.55"),
        tradeDate: new Date(Date.now() - 86400000),
        settleDate: new Date(),
        internalStatus: "MATCHED",
        brokerStatus: "UNMATCHED",
        custodianStatus: "MATCHED",
        overallStatus: "BREAK",
        differenceAmount: new Decimal("2275"),
        currency: CURRENCY,
        version: 1,
      },
    });
  }

  console.log(`[ok] sp cash journals, recon batch, broker-custodian, exception`);
}

/** FUND / TRADING purpose-tagged accounts + ledger lines for cash-ledger walkthrough filters. */
async function ensurePurposeCashAccounts(opts: {
  fund: { id: string; name: string };
  providerId: string;
  tolerancePolicyId: string;
  adminId: string;
  approverId: string;
}) {
  const specs = [
    {
      code: "TRADING",
      accountType: "TRADING_CASH",
      moneyClass: "TRADING_CASH",
      opening: "750000",
      movement: "-45000",
      movementDesc: "Equity buy — trading sleeve",
    },
    {
      code: "FUND",
      accountType: "OMNIBUS",
      moneyClass: "FUND_CASH",
      opening: "3200000",
      movement: "125000",
      movementDesc: "Capital call receipt — fund omnibus",
    },
  ] as const;

  for (const spec of specs) {
    const externalId = `ARCS-${spec.code}-${opts.fund.id.slice(0, 8)}`;
    const fp = fingerprint([opts.providerId, externalId, CURRENCY]);
    let acct = await prisma.spCashClientAccount.findFirst({
      where: { providerId: opts.providerId, externalFingerprint: fp },
    });
    const base = {
      tenantId: TENANT_ID,
      legalEntityId: LEGAL_ENTITY_ID,
      clientOrVehicleId: `vehicle:${opts.fund.id}`,
      portfolioId: opts.fund.id,
      ownerModel: "SEGREGATED",
      moneyClass: spec.moneyClass,
      accountType: spec.accountType,
      providerId: opts.providerId,
      externalIdentifierEncrypted: encryptExternalId(externalId),
      externalFingerprint: fp,
      maskedIdentifier: `****${spec.code}`,
      accountNumberMasked: `****${spec.code}`,
      currency: CURRENCY,
      status: "ACTIVE",
      effectiveFrom: new Date("2020-01-01"),
      tolerancePolicyId: opts.tolerancePolicyId,
      clientName: `${opts.fund.name} (${spec.code})`,
      createdById: opts.adminId,
      approvedById: opts.adminId,
    };
    if (!acct) {
      acct = await prisma.spCashClientAccount.create({ data: { ...base, version: 1 } });
    } else {
      acct = await prisma.spCashClientAccount.update({ where: { id: acct.id }, data: base });
    }

    const openKey = `seed:purpose-open:${spec.code}:${opts.fund.id.slice(0, 8)}`;
    if (!(await prisma.spCashJournal.findFirst({ where: { idempotencyKey: openKey } }))) {
      await prisma.spCashJournal.create({
        data: {
          sourceSystem: "SEED",
          sourceEventId: `OPEN-${spec.code}-${opts.fund.id.slice(0, 8)}`,
          postingPurpose: "OPENING",
          idempotencyKey: openKey,
          valueDate: new Date("2025-06-15"),
          settlementDate: new Date("2025-06-15"),
          postingBusinessDate: new Date("2025-06-15"),
          currency: CURRENCY,
          status: "POSTED",
          makerId: opts.adminId,
          checkerId: opts.approverId !== opts.adminId ? opts.approverId : opts.adminId,
          cashAccountId: acct.id,
          portfolioId: opts.fund.id,
          postedAt: new Date(),
          version: 1,
          lines: {
            create: [
              {
                ledgerAccountCode: "CASH",
                cashAccountId: acct.id,
                debit: new Decimal(spec.opening),
                credit: new Decimal(0),
                signedCashAmount: new Decimal(spec.opening),
                currency: CURRENCY,
                description: `${spec.code} opening balance`,
                matchStatus: "UNMATCHED",
              },
              {
                ledgerAccountCode: "OPENING_EQUITY",
                debit: new Decimal(0),
                credit: new Decimal(spec.opening),
                signedCashAmount: new Decimal(0),
                currency: CURRENCY,
                description: "Opening equity balancing line",
                matchStatus: null,
              },
            ],
          },
        },
      });
    }

    const moveKey = `seed:purpose-move:${spec.code}:${opts.fund.id.slice(0, 8)}`;
    const moveAmt = new Decimal(spec.movement);
    const absMove = moveAmt.abs();
    if (!(await prisma.spCashJournal.findFirst({ where: { idempotencyKey: moveKey } }))) {
      await prisma.spCashJournal.create({
        data: {
          sourceSystem: "SEED",
          sourceEventId: `MOVE-${spec.code}-${opts.fund.id.slice(0, 8)}`,
          postingPurpose: spec.code === "TRADING" ? "TRADE_SETTLEMENT" : "CAPITAL_CALL",
          idempotencyKey: moveKey,
          valueDate: new Date(),
          settlementDate: new Date(),
          postingBusinessDate: new Date(),
          currency: CURRENCY,
          status: "POSTED",
          makerId: opts.adminId,
          checkerId: opts.approverId !== opts.adminId ? opts.approverId : opts.adminId,
          cashAccountId: acct.id,
          portfolioId: opts.fund.id,
          postedAt: new Date(),
          version: 1,
          lines: {
            create: [
              {
                ledgerAccountCode: "CASH",
                cashAccountId: acct.id,
                debit: moveAmt.gt(0) ? absMove : new Decimal(0),
                credit: moveAmt.lt(0) ? absMove : new Decimal(0),
                signedCashAmount: moveAmt,
                currency: CURRENCY,
                description: spec.movementDesc,
                matchStatus: "UNMATCHED",
              },
              {
                ledgerAccountCode: spec.code === "TRADING" ? "TRADE_PAYABLE" : "CAPITAL_RECEIVED",
                debit: moveAmt.lt(0) ? absMove : new Decimal(0),
                credit: moveAmt.gt(0) ? absMove : new Decimal(0),
                signedCashAmount: new Decimal(0),
                currency: CURRENCY,
                description: `${spec.code} offset`,
                matchStatus: null,
              },
            ],
          },
        },
      });
    }
  }
  console.log(`[ok] purpose-tagged TRADING + FUND cash accounts and ledger lines`);
}

/** OPEN / INVESTIGATING reconciliation exceptions for walkthrough resolve flow. */
async function ensureWalkthroughReconExceptions(opts: {
  fund: { id: string; name: string };
  cashAccountId: string;
  batchId: string;
  adminId: string;
}) {
  const specs = [
    {
      source: "SEED_WALKTHROUGH:EX-1",
      category: "TIMING",
      severity: "MEDIUM",
      status: "OPEN",
      amount: "200",
      counterparty: "CBZ Custody",
    },
    {
      source: "SEED_WALKTHROUGH:EX-2",
      category: "AMOUNT",
      severity: "HIGH",
      status: "INVESTIGATING",
      amount: "1250",
      counterparty: "Imara Edwards",
    },
    {
      source: "SEED_WALKTHROUGH:EX-3",
      category: "MISSING",
      severity: "LOW",
      status: "OPEN",
      amount: "75",
      counterparty: "Internal transfer",
    },
  ] as const;

  for (const spec of specs) {
    let row = await prisma.spCashReconciliationException.findFirst({
      where: { source: spec.source, cashAccountId: opts.cashAccountId },
    });
    const data = {
      batchId: opts.batchId,
      cashAccountId: opts.cashAccountId,
      clientOrVehicleId: `vehicle:${opts.fund.id}`,
      category: spec.category,
      severity: spec.severity,
      status: spec.status,
      amountTxn: new Decimal(spec.amount),
      currencyTxn: CURRENCY,
      assignedToId: opts.adminId,
      source: spec.source,
      counterparty: spec.counterparty,
    };
    if (!row) {
      row = await prisma.spCashReconciliationException.create({
        data: { ...data, version: 1 },
      });
    } else {
      row = await prisma.spCashReconciliationException.update({
        where: { id: row.id },
        data: { ...data, version: row.version + 1 },
      });
    }

    // Linked break so /reconciliation-breaks/:id/mark-reviewed works with exception or break id.
    if (opts.batchId) {
      const existingBreak = await prisma.spCashReconciliationBreak.findFirst({
        where: { exceptionId: row.id },
      });
      if (!existingBreak) {
        await prisma.spCashReconciliationBreak.create({
          data: {
            batchId: opts.batchId,
            breakCode: `EXC_${spec.category}`,
            category: spec.category,
            details: `Walkthrough break linked to ${spec.source}`,
            amount: new Decimal(spec.amount),
            currency: CURRENCY,
            status: "OPEN",
            exceptionId: row.id,
            version: 1,
          },
        });
      }
    }

    const timelineKey = `${spec.source}:OPENED`;
    if (
      !(await prisma.spCashExceptionTimeline.findFirst({
        where: { exceptionId: row.id, eventType: "OPENED" },
      }))
    ) {
      await prisma.spCashExceptionTimeline.create({
        data: {
          exceptionId: row.id,
          eventType: "OPENED",
          actorId: opts.adminId,
          notes: `Walkthrough seed — ${spec.category} variance detected`,
        },
      });
    }
    if (
      spec.status === "INVESTIGATING" &&
      !(await prisma.spCashExceptionTimeline.findFirst({
        where: { exceptionId: row.id, eventType: "INVESTIGATION_STARTED" },
      }))
    ) {
      await prisma.spCashExceptionTimeline.create({
        data: {
          exceptionId: row.id,
          eventType: "INVESTIGATION_STARTED",
          actorId: opts.adminId,
          notes: "Assigned for broker statement review",
        },
      });
    }
  }
  console.log(`[ok] walkthrough recon exceptions (OPEN/INVESTIGATING)`);
}

async function ensureMarketDataBatch(_adminId: string) {
  let config = await prisma.listedEquityMarketDataSourceConfig.findFirst({
    where: { sourceCode: "SEED_EOD" },
  });
  if (!config) {
    config = await prisma.listedEquityMarketDataSourceConfig.create({
      data: {
        sourceCode: "SEED_EOD",
        displayName: "Seed EOD Prices",
        isEnabled: true,
      },
    });
  }
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);
  let batch = await prisma.listedEquityMarketDataIngestBatch.findFirst({
    where: { sourceCode: "SEED_EOD", asOfDate: asOf },
  });
  if (!batch) {
    batch = await prisma.listedEquityMarketDataIngestBatch.create({
      data: {
        sourceType: "EOD",
        sourceCode: "SEED_EOD",
        asOfDate: asOf,
        sha256Checksum: sha("seed-ingest-batch-zse"),
        recordCount: EQUITIES.length,
        status: "COMPLETED",
        sourceStatus: "OK",
      },
    });
  }
  console.log(`[ok] market data ingest batch ${batch.id}`);
}

const LP_DEMO_MARKER = "IO-V2-DEMO";

type LpSeedClient = {
  investorId: string;
  email: string;
  legalName: string;
  commitment: number;
};

const LP_FULL_ROSTER: LpSeedClient[] = [
  {
    investorId: "LP-IOV2-HPF",
    email: "lp-harare-pension@arcus.co.zw",
    legalName: "Harare Pension Fund Trustees",
    commitment: 5_000_000,
  },
  {
    investorId: "LP-IOV2-NSSA",
    email: "lp-nssa-equity@arcus.co.zw",
    legalName: "NSSA Equity Sleeve",
    commitment: 10_000_000,
  },
  {
    investorId: "LP-IOV2-ZAM",
    email: "lp-zambezi-inst@arcus.co.zw",
    legalName: "Zambezi Institutional Investors",
    commitment: 2_500_000,
  },
];

const LP_LITE_ROSTER: LpSeedClient[] = [
  {
    investorId: "LP-IOV2-SLEEVE",
    email: "lp-inst-sleeve@arcus.co.zw",
    legalName: "Arcus Institutional Sleeve LP",
    commitment: 1_000_000,
  },
];

async function ensureLpClient(fixture: LpSeedClient) {
  let client = await prisma.client.findFirst({
    where: { OR: [{ investorId: fixture.investorId }, { email: fixture.email }] },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        investorId: fixture.investorId,
        type: "institutional",
        legalName: fixture.legalName,
        email: fixture.email,
        country: "ZW",
        status: "ACTIVE",
      },
    });
  } else {
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        investorId: fixture.investorId,
        legalName: fixture.legalName,
        email: fixture.email,
        country: "ZW",
        status: "ACTIVE",
        type: "institutional",
      },
    });
  }
  return client;
}

async function ensureLpCommitment(clientId: string, fundId: string, amount: number) {
  return prisma.investmentCommitment.upsert({
    where: { clientId_fundId: { clientId, fundId } },
    create: {
      clientId,
      fundId,
      amount: new Decimal(amount),
      currency: "USD",
      effectiveDate: new Date("2024-06-01"),
      status: "ACTIVE",
      notes: LP_DEMO_MARKER,
    },
    update: {
      amount: new Decimal(amount),
      status: "ACTIVE",
      currency: "USD",
      notes: LP_DEMO_MARKER,
    },
  });
}

async function ensureFundFeePolicy(fundId: string) {
  await prisma.fund.update({
    where: { id: fundId },
    data: {
      managementFeeRate: new Decimal("0.0150"),
      managementFeeBase: "COMMITTED",
      managementFeeFrequency: "QUARTERLY",
      managementFeeStartDate: new Date("2024-01-01"),
      carryRate: new Decimal("0.10"),
      hurdleRate: new Decimal("0.08"),
    },
  });
}

function lpShare(total: number, part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((total * part) / whole * 100) / 100;
}

/** Capital calls, distributions, management fees for Fund Cash tabs (`/funds/:id/...`). */
async function ensureLpFundCash(opts: {
  fundId: string;
  fundName: string;
  currencyId: string;
  adminId: string;
  full?: boolean;
}) {
  const roster = opts.full ? LP_FULL_ROSTER : LP_LITE_ROSTER;
  await ensureFundFeePolicy(opts.fundId);

  const lpRows: Array<{
    clientId: string;
    commitmentId: string;
    legalName: string;
    commitment: number;
  }> = [];
  for (const lp of roster) {
    const client = await ensureLpClient(lp);
    const commit = await ensureLpCommitment(client.id, opts.fundId, lp.commitment);
    lpRows.push({
      clientId: client.id,
      commitmentId: commit.id,
      legalName: lp.legalName,
      commitment: lp.commitment,
    });
  }

  const totalCommitment = lpRows.reduce((s, r) => s + r.commitment, 0);
  const ccMarker1 = `${LP_DEMO_MARKER}|CC1|${opts.fundId.slice(0, 8)}`;
  const ccMarker2 = `${LP_DEMO_MARKER}|CC2|${opts.fundId.slice(0, 8)}`;
  const distMarker1 = `${LP_DEMO_MARKER}|DIST1|${opts.fundId.slice(0, 8)}`;
  const distMarker2 = `${LP_DEMO_MARKER}|DIST2|${opts.fundId.slice(0, 8)}`;
  const feeMarker1 = `${LP_DEMO_MARKER}|FEE-Q1-2026|${opts.fundId.slice(0, 8)}`;
  const feeMarker2 = `${LP_DEMO_MARKER}|FEE-Q4-2025|${opts.fundId.slice(0, 8)}`;

  const due = new Date();
  due.setDate(due.getDate() + 21);
  const wiring = (ref: string) =>
    JSON.stringify({
      marker: LP_DEMO_MARKER,
      bankName: "CBZ Bank",
      accountName: opts.fundName,
      accountNumber: "****4821",
      reference: ref,
    });

  // Capital call 1 — notices sent, one LP partially paid
  let cc1 = await prisma.capitalCall.findFirst({
    where: { fundId: opts.fundId, bankInstructions: { contains: ccMarker1 } },
  });
  const call1Pct = opts.full ? 0.05 : 0.03;
  if (!cc1) {
    cc1 = await prisma.capitalCall.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        callPercent: new Decimal(String(call1Pct)),
        paymentDueDate: due,
        bankInstructions: wiring(ccMarker1),
        transactionDate: new Date(),
        status: "NOTICES_SENT",
        noticesSentAt: new Date(),
        createdById: opts.adminId,
      },
    });
  } else {
    cc1 = await prisma.capitalCall.update({
      where: { id: cc1.id },
      data: { status: "NOTICES_SENT", noticesSentAt: cc1.noticesSentAt || new Date() },
    });
  }

  for (const row of lpRows) {
    const callAmt = lpShare(totalCommitment * call1Pct, row.commitment, totalCommitment);
    const uncalled = row.commitment * 0.55;
    let alloc = await prisma.capitalCallAllocation.findFirst({
      where: { capitalCallId: cc1.id, clientId: row.clientId },
    });
    const isFirst = row.clientId === lpRows[0]?.clientId;
    const paid = isFirst && opts.full ? callAmt * 0.5 : 0;
    const status = paid > 0 ? (paid < callAmt ? "PARTIALLY_PAID" : "PAID") : "PENDING";
    if (!alloc) {
      alloc = await prisma.capitalCallAllocation.create({
        data: {
          capitalCallId: cc1.id,
          clientId: row.clientId,
          investmentCommitmentId: row.commitmentId,
          lpLegalNameSnapshot: row.legalName,
          totalCommitmentSnapshot: new Decimal(row.commitment),
          uncalledCapitalBeforeSnapshot: new Decimal(uncalled),
          currentCallAmount: new Decimal(callAmt),
          amountPaid: new Decimal(paid),
          status,
        },
      });
    } else {
      alloc = await prisma.capitalCallAllocation.update({
        where: { id: alloc.id },
        data: {
          currentCallAmount: new Decimal(callAmt),
          amountPaid: new Decimal(paid),
          status,
          investmentCommitmentId: row.commitmentId,
        },
      });
    }
    if (paid > 0 && opts.full && isFirst) {
      const existingPay = await prisma.capitalCallAllocationPayment.findFirst({
        where: { capitalCallAllocationId: alloc.id },
      });
      if (!existingPay) {
        await prisma.capitalCallAllocationPayment.create({
          data: {
            capitalCallAllocationId: alloc.id,
            amount: new Decimal(paid),
            recordedAt: new Date(Date.now() - 3 * 86400000),
          },
        });
      }
    }
  }

  // Capital call 2 — initiated (draft notices)
  let cc2 = await prisma.capitalCall.findFirst({
    where: { fundId: opts.fundId, bankInstructions: { contains: ccMarker2 } },
  });
  const call2Pct = 0.02;
  if (!cc2) {
    cc2 = await prisma.capitalCall.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        callPercent: new Decimal(String(call2Pct)),
        paymentDueDate: new Date(Date.now() + 45 * 86400000),
        bankInstructions: wiring(ccMarker2),
        transactionDate: new Date(),
        status: "INITIATED",
        createdById: opts.adminId,
      },
    });
    for (const row of lpRows) {
      const callAmt = lpShare(totalCommitment * call2Pct, row.commitment, totalCommitment);
      await prisma.capitalCallAllocation.create({
        data: {
          capitalCallId: cc2.id,
          clientId: row.clientId,
          investmentCommitmentId: row.commitmentId,
          lpLegalNameSnapshot: row.legalName,
          totalCommitmentSnapshot: new Decimal(row.commitment),
          uncalledCapitalBeforeSnapshot: new Decimal(row.commitment * 0.48),
          currentCallAmount: new Decimal(callAmt),
          amountPaid: new Decimal(0),
          status: "PENDING",
        },
      });
    }
  }

  // Distribution 1 — dividend, notices sent
  let dist1 = await prisma.distribution.findFirst({
    where: { fundId: opts.fundId, notes: { contains: distMarker1 } },
  });
  const gross1 = opts.full ? 350_000 : 75_000;
  const carry1 = opts.full ? 35_000 : 0;
  const net1 = gross1 - carry1;
  if (!dist1) {
    dist1 = await prisma.distribution.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        distributionDate: new Date("2026-03-31"),
        source: "DIVIDEND",
        grossAmount: new Decimal(gross1),
        carryAmount: new Decimal(carry1),
        netToLPs: new Decimal(net1),
        status: "NOTICES_SENT",
        noticesSentAt: new Date(),
        notes: distMarker1,
        createdById: opts.adminId,
      },
    });
  }
  for (const row of lpRows) {
    const paidIn = row.commitment * 0.4;
    const share = lpShare(net1, paidIn, totalCommitment * 0.4);
    const existing = await prisma.distributionAllocation.findFirst({
      where: { distributionId: dist1!.id, clientId: row.clientId },
    });
    if (!existing) {
      await prisma.distributionAllocation.create({
        data: {
          distributionId: dist1!.id,
          clientId: row.clientId,
          investmentCommitmentId: row.commitmentId,
          lpLegalNameSnapshot: row.legalName,
          commitmentSnapshot: new Decimal(row.commitment),
          paidInSnapshot: new Decimal(paidIn),
          shareAmount: new Decimal(share),
          amountPaid: new Decimal(0),
          status: "PENDING",
        },
      });
    }
  }

  // Distribution 2 — exit proceeds, partially paid (full book only)
  if (opts.full) {
    let dist2 = await prisma.distribution.findFirst({
      where: { fundId: opts.fundId, notes: { contains: distMarker2 } },
    });
    if (!dist2) {
      dist2 = await prisma.distribution.create({
        data: {
          fundId: opts.fundId,
          currencyId: opts.currencyId,
          distributionDate: new Date("2025-12-15"),
          source: "EXIT_PROCEEDS",
          grossAmount: new Decimal(120_000),
          carryAmount: new Decimal(12_000),
          netToLPs: new Decimal(108_000),
          status: "PARTIALLY_PAID",
          notes: distMarker2,
          createdById: opts.adminId,
        },
      });
      const first = lpRows[0];
      const share = lpShare(108_000, first.commitment * 0.4, totalCommitment * 0.4);
      const paid = share * 0.6;
      const alloc = await prisma.distributionAllocation.create({
        data: {
          distributionId: dist2.id,
          clientId: first.clientId,
          investmentCommitmentId: first.commitmentId,
          lpLegalNameSnapshot: first.legalName,
          commitmentSnapshot: new Decimal(first.commitment),
          paidInSnapshot: new Decimal(first.commitment * 0.4),
          shareAmount: new Decimal(share),
          amountPaid: new Decimal(paid),
          status: "PARTIALLY_PAID",
        },
      });
      await prisma.distributionAllocationPayment.create({
        data: {
          distributionAllocationId: alloc.id,
          amount: new Decimal(paid),
          recordedAt: new Date("2025-12-20"),
        },
      });
    }
  }

  // Management fee Q1 2026 — accrued
  const q1Fee = Math.round(totalCommitment * 0.015 * (90 / 365) * 100) / 100;
  let fee1 = await prisma.managementFeePeriod.findFirst({
    where: { fundId: opts.fundId, notes: { contains: feeMarker1 } },
  });
  if (!fee1) {
    fee1 = await prisma.managementFeePeriod.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-03-31"),
        feeBase: "COMMITTED",
        feeBaseAmount: new Decimal(totalCommitment),
        rate: new Decimal("0.0150"),
        totalFee: new Decimal(q1Fee),
        status: "ACCRUED",
        notes: feeMarker1,
        createdById: opts.adminId,
        allocations: {
          create: lpRows.map((row) => ({
            clientId: row.clientId,
            investmentCommitmentId: row.commitmentId,
            lpLegalNameSnapshot: row.legalName,
            commitmentSnapshot: new Decimal(row.commitment),
            shareOfFee: new Decimal(lpShare(q1Fee, row.commitment, totalCommitment)),
            amountPaid: new Decimal(0),
            status: "PENDING",
          })),
        },
      },
    });
  }

  // Management fee Q4 2025 — invoiced, partial payment on first LP
  const q4Fee = Math.round(totalCommitment * 0.015 * (92 / 365) * 100) / 100;
  let fee2 = await prisma.managementFeePeriod.findFirst({
    where: { fundId: opts.fundId, notes: { contains: feeMarker2 } },
  });
  if (!fee2) {
    fee2 = await prisma.managementFeePeriod.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        periodStart: new Date("2025-10-01"),
        periodEnd: new Date("2025-12-31"),
        feeBase: "COMMITTED",
        feeBaseAmount: new Decimal(totalCommitment),
        rate: new Decimal("0.0150"),
        totalFee: new Decimal(q4Fee),
        status: "INVOICED",
        invoicesSentAt: new Date("2026-01-05"),
        notes: feeMarker2,
        createdById: opts.adminId,
      },
    });
    for (const [idx, row] of lpRows.entries()) {
      const share = lpShare(q4Fee, row.commitment, totalCommitment);
      const paid = idx === 0 ? share * 0.5 : 0;
      const status = paid > 0 ? "PARTIALLY_PAID" : "PENDING";
      const alloc = await prisma.managementFeeAllocation.create({
        data: {
          managementFeePeriodId: fee2!.id,
          clientId: row.clientId,
          investmentCommitmentId: row.commitmentId,
          lpLegalNameSnapshot: row.legalName,
          commitmentSnapshot: new Decimal(row.commitment),
          shareOfFee: new Decimal(share),
          amountPaid: new Decimal(paid),
          status,
        },
      });
      if (paid > 0) {
        await prisma.managementFeeAllocationPayment.create({
          data: {
            managementFeeAllocationId: alloc.id,
            amount: new Decimal(paid),
            recordedAt: new Date("2026-01-10"),
          },
        });
      }
    }
  }

  // Fund-cash documents (investment docs bucket)
  const fundCashDocs = opts.full
    ? [
        { title: "Capital Call Notice — CC1", type: "CAPITAL_CALL_NOTICE", file: "cc-notice-1.pdf" },
        { title: "Q1 2026 Distribution Notice", type: "DISTRIBUTION_NOTICE", file: "dist-q1.pdf" },
        { title: "Management Fee Invoice — Q4 2025", type: "MANAGEMENT_FEE_INVOICE", file: "mfee-q4.pdf" },
        { title: "LP Subscription Agreement — HPF", type: "SUBSCRIPTION", file: "sub-hpf.pdf" },
      ]
    : [{ title: "Capital Call Notice — Sleeve", type: "CAPITAL_CALL_NOTICE", file: "cc-sleeve.pdf" }];
  for (const d of fundCashDocs) {
    if (await prisma.investmentDocument.findFirst({ where: { fundId: opts.fundId, title: d.title } }))
      continue;
    const fileRef = `storage/local-upload-mock/investment-ops-fund-cash/${opts.fundId}/${d.file}`;
    await writeSeedMockFile(fileRef, `%PDF-1.4\n% Fund cash document: ${d.title}\n`);
    await prisma.investmentDocument.create({
      data: {
        fundId: opts.fundId,
        documentType: d.type,
        title: d.title,
        fileRef,
        checksumSha256: sha(fileRef),
        classification: "CONFIDENTIAL",
        approvalStatus: "APPROVED",
        uploadedById: opts.adminId,
      },
    });
  }

  console.log(
    `[ok] LP fund cash ${opts.fundName}: LPs=${lpRows.length} CC=2 dist=${opts.full ? 2 : 1} fees=2`
  );
}

async function ensureExtraPortfolios(opts: {
  adminId: string;
  bankId: string | null;
  brokerId: string;
  custodianId: string;
  securityBySymbol: Record<string, string>;
  instrumentBySymbol: Record<string, string>;
}) {
  const fundIds: string[] = [];
  for (const pf of EXTRA_PORTFOLIOS) {
    const { fund, cfg } = await ensureListedFund({
      name: pf.name,
      description: pf.description,
      adminId: opts.adminId,
      bankId: opts.bankId,
      brokerId: opts.brokerId,
      custodianId: opts.custodianId,
    });
    fundIds.push(fund.id);

    const holdMeta: Array<{
      securityId: string;
      instrumentId: string;
      qty: number;
      price: number;
      wac: number;
      currency: string;
    }> = [];
    for (const h of pf.holdings) {
      await ensureHolding(fund.id, opts.securityBySymbol[h.symbol], h.qty, h.wac);
      holdMeta.push({
        securityId: opts.securityBySymbol[h.symbol],
        instrumentId: opts.instrumentBySymbol[h.symbol],
        qty: h.qty,
        price: h.price,
        wac: h.wac,
        currency: "USD",
      });
    }
    await ensureValuationWithItems(
      fund.id,
      opts.adminId,
      holdMeta,
      `seed-val-run-${fund.id.slice(0, 8)}`
    );
    await ensurePortfolioFolders(fund.id, cfg.id, opts.adminId, [
      { path: "/Listed Equities", name: "Listed Equities", sortOrder: 1 },
      { path: "/Listed Equities/Core Holdings", name: "Core Holdings", sortOrder: 2 },
      { path: "/Compliance & Legal", name: "Compliance & Legal", sortOrder: 3 },
    ]);
    const snapNav = holdMeta.reduce((s, h) => s + h.qty * h.price, 0);
    await prisma.listedEquityValuationSnapshot.create({
      data: {
        fundId: fund.id,
        asOf: new Date(),
        navBaseCurrency: new Decimal(snapNav),
        unrealizedPnlUsd: new Decimal(snapNav * 0.08),
        status: "OK",
      },
    }).catch(() => {});
  }
  console.log(`[ok] extra portfolios=${EXTRA_PORTFOLIOS.length} ids=${fundIds.join(", ")}`);
  return fundIds;
}

async function ensureComplianceResultsForOrders(opts: {
  fundId: string;
  orderIds: string[];
  adminId: string;
}) {
  const rules = await prisma.investmentComplianceRule.findMany({
    where: { fundId: opts.fundId, isActive: true },
    take: 2,
  });
  if (!rules.length) return;

  for (const [idx, orderId] of opts.orderIds.slice(0, 6).entries()) {
    const order = await prisma.investmentOrder.findUnique({
      where: { id: orderId },
      select: { id: true, orderRef: true, currentRevisionNo: true },
    });
    if (!order) continue;
    const rule = rules[idx % rules.length];
    const threshold = rule.thresholdValue != null ? Number(rule.thresholdValue) : 25;
    const unit = rule.thresholdUnit === "PCT" ? "%" : "";
    const failed = idx % 2 === 1;
    const snapshot = {
      seed: true,
      revisionNo: order.currentRevisionNo || 1,
      display: {
        limitDisplay: `${threshold}${unit}`,
        currentDisplay: failed ? `${Math.max(0, threshold - 3)}${unit}` : `${Math.max(0, threshold - 8)}${unit}`,
        afterTradeDisplay: failed ? `${threshold + 4}${unit}` : `${Math.max(0, threshold - 5)}${unit}`,
      },
      checks: [
        {
          ruleId: rule.id,
          outcome: failed ? "FAILED" : "PASSED",
          limitDisplay: `${threshold}${unit}`,
          currentDisplay: failed ? `${Math.max(0, threshold - 3)}${unit}` : `${Math.max(0, threshold - 8)}${unit}`,
          afterTradeDisplay: failed ? `${threshold + 4}${unit}` : `${Math.max(0, threshold - 5)}${unit}`,
        },
      ],
    };

    let run = await prisma.investmentComplianceRun.findFirst({
      where: { idempotencyKey: `seed-compliance-run-${orderId.slice(0, 8)}` },
    });
    if (!run) {
      run = await prisma.investmentComplianceRun.create({
        data: {
          fundId: opts.fundId,
          orderId,
          runType: "PRE_TRADE",
          status: "COMPLETED",
          ruleSetVersion: 1,
          inputSnapshot: snapshot,
          idempotencyKey: `seed-compliance-run-${orderId.slice(0, 8)}`,
          startedById: opts.adminId,
          completedAt: new Date(),
        },
      });
    } else {
      run = await prisma.investmentComplianceRun.update({
        where: { id: run.id },
        data: { inputSnapshot: snapshot },
      });
    }

    let result = await prisma.investmentComplianceResult.findFirst({
      where: { orderId, ruleId: rule.id },
    });
    if (!result) {
      result = await prisma.investmentComplianceResult.create({
        data: {
          orderId,
          ruleId: rule.id,
          complianceRunId: run.id,
          outcome: failed ? "FAILED" : "PASSED",
          message: failed
            ? `Projected weight exceeds ${threshold}${unit} single-name limit`
            : "Within mandate limits",
        },
      });
    } else {
      await prisma.investmentComplianceResult.update({
        where: { id: result.id },
        data: {
          complianceRunId: run.id,
          outcome: failed ? "FAILED" : "PASSED",
          message: failed
            ? `Projected weight exceeds ${threshold}${unit} single-name limit`
            : "Within mandate limits",
        },
      });
    }
  }

  // Dedicated walkthrough FAILED row with no pending override (Request override demo).
  const overrideDemoOrder =
    (await prisma.investmentOrder.findFirst({ where: { orderRef: "ALP-ORD-SENT-SEED" } })) ||
    (await prisma.investmentOrder.findFirst({ where: { orderRef: "ALP-ORD-SENT-BAT" } }));
  const maxRule = await prisma.investmentComplianceRule.findFirst({
    where: { fundId: opts.fundId, ruleCode: "MAX_SINGLE_NAME_25" },
  });
  if (overrideDemoOrder && maxRule) {
    const key = `seed-compliance-run-override-demo`;
    let run = await prisma.investmentComplianceRun.findFirst({ where: { idempotencyKey: key } });
    const snapshot = {
      seed: true,
      healed: true,
      revisionNo: overrideDemoOrder.currentRevisionNo || 1,
      display: {
        limitDisplay: "25%",
        currentDisplay: "18%",
        afterTradeDisplay: "29%",
      },
      checks: [
        {
          ruleId: maxRule.id,
          outcome: "FAILED",
          limitDisplay: "25%",
          currentDisplay: "18%",
          afterTradeDisplay: "29%",
        },
      ],
    };
    if (!run) {
      run = await prisma.investmentComplianceRun.create({
        data: {
          fundId: opts.fundId,
          orderId: overrideDemoOrder.id,
          runType: "PRE_TRADE",
          status: "COMPLETED",
          ruleSetVersion: 1,
          inputSnapshot: snapshot,
          idempotencyKey: key,
          startedById: opts.adminId,
          completedAt: new Date(),
        },
      });
    } else {
      run = await prisma.investmentComplianceRun.update({
        where: { id: run.id },
        data: { orderId: overrideDemoOrder.id, inputSnapshot: snapshot },
      });
    }
    let result = await prisma.investmentComplianceResult.findFirst({
      where: { orderId: overrideDemoOrder.id, ruleId: maxRule.id, complianceRunId: run.id },
    });
    if (!result) {
      result = await prisma.investmentComplianceResult.findFirst({
        where: { orderId: overrideDemoOrder.id, ruleId: maxRule.id },
      });
    }
    if (!result) {
      result = await prisma.investmentComplianceResult.create({
        data: {
          orderId: overrideDemoOrder.id,
          ruleId: maxRule.id,
          complianceRunId: run.id,
          outcome: "FAILED",
          message: "Walkthrough: projected weight 29% exceeds 25% — request override",
        },
      });
    } else {
      await prisma.investmentComplianceResult.update({
        where: { id: result.id },
        data: {
          complianceRunId: run.id,
          outcome: "FAILED",
          message: "Walkthrough: projected weight 29% exceeds 25% — request override",
        },
      });
    }
    // Ensure no leftover PENDING override blocks the demo button.
    await prisma.investmentComplianceOverride.deleteMany({
      where: { complianceResultId: result.id, status: "PENDING", reasonCode: "CLIENT_OVERRIDE_DEMO" },
    });
  }

  console.log(`[ok] compliance results for walkthrough (incl. override-demo FAILED)`);
}

async function ensureTransactionsFromTrades(fundId: string) {
  const trades = await prisma.listedEquityTrade.findMany({
    where: { fundId, status: "SETTLED" },
    orderBy: { executedAt: "desc" },
  });
  let n = 0;
  for (const t of trades) {
    const key = `seed-txn-${t.tradeRef}`;
    const order = await prisma.investmentOrder.findFirst({ where: { tradeId: t.id } });
    const instrument = await prisma.investmentInstrument.findFirst({
      where: { listedEquitySecurityId: t.securityId },
      select: { id: true },
    });
    const existing = await prisma.investmentTransaction.findFirst({ where: { idempotencyKey: key } });
    if (existing) {
      if (!existing.instrumentId || !existing.orderId) {
        await prisma.investmentTransaction.update({
          where: { id: existing.id },
          data: {
            instrumentId: existing.instrumentId ?? instrument?.id ?? null,
            orderId: existing.orderId ?? order?.id ?? null,
          },
        });
        n++;
      }
      continue;
    }
    const amt = Number(t.quantity) * Number(t.executionPrice);
    await prisma.investmentTransaction.create({
      data: {
        transactionRef: t.tradeRef,
        fundId,
        orderId: order?.id ?? null,
        instrumentId: instrument?.id ?? null,
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
  }>,
  idempotencyKey = "seed-val-run-primary"
) {
  let run = await prisma.investmentValuationRun.findFirst({
    where: { fundId, idempotencyKey },
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
        idempotencyKey,
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
  const order = await prisma.investmentOrder.findUnique({
    where: { id: opts.orderId },
    select: { currentRevisionNo: true },
  });
  const snapshot = {
    seed: true,
    revisionNo: order?.currentRevisionNo || 1,
    display: {
      limitDisplay: "25%",
      currentDisplay: "22%",
      afterTradeDisplay: "28%",
    },
    checks: [
      {
        ruleId: rule.id,
        outcome: "FAILED",
        limitDisplay: "25%",
        currentDisplay: "22%",
        afterTradeDisplay: "28%",
      },
    ],
  };
  if (!run) {
    run = await prisma.investmentComplianceRun.create({
      data: {
        fundId: opts.fundId,
        orderId: opts.orderId,
        runType: "PRE_TRADE",
        status: "COMPLETED",
        ruleSetVersion: 1,
        inputSnapshot: snapshot,
        idempotencyKey: "seed-compliance-run-approved-dlta",
        startedById: opts.adminId,
        completedAt: new Date(),
      },
    });
  } else {
    run = await prisma.investmentComplianceRun.update({
      where: { id: run.id },
      data: { inputSnapshot: snapshot },
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
        outcome: "FAILED",
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
    { title: "July 2026 Valuation Pack", type: "VALUATION_PACK", file: "valuation-jul-2026.pdf" },
    { title: "Legal Opinion — Exchange Control", type: "LEGAL", file: "legal-opinion.pdf" },
    { title: "Client Custom Investment Instruction", type: "CUSTOM_INSTRUCTION", file: "custom-instruction.pdf" },
    { title: "Board Resolution — Mandate Amendment", type: "BOARD_RESOLUTION", file: "board-res.pdf" },
    { title: "Custodian Statement — Q2 2026", type: "CUSTODIAN_STATEMENT", file: "custodian-q2.pdf" },
  ];
  for (const d of docs) {
    if (await prisma.investmentDocument.findFirst({ where: { fundId, title: d.title } })) continue;
    const fileRef = `storage/local-upload-mock/investment-ops-docs/seed/${fundId}/${d.file}`;
    await writeSeedMockFile(fileRef, `%PDF-1.4\n% Demo document: ${d.title}\n`);
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
    { name: "DLTA overweight scenario", key: "seed-sim-dlta-over" },
    { name: "Rate shock + FX stress", key: "seed-sim-fx-stress" },
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

  for (const [name, strategy, weights] of [
    [
      "Arcus Income Model",
      "INCOME",
      [
        ["DLTA", 30],
        ["BAT", 25],
        ["INN", 20],
        ["CBZ", 15],
        ["FBC", 10],
      ],
    ],
    [
      "Arcus Defensive Model",
      "DEFENSIVE",
      [
        ["BAT", 35],
        ["INN", 25],
        ["SEED", 20],
        ["OKZ", 20],
      ],
    ],
  ] as const) {
    let extra = await prisma.investmentModelPortfolio.findFirst({ where: { name } });
    if (!extra) {
      extra = await prisma.investmentModelPortfolio.create({
        data: {
          name,
          strategyCode: strategy,
          baseCurrencyCode: "USD",
          linkedFundId: fundId,
          isActive: true,
        },
      });
    }
    await prisma.investmentModelPortfolioAllocation.deleteMany({
      where: { modelPortfolioId: extra.id },
    });
    for (const [sym, w] of weights) {
      await prisma.investmentModelPortfolioAllocation.create({
        data: {
          modelPortfolioId: extra.id,
          allocationType: "INSTRUMENT",
          allocationKey: sym,
          targetWeightPct: new Decimal(w),
        },
      });
    }
  }
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
  let layout = await prisma.spCashFileLayout.findFirst({
    where: { providerId: provider.id, layoutCode: "CBZ_CSV_V1" },
  });
  const layoutData = {
    providerId: provider.id,
    layoutCode: "CBZ_CSV_V1",
    versionNo: 1,
    signMapJson: { Debit: "NEGATIVE", Credit: "POSITIVE" },
    dateMapJson: {
      valueDate: "value_date",
      tradeDate: "trade_date",
      // Documented CBZ_CSV_V1 columns for FE demo templates
      columns: [
        "value_date",
        "trade_date",
        "amount",
        "debit_credit",
        "reference",
        "counterparty",
        "description",
      ],
      alternateColumns: ["debit_amount", "credit_amount"],
    },
    status: "ACTIVE",
    effectiveFrom: new Date("2020-01-01"),
  };
  if (!layout) {
    layout = await prisma.spCashFileLayout.create({ data: layoutData });
  } else {
    layout = await prisma.spCashFileLayout.update({
      where: { id: layout.id },
      data: {
        signMapJson: layoutData.signMapJson,
        dateMapJson: layoutData.dateMapJson,
        status: "ACTIVE",
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
  await cleanupOrphanComplianceResults();

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
  await ensurePortfolioFolders(fund.id, cfg.id, admin.id, [
    { path: "/Listed Equities", name: "Listed Equities", sortOrder: 1 },
    { path: "/Listed Equities/Financials", name: "Financials", sortOrder: 2 },
    { path: "/Listed Equities/Telecoms", name: "Telecoms", sortOrder: 3 },
    { path: "/Compliance & Legal", name: "Compliance & Legal", sortOrder: 4 },
    { path: "/Valuation & Reporting", name: "Valuation & Reporting", sortOrder: 5 },
  ]);
  await ensureSetupCatalogs(admin.id);

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
  // Open blotter trades for orderbook → blotter deep-link (tradeId + orderId/orderRef).
  const tradePartialEco = await ensureRoutingTrade({
    fundId: fund.id,
    securityId: securityBySymbol.ECO,
    tradeRef: "ALP-TRADE-PARTIAL-ECO",
    side: "BUY",
    qty: 4000, // 40% of ALP-ORD-PARTIAL-ECO qty 10000
    price: 4.5,
    adminId: admin.id,
    status: "ROUTING",
  });
  const tradePendingSettleCbz = await ensureRoutingTrade({
    fundId: fund.id,
    securityId: securityBySymbol.CBZ,
    tradeRef: "ALP-TRADE-PENDING-SETTLE-CBZ",
    side: "BUY",
    qty: 600,
    price: 12.4,
    adminId: admin.id,
    status: "ROUTING",
  });
  const tradeSettledInn = await ensureSettledTrade({
    fundId: fund.id,
    securityId: securityBySymbol.INN,
    tradeRef: "ALP-TRADE-SETTLED-INN",
    side: "BUY",
    qty: 400,
    price: 41.5,
    fees: 25,
    when: new Date(Date.now() - 2 * 86400000),
    adminId: admin.id,
  });
  console.log(`[ok] trades settled=${SETTLED_TRADES.length} routing=2 lifecycleOpen=3`);

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
    {
      ref: "ALP-ORD-SETTLED-INN",
      symbol: "INN",
      side: "BUY" as const,
      qty: 400,
      price: 41.5,
      status: "SETTLED",
      tradeId: tradeSettledInn.id,
    },
    { ref: "ALP-ORD-SENT-BAT", symbol: "BAT", side: "BUY" as const, qty: 100, price: 84.0, status: "SENT_TO_BROKER" },
    { ref: "ALP-ORD-SENT-SEED", symbol: "SEED", side: "BUY" as const, qty: 500, price: 6.15, status: "SENT_TO_BROKER" },
    {
      ref: "ALP-ORD-PARTIAL-ECO",
      symbol: "ECO",
      side: "BUY" as const,
      qty: 10000,
      price: 4.5,
      status: "PARTIALLY_EXECUTED",
      tradeId: tradePartialEco.id,
    },
    {
      ref: "ALP-ORD-PENDING-SETTLE-CBZ",
      symbol: "CBZ",
      side: "BUY" as const,
      qty: 600,
      price: 12.4,
      status: "PENDING_SETTLEMENT",
      tradeId: tradePendingSettleCbz.id,
    },
    {
      ref: "ALP-ORD-FAILED-FBC",
      symbol: "FBC",
      side: "SELL" as const,
      qty: 300,
      price: 8.0,
      status: "FAILED",
    },
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
  const valRun = await ensureValuationWithItems(fund.id, admin.id, holdMeta);
  const fxApproved = await ensurePriceAndFxLifecycle(securityBySymbol, admin.id, approver.id);
  await ensureValuationInputs(valRun.id, holdMeta, fxApproved?.id);
  await ensureComplianceChain({
    fundId: fund.id,
    orderId: approvedOrderId || orderIds[2],
    adminId: admin.id,
    approverId: approver.id,
  });
  await ensureComplianceResultsForOrders({
    fundId: fund.id,
    orderIds,
    adminId: admin.id,
  });
  const firstTrade = await prisma.listedEquityTrade.findFirst({
    where: { fundId: fund.id, tradeRef: SETTLED_TRADES[0].ref },
  });
  if (firstTrade) {
    await ensureAccountingDemo({
      fundId: fund.id,
      adminId: admin.id,
      approverId: approver.id,
      tradeRef: firstTrade.tradeRef,
      tradeId: firstTrade.id,
      amount: Number(firstTrade.quantity) * Number(firstTrade.executionPrice),
    });
  }
  await ensureRecon(fund.id, admin.id);
  await ensureDocsReports(fund.id, admin.id, approvedOrderId || orderIds[0]);
  await ensureBlotters(fund.id, admin.id, orderIds);
  await ensureModelsAndSims(fund.id, admin.id, instrumentBySymbol);
  await ensurePriceQueue(securityBySymbol);
  const cash = await ensureSpCash(fund, admin.id);
  await ensureSpCashRich({
    fund,
    cashAccountId: cash.cash.id,
    adminId: admin.id,
    approverId: approver.id,
  });
  await ensurePurposeCashAccounts({
    fund,
    providerId: cash.provider.id,
    tolerancePolicyId: cash.cash.tolerancePolicyId,
    adminId: admin.id,
    approverId: approver.id,
  });
  const reconBatch = await prisma.spCashReconciliationBatch.findFirst({
    where: { cashAccountId: cash.cash.id, fundId: fund.id },
    orderBy: { createdAt: "desc" },
  });
  if (reconBatch) {
    await ensureWalkthroughReconExceptions({
      fund,
      cashAccountId: cash.cash.id,
      batchId: reconBatch.id,
      adminId: admin.id,
    });
  }
  await ensureMarketDataBatch(admin.id);
  const extraFundIds = await ensureExtraPortfolios({
    adminId: admin.id,
    bankId: bank?.id ?? null,
    brokerId: broker.id,
    custodianId: custodian.id,
    securityBySymbol,
    instrumentBySymbol,
  });

  const usd =
    (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { isActive: true } }));
  if (!usd) throw new Error("No active currency for LP fund-cash seed");
  await ensureLpFundCash({
    fundId: fund.id,
    fundName: fund.name,
    currencyId: usd.id,
    adminId: admin.id,
    full: true,
  });
  for (const efId of extraFundIds) {
    const ef = await prisma.fund.findUnique({ where: { id: efId }, select: { name: true } });
    await ensureLpFundCash({
      fundId: efId,
      fundName: ef?.name || "Arcus sleeve",
      currencyId: usd.id,
      adminId: admin.id,
      full: false,
    });
  }

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
    journalEntries: await prisma.journalEntry.count(),
    accountingReversals: await prisma.investmentAccountingReversal.count(),
    ledgerExports: await prisma.investmentAccountingExportLink.count(),
    valuationInputs: await prisma.investmentValuationInputSnapshot.count({
      where: { valuationRunId: valRun.id },
    }),
    fxSnapshots: await prisma.investmentFxRateSnapshot.count(),
    complianceResults: await prisma.investmentComplianceResult.count(),
    documents: await prisma.investmentDocument.count({ where: { fundId: fund.id } }),
    reports: await prisma.investmentReportRun.count({ where: { fundId: fund.id } }),
    blotters: await prisma.investmentBlotter.count({ where: { fundId: fund.id } }),
    spCashJournals: await prisma.spCashJournal.count({ where: { portfolioId: fund.id } }),
    brokerCustodianItems: await prisma.spCashBrokerCustodianItem.count({ where: { portfolioId: fund.id } }),
    reconExceptions: await prisma.spCashReconciliationException.count({
      where: { cashAccountId: cash.cash.id },
    }),
    extraPortfolios: EXTRA_PORTFOLIOS.length,
    lpCommitments: await prisma.investmentCommitment.count({ where: { fundId: fund.id } }),
    capitalCalls: await prisma.capitalCall.count({ where: { fundId: fund.id } }),
    distributions: await prisma.distribution.count({ where: { fundId: fund.id } }),
    managementFeePeriods: await prisma.managementFeePeriod.count({ where: { fundId: fund.id } }),
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
