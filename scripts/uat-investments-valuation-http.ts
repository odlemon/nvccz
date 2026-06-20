/**
 * UAT — Listed equity valuation / WAC (HTTP).
 * Run: npm run uat:investments:valuation
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

type StepResult = { step: string; ok: boolean; detail: string };
const results: StepResult[] = [];
let token = "";

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  return json.token || json.data?.token || "";
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function confirmStakeholderHops(tradeId: string) {
  for (const target of ["BROKER", "CUSTODIAN"]) {
    const detail = await api("GET", `/investments/trades/${tradeId}`);
    const hop = (detail.json?.data?.routingHops || []).find(
      (h: { target: string }) => h.target === target
    );
    if (hop?.id && hop.status !== "CONFIRMED") {
      await api("POST", `/investments/trades/${tradeId}/routing-hops/${hop.id}/confirm`, {
        externalRef: `UAT-${target}`,
      });
    }
  }
}

async function main() {
  token = await login();
  log("login", Boolean(token), token ? "token ok" : "login failed");
  if (!token) process.exit(1);

  const fund = await prisma.fund.findFirst({ orderBy: { createdAt: "asc" } });
  log("seed fund", Boolean(fund?.id), fund?.id || "no fund");
  if (!fund) process.exit(1);

  const bank = await prisma.bank.findFirst({ orderBy: { createdAt: "asc" } });
  const broker = await prisma.listedEquityStakeholderProfile.create({
    data: { profileType: "BROKER", name: "UAT Val Broker", contactEmail: "broker@example.com" },
  });
  const custodian = await prisma.listedEquityStakeholderProfile.create({
    data: { profileType: "CUSTODIAN", name: "UAT Val Custodian", contactEmail: "custodian@example.com" },
  });

  await prisma.listedEquityFundConfig.upsert({
    where: { fundId: fund.id },
    create: {
      fundId: fund.id,
      baseCurrencyCode: "USD",
      trustBankId: bank?.id,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
    },
    update: {
      trustBankId: bank?.id,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
    },
  });

  const symbol = `VAL${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const secRes = await api("POST", "/investments/market-data/securities", {
    symbol,
    exchangeCode: "ZSE",
    name: `Valuation UAT ${symbol}`,
    listingCurrencyCode: "USD",
  });
  const securityId = secRes.json?.data?.id;
  log("security", secRes.status === 201 && securityId, securityId || "fail");

  await api("POST", "/investments/market-data/ingest/run", {
    sourceCode: "MANUAL",
    ticks: [{ symbol, exchangeCode: "ZSE", priceType: "CLOSE", price: 10, pricedAt: new Date().toISOString() }],
  });

  const trade = await api("POST", "/investments/trades", {
    fundId: fund.id,
    securityId,
    side: "BUY",
    quantity: 100,
    executionPrice: 9.5,
    executionCurrencyCode: "USD",
    fees: 0,
  });
  const tradeId = trade.json?.data?.id;
  log("draft buy trade", trade.status === 201 && tradeId, tradeId || "fail");

  if (tradeId) {
    const exec = await api("POST", `/investments/trades/${tradeId}/execute`, undefined);
    log("execute buy", exec.status === 200, exec.json?.data?.status || `status ${exec.status}`);
    await confirmStakeholderHops(tradeId);
  }

  const holdings = await api("GET", `/investments/portfolio/funds/${fund.id}/holdings`);
  const row = (holdings.json?.data || []).find((h: any) => h.securityId === securityId);
  log("holdings WAC", holdings.status === 200 && row, row ? `qty=${row.quantity} wac=${row.wac}` : "no row");

  const runVal = await api("POST", `/investments/portfolio/funds/${fund.id}/valuations/run`);
  log("valuation run", runVal.status === 200, runVal.json?.data?.status || `status ${runVal.status}`);

  const pnl = await api("GET", `/investments/portfolio/funds/${fund.id}/pnl`);
  log(
    "pnl USD+ZiG",
    pnl.status === 200 && pnl.json?.data?.unrealized != null,
    `unrealized.usd=${pnl.json?.data?.unrealized?.usd}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT valuation: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
