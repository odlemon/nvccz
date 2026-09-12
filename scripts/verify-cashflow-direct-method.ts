/**
 * Quick verification script for the rewritten (Direct Method) cash flow statement.
 *
 * Runs the service against the current active currency for a user-specified month
 * (default: current month) and prints:
 *   - Top-level response keys (to confirm no structural drift)
 *   - Section totals + lineItems (per activity)
 *   - Reconciliation: sum(operating+investing+financing) vs netCashFlow vs (end - begin)
 *
 * Usage (PowerShell):
 *   $env:CF_MONTH="2026-04"; npx ts-node scripts/verify-cashflow-direct-method.ts
 */

import { prisma } from "../src/utils/database";
import { CashFlowService } from "../src/services/CashFlowService";

function parseMonth(input?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-based
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split("-").map((n) => parseInt(n, 10));
    year = y;
    month = m - 1;
  }
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { start, end, label };
}

async function main() {
  const { start, end, label } = parseMonth(process.env.CF_MONTH);
  const currency = await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) {
    console.error("No active currency found — aborting");
    process.exit(1);
  }

  console.log(`\n=== Cash Flow Direct-Method Verification ===`);
  console.log(`Period : ${label}  (${start.toISOString()} → ${end.toISOString()})`);
  console.log(`Currency: ${currency.code} (${currency.id})\n`);

  const statement = await CashFlowService.generateCashFlowStatement({
    startDate: start,
    endDate: end,
    currencyId: currency.id
  });

  // 1. Top-level keys
  const topKeys = Object.keys(statement).sort();
  console.log("Top-level response keys:", topKeys.join(", "));
  const expected = [
    "activityBasedNetCashFlow",
    "beginningCashBalance",
    "currency",
    "endingCashBalance",
    "financingActivities",
    "generatedAt",
    "investingActivities",
    "netCashFlow",
    "operatingActivities",
    "period",
    "presentation"
  ].sort();
  const missing = expected.filter((k) => !topKeys.includes(k));
  const extra = topKeys.filter((k) => !expected.includes(k));
  if (missing.length) console.log("  ❌ MISSING keys:", missing.join(", "));
  if (extra.length) console.log("  ⚠️  EXTRA keys (additive, harmless):", extra.join(", "));
  if (!missing.length && !extra.length) console.log("  ✅ Response shape preserved exactly.\n");

  // 2. Section shapes + line items
  const sections: Array<["operating" | "investing" | "financing", any]> = [
    ["operating", statement.operatingActivities],
    ["investing", statement.investingActivities],
    ["financing", statement.financingActivities]
  ];
  for (const [name, s] of sections) {
    const sectionKeys = Object.keys(s || {}).sort();
    console.log(`--- ${name.toUpperCase()} (keys: ${sectionKeys.join(",")}) ---`);
    console.log(
      `  total=${Number(s.total).toFixed(2)}  accountCount=${s.accountCount}  lineItems=${Array.isArray(
        s.lineItems
      ) ? s.lineItems.length : "n/a"}`
    );
    if (Array.isArray(s.lineItems)) {
      let sum = 0;
      for (const li of s.lineItems) {
        sum += Number(li.amount || 0);
        console.log(
          `    • ${li.accountNo || "----"}  ${String(li.accountName).padEnd(40)}  ${Number(li.amount).toFixed(2)}`
        );
      }
      const delta = Math.abs(Number(s.total) - sum);
      console.log(`  Σ lineItems.amount = ${sum.toFixed(2)}  (delta vs total: ${delta.toFixed(4)})`);
    }
    console.log();
  }

  // 3. Reconciliation
  const opT = Number(statement.operatingActivities.total || 0);
  const inT = Number(statement.investingActivities.total || 0);
  const fnT = Number(statement.financingActivities.total || 0);
  const activityBased = Number(statement.activityBasedNetCashFlow || 0);
  const net = Number(statement.netCashFlow || 0);
  const begin = Number(statement.beginningCashBalance || 0);
  const endBal = Number(statement.endingCashBalance || 0);
  const cashDelta = endBal - begin;

  console.log("--- RECONCILIATION ---");
  console.log(`  operating+investing+financing = ${(opT + inT + fnT).toFixed(2)}`);
  console.log(`  activityBasedNetCashFlow      = ${activityBased.toFixed(2)}`);
  console.log(`  netCashFlow                   = ${net.toFixed(2)}`);
  console.log(`  endingCash − beginningCash    = ${cashDelta.toFixed(2)}`);
  console.log(`  |activityBased − netCashFlow| = ${Math.abs(activityBased - net).toFixed(4)}`);
  console.log(`  |netCashFlow − cashDelta|     = ${Math.abs(net - cashDelta).toFixed(4)}`);
  console.log();

  // 4. Presentation sanity
  const p = (statement as any).presentation;
  if (p) {
    console.log("--- PRESENTATION ---");
    for (const k of ["operating", "investing", "financing"] as const) {
      const sec = p[k];
      const recSum = (sec.cashReceipts || []).reduce((a: number, x: any) => a + Number(x.amount || 0), 0);
      const paySum = (sec.cashPayments || []).reduce((a: number, x: any) => a + Number(x.amount || 0), 0);
      const addSum = (sec.additions || []).reduce((a: number, x: any) => a + Number(x.amount || 0), 0);
      const adjSum = (sec.adjustments || []).reduce((a: number, x: any) => a + Number(x.amount || 0), 0);
      const computed = recSum + paySum + addSum + adjSum;
      console.log(
        `  ${k.padEnd(10)} total=${Number(sec.total).toFixed(2)}  Σ(components)=${computed.toFixed(2)}  delta=${Math.abs(
          Number(sec.total) - computed
        ).toFixed(4)}`
      );
    }
    console.log(
      `  netChangeInCash=${Number(p.netChangeInCash).toFixed(2)}  begin=${Number(p.beginningCashBalance).toFixed(2)}  end=${Number(p.endingCashBalance).toFixed(2)}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
