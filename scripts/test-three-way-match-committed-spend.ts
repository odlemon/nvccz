// @ts-nocheck
/**
 * Three-Way Match: PO for 5000 ZIG → Dashboard shows 5000 in Committed Spend; GL unchanged until bill is posted.
 *
 * Run: npx ts-node scripts/test-three-way-match-committed-spend.ts
 */
import { prisma } from "../src/utils/database";
import { ProcurementService } from "../src/services/ProcurementService";
import { AccountingDashboardService } from "../src/services/AccountingDashboardService";

const TARGET_TOTAL_ZIG = 5000;
const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(msg);
}

async function run() {
  console.log("Three-Way Match – Committed Spend\n");

  const currency = await prisma.currency.findFirst({ where: { code: "ZIG" } }) ?? await prisma.currency.findFirst();
  const vendor = await prisma.vendor.findFirst();
  const user = await prisma.user.findFirst();

  if (!currency?.id || !vendor?.id || !user?.id) {
    console.error("Need currency (ZIG), vendor, and user.");
    process.exit(1);
  }

  // Subtotal so that subtotal + 15% tax = 5000 → subtotal = 5000/1.15
  const subtotal = TARGET_TOTAL_ZIG / 1.15;
  const unitPrice = Math.round(subtotal * 100) / 100;

  const jeCountBefore = await prisma.journalEntry.count();

  const po = await ProcurementService.createPurchaseOrder({
    vendorId: vendor.id,
    currencyId: currency.id,
    createdById: user.id,
    items: [
      { itemName: "Three-Way Match Test Item", quantity: 1, unitPrice, description: "PO to test committed spend" },
    ],
  });

  const jeCountAfter = await prisma.journalEntry.count();
  assert(jeCountAfter === jeCountBefore, "GL unchanged: no new journal entries when creating PO");

  const totalAmount = Number(po.totalAmount);
  assert(Math.abs(totalAmount - TARGET_TOTAL_ZIG) < 1, `PO total should be ~${TARGET_TOTAL_ZIG} ZIG, got ${totalAmount}`);

  const dashboard = await AccountingDashboardService.getDashboardData({
    currencyId: currency.id,
    period: "YTD",
  });

  assert(
    typeof dashboard.committedSpend === "number",
    "Dashboard must expose committedSpend"
  );
  assert(
    dashboard.committedSpend >= TARGET_TOTAL_ZIG - 1,
    `Dashboard committed spend should reflect PO: expected >= ${TARGET_TOTAL_ZIG}, got ${dashboard.committedSpend}`
  );

  console.log("PO total (ZIG):", totalAmount);
  console.log("Dashboard committedSpend:", dashboard.committedSpend);
  console.log("Journal entries before/after PO:", jeCountBefore, jeCountAfter);

  if (failures.length > 0) {
    console.error("\nFailures:", failures);
    process.exit(1);
  }
  console.log("\nThree-Way Match (committed spend, GL unchanged) test passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
