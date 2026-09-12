/**
 * UAT — Investments V2 Phase 1 (dashboard, portfolios, instruments, market data, setup).
 * DEV nts only. Creates/reuses story fixtures when missing.
 *
 * npm run uat:investments-v2:phase1
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  BASE,
  api,
  ensureApprovedInstrument,
  ensurePrimaryFund,
  idem,
  log,
  login,
  summarizeFail,
} from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  await assertDevDatabase(prisma, "uat:investments-v2:phase1");
  console.log(`Investments V2 Phase 1 UAT — ${BASE}\n`);

  const token = await login();
  const fund = await ensurePrimaryFund(prisma);
  const instrument = await ensureApprovedInstrument(prisma);
  console.log(`fundId=${fund.id} (${fund.name})`);
  console.log(`instrumentId=${instrument.id} (${instrument.instrumentCode})\n`);

  const checks: Array<[string, string, string?]> = [
    ["dashboard.summary", "GET", "/investment-ops/dashboard/summary?period=MTD"],
    ["dashboard.funds", "GET", "/investment-ops/dashboard/funds"],
    ["portfolios.list", "GET", "/investment-ops/portfolios"],
    ["portfolios.overview", "GET", `/investment-ops/portfolios/${fund.id}/overview`],
    ["portfolios.holdings", "GET", `/investment-ops/portfolios/${fund.id}/holdings`],
    ["instruments.types", "GET", "/investment-ops/instruments/types"],
    ["instruments.list", "GET", "/investment-ops/instruments?page=1&pageSize=10"],
    ["instruments.get", "GET", `/investment-ops/instruments/${instrument.id}`],
    ["market.latest", "GET", "/investment-ops/market-data/prices/latest"],
    ["market.queue", "GET", "/investment-ops/market-data/validation-queue"],
    ["market.fx", "GET", "/investment-ops/market-data/fx-rates"],
    ["setup.countries", "GET", "/investment-ops/setup/countries"],
    ["setup.markets", "GET", "/investment-ops/setup/markets"],
    ["setup.price-sources", "GET", "/investment-ops/setup/price-sources"],
  ];

  for (const [step, method, path] of checks) {
    const res = await api(method, path!, token);
    record(
      step,
      res.status < 400 && res.json?.success !== false,
      `${res.status} ${path}`
    );
  }

  const manual = await api("POST", "/investment-ops/market-data/prices/manual", token, {
    securityId: instrument.listedEquitySecurityId,
    price: 4.56,
    priceType: "CLOSE",
    pricedAt: new Date().toISOString(),
  }, { "Idempotency-Key": idem("p1-manual-price") });
  record(
    "market.manual",
    [200, 201, 400, 404].includes(manual.status),
    `status=${manual.status} code=${manual.json?.code || "ok"}`
  );

  const folders = await api("GET", `/investment-ops/portfolios/${fund.id}/folders`, token);
  record(
    "portfolios.folders",
    folders.status < 400 && folders.json?.success !== false,
    `status=${folders.status}`
  );

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
