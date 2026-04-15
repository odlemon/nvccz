// @ts-nocheck
/**
 * UAT 1.3 – Verify mandatory local banking fields (Branch Code, SWIFT, Currency)
 *
 * Test flow:
 *  a) Attempt to create a VendorBank missing branchCode → expect validation error.
 *  b) Attempt to create a VendorBank missing swiftCode  → expect validation error.
 *  c) Attempt to create a VendorBank missing currencyCode → expect validation error.
 *  d) Create a complete VendorBank → expect success (record persists in DB).
 *  e) Cleanup seeded data.
 */

import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  VENDOR_BANK_PAYMENT_READINESS_MESSAGE,
  vendorBankMeetsPaymentReadiness,
} from "../src/utils/vendorPaymentReadiness";

async function createVendorBank(params: {
  vendorId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban?: string;
  branchCode?: string;
  swiftCode?: string;
  currencyCode?: string;
  isPrimary?: boolean;
  createdById: string;
}) {
  if (!vendorBankMeetsPaymentReadiness(params)) {
    throw new Error(VENDOR_BANK_PAYMENT_READINESS_MESSAGE);
  }

  const now = new Date();
  const id = `vb-uat-${Date.now()}`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO vendor_banks
       (id, vendor_id, bank_name, account_name, account_number, iban,
        branch_code, swift_code, currency_code, is_primary, is_active,
        created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    id,
    params.vendorId,
    params.bankName,
    params.accountName,
    params.accountNumber,
    params.iban ?? null,
    params.branchCode!,
    params.swiftCode!,
    params.currencyCode!,
    params.isPrimary ? 1 : 0,
    params.createdById,
    now,
    now
  );

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM vendor_banks WHERE id = ?`,
    id
  );
  return rows[0];
}

async function main() {
  console.log("=== UAT 1.3 — Vendor Bank Payment Readiness Gate ===\n");

  // ── Seed: find or create a test vendor ───────────────────────────────────
  let vendor = await prisma.vendor.findFirst({
    where: { name: { contains: "UAT-1.3" } },
  });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: "UAT-1.3 Test Vendor",
        email: "uat13@test.local",
        isActive: true,
      },
    });
    console.log(`[seed] Created vendor: ${vendor.id}`);
  } else {
    console.log(`[seed] Using existing vendor: ${vendor.id}`);
  }

  // Seed: find any user to use as createdById (raw SQL — User model has no isActive field)
  const userRows = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM users LIMIT 1`);
  if (!userRows.length) throw new Error("No user found for seeding — please seed users first.");
  const createdById = userRows[0].id;

  let passed = 0;
  let failed = 0;

  // ── Test a: missing branchCode ────────────────────────────────────────────
  console.log("\n[a] Attempt: missing branchCode...");
  try {
    await createVendorBank({
      vendorId: vendor.id,
      bankName: "Test Bank",
      accountName: "UAT Account",
      accountNumber: "ACC-UAT-001",
      swiftCode: "TESTBWXX",
      currencyCode: "USD",
      createdById,
    });
    console.log("  FAIL — expected validation error but none was thrown");
    failed++;
  } catch (err: any) {
    if (err.message === VENDOR_BANK_PAYMENT_READINESS_MESSAGE) {
      console.log("  PASS — correct error:", err.message);
      passed++;
    } else {
      console.log("  FAIL — unexpected error:", err.message);
      failed++;
    }
  }

  // ── Test b: missing swiftCode ─────────────────────────────────────────────
  console.log("\n[b] Attempt: missing swiftCode...");
  try {
    await createVendorBank({
      vendorId: vendor.id,
      bankName: "Test Bank",
      accountName: "UAT Account",
      accountNumber: "ACC-UAT-002",
      branchCode: "263-04",
      currencyCode: "USD",
      createdById,
    });
    console.log("  FAIL — expected validation error but none was thrown");
    failed++;
  } catch (err: any) {
    if (err.message === VENDOR_BANK_PAYMENT_READINESS_MESSAGE) {
      console.log("  PASS — correct error:", err.message);
      passed++;
    } else {
      console.log("  FAIL — unexpected error:", err.message);
      failed++;
    }
  }

  // ── Test c: missing currencyCode ──────────────────────────────────────────
  console.log("\n[c] Attempt: missing currencyCode...");
  try {
    await createVendorBank({
      vendorId: vendor.id,
      bankName: "Test Bank",
      accountName: "UAT Account",
      accountNumber: "ACC-UAT-003",
      branchCode: "263-04",
      swiftCode: "TESTBWXX",
      createdById,
    });
    console.log("  FAIL — expected validation error but none was thrown");
    failed++;
  } catch (err: any) {
    if (err.message === VENDOR_BANK_PAYMENT_READINESS_MESSAGE) {
      console.log("  PASS — correct error:", err.message);
      passed++;
    } else {
      console.log("  FAIL — unexpected error:", err.message);
      failed++;
    }
  }

  // ── Test d: all fields present → success ──────────────────────────────────
  console.log("\n[d] Attempt: all mandatory fields present...");
  let createdBankId: string | undefined;
  try {
    const bank = await createVendorBank({
      vendorId: vendor.id,
      bankName: "Standard Chartered Zimbabwe",
      accountName: "UAT Test Account",
      accountNumber: "ACC-UAT-FULL",
      iban: "ZW12 3456 7890 0000 0000 00",
      branchCode: "263-04",
      swiftCode: "SCBLZWHX",
      currencyCode: "USD",
      isPrimary: true,
      createdById,
    });
    createdBankId = bank?.id;
    console.log("  PASS — VendorBank created:", {
      id: bank?.id,
      bankName: bank?.bank_name,
      branchCode: bank?.branch_code,
      swiftCode: bank?.swift_code,
      currencyCode: bank?.currency_code,
    });
    passed++;
  } catch (err: any) {
    console.log("  FAIL — unexpected error:", err.message);
    failed++;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n[cleanup] Removing seeded data...");
  if (createdBankId) {
    await prisma.$executeRawUnsafe(`DELETE FROM vendor_banks WHERE id = ?`, createdBankId);
    console.log("  removed vendor_bank:", createdBankId);
  }
  await prisma.vendor.delete({ where: { id: vendor.id } }).catch(() =>
    prisma.vendor.update({ where: { id: vendor.id }, data: { isActive: false } })
  );
  console.log("  removed vendor:", vendor.id);

  // ── Result ────────────────────────────────────────────────────────────────
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("UAT 1.3 script error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
