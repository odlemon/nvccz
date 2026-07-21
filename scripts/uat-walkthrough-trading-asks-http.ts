/**
 * UAT for walkthrough trading asks BA-T1..T4 (+ recheck BA-6 statuses).
 * Usage: npm run uat:investments-v2:trading-asks
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { api, BASE, idem, login, log } from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient() as any;
const OPS = "/investment-ops";
type Row = { step: string; ok: boolean; detail: string };
const results: Row[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  console.log(`\n=== Investments V2 trading asks UAT ===\nBASE=${BASE}\n`);
  await assertDevDatabase(prisma);
  const token = await login();
  record("login", Boolean(token), "admin@nts.com");

  const ordersRes = await api("GET", `${OPS}/orders?page=1&pageSize=100`, token);
  const orders: any[] = ordersRes.json?.data?.items ?? ordersRes.json?.data ?? [];
  const by = (s: string) =>
    orders.filter((o) => String(o.status || "").toUpperCase() === s).length;

  record("BA-6 DRAFT present", by("DRAFT") >= 1, `DRAFT=${by("DRAFT")}`);
  record("BA-6 SUBMITTED present", by("SUBMITTED") >= 1, `SUBMITTED=${by("SUBMITTED")}`);
  record("BA-T2 PARTIALLY_EXECUTED present", by("PARTIALLY_EXECUTED") >= 1, `n=${by("PARTIALLY_EXECUTED")}`);
  record("BA-T2 PENDING_SETTLEMENT present", by("PENDING_SETTLEMENT") >= 1, `n=${by("PENDING_SETTLEMENT")}`);

  // BA-T1 — compliance outcomes include srdLabel / normalized FAILED
  {
    const r = await api("GET", `${OPS}/compliance/results?page=1&pageSize=20`, token);
    const items: any[] = r.json?.data?.items ?? [];
    const hasSrd = items.some((i) => i.srdLabel);
    const noBreach = !items.some((i) => String(i.outcome || "").toUpperCase() === "BREACH");
    record(
      "BA-T1 compliance results srdLabel + no BREACH",
      r.status === 200 && (items.length === 0 || (hasSrd && noBreach)),
      `status=${r.status} items=${items.length} sample=${items[0]?.outcome}/${items[0]?.srdLabel}`
    );
  }

  // BA-T3 — STOP_LIMIT accepted on preview (SELL avoids cash-insufficient gate)
  {
    const fund = await prisma.fund.findFirst({
      where: { name: "Arcus Listed Portfolio", fundPurpose: "LISTED_EQUITY" },
      select: { id: true },
    });
    const instrument = await prisma.investmentInstrument.findFirst({
      where: { ticker: "ECO", exchangeCode: "ZSE" },
      select: { id: true },
    });
    if (!fund || !instrument) {
      record("BA-T3 STOP_LIMIT preview", false, "missing fund/instrument");
    } else {
      const r = await api(
        "POST",
        `${OPS}/orders/preview`,
        token,
        {
          fundId: fund.id,
          instrumentId: instrument.id,
          side: "SELL",
          quantity: "50",
          orderType: "STOP_LIMIT",
          stopPrice: "4.40",
          limitPrice: "4.30",
          tradeCurrency: "USD",
          settlementAccountId: "seed-settle-usd",
          approvalRouteId: "seed-route-default",
        },
        { "Idempotency-Key": idem(`bat3-stop-preview-${Date.now()}`) }
      );
      record(
        "BA-T3 STOP_LIMIT preview accepted",
        r.status === 200 || r.status === 201,
        `status=${r.status} err=${r.json?.message || r.json?.error || ""}`
      );
    }
  }

  // BA-T4 — fail then archive (reset a SENT_TO_BROKER seed first)
  {
    const reset = await prisma.investmentOrder.findFirst({
      where: { orderRef: "ALP-ORD-SENT-BAT" },
    });
    if (reset) {
      await prisma.investmentOrder.update({
        where: { id: reset.id },
        data: { status: "SENT_TO_BROKER", tradeId: null },
      });
    }
    const target = reset || (await prisma.investmentOrder.findFirst({ where: { status: "SENT_TO_BROKER" } }));
    if (!target?.id) {
      record("BA-T4 fail order", false, "no SENT_TO_BROKER order");
      record("BA-T4 archive order", false, "skipped");
    } else {
      const fail = await api(
        "POST",
        `${OPS}/orders/${target.id}/fail`,
        token,
        { reason: "Walkthrough UAT — broker reject simulation" },
        { "Idempotency-Key": idem(`bat4-fail-${target.id}-${Date.now()}`) }
      );
      record(
        "BA-T4 fail order",
        fail.status === 200 && String(fail.json?.data?.status || "").toUpperCase() === "FAILED",
        `status=${fail.status} orderStatus=${fail.json?.data?.status} err=${fail.json?.message || ""}`
      );
      const arch = await api(
        "POST",
        `${OPS}/orders/${target.id}/archive`,
        token,
        { reason: "Walkthrough UAT archive" },
        { "Idempotency-Key": idem(`bat4-arch-${target.id}-${Date.now()}`) }
      );
      record(
        "BA-T4 archive order",
        arch.status === 200 && String(arch.json?.data?.status || "").toUpperCase() === "ARCHIVED",
        `status=${arch.status} orderStatus=${arch.json?.data?.status} err=${arch.json?.message || ""}`
      );
    }
  }

  // BA-T2 — partial execute returns PARTIALLY_EXECUTED
  {
    const seed = await prisma.investmentOrder.findFirst({
      where: { orderRef: "ALP-ORD-SENT-SEED" },
    });
    if (seed) {
      await prisma.investmentOrder.update({
        where: { id: seed.id },
        data: { status: "SENT_TO_BROKER", tradeId: null },
      });
    }
    const list = await api("GET", `${OPS}/orders?status=SENT_TO_BROKER&pageSize=5`, token);
    const sent: any[] = list.json?.data?.items ?? [];
    const target = sent.find((o) => o.orderRef === "ALP-ORD-SENT-SEED") || sent[0];
    if (!target?.id) {
      record("BA-T2 partial execute", false, "no SENT_TO_BROKER");
    } else {
      const qty = Math.max(1, Math.floor(Number(target.quantity || 500) / 2));
      const t0 = Date.now();
      const r = await api(
        "POST",
        `${OPS}/orders/${target.id}/execute`,
        token,
        { quantity: qty, executionPrice: Number(target.limitPrice || target.executionPrice || 6) },
        { "Idempotency-Key": idem(`bat2-partial-${target.id}-${Date.now()}`) }
      );
      const ms = Date.now() - t0;
      const status = r.json?.data?.status || r.json?.data?.order?.status;
      record(
        "BA-T2 partial execute status",
        r.status === 200 && String(status).toUpperCase() === "PARTIALLY_EXECUTED",
        `status=${r.status} orderStatus=${status} tradeId=${r.json?.data?.tradeId} ${ms}ms`
      );
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL: ${r.step} — ${r.detail}`);
  process.exit(passed === results.length ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
