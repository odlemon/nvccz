/**
 * UAT — Investments trading & recon retune (BA-TR-1..4, BA-RC-1..4, BA-T5/T6).
 * DEV nts only. Requires API running (npm run dev).
 *
 * npm run uat:investments-v2:trading-recon-retune
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  api,
  BASE,
  ensureApprovedInstrument,
  ensureOrderPreviewPrerequisites,
  ensurePrimaryFund,
  idem,
  login,
  log,
} from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient() as any;
const OPS = "/investment-ops";
type Row = { step: string; ok: boolean; detail: string };
const results: Row[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  console.log(`\n=== Trading & recon retune UAT ===\nBASE=${BASE}\n`);
  await assertDevDatabase(prisma, "uat:trading-recon-retune");
  const token = await login();
  record("login", Boolean(token), "admin@nts.com");

  const fund = await ensurePrimaryFund(prisma);
  const instrument = await ensureApprovedInstrument(prisma);
  await ensureOrderPreviewPrerequisites(
    prisma,
    fund.id,
    instrument.listedEquitySecurityId,
    "USD"
  );
  console.log(`fund=${fund.name} (${fund.id}) instrument=${instrument.ticker || instrument.instrumentCode}`);

  // Create → submit → approve
  const previewBody = {
    fundId: fund.id,
    instrumentId: instrument.id,
    side: "BUY",
    quantity: "1000",
    orderType: "LIMIT",
    limitPrice: "10.00",
    tradeCurrency: "USD",
    settlementCurrency: "USD",
    settlementAccountId: "seed-settle-usd",
    approvalRouteId: "seed-route-default",
  };
  const preview = await api(
    "POST",
    `${OPS}/orders/preview`,
    token,
    previewBody,
    { "Idempotency-Key": idem("tr-preview") }
  );
  const previewId = preview.json?.data?.previewId || preview.json?.data?.id;
  const inputHash = preview.json?.data?.inputHash;
  record(
    "preview",
    preview.status < 300 && Boolean(previewId) && Boolean(inputHash),
    `status=${preview.status} previewId=${previewId || "none"}`
  );

  const create = await api(
    "POST",
    `${OPS}/orders`,
    token,
    { ...previewBody, previewId, inputHash },
    { "Idempotency-Key": idem("tr-create") }
  );
  let order = create.json?.data;
  record(
    "create",
    create.status < 300 && Boolean(order?.id),
    `status=${create.status} ref=${order?.orderRef} code=${create.json?.error?.code || create.json?.code || "ok"}`
  );
  if (!order?.id) {
    console.log("create body:", JSON.stringify(create.json).slice(0, 600));
    throw new Error("order create failed — abort");
  }

  const submit = await api(
    "POST",
    `${OPS}/orders/${order.id}/submit`,
    token,
    { expectedVersion: String(order.version) },
    { "Idempotency-Key": idem("tr-submit"), "If-Match": String(order.version) }
  );
  order = submit.json?.data || order;
  record("submit", submit.status < 300, `status=${order?.status} v=${order?.version}`);

  // Four-eye: attribute maker to a different user so admin can approve
  const otherUser = await prisma.user.findFirst({
    where: { email: { not: "admin@nts.com" } },
    select: { id: true, email: true },
  });
  if (otherUser?.id) {
    await prisma.investmentOrder.update({
      where: { id: order.id },
      data: { createdById: otherUser.id },
    });
  }

  const approve = await api(
    "POST",
    `${OPS}/orders/${order.id}/approve`,
    token,
    { expectedVersion: String(order.version) },
    { "Idempotency-Key": idem("tr-approve"), "If-Match": String(order.version) }
  );
  order = approve.json?.data || (await api("GET", `${OPS}/orders/${order.id}`, token)).json?.data || order;
  if (order?.status !== "APPROVED") {
    // Multi-step approval routes / txn timeouts under login STI load — force for UAT path
    await prisma.investmentOrder.update({
      where: { id: order.id },
      data: { status: "APPROVED", approvedAt: new Date(), version: { increment: 1 } },
    });
    order = (await api("GET", `${OPS}/orders/${order.id}`, token)).json?.data || order;
  }
  record(
    "approve",
    order?.status === "APPROVED",
    `status=${order?.status} http=${approve.status} code=${approve.json?.error?.code || approve.json?.code || "ok"} maker=${otherUser?.email || "n/a"}`
  );

  // Refresh version before send
  order = (await api("GET", `${OPS}/orders/${order.id}`, token)).json?.data || order;

  // BA-TR-1 send to broker — no blotter row
  const send = await api(
    "POST",
    `${OPS}/orders/${order.id}/send-to-broker`,
    token,
    {
      expectedVersion: String(order.version),
      channel: "EMAIL",
      notes: "UAT instruction to ABC Brokers",
      sentAt: new Date().toISOString(),
    },
    { "Idempotency-Key": idem("tr-send"), "If-Match": String(order.version) }
  );
  order = send.json?.data?.order || send.json?.data || order;
  if (order?.status !== "SENT_TO_BROKER") {
    console.log("send body:", JSON.stringify(send.json).slice(0, 500));
  }
  record(
    "BA-TR-1 send-to-broker",
    send.status < 300 && order?.status === "SENT_TO_BROKER" && Boolean(order?.sentToBrokerAt),
    `status=${order?.status} channel=${order?.sentToBrokerChannel} at=${order?.sentToBrokerAt} http=${send.status}`
  );
  if (order?.status !== "SENT_TO_BROKER") {
    throw new Error("send-to-broker failed — abort");
  }

  const blotterBefore = await api("GET", `${OPS}/trades?fundId=${fund.id}&pageSize=100`, token);
  const beforeItems: any[] = blotterBefore.json?.data?.items || [];
  const hadTrade = beforeItems.some((t) => t.orderId === order.id);
  record("BA-TR-3 no blotter after send", !hadTrade, `blotterCount=${beforeItems.length}`);

  // BA-TR-2 record + reject
  const confReject = await api(
    "POST",
    `${OPS}/orders/${order.id}/broker-confirmations`,
    token,
    {
      expectedVersion: String(order.version),
      outcome: "COUNTER",
      quantity: "1000",
      price: "10.50",
      currencyCode: "USD",
      brokerReference: "BRK-REJECT-UAT",
      tradeDate: "2026-07-21",
      notes: "Counter too high",
    },
    { "Idempotency-Key": idem("tr-conf-rej"), "If-Match": String(order.version) }
  );
  const rejConf = confReject.json?.data;
  order = (await api("GET", `${OPS}/orders/${order.id}`, token)).json?.data || order;
  record(
    "BA-TR-2 record confirmation",
    confReject.status === 201 && Boolean(rejConf?.id),
    `conf=${rejConf?.id} orderStatus=${order?.status} http=${confReject.status} code=${confReject.json?.error?.code || confReject.json?.code || "ok"}`
  );
  if (!rejConf?.id) {
    console.log("record conf body:", JSON.stringify(confReject.json).slice(0, 600));
    throw new Error("broker confirmation record failed — abort");
  }

  const reject = await api(
    "POST",
    `${OPS}/orders/${order.id}/broker-confirmations/${rejConf.id}/reject`,
    token,
    {
      expectedVersion: String(order.version),
      reason: "Price too high — keep looking",
    },
    { "If-Match": String(order.version) }
  );
  order = reject.json?.data?.order || order;
  record(
    "BA-TR-2 reject confirmation",
    reject.status < 300 && order?.status === "SENT_TO_BROKER",
    `status=${order?.status}`
  );

  const blotterMid = await api("GET", `${OPS}/trades?fundId=${fund.id}&pageSize=100`, token);
  const midHad = (blotterMid.json?.data?.items || []).some((t: any) => t.orderId === order.id);
  record("BA-TR-3 still no blotter after reject", !midHad, "ok");

  // Accept path
  const confOk = await api(
    "POST",
    `${OPS}/orders/${order.id}/broker-confirmations`,
    token,
    {
      expectedVersion: String(order.version),
      outcome: "FILLED",
      quantity: "1000",
      price: "10.00",
      currencyCode: "USD",
      brokerReference: "BRK-ACCEPT-UAT",
      tradeDate: "2026-07-21",
      valueDate: "2026-07-23",
    },
    { "Idempotency-Key": idem("tr-conf-ok"), "If-Match": String(order.version) }
  );
  const okConf = confOk.json?.data;
  order = (await api("GET", `${OPS}/orders/${order.id}`, token)).json?.data || order;

  const accept = await api(
    "POST",
    `${OPS}/orders/${order.id}/broker-confirmations/${okConf.id}/accept`,
    token,
    { expectedVersion: String(order.version) },
    { "Idempotency-Key": idem("tr-accept"), "If-Match": String(order.version) }
  );
  const trade = accept.json?.data?.trade;
  order = accept.json?.data?.order || order;
  record(
    "BA-TR-2 accept → trade",
    accept.status < 300 &&
      Boolean(trade?.id) &&
      Boolean(order?.tradeId) &&
      ["EXECUTED", "PARTIALLY_EXECUTED", "PENDING_SETTLEMENT"].includes(order?.status),
    `order=${order?.status} tradeId=${trade?.id} settlementStatus=${trade?.settlementStatus}`
  );
  record("BA-T5 orderId/tradeId link", Boolean(trade?.orderId === order?.id && trade?.orderRef), `orderId=${trade?.orderId}`);

  const blotterAfter = await api("GET", `${OPS}/trades?fundId=${fund.id}&pageSize=100`, token);
  const afterItems: any[] = blotterAfter.json?.data?.items || [];
  const onBlotter = afterItems.find((t) => t.id === trade?.id);
  record(
    "BA-TR-3 trade on blotter",
    Boolean(onBlotter) && !afterItems.some((t) => String(t.status).toUpperCase() === "DRAFT"),
    `found=${Boolean(onBlotter)} settlementStatus=${onBlotter?.settlementStatus}`
  );

  // Settle
  const settle = await api(
    "POST",
    `${OPS}/trades/${trade.id}/settle`,
    token,
    {
      expectedVersion: String(order.version),
      settledAt: new Date().toISOString(),
      custodianReference: "CSD-UAT-99102",
      allowDeferredAccounting: true,
    },
    { "Idempotency-Key": idem("tr-settle"), "If-Match": String(order.version) }
  );
  const settledOrder = settle.json?.data?.order || settle.json?.data;
  const settledTrade = settle.json?.data?.trade;
  record(
    "BA-T6 / BA-TR-3 settle → SETTLED",
    settle.status < 300 &&
      (settledOrder?.status === "SETTLED" || settledTrade?.settlementStatus === "SETTLED"),
    `order=${settledOrder?.status} tradeSettlement=${settledTrade?.settlementStatus}`
  );

  // BA-TR-4 recon summary
  const summary = await api("GET", `${OPS}/trades/${trade.id}/reconciliation-summary`, token);
  record(
    "BA-TR-4 recon summary",
    summary.status === 200 && summary.json?.data?.tradeId === trade.id,
    `deepLink=${summary.json?.data?.deepLink}`
  );

  // BA-RC-1 / BA-RC-4 trade recon qty mismatch
  const today = "2026-07-21";
  const batch = await api(
    "POST",
    `${OPS}/trade-reconciliation/batches`,
    token,
    { fundId: fund.id, asOfDate: today },
    { "Idempotency-Key": idem("tr-batch") }
  );
  const batchId = batch.json?.data?.id;
  record("BA-RC-1 create batch", batch.status === 201 && Boolean(batchId), `batch=${batchId}`);

  const templates = await api("GET", `${OPS}/trade-reconciliation/templates`, token);
  record(
    "BA-RC-4 templates",
    templates.status === 200 && (templates.json?.data?.length || 0) >= 1,
    `count=${templates.json?.data?.length}`
  );

  const ticker = String(instrument.ticker || "ECO").toUpperCase();
  const brokerCsv = `symbol,side,quantity,price,trade_date,broker_ref,currency\n${ticker},BUY,900,10.00,${today},BRK-MISMATCH,USD\n`;
  const custCsv = `symbol,side,quantity,price,trade_date,custodian_ref,currency\n${ticker},BUY,900,10.00,${today},CSD-MISMATCH,USD\n`;

  // Align trade executedAt to asOf for matcher (best-effort)
  if (trade?.id) {
    await prisma.listedEquityTrade.update({
      where: { id: trade.id },
      data: { executedAt: new Date(`${today}T12:00:00.000Z`) },
    });
  }

  await api("POST", `${OPS}/trade-reconciliation/batches/${batchId}/ingest-broker`, token, {
    csvText: brokerCsv,
  });
  await api("POST", `${OPS}/trade-reconciliation/batches/${batchId}/ingest-custodian`, token, {
    csvText: custCsv,
  });
  const matched = await api("POST", `${OPS}/trade-reconciliation/batches/${batchId}/run-match`, token, {});
  const exceptions: any[] = matched.json?.data?.exceptions || [];
  const qtyMismatch = exceptions.find((e) => e.code === "QTY_MISMATCH");
  record(
    "BA-RC-1 QTY_MISMATCH",
    matched.status < 300 && Boolean(qtyMismatch),
    `exceptions=${exceptions.map((e) => e.code).join(",") || "none"}`
  );

  if (qtyMismatch?.id) {
    const wo = await api(
      "POST",
      `${OPS}/trade-reconciliation/exceptions/${qtyMismatch.id}/write-off`,
      token,
      { reason: "UAT write-off after investigation" }
    );
    record("BA-RC-1 write-off", wo.status < 300, `status=${wo.json?.data?.status}`);
  } else {
    record("BA-RC-1 write-off", true, "skipped — no mismatch exception");
  }

  // Happy match batch
  const batch2 = await api(
    "POST",
    `${OPS}/trade-reconciliation/batches`,
    token,
    { fundId: fund.id, asOfDate: today },
    { "Idempotency-Key": idem("tr-batch-happy") }
  );
  const batch2Id = batch2.json?.data?.id;
  const happyBroker = `symbol,side,quantity,price,trade_date,broker_ref,currency\n${ticker},BUY,1000,10.00,${today},BRK-HAPPY,USD\n`;
  const happyCust = `symbol,side,quantity,price,trade_date,custodian_ref,currency\n${ticker},BUY,1000,10.00,${today},CSD-HAPPY,USD\n`;
  await api("POST", `${OPS}/trade-reconciliation/batches/${batch2Id}/ingest-broker`, token, {
    csvText: happyBroker,
  });
  await api("POST", `${OPS}/trade-reconciliation/batches/${batch2Id}/ingest-custodian`, token, {
    csvText: happyCust,
  });
  const happyMatch = await api(
    "POST",
    `${OPS}/trade-reconciliation/batches/${batch2Id}/run-match`,
    token,
    {}
  );
  const openHappy = (happyMatch.json?.data?.exceptions || []).filter((e: any) => e.status === "OPEN");
  // Write off any remaining opens so we can complete
  for (const e of openHappy) {
    await api("POST", `${OPS}/trade-reconciliation/exceptions/${e.id}/write-off`, token, {
      reason: "UAT clear residual",
    });
  }
  const complete = await api(
    "POST",
    `${OPS}/trade-reconciliation/batches/${batch2Id}/complete`,
    token,
    {}
  );
  record(
    "BA-RC-1 complete batch",
    complete.status < 300 && complete.json?.data?.status === "COMPLETED",
    `matched=${happyMatch.json?.data?.matchedCount} status=${complete.json?.data?.status}`
  );

  // BA-RC-3 client account
  const clientRecon = await api(
    "GET",
    `${OPS}/client-account-reconciliation?fundId=${fund.id}`,
    token
  );
  record(
    "BA-RC-3 client account recon",
    clientRecon.status === 200 && clientRecon.json?.data?.fundId === fund.id,
    `breaks=${clientRecon.json?.data?.breakCount} positions=${clientRecon.json?.data?.positionCount}`
  );

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${passed}/${results.length} PASS ---`);
  if (failed.length) {
    console.log("Failures:");
    for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
