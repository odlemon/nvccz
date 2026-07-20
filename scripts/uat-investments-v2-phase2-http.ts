/**
 * UAT — Investments V2 Phase 2 (orders, compliance, blotters).
 * DEV nts only.
 *
 * npm run uat:investments-v2:phase2
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  BASE,
  api,
  ensureApprovedInstrument,
  ensureOrderPreviewPrerequisites,
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
  await assertDevDatabase(prisma, "uat:investments-v2:phase2");
  console.log(`Investments V2 Phase 2 UAT — ${BASE}\n`);

  const token = await login();
  const fund = await ensurePrimaryFund(prisma);
  const instrument = await ensureApprovedInstrument(prisma);
  if (!instrument.listedEquitySecurityId) {
    throw new Error(`Instrument ${instrument.id} has no listedEquitySecurityId`);
  }
  await ensureOrderPreviewPrerequisites(prisma, fund.id, instrument.listedEquitySecurityId, "USD");
  console.log(`fundId=${fund.id}`);
  console.log(`instrumentId=${instrument.id}\n`);

  const list = await api("GET", `/investment-ops/orders?fundId=${fund.id}&page=1&pageSize=20`, token);
  record("orders.list", list.status < 400 && list.json?.success !== false, `status=${list.status}`);

  const previewBody = {
    fundId: fund.id,
    instrumentId: instrument.id,
    side: "BUY",
    quantity: "100",
    orderType: "LIMIT",
    limitPrice: "10.00",
    tradeCurrency: "USD",
    settlementCurrency: "USD",
  };
  const preview = await api("POST", "/investment-ops/orders/preview", token, previewBody, {
    "Idempotency-Key": idem("p2-preview"),
  });
  const previewId = preview.json?.data?.previewId || preview.json?.data?.id;
  const inputHash = preview.json?.data?.inputHash;
  record(
    "orders.preview",
    [200, 201].includes(preview.status) && Boolean(previewId) && Boolean(inputHash),
    `status=${preview.status} code=${preview.json?.error?.code || preview.json?.code || "ok"} previewId=${previewId || "none"}`
  );

  const create = await api(
    "POST",
    "/investment-ops/orders",
    token,
    {
      ...previewBody,
      previewId,
      inputHash,
    },
    { "Idempotency-Key": idem("p2-create-order") }
  );
  const orderId = create.json?.data?.id;
  record(
    "orders.create",
    [200, 201].includes(create.status) && Boolean(orderId),
    `status=${create.status} orderId=${orderId || create.json?.error?.code || create.json?.code || "none"}`
  );

  if (orderId) {
    console.log(`orderId=${orderId}`);
    const fetched = await api("GET", `/investment-ops/orders/${orderId}`, token);
    const version = String(fetched.json?.data?.version ?? create.json?.data?.version ?? "1");
    const submit = await api(
      "POST",
      `/investment-ops/orders/${orderId}/submit`,
      token,
      { expectedVersion: version },
      { "Idempotency-Key": idem("p2-submit"), "If-Match": version }
    );
    record(
      "orders.submit",
      [200, 201].includes(submit.status),
      `status=${submit.status} code=${submit.json?.error?.code || submit.json?.code || "ok"} msg=${String(submit.json?.message || "").slice(0, 120)}`
    );

    const hist = await api("GET", `/investment-ops/orders/${orderId}/history`, token);
    record("orders.history", hist.status < 400, `status=${hist.status}`);
  }

  const rules = await api("GET", `/investment-ops/compliance/rules?fundId=${fund.id}`, token);
  record("compliance.rules", rules.status < 400, `status=${rules.status}`);

  const blotters = await api("GET", `/investment-ops/blotters?fundId=${fund.id}`, token);
  record("blotters.list", blotters.status < 400, `status=${blotters.status}`);

  const models = await api("GET", "/investment-ops/model-portfolios", token);
  record("models.list", models.status < 400, `status=${models.status}`);

  const sims = await api("GET", `/investment-ops/simulation/runs?fundId=${fund.id}`, token);
  record("simulation.runs", sims.status < 400, `status=${sims.status}`);

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
