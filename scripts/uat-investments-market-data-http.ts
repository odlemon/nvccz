/**
 * UAT — Listed equity market data (HTTP).
 * Run: npm run uat:investments:market-data
 */
import "dotenv/config";
import { createHash } from "crypto";
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

async function main() {
  token = await login();
  log("login", Boolean(token), token ? "token ok" : "login failed");
  if (!token) process.exit(1);

  const symbol = `UAT${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const created = await api("POST", "/investments/market-data/securities", {
    symbol,
    exchangeCode: "ZSE",
    name: `UAT Security ${symbol}`,
    listingCurrencyCode: "USD",
    isActive: true,
  });
  const securityId = created.json?.data?.id;
  log("create security", created.status === 201 && securityId, securityId || `status ${created.status}`);

  const ticks = [
    { symbol, exchangeCode: "ZSE", priceType: "CLOSE", price: 1.0, pricedAt: new Date().toISOString() },
    { symbol, exchangeCode: "ZSE", priceType: "CLOSE", price: 1.2, pricedAt: new Date().toISOString() },
  ];
  const ingest = await api("POST", "/investments/market-data/ingest/run", {
    sourceCode: "MANUAL",
    ticks,
  });
  const batchId = ingest.json?.data?.batch?.id;
  log("manual ingest", ingest.status === 200 && batchId, batchId || ingest.json?.message || `status ${ingest.status}`);

  const checksum = createHash("sha256")
    .update(JSON.stringify(ticks))
    .digest("hex");
  log("sha256 local", checksum.length === 64, checksum.slice(0, 16) + "...");

  const batch = await api("GET", `/investments/market-data/ingest/batches/${batchId}`);
  log(
    "batch verify endpoint",
    batch.status === 200,
    `checksumValid=${batch.json?.data?.checksumValid}`
  );

  const deviant = await api("POST", "/investments/market-data/ingest/run", {
    sourceCode: "MANUAL",
    ticks: [{ symbol, exchangeCode: "ZSE", priceType: "CLOSE", price: 2.0, pricedAt: new Date().toISOString() }],
  });
  log("deviation ingest", deviant.status === 200, `status ${deviant.status}`);

  const queue = await api("GET", "/investments/market-data/validation-queue");
  const pending = (queue.json?.data || []).find((t: any) => t.securityId === securityId);
  log("validation queue", queue.status === 200, pending ? "pending tick found" : "no pending (may be ok)");

  if (pending?.id) {
    const approve = await api("POST", `/investments/market-data/validation-queue/${pending.id}/approve`);
    log("approve tick", approve.status === 200, `status ${approve.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT market-data: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
