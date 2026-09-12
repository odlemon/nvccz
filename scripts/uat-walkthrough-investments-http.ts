/**
 * Walkthrough backend readiness UAT (BA-1, BA-2, BA-3, BA-6).
 * Usage: npm run uat:investments-v2:walkthrough
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
  console.log(`\n=== Investments V2 walkthrough backend UAT ===`);
  console.log(`BASE=${BASE}\n`);

  await assertDevDatabase(prisma);
  const token = await login();
  record("login", Boolean(token), "admin@nts.com");

  // BA-1 — cash ledger purpose filters
  for (const purpose of ["FUND", "TRADING"] as const) {
    const r = await api(
      "GET",
      `${OPS}/cash-ledger?accountPurpose=${purpose}&view=LINES&pageSize=50`,
      token
    );
    const items = r.json?.data?.items ?? r.json?.data ?? [];
    const count = Array.isArray(items) ? items.length : 0;
    record(
      `BA-1 cash-ledger accountPurpose=${purpose}`,
      r.status === 200 && count > 0,
      `status=${r.status} rows=${count}`
    );
  }

  // BA-3 — open reconciliation exceptions
  {
    const r = await api("GET", `${OPS}/reconciliation-exceptions?page=1&pageSize=20`, token);
    const items: any[] = r.json?.data?.items ?? [];
    const open = items.filter((x) =>
      ["OPEN", "ASSIGNED", "INVESTIGATING", "PENDING_APPROVAL", "INFO_REQUESTED"].includes(
        String(x.status || "").toUpperCase()
      )
    );
    record(
      "BA-3 open reconciliation exceptions",
      r.status === 200 && open.length >= 2,
      `total=${items.length} open=${open.length}`
    );
  }

  // BA-6 — DRAFT + SUBMITTED orders
  {
    const r = await api("GET", `${OPS}/orders?page=1&pageSize=100`, token);
    const items: any[] = r.json?.data?.items ?? r.json?.data ?? [];
    const byStatus = (s: string) =>
      items.filter((o) => String(o.status || "").toUpperCase() === s).length;
    const draft = byStatus("DRAFT");
    const submitted = byStatus("SUBMITTED");
    record(
      "BA-6 DRAFT orders seeded",
      draft >= 1,
      `DRAFT=${draft}`
    );
    record(
      "BA-6 SUBMITTED orders seeded",
      submitted >= 1,
      `SUBMITTED=${submitted}`
    );
  }

  // BA-2 — execute returns tradeId within reasonable time
  {
    const seedOrder = await prisma.investmentOrder.findFirst({
      where: { orderRef: "ALP-ORD-SENT-SEED" },
      select: { id: true, status: true, tradeId: true },
    });
    if (seedOrder?.tradeId) {
      await prisma.investmentOrder.update({
        where: { id: seedOrder.id },
        data: { status: "SENT_TO_BROKER", tradeId: null },
      });
    }
    const list = await api("GET", `${OPS}/orders?status=SENT_TO_BROKER&pageSize=5`, token);
    const orders: any[] = list.json?.data?.items ?? list.json?.data ?? [];
    const target =
      orders.find((o) => o.orderRef === "ALP-ORD-SENT-SEED") ??
      orders.find((o) => !o.tradeId) ??
      orders[0];
    if (!target?.id) {
      record("BA-2 execute order tradeId + latency", false, "no SENT_TO_BROKER order");
    } else {
      const t0 = Date.now();
      const r = await api(
        "POST",
        `${OPS}/orders/${target.id}/execute`,
        token,
        {},
        { "Idempotency-Key": idem(`walkthrough-exec-${target.id}-${Date.now()}`) }
      );
      const ms = Date.now() - t0;
      const tradeId = r.json?.data?.tradeId ?? r.json?.data?.order?.tradeId ?? r.json?.data?.trade?.id;
      const err = r.json?.message || r.json?.error || "";
      record(
        "BA-2 execute returns tradeId",
        r.status === 200 && Boolean(tradeId),
        `status=${r.status} tradeId=${tradeId || "missing"} ${err}`.trim()
      );
      record(
        "BA-2 execute latency under 45s",
        ms < 45_000,
        `${ms}ms`
      );
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  FAIL: ${r.step} — ${r.detail}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
