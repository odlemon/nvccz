/**
 * UAT — Duplicate BP / VAT on vendor onboarding: expect 400 "Duplicate Entity Detected".
 *
 * Run: npm run uat:procurement:1.2
 * Optional HTTP: RUN_HTTP_UAT=1 (requires dev server + UAT_EMAIL / UAT_PASSWORD)
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { VendorRegistrationDedupeService } from "../src/services/VendorRegistrationDedupeService";
import { DUPLICATE_ENTITY_MESSAGE } from "../src/utils/vendorRegistrationDedupe";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runServiceUat() {
  const suffix = Date.now();
  const vat = `VAT-UAT-${suffix}`;
  const bp = `BP-UAT-${suffix}`;

  const a = await prisma.vendor.create({
    data: {
      name: `UAT Dup A ${suffix}`,
      email: `uat.dup.a.${suffix}@example.invalid`,
      taxNumber: vat,
      bpNumber: bp,
    },
  });

  try {
    const dupVat = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
      taxNumber: vat,
      bpNumber: `OTHER-BP-${suffix}`,
    });
    assert(!dupVat.ok && dupVat.message === DUPLICATE_ENTITY_MESSAGE, "duplicate VAT should fail");

    const dupBp = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
      taxNumber: `OTHER-VAT-${suffix}`,
      bpNumber: bp,
    });
    assert(!dupBp.ok && dupBp.message === DUPLICATE_ENTITY_MESSAGE, "duplicate BP should fail");

    const dupNorm = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
      taxNumber: ` ${vat.replace(/-/g, " ")} `,
    });
    assert(!dupNorm.ok, "normalized VAT match should fail");

    const okSelf = await VendorRegistrationDedupeService.assertNoDuplicateIdentifiers({
      taxNumber: vat,
      bpNumber: bp,
      excludeVendorId: a.id,
    });
    assert(okSelf.ok, "same vendor excluded should pass");

    console.log("[ok] UAT duplicate BP/VAT service checks");
  } finally {
    await prisma.vendor.delete({ where: { id: a.id } }).catch(() =>
      prisma.vendor.update({ where: { id: a.id }, data: { isActive: false } })
    );
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
  assert(login.status === 200 && login.data?.token, "login failed");

  const token = login.data.token as string;
  const suffix = Date.now();
  const vat = `HTTP-VAT-${suffix}`;
  const bp = `HTTP-BP-${suffix}`;

  const first = await axios.post(
    `${base}/api/accounting/vendors`,
    {
      name: `UAT HTTP Dup First ${suffix}`,
      email: `http.dup.1.${suffix}@example.invalid`,
      vatNumber: vat,
      bpNumber: bp,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    }
  );
  assert(first.status === 201, `first vendor 201, got ${first.status}`);

  const second = await axios.post(
    `${base}/api/accounting/vendors`,
    {
      name: `UAT HTTP Dup Second ${suffix}`,
      email: `http.dup.2.${suffix}@example.invalid`,
      taxNumber: vat,
      bpNumber: `OTHER-${suffix}`,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    }
  );
  assert(second.status === 400, `duplicate VAT expect 400, got ${second.status}`);
  assert(
    second.data?.message === DUPLICATE_ENTITY_MESSAGE,
    `message "${DUPLICATE_ENTITY_MESSAGE}", got ${JSON.stringify(second.data)}`
  );

  const third = await axios.post(
    `${base}/api/accounting/vendors`,
    {
      name: `UAT HTTP Dup Third ${suffix}`,
      email: `http.dup.3.${suffix}@example.invalid`,
      taxNumber: `OTHER2-${suffix}`,
      bpNumber: bp,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    }
  );
  assert(third.status === 400, `duplicate BP expect 400, got ${third.status}`);
  assert(third.data?.message === DUPLICATE_ENTITY_MESSAGE, "duplicate BP message");

  const id = first.data?.data?.id as string;
  if (id) {
    await prisma.vendor.delete({ where: { id } }).catch(() =>
      prisma.vendor.update({ where: { id }, data: { isActive: false } })
    );
  }
  console.log("[ok] UAT duplicate BP/VAT HTTP");
}

async function main() {
  await runServiceUat();
  await runHttpUat();
  console.log(
    "\nUAT duplicate registration PASSED (service" +
      (process.env.RUN_HTTP_UAT === "1" ? " + HTTP" : "") +
      ")."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
