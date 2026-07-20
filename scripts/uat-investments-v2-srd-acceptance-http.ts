/**
 * Optional final SRD acceptance verifier for Investments V2.
 * Smoke-checks phases 1-4 endpoints + contract invariants on DEV nts.
 *
 * npm run uat:investments-v2:srd-acceptance
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  BASE,
  api,
  ensureApprovedInstrument,
  ensurePrimaryFund,
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
  await assertDevDatabase(prisma, "uat:investments-v2:srd-acceptance");
  console.log(`Investments V2 SRD acceptance — ${BASE}\n`);

  const token = await login();
  const fund = await ensurePrimaryFund(prisma);
  const instrument = await ensureApprovedInstrument(prisma);
  console.log(`fundId=${fund.id}`);
  console.log(`instrumentId=${instrument.id}\n`);

  const paths: Array<[string, string]> = [
    ["p1.dashboard", "/investment-ops/dashboard/summary?period=MTD"],
    ["p1.portfolios", "/investment-ops/portfolios"],
    ["p1.instruments", "/investment-ops/instruments?page=1&pageSize=5"],
    ["p1.market", "/investment-ops/market-data/prices/latest"],
    ["p2.orders", `/investment-ops/orders?fundId=${fund.id}&page=1&pageSize=5`],
    ["p2.compliance", `/investment-ops/compliance/rules?fundId=${fund.id}`],
    ["p3.valuation", `/investment-ops/valuation/runs?fundId=${fund.id}`],
    ["p3.recon", `/investment-ops/reconciliation/batches?fundId=${fund.id}`],
    ["p3.accounting", `/investment-ops/accounting/events?fundId=${fund.id}&page=1&pageSize=5`],
    ["p3.documents", `/investment-ops/documents?fundId=${fund.id}`],
    ["p4.templates", "/investment-ops/reports/templates"],
    ["p4.reports", `/investment-ops/reports?fundId=${fund.id}&page=1&pageSize=5`],
    ["p4.outbox", "/investment-ops/outbox-events?page=1&pageSize=5"],
    ["p4.audit", "/investment-ops/audit-events?page=1&pageSize=5"],
    ["p4.capabilities", `/investment-ops/capabilities?fundId=${fund.id}`],
  ];

  for (const [step, path] of paths) {
    const res = await api("GET", path, token);
    record(step, res.status < 400 && res.json?.success !== false, `${res.status} ${path}`);
  }

  const fourEye = await prisma.investmentOpsSetting.findUnique({
    where: { settingKey: "four_eye_orders" },
  });
  record(
    "contract.fourEyeSetting",
    Boolean(fourEye),
    fourEye ? `present enabled=${(fourEye.settingValue as any)?.enabled}` : "missing"
  );

  const lifecycleOrders = await prisma.investmentOrder.groupBy({
    by: ["status"],
    where: { fundId: fund.id },
    _count: true,
  });
  record(
    "contract.orderLifecycleCoverage",
    lifecycleOrders.length >= 3,
    lifecycleOrders.map((r) => `${r.status}:${r._count}`).join(", ") || "none"
  );

  const approvedTick = await prisma.listedEquityPriceTick.count({
    where: { validationStatus: "APPROVED" },
  });
  const rejectedTick = await prisma.listedEquityPriceTick.count({
    where: { validationStatus: "REJECTED" },
  });
  record(
    "contract.priceApprovals",
    approvedTick > 0 && rejectedTick > 0,
    `approved=${approvedTick} rejected=${rejectedTick}`
  );

  summarizeFail(results);
  console.log("\nSRD acceptance verifier passed on DEV nts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
