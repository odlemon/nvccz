/**
 * UAT — Tax Return Pack preflight blocker (HTTP).
 * Run: npm run uat:tax-return-pack:preflight
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();
const BASE = process.env.UAT_LOCAL_API ?? process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function main() {
  const token = await login();
  if (!token) {
    console.error("login failed");
    process.exit(1);
  }

  const entity = await prisma.forecastEntity.findFirst({
    where: { isActive: true, type: "INTERNAL_SUBSIDIARY" },
    orderBy: { isDefault: "desc" },
  });
  if (!entity) {
    console.error("no forecast entity");
    process.exit(1);
  }

  const currency = await prisma.currency.findFirst({ where: { isDefault: true } });
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!currency || !user) {
    console.error("missing currency or user");
    process.exit(1);
  }

  const taxYear = 2094;
  const txDate = new Date(Date.UTC(taxYear, 5, 15));
  const ref = `UAT-TRP-PREFLIGHT-${Date.now()}`;
  await prisma.journalEntry.create({
    data: {
      id: randomUUID(),
      transactionDate: txDate,
      referenceNumber: ref,
      description: "UAT preflight blocker",
      totalAmount: 100,
      currencyId: currency.id,
      status: "PENDING",
      createdById: user.id,
    },
  });

  const createRes = await fetch(`${BASE}/tax-return-packs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      forecastEntityId: entity.id,
      taxYear,
      taxPeriod: "ANNUAL",
    }),
  });
  const created = await createRes.json();
  const packId = created?.data?.id;
  if (!packId) {
    console.error("provision failed", created);
    await prisma.journalEntry.deleteMany({ where: { referenceNumber: ref } });
    process.exit(1);
  }

  const compileRes = await fetch(`${BASE}/tax-return-packs/${packId}/compile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const compiled = await compileRes.json();

  const blocked = compileRes.status === 400 || compiled?.data?.status === "FAILED";
  console.log(`[${blocked ? "PASS" : "FAIL"}] preflight blocks unposted journal: status=${compileRes.status}`);

  await prisma.journalEntry.deleteMany({ where: { referenceNumber: ref } });
  await prisma.$disconnect();
  process.exit(blocked ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
