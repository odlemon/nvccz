/**
 * UAT — Deal Execution Pack execute flow (HTTP).
 * Run: npm run uat:deal-execution-pack:execute
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
    select: { id: true, fundId: true, name: true },
  });
  if (!company?.fundId) {
    log("resolve company", false, "none");
    process.exit(1);
  }
  log("resolve company", true, company.name);

  const create = await api(
    "POST",
    "/deal-execution-packs",
    {
      fundId: company.fundId,
      portfolioCompanyId: company.id,
      investmentAmount: 150000,
      metadata: {
        shareClassCode: "COMMON",
        quantity: 30000,
        pricePerShare: 5,
      },
    },
    token
  );
  const packId = create.json?.data?.id;
  log("create pack", Boolean(packId), `status ${create.status}`);
  if (!packId) process.exit(1);

  const cp = await api(
    "POST",
    `/deal-execution-packs/${packId}/cps`,
    { description: "Execute UAT CP", weight: 100 },
    token
  );
  if (cp.json?.data?.id) {
    await api("POST", `/deal-execution-packs/${packId}/cps/${cp.json.data.id}/satisfy`, {}, token);
  }

  for (const slot of ["SPA", "SHA", "SUBSCRIPTION", "BOARD_RESOLUTION"]) {
    await uploadSlot(token, packId, slot);
  }

  const sigs = await api("GET", `/deal-execution-packs/${packId}/signatures`, undefined, token);
  for (const sig of sigs.json?.data ?? []) {
    await api("POST", `/deal-execution-packs/${packId}/signatures/${sig.id}/sign`, {}, token);
  }
  log("sign all roles", true, `${(sigs.json?.data ?? []).length} signatures`);

  const dash = await api("GET", `/deal-execution-packs/${packId}/dashboard`, undefined, token);
  log("dashboard rLegal", dash.json?.data?.rLegal === true, `icp=${dash.json?.data?.icpPct}`);

  const execute = await api("POST", `/deal-execution-packs/${packId}/execute`, {}, token);
  log("execute pack", execute.status === 200 && execute.json?.data?.status === "EXECUTED", `status ${execute.status}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
