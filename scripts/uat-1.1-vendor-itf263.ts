/**
 * UAT 1.1 — Register vendor with valid ZIMRA ITF263 text: parse expiry, ACTIVE compliance,
 * re-validation alert date = 30 calendar days before expiry (UTC date-only).
 *
 * Run: npm run uat:procurement:1.1
 *
 * Optional HTTP check (dev server + auth): set RUN_HTTP_UAT=1, BASE_URL, UAT_EMAIL, UAT_PASSWORD
 */
import "dotenv/config";
import { buildTaxComplianceData } from "../src/services/VendorTaxComplianceService";
import {
  computeRevalidationAlertDueAt,
  utcDateOnly,
} from "../src/utils/itf263TaxClearance";
import { prisma } from "../src/utils/database";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function sameUtcDay(a: Date, b: Date): boolean {
  const ua = utcDateOnly(a).getTime();
  const ub = utcDateOnly(b).getTime();
  return ua === ub;
}

async function runServiceLevelUat() {
  const itf263CertificateText = `ZIMRA Tax Clearance Certificate ITF 263
Taxpayer: UAT Fixtures Ltd
Valid until: 31/12/2028
Reference: ITF263-UAT`;

  const compliance = buildTaxComplianceData({
    itf263CertificateText,
  });

  if ("error" in compliance) {
    throw new Error(compliance.error);
  }
  if ("skip" in compliance) {
    throw new Error("Expected ITF263 data to be applied, not skip");
  }

  const expectedExpiry = utcDateOnly(new Date(Date.UTC(2028, 11, 31)));
  const expectedAlert = computeRevalidationAlertDueAt(expectedExpiry);

  assert(
    sameUtcDay(compliance.taxClearanceExpiryDate, expectedExpiry),
    `Expected expiry 2028-12-31 UTC, got ${compliance.taxClearanceExpiryDate.toISOString()}`
  );
  assert(
    sameUtcDay(compliance.taxRevalidationAlertDueAt, expectedAlert),
    `Expected alert 30 days before expiry (${expectedAlert.toISOString()}), got ${compliance.taxRevalidationAlertDueAt.toISOString()}`
  );
  assert(compliance.taxComplianceStatus === "ACTIVE", "taxComplianceStatus must be ACTIVE");
  assert(compliance.isActive === true, "isActive must be true");
  assert(compliance.meta.source === "parsed", "expirySource should be parsed from certificate text");

  const name = `UAT-1.1-ITF263-${Date.now()}`;
  const vendor = await prisma.vendor.create({
    data: {
      name,
      email: `uat1.1.${Date.now()}@example.invalid`,
      ...{
        taxComplianceStatus: compliance.taxComplianceStatus,
        taxClearanceExpiryDate: compliance.taxClearanceExpiryDate,
        taxRevalidationAlertDueAt: compliance.taxRevalidationAlertDueAt,
        taxRevalidationAlertNotifiedAt: compliance.taxRevalidationAlertNotifiedAt,
        isActive: compliance.isActive,
      },
    },
  });

  try {
    assert(vendor.taxComplianceStatus === "ACTIVE", "DB: taxComplianceStatus ACTIVE");
    assert(
      vendor.taxClearanceExpiryDate &&
        sameUtcDay(vendor.taxClearanceExpiryDate, expectedExpiry),
      "DB: taxClearanceExpiryDate"
    );
    assert(
      vendor.taxRevalidationAlertDueAt &&
        sameUtcDay(vendor.taxRevalidationAlertDueAt, expectedAlert),
      "DB: taxRevalidationAlertDueAt"
    );
    console.log("[ok] UAT 1.1 service/DB: vendor", vendor.id, name);
  } finally {
    await prisma.vendor.delete({ where: { id: vendor.id } }).catch(() => {
      console.warn("[warn] Could not delete test vendor (FKs?); deactivate instead");
      return prisma.vendor.update({
        where: { id: vendor.id },
        data: { isActive: false },
      });
    });
  }
}

async function runHttpUat() {
  if (process.env.RUN_HTTP_UAT !== "1") return;

  const axios = (await import("axios")).default;
  const base =
    process.env.BASE_URL || `http://localhost:${process.env.PORT || "3009"}`;
  const email = process.env.UAT_EMAIL || "admin@nts.com";
  const password = process.env.UAT_PASSWORD || "admin123";

  const login = await axios.post(
    `${base}/api/auth/login`,
    { email, password },
    { validateStatus: () => true, timeout: 15000 }
  );
  assert(login.status === 200 && login.data?.token, "HTTP login failed");

  const token = login.data.token as string;
  const name = `UAT-1.1-HTTP-${Date.now()}`;
  const body = {
    name,
    email: `http.uat1.1.${Date.now()}@example.invalid`,
    itf263CertificateText: `ZIMRA Tax Clearance ITF263\nValid until: 15/06/2029\n`,
  };

  const res = await axios.post(
    `${base}/api/accounting/vendors`,
    body,
    {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
      timeout: 20000,
    }
  );

  assert(res.status === 201, `POST /api/accounting/vendors expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
  assert(res.data?.success === true, "success true");
  assert(res.data?.taxCompliance?.status === "ACTIVE", "taxCompliance.status ACTIVE");
  const exp = new Date(res.data.taxCompliance.taxClearanceExpiryDate);
  const alert = new Date(res.data.taxCompliance.taxRevalidationAlertDueAt);
  const wantAlert = computeRevalidationAlertDueAt(utcDateOnly(exp));
  assert(sameUtcDay(alert, wantAlert), "HTTP response alert date = 30 days before expiry");

  const vid = res.data.data?.id as string;
  if (vid) {
    await prisma.vendor.delete({ where: { id: vid } }).catch(() =>
      prisma.vendor.update({ where: { id: vid }, data: { isActive: false } })
    );
  }
  console.log("[ok] UAT 1.1 HTTP: POST /api/accounting/vendors");
}

async function main() {
  await runServiceLevelUat();
  await runHttpUat();
  console.log("\nUAT 1.1 PASSED (service/DB" + (process.env.RUN_HTTP_UAT === "1" ? " + HTTP" : "") + ").");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
