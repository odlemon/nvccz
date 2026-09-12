/**
 * UAT — Deal Execution Pack core (HTTP).
 * Run: npm run uat:deal-execution-pack:core
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

function minimalPdfBuffer(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function uploadSlot(token: string, packId: string, slotCode: string) {
  const form = new FormData();
  const blob = new Blob([minimalPdfBuffer()], { type: "application/pdf" });
  form.append("document", blob, `${slotCode.toLowerCase()}.pdf`);
  const res = await fetch(`${BASE}/deal-execution-packs/${packId}/documents/${slotCode}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const company = await prisma.portfolioCompany.findFirst({
    where: { fundId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, fundId: true },
  });
  if (!company?.fundId) {
    log("resolve portfolio company", false, "none with fundId");
    process.exit(1);
  }
  log("resolve portfolio company", true, `${company.name}`);

  const create = await api(
    "POST",
    "/deal-execution-packs",
    {
      fundId: company.fundId,
      portfolioCompanyId: company.id,
      transactionType: "EQUITY_ROUND",
      investmentAmount: 250000,
      metadata: { shareClassCode: "COMMON", quantity: 50000, pricePerShare: 5 },
    },
    token
  );
  const packId = create.json?.data?.id;
  log("create pack", (create.status === 201 || create.status === 200) && Boolean(packId), `status ${create.status}`);
  if (!packId) process.exit(1);

  const detail = await api("GET", `/deal-execution-packs/${packId}`, undefined, token);
  const slotCount = detail.json?.data?.documentSlots?.length ?? 0;
  log("get pack detail", detail.status === 200 && slotCount >= 5, `slots ${slotCount}`);

  const dash = await api("GET", `/deal-execution-packs/${packId}/dashboard`, undefined, token);
  log("dashboard", dash.status === 200 && dash.json?.data?.packId === packId, `rLegal=${dash.json?.data?.rLegal}`);

  const cp = await api(
    "POST",
    `/deal-execution-packs/${packId}/cps`,
    { description: "UAT CP — legal clearance", weight: 100 },
    token
  );
  const cpId = cp.json?.data?.id;
  log("add CP", cp.status === 201 && Boolean(cpId), `status ${cp.status}`);

  if (cpId) {
    const satisfy = await api("POST", `/deal-execution-packs/${packId}/cps/${cpId}/satisfy`, {}, token);
    log("satisfy CP", satisfy.status === 200, `status ${satisfy.status}`);
  }

  for (const slot of ["SPA", "SHA", "SUBSCRIPTION", "BOARD_RESOLUTION"]) {
    const up = await uploadSlot(token, packId, slot);
    log(`upload ${slot}`, up.status === 201, `status ${up.status}`);
  }

  const docs = await api("GET", `/deal-execution-packs/${packId}/documents`, undefined, token);
  const firstDoc = docs.json?.data?.find((s: any) => s.activeDocument)?.activeDocument;
  if (firstDoc?.id) {
    const verify = await api(
      "GET",
      `/deal-execution-packs/${packId}/documents/${firstDoc.id}/verify`,
      undefined,
      token
    );
    log("verify document SHA", verify.status === 200 && verify.json?.data?.ok === true, `status ${verify.status}`);
  }

  const audit = await api("GET", `/deal-execution-packs/${packId}/audit`, undefined, token);
  log("audit trail", audit.status === 200 && Array.isArray(audit.json?.data), `events ${audit.json?.data?.length ?? 0}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
