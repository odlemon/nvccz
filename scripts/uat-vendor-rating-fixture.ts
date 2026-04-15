/**
 * Ensures DB has a Purchase Order suitable for vendor-rating UAT (expectedDeliveryDate + pending qty),
 * **creates at least one GRN** when the vendor has no RECEIVED/APPROVED GRNs yet (so `vendorRating` is
 * populated — rating is only calculated from GRN history, not from the PO alone),
 * then prints Postman-ready URLs and JSON bodies.
 *
 * Run: npx ts-node --transpile-only scripts/uat-vendor-rating-fixture.ts
 * Or:  npm run uat:procurement:vendor-rating-fixture
 *
 * Requires: DATABASE_URL, at least one User, one active Currency (prefers USD).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ProcurementService } from "../src/services/ProcurementService";
import { VendorRatingService } from "../src/services/VendorRatingService";

const prisma = new PrismaClient();

const FIXTURE_VENDOR_NAME = "UAT Vendor Rating Fixture";

/** Promised delivery day (end-of-day logic in VendorRatingService uses this calendar day). */
const PROMISED_DATE = new Date("2026-06-15T12:00:00.000Z");

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error("No users in database — create a user first.");
  }

  const currency =
    (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { isActive: true } }));
  if (!currency) {
    throw new Error("No active currency — seed currencies first.");
  }

  let vendor = await prisma.vendor.findFirst({
    where: { name: FIXTURE_VENDOR_NAME, isActive: true },
  });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: FIXTURE_VENDOR_NAME,
        email: "uat-vendor-rating-fixture@example.local",
        isActive: true,
        registrationStatus: "ACTIVE",
        selfRegistered: false,
        settlementCurrencyId: currency.id,
      },
    });
    console.log("Created fixture vendor:", vendor.id);
  }

  let po = await prisma.purchaseOrder.findFirst({
    where: {
      vendorId: vendor.id,
      expectedDeliveryDate: { not: null },
      items: { some: { quantityPending: { gt: 0 } } },
    },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { createdAt: "asc" } }, vendor: true },
  });

  if (!po) {
    const created = await ProcurementService.createPurchaseOrder({
      vendorId: vendor.id,
      currencyId: currency.id,
      expectedDeliveryDate: PROMISED_DATE,
      createdById: user.id,
      paymentTerms: "Net 30",
      items: [
        { itemName: "UAT Rating Line A", quantity: 10, unitPrice: 25, unit: "ea", description: "Fixture" },
        { itemName: "UAT Rating Line B", quantity: 10, unitPrice: 30, unit: "ea" },
      ],
    });
    po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: { orderBy: { createdAt: "asc" } }, vendor: true },
    });
    console.log("Created fixture PO:", po.poNumber, po.id);
  } else {
    console.log("Using existing fixture PO:", po.poNumber, po.id);
  }

  let line = po.items.find((i) => Number(i.quantityPending) > 0);
  if (!line) {
    throw new Error("Fixture PO has no lines with quantityPending > 0");
  }

  const onTimeReceived = new Date("2026-06-14T16:00:00.000Z");
  const lateReceived = new Date("2026-06-30T10:00:00.000Z");

  const qualifyingGrnCount = await prisma.goodsReceivedNote.count({
    where: {
      status: { in: ["RECEIVED", "APPROVED"] },
      purchaseOrder: { vendorId: vendor.id },
    },
  });

  if (qualifyingGrnCount === 0) {
    const pending0 = Number(line.quantityPending);
    const seedQty = Math.min(2, pending0);
    await ProcurementService.createGoodsReceivedNote(
      po.id,
      user.id,
      [
        {
          purchaseOrderItemId: line.id,
          quantityReceived: seedQty,
          quantityAccepted: seedQty,
          quantityRejected: 0,
          qualityStatus: "PASSED",
        },
      ],
      { receivedDate: onTimeReceived }
    );
    console.log(
      "Seeded first GRN (on-time) — vendorRating is now calculated from GRN history (PO alone does not set it)."
    );
    po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
      include: { items: { orderBy: { createdAt: "asc" } }, vendor: true },
    });
    line = po.items.find((i) => Number(i.quantityPending) > 0) || line;
  }

  const pending = Number(line.quantityPending);
  const qtyThisGrn = Math.min(2, pending);

  const port = process.env.PORT || "3008";
  const base = (process.env.APP_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");

  const grnBodyOnTime = {
    purchaseOrderId: po.id,
    receivedDate: onTimeReceived.toISOString(),
    items: [
      {
        purchaseOrderItemId: line.id,
        quantityReceived: qtyThisGrn,
        quantityAccepted: qtyThisGrn,
        quantityRejected: 0,
        qualityStatus: "PASSED",
      },
    ],
  };

  const grnBodyLate = {
    purchaseOrderId: po.id,
    receivedDate: lateReceived.toISOString(),
    items: [
      {
        purchaseOrderItemId: line.id,
        quantityReceived: qtyThisGrn,
        quantityAccepted: qtyThisGrn,
        quantityRejected: 0,
        qualityStatus: "PASSED",
      },
    ],
  };

  await VendorRatingService.recalculateForVendor(vendor.id);

  const vendorSnapshot = await prisma.vendor.findUnique({
    where: { id: vendor.id },
    select: { vendorRating: true, vendorRatingUpdatedAt: true },
  });

  console.log("\n========== VENDOR RATING UAT — copy into Postman ==========\n");
  console.log("Fixture vendorId:", vendor.id);
  console.log("Fixture PO id:", po.id, "| promised (expectedDeliveryDate):", po.expectedDeliveryDate?.toISOString());
  console.log("First line with pending:", line.id, "| quantityPending:", pending, "| using qtyThisGrn:", qtyThisGrn);
  console.log(
    "Vendor rating now (after any auto-seed GRN):",
    vendorSnapshot?.vendorRating?.toString() ?? "null",
    "| updatedAt:",
    vendorSnapshot?.vendorRatingUpdatedAt?.toISOString() ?? "null"
  );
  console.log("\n--- 1) Login (get Bearer token) ---");
  console.log(`POST ${base}/api/auth/login`);
  console.log('Body: { "email": "<your user>", "password": "<your password>" }');
  console.log("\n--- 2a) GRN — on-time / early (expect score 5 for this GRN) ---");
  console.log(`POST ${base}/api/procurement/goods-received-notes`);
  console.log("Authorization: Bearer <token>");
  console.log("Content-Type: application/json");
  console.log(JSON.stringify(grnBodyOnTime, null, 2));
  console.log("\n--- 2b) GRN — late (re-run after 2a with a fresh qty, or reset PO; see note) ---");
  console.log(`POST ${base}/api/procurement/goods-received-notes`);
  console.log(JSON.stringify(grnBodyLate, null, 2));
  console.log("\n--- 3) Check vendor rating ---");
  console.log(`GET ${base}/api/accounting/vendors/${vendor.id}`);
  console.log("Authorization: Bearer <token>");
  console.log("\nNote: Run 2a first. For 2b you need another GRN on the same PO — use the next");
  console.log("pending line or same line after 2a consumes qty (script uses min(2, pending)).");
  console.log("Re-run this script after partial receipts to print updated line id / pending.");
  console.log("================================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
