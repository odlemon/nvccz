/**
 * UAT — Listed equity trade router full flow (HTTP).
 * Run: npm run uat:investments:trade-router:full
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

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function confirmStakeholderHops(tradeId: string) {
  for (const target of ["BROKER", "CUSTODIAN", "CORE_BANKING"]) {
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

  const fund = await prisma.fund.findFirst({
    include: { listedEquityFundConfig: true },
    orderBy: { createdAt: "asc" },
  });
  const bank = await prisma.bank.findFirst({ orderBy: { createdAt: "asc" } });
  log("fund+bank", Boolean(fund?.id && bank?.id), `${fund?.id} / ${bank?.id}`);
  if (!fund || !bank) process.exit(1);

  const broker = await prisma.listedEquityStakeholderProfile.create({
    data: { profileType: "BROKER", name: "UAT Broker", contactEmail: "broker@example.com" },
  });
  const custodian = await prisma.listedEquityStakeholderProfile.create({
    data: { profileType: "CUSTODIAN", name: "UAT Custodian", contactEmail: "custodian@example.com" },
  });

  await prisma.listedEquityFundConfig.upsert({
    where: { fundId: fund.id },
    create: {
      fundId: fund.id,
      trustBankId: bank.id,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
      coaMappingJson: {
        listedSecuritiesAsset: "1210",
        bankClearing: "1105",
        realizedGain: "4200",
        realizedLoss: "5200",
      },
    },
    update: {
      trustBankId: bank.id,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
    },
  });

  const symbol = `TRD${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const secRes = await api("POST", "/investments/market-data/securities", {
    symbol,
    exchangeCode: "ZSE",
    name: `Trade UAT ${symbol}`,
    listingCurrencyCode: "USD",
  });
  const securityId = secRes.json?.data?.id;
  log("security", Boolean(securityId), securityId || "fail");

  const tradeRes = await api("POST", "/investments/trades", {
    fundId: fund.id,
    securityId,
    side: "BUY",
    quantity: 50,
    executionPrice: 2.5,
    executionCurrencyCode: "USD",
    fees: 5,
  });
  const tradeId = tradeRes.json?.data?.id;
  log("create draft", tradeRes.status === 201 && tradeId, tradeId || "fail");

  const idemKey = `uat-${Date.now()}`;
  const exec = await api("POST", `/investments/trades/${tradeId}/execute`, undefined, {
    "Idempotency-Key": idemKey,
  });
  let hops = exec.json?.data?.routingHops || [];
  log("execute + hops", exec.status === 200 && hops.length === 4, `hops=${hops.length} status=${exec.json?.data?.status}`);

  await confirmStakeholderHops(tradeId);
  const refreshed = await api("GET", `/investments/trades/${tradeId}`);
  hops = refreshed.json?.data?.routingHops || [];

  const targets = hops.map((h: any) => h.target);
  log("quad targets", targets.length === 4, targets.join(","));

  const confirmed = hops.filter((h: any) => h.status === "CONFIRMED").length;
  log("hops confirmed", confirmed >= 2, `${confirmed}/4 confirmed (GL may need COA)`);

  const detail = await api("GET", `/investments/trades/${tradeId}`);
  const holds = detail.json?.data?.cashHolds?.length || 0;
  log("cash holds", detail.status === 200, `holds=${holds}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT trade-router: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
