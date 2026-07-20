/**
 * Shared helpers for Investments V2 HTTP UAT (DEV nts only).
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export const BASE =
  process.env.UAT_BASE_URL ||
  process.env.API_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || 3009}/api`;
export const EMAIL = process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
export const PASSWORD = process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";

export type ApiResult = { status: number; json: any; headers: Headers };

export async function login(email = EMAIL, password = PASSWORD): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json: any = await res.json().catch(() => ({}));
  const token = json.token || json.data?.token;
  if (!token) throw new Error(`Login failed: ${json.message || res.status}`);
  return token;
}

export async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<ApiResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

export function log(step: string, ok: boolean, detail: string) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

export function idem(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensurePrimaryFund(prisma: PrismaClient) {
  let fund = await prisma.fund.findFirst({
    where: { name: "Arcus Listed Portfolio", fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
  });
  if (!fund) {
    fund = await prisma.fund.findFirst({
      where: { fundPurpose: "LISTED_EQUITY", listedEquityFundConfig: { isNot: null } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!fund) throw new Error("No LISTED_EQUITY fund; run npm run db:seed:investment-ops-demo");
  return fund;
}

export async function ensureApprovedInstrument(prisma: PrismaClient) {
  let instrument = await prisma.investmentInstrument.findFirst({
    where: {
      status: { in: ["ACTIVE", "APPROVED"] },
      instrumentTypeCode: "EQUITY",
      listedEquitySecurityId: { not: null },
    },
    select: { id: true, instrumentCode: true, ticker: true, listedEquitySecurityId: true, status: true },
  });
  if (!instrument) throw new Error("No ACTIVE/APPROVED equity instrument; run presentation seed");
  if (instrument.status === "APPROVED") {
    instrument = await prisma.investmentInstrument.update({
      where: { id: instrument.id },
      data: { status: "ACTIVE" },
      select: { id: true, instrumentCode: true, ticker: true, listedEquitySecurityId: true, status: true },
    });
  }
  return instrument;
}

/** Ensure preview/create can succeed: approved price + cash ledger with headroom. */
export async function ensureOrderPreviewPrerequisites(
  prisma: PrismaClient,
  fundId: string,
  securityId: string,
  currencyCode = "USD"
) {
  const approved = await prisma.listedEquityPriceTick.findFirst({
    where: { securityId, validationStatus: "APPROVED" },
    orderBy: { pricedAt: "desc" },
  });
  if (!approved) {
    await prisma.listedEquityPriceTick.create({
      data: {
        securityId,
        price: new Decimal("10.0000"),
        priceType: "CLOSE",
        pricedAt: new Date(),
        sourceCode: "UAT_SETUP",
        validationStatus: "APPROVED",
      },
    });
  }

  let config = await prisma.investmentPortfolioConfig.findUnique({ where: { fundId } });
  if (!config) {
    config = await prisma.investmentPortfolioConfig.create({
      data: {
        fundId,
        baseCurrencyCode: currencyCode,
        isActive: true,
      },
    });
  }

  let cash = await prisma.investmentCashAccount.findFirst({
    where: { portfolioConfigId: config.id, currencyCode, status: "ACTIVE" },
  });
  if (!cash) {
    cash = await prisma.investmentCashAccount.create({
      data: {
        portfolioConfigId: config.id,
        currencyCode,
        accountCode: `${currencyCode}_OPS`,
        status: "ACTIVE",
      },
    });
  }

  const last = await prisma.investmentCashLedgerEntry.findFirst({
    where: { cashAccountId: cash.id, status: "POSTED" },
    orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
  });
  const balance = new Decimal(last?.runningBalance || 0);
  if (balance.lt(new Decimal("1000000"))) {
    await prisma.investmentCashLedgerEntry.create({
      data: {
        cashAccountId: cash.id,
        entryType: "MANUAL_ADJUSTMENT",
        amount: new Decimal("5000000"),
        runningBalance: new Decimal("5000000"),
        currencyCode,
        effectiveAt: new Date(),
        status: "POSTED",
        idempotencyKey: idem("uat-cash-buffer"),
      },
    });
  }

  return { portfolioConfigId: config.id, cashAccountId: cash.id, currencyCode };
}

export function summarizeFail(results: Array<{ step: string; ok: boolean; detail: string }>) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
    process.exit(1);
  }
}

export { Decimal };
