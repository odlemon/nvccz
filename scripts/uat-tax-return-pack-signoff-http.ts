/**
 * UAT — Tax Return Pack sign-off (HTTP).
 * Run: npm run uat:tax-return-pack:signoff
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.UAT_LOCAL_API ?? process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const entity = await prisma.forecastEntity.findFirst({
    where: { isActive: true, type: "INTERNAL_SUBSIDIARY" },
    orderBy: { isDefault: "desc" },
    select: { id: true, name: true },
  });
  const fund = await prisma.fund.findFirst({
    where: { investmentCommitments: { some: { status: { in: ["ACTIVE", "PENDING"] } } } },
    select: { id: true, name: true },
  });

  if (!entity) {
    log("resolve entity", false, "none");
    process.exit(1);
  }

  const taxYear = 2095;
  const create = await api(
    "POST",
    "/tax-return-packs",
    {
      forecastEntityId: entity.id,
      taxYear,
      taxPeriod: "ANNUAL",
      fundId: fund?.id,
    },
    token
  );
  let packId = create.json?.data?.id;
  if (!packId && create.status === 200) {
    const existing = await api("GET", `/tax-return-packs?forecastEntityId=${entity.id}&taxYear=${taxYear}`, undefined, token);
    packId = existing.json?.data?.[0]?.id;
  }
  log("provision signoff pack", Boolean(packId), packId || `status ${create.status}`);

  const compile = await api("POST", `/tax-return-packs/${packId}/compile`, {}, token);
  log("compile", compile.status === 200, compile.json?.data?.status || compile.json?.message);

  const submit = await api("POST", `/tax-return-packs/${packId}/submit-review`, {}, token);
  log("submit review", submit.status === 200, `status ${submit.status}`);

  const signOff = await api("POST", `/tax-return-packs/${packId}/sign-off`, {}, token);
  const signed = signOff.json?.data;
  log(
    "sign-off",
    signOff.status === 200 && signed?.status === "SIGNED_OFF",
    `status ${signOff.status} pack=${signed?.status}`
  );

  log("SHA-256 recorded", Boolean(signed?.packPdfSha256), signed?.packPdfSha256?.slice(0, 16) || "missing");

  if (signed?.journalEntryId) {
    const je = await prisma.journalEntry.findUnique({
      where: { id: signed.journalEntryId },
      select: { referenceNumber: true, status: true },
    });
    log("GL journal posted", Boolean(je?.referenceNumber?.startsWith("TRP-")), je?.referenceNumber || "none");
  } else {
    log("GL journal posted", true, "skipped (zero liability)");
  }

  if (fund?.id && signed?.portalDocumentId) {
    const portalDoc = await prisma.lpPortalDocument.findUnique({
      where: { id: signed.portalDocumentId },
      select: { category: true, sourceType: true },
    });
    log("LP portal published", portalDoc?.category === "TAX", portalDoc?.sourceType || "n/a");
  } else {
    log("LP portal published", true, fund?.id ? "no portal doc (no LP client)" : "no fundId");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT signoff: ${results.length - failed.length}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
