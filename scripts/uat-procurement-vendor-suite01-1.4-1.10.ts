// @ts-nocheck
/**
 * Service-level checks for Suite 01 UATs 1.4–1.10 (after 1.1–1.3).
 * Run: npm run uat:procurement:suite01:1.4-1.10
 */

import "dotenv/config";
import { prisma } from "../src/utils/database";
import { listVendorsEligibleForRfqQuery } from "../src/services/VendorProcurementListService";
import { encryptVendorArtifact, decryptVendorArtifact } from "../src/utils/vendorArtifactCrypto";
import { VendorRatingService } from "../src/services/VendorRatingService";
import { VendorBankService } from "../src/services/VendorBankService";
import { VendorSelfRegistrationService } from "../src/services/VendorSelfRegistrationService";
import { ProcurementService } from "../src/services/ProcurementService";
import { Decimal } from "@prisma/client/runtime/library";

async function getAnyUserId(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM users LIMIT 1`);
  if (!rows.length) throw new Error("No users in DB");
  return rows[0].id;
}

async function getAnyCurrencyId(): Promise<string> {
  const c = await prisma.currency.findFirst({ where: { isActive: true } });
  if (!c) throw new Error("No currency");
  return c.id;
}

async function main() {
  console.log("=== UAT Suite 01 — 1.4 through 1.10 (service checks) ===\n");
  const userId = await getAnyUserId();
  const currencyId = await getAnyCurrencyId();
  let passed = 0;
  let failed = 0;
  const ok = (name: string) => {
    console.log(`  PASS — ${name}`);
    passed++;
  };
  const bad = (name: string, err: any) => {
    console.log(`  FAIL — ${name}:`, err?.message || err);
    failed++;
  };

  // ── 1.4 Category filter for RFQ list ─────────────────────────────────────
  try {
    const v1 = await prisma.vendor.create({
      data: {
        name: `UAT-SUITE-SOLAR-${Date.now()}`,
        email: `solar${Date.now()}@uat.local`,
        category: "SOLAR",
        isActive: true,
        registrationStatus: "ACTIVE",
      },
    });
    const v2 = await prisma.vendor.create({
      data: {
        name: `UAT-SUITE-IT-${Date.now()}`,
        email: `it${Date.now()}@uat.local`,
        category: "IT_SERVICES",
        isActive: true,
        registrationStatus: "ACTIVE",
      },
    });
    const list = await listVendorsEligibleForRfqQuery({ sourcingCategory: "SOLAR" });
    const ids = list.map((x) => x.id);
    if (!ids.includes(v1.id)) throw new Error("SOLAR vendor missing from filtered list");
    if (ids.includes(v2.id)) throw new Error("IT vendor should not appear for SOLAR filter");
    await prisma.vendor.deleteMany({ where: { id: { in: [v1.id, v2.id] } } });
    ok("1.4 RFQ vendor list filters by sourcing category");
  } catch (e) {
    bad("1.4", e);
  }

  // ── 1.5 Artifact crypto roundtrip (AES-GCM) ───────────────────────────────
  try {
    const plain = Buffer.from("CR14-simulated-content", "utf8");
    const { ciphertext, iv, authTag } = encryptVendorArtifact(plain);
    const out = decryptVendorArtifact(ciphertext, iv, authTag);
    if (out.toString("utf8") !== plain.toString("utf8")) throw new Error("decrypt mismatch");
    ok("1.5 KYC payload encrypt/decrypt (at-rest)");
  } catch (e) {
    bad("1.5", e);
  }

  // ── 1.6 Blacklisted excluded from RFQ list ─────────────────────────────────
  try {
    const vb = await prisma.vendor.create({
      data: {
        name: `UAT-BL-${Date.now()}`,
        email: `bl${Date.now()}@uat.local`,
        isBlacklisted: true,
        isActive: true,
        registrationStatus: "ACTIVE",
      },
    });
    const list = await listVendorsEligibleForRfqQuery({});
    if (list.some((x) => x.id === vb.id)) throw new Error("blacklisted vendor leaked into list");
    await prisma.vendor.delete({ where: { id: vb.id } });
    ok("1.6 Blacklisted vendor hidden from invite list");
  } catch (e) {
    bad("1.6", e);
  }

  // ── 1.7 Vendor rating from GRN vs PO expected date ──────────────────────
  try {
    const vend = await prisma.vendor.create({
      data: {
        name: `UAT-RATING-${Date.now()}`,
        email: `rate${Date.now()}@uat.local`,
        isActive: true,
        registrationStatus: "ACTIVE",
      },
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-UAT-R-${Date.now()}`,
        vendorId: vend.id,
        createdById: userId,
        status: "DRAFT",
        subtotal: new Decimal(1),
        taxAmount: new Decimal(0),
        totalAmount: new Decimal(1),
        expectedDeliveryDate: new Date(Date.now() + 86400000 * 10),
        items: {
          create: [
            {
              itemName: "X",
              quantity: new Decimal(1),
              unitPrice: new Decimal(1),
              totalPrice: new Decimal(1),
              quantityReceived: new Decimal(0),
              quantityPending: new Decimal(1),
            },
          ],
        },
      },
      include: { items: true },
    });
    const item = po.items[0];
    const early = new Date(Date.now() - 86400000);
    await prisma.goodsReceivedNote.create({
      data: {
        grnNumber: `GRN-UAT-R-${Date.now()}`,
        purchaseOrderId: po.id,
        receivedById: userId,
        status: "RECEIVED",
        receivedDate: early,
        items: {
          create: [
            {
              purchaseOrderItemId: item.id,
              quantityOrdered: new Decimal(1),
              quantityReceived: new Decimal(1),
              quantityAccepted: new Decimal(1),
              quantityRejected: new Decimal(0),
            },
          ],
        },
      },
    });
    const { rating } = await VendorRatingService.recalculateForVendor(vend.id);
    if (!rating || Number(rating) < 4.5) throw new Error(`expected high rating, got ${rating}`);
    await prisma.goodsReceivedNote.deleteMany({ where: { purchaseOrderId: po.id } });
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    await prisma.vendor.delete({ where: { id: vend.id } });
    ok("1.7 Vendor rating recalculated from GRN vs promised date");
  } catch (e) {
    bad("1.7", e);
  }

  // ── 1.8 PO defaults currency from vendor settlement ───────────────────────
  try {
    const vend = await prisma.vendor.create({
      data: {
        name: `UAT-SETTLE-${Date.now()}`,
        email: `set${Date.now()}@uat.local`,
        settlementCurrencyId: currencyId,
        isActive: true,
        registrationStatus: "ACTIVE",
      },
    });
    const po = await ProcurementService.createPurchaseOrder({
      vendorId: vend.id,
      createdById: userId,
      items: [{ itemName: "A", quantity: 1, unitPrice: 10 }],
    });
    if (po.currencyId !== currencyId) throw new Error("PO currency not defaulted from vendor");
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    await prisma.vendor.delete({ where: { id: vend.id } });
    ok("1.8 Purchase order picks vendor settlement currency when omitted");
  } catch (e) {
    bad("1.8", e);
  }

  // ── 1.9 Critical bank field change → audit log with HIGH marker ─────────
  try {
    const vend = await prisma.vendor.create({
      data: {
        name: `UAT-BANKAUD-${Date.now()}`,
        email: `ba${Date.now()}@uat.local`,
        isActive: true,
        registrationStatus: "ACTIVE",
      },
    });
    const bank = await VendorBankService.create({
      vendorId: vend.id,
      bankName: "B",
      accountName: "A",
      accountNumber: "111",
      iban: null,
      branchCode: "263",
      swiftCode: "TESTZWXX",
      currencyCode: "USD",
      createdById: userId,
    });
    const before = await prisma.auditLog.count({
      where: { entityType: "VendorBank", entityId: bank.id },
    });
    await VendorBankService.update(bank.id, {
      accountNumber: "222",
      updatedById: userId,
    });
    const after = await prisma.auditLog.count({
      where: { entityType: "VendorBank", entityId: bank.id },
    });
    if (after <= before) throw new Error("expected new audit row for bank update");
    const last = await prisma.auditLog.findFirst({
      where: { entityType: "VendorBank", entityId: bank.id },
      orderBy: { createdAt: "desc" },
    });
    const nv = last?.newValues as any;
    if (nv?._priority !== "HIGH") throw new Error("expected HIGH priority on critical bank change");
    await prisma.vendorBank.deleteMany({ where: { vendorId: vend.id } });
    await prisma.vendor.delete({ where: { id: vend.id } });
    ok("1.9 Audit trail flags HIGH priority on account number change (email also sent if CFO configured)");
  } catch (e) {
    bad("1.9", e);
  }

  // ── 1.10 Public portal registration (profile + banks) + approve ──────────
  try {
    const ts = Date.now();
    const { vendor, token, banks } = await VendorSelfRegistrationService.registerFromPublicPortal({
      name: `UAT Self Co ${ts}`,
      email: `self${ts}@uat.local`,
      phone: "123",
      banks: [
        {
          bankName: "Test Bank",
          accountName: "UAT Account",
          accountNumber: `UAT-${ts}`,
          branchCode: "263",
          swiftCode: "TESTZWXX",
          currencyCode: "USD",
        },
      ],
    });
    if (!token || vendor.registrationStatus !== "PENDING_REVIEW" || banks.length !== 1) {
      throw new Error("registration state invalid");
    }
    const row = await VendorSelfRegistrationService.getByToken(token);
    if (!row?.id) throw new Error("token lookup failed");
    const approved = await VendorSelfRegistrationService.approvePendingVendor(vendor.id);
    if (approved.registrationStatus !== "ACTIVE" || approved.selfRegistrationToken != null) {
      throw new Error("approve did not clear token / set ACTIVE");
    }
    await prisma.vendorBank.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.vendor.delete({ where: { id: vendor.id } });
    ok("1.10 Public portal register (with bank) + GP approve → ACTIVE");
  } catch (e) {
    bad("1.10", e);
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
