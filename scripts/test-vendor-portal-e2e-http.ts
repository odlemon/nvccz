// @ts-nocheck
/**
 * E2E: public vendor registration + portal KYC uploads (HTTP).
 * Requires: server running (see PORT in .env), remote upload reachable for KYC.
 *
 * Usage (PowerShell):
 *   $env:E2E_ADMIN_EMAIL="admin@nts.com"; $env:E2E_ADMIN_PASSWORD="your-password"; npx ts-node --transpile-only scripts/test-vendor-portal-e2e-http.ts
 *
 * Or add E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to .env (do not commit real passwords).
 */
import "dotenv/config";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

const port = process.env.PORT || "3008";
const base = `http://127.0.0.1:${port}`;

async function main() {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.error("Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in the environment (do not commit passwords).");
    process.exit(1);
  }

  console.log(`Base URL: ${base}\n`);

  // 1) Admin login (verify API + optional approve later)
  let jwt: string;
  try {
    const loginRes = await axios.post(`${base}/api/auth/login`, {
      email: adminEmail,
      password: adminPassword,
    });
    if (!loginRes.data?.token) {
      console.error("Login response:", loginRes.data);
      throw new Error("No token in login response");
    }
    jwt = loginRes.data.token;
    console.log("[ok] Admin login");
  } catch (e: any) {
    console.error("[fail] Login:", e.response?.data || e.message);
    process.exit(1);
  }

  const ts = Date.now();
  const vendorEmail = `e2e-portal-${ts}@test.local`;

  // 2) Public registration (profile + bank)
  let kycToken: string;
  let vendorId: string;
  try {
    const reg = await axios.post(`${base}/api/public/vendor-registration`, {
      name: `E2E Portal Vendor ${ts}`,
      email: vendorEmail,
      contactPerson: "E2E Tester",
      phone: "+263000000000",
      address: "Test Address",
      banks: [
        {
          bankName: "Test Bank ZW",
          accountName: "E2E Account",
          accountNumber: `E2E-ACC-${ts}`,
          branchCode: "263-04",
          swiftCode: "TESTZWXX",
          currencyCode: "USD",
          isPrimary: true,
        },
      ],
    });
    const d = reg.data?.data;
    if (!d?.kycUploadToken || !d?.vendorId) {
      console.error("Register response:", reg.data);
      throw new Error("Missing kycUploadToken or vendorId");
    }
    kycToken = d.kycUploadToken;
    vendorId = d.vendorId;
    console.log("[ok] Public registration — vendorId:", vendorId);
    console.log("     kycDocumentsUrl:", d.kycDocumentsUrl);
  } catch (e: any) {
    console.error("[fail] Registration:", e.response?.data || e.message);
    process.exit(1);
  }

  // 3) KYC uploads (3 doc types)
  const tmpDir = path.join(__dirname, "..", "tmp-e2e-kyc");
  fs.mkdirSync(tmpDir, { recursive: true });
  const uploads: { file: string; type: string }[] = [
    { file: path.join(tmpDir, `cr14-${ts}.txt`), type: "CR14" },
    { file: path.join(tmpDir, `bank-${ts}.txt`), type: "BANK_LETTER" },
    { file: path.join(tmpDir, `coi-${ts}.txt`), type: "CERTIFICATE_OF_INCORPORATION" },
  ];

  for (const u of uploads) {
    fs.writeFileSync(u.file, `Mock KYC content for ${u.type} at ${new Date().toISOString()}\n`);
    const fd = new FormData();
    fd.append("file", fs.createReadStream(u.file), { filename: path.basename(u.file) });
    fd.append("documentType", u.type);
    try {
      await axios.post(`${base}/api/public/vendor-registration/${kycToken}/kyc-documents`, fd, {
        headers: fd.getHeaders(),
        maxBodyLength: 30 * 1024 * 1024,
        maxContentLength: 30 * 1024 * 1024,
      });
      console.log(`[ok] KYC upload: ${u.type}`);
    } catch (e: any) {
      console.error(`[fail] KYC upload ${u.type}:`, e.response?.data || e.message);
      process.exit(1);
    }
  }

  // 4) List KYC via portal token
  try {
    const list = await axios.get(`${base}/api/public/vendor-registration/${kycToken}/kyc-documents`);
    const n = list.data?.data?.length ?? 0;
    if (n !== 3) {
      console.error("List response:", list.data);
      throw new Error(`Expected 3 KYC rows, got ${n}`);
    }
    console.log("[ok] Portal KYC list count:", n);
  } catch (e: any) {
    console.error("[fail] List KYC:", e.response?.data || e.message);
    process.exit(1);
  }

  // 5) Accounting vendor list includes this vendor (admin JWT)
  try {
    const vendors = await axios.get(`${base}/api/accounting/vendors`, {
      headers: { Authorization: `Bearer ${jwt}` },
      params: { vendorOrigin: "portal", registrationStatus: "PENDING_REVIEW" },
    });
    const rows = vendors.data?.data ?? [];
    const found = rows.some((v: any) => v.id === vendorId);
    if (!found) {
      console.warn("[warn] Vendor not found in filtered list; checking unfiltered active list...");
      const all = await axios.get(`${base}/api/accounting/vendors`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const ok = (all.data?.data ?? []).some((v: any) => v.id === vendorId);
      if (!ok) throw new Error("Vendor not visible in GET /accounting/vendors");
    }
    console.log("[ok] Vendor visible in accounting list (portal + pending or active list)");
  } catch (e: any) {
    console.error("[fail] Accounting list:", e.response?.data || e.message);
    process.exit(1);
  }

  console.log("\n=== E2E vendor portal + KYC: all steps passed ===");
  console.log("Vendor remains PENDING_REVIEW — approve with:");
  console.log(`  PUT ${base}/api/accounting/vendors/${vendorId}/approve-registration`);
  console.log(`  Header: Authorization: Bearer <admin token>`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
