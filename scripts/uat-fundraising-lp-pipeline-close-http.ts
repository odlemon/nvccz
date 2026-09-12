/**
 * UAT — Fundraising LP Pipeline close flow (HTTP).
 * Run: npm run uat:fundraising:close
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
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

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function apiJson(method: string, path: string, body?: unknown, token?: string) {
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

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const fund = await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, minInvestment: true } });
  if (!fund) {
    log("resolve fund", false, "none");
    process.exit(1);
  }

  const campaignRes = await apiJson(
    "POST",
    "/fundraising/campaigns",
    {
      fundId: fund.id,
      name: `UAT Close ${Date.now().toString(36).slice(-4)}`,
      targetCapital: 10000000,
      primaryCurrency: "USD",
      startDate: "2026-01-01",
      closeDate: "2026-12-31",
    },
    token
  );
  const campaignId = campaignRes.json?.data?.id;
  const stages = campaignRes.json?.data?.stages || [];
  const wonStage = stages.find((s: any) => s.stageCode === "WON_SIGNED");
  log("create campaign", campaignRes.status === 201 && Boolean(campaignId), `status ${campaignRes.status}`);

  const amount = Math.max(Number(fund.minInvestment) || 10000, 10000);
  const dealRes = await apiJson(
    "POST",
    `/fundraising/campaigns/${campaignId}/deals`,
    {
      prospectName: "UAT Close LP",
      prospectEmail: `uat-close-${Date.now()}@example.com`,
      proposedAmount: amount,
      currencyCode: "USD",
      prospectCountry: "ZW",
    },
    token
  );
  const dealId = dealRes.json?.data?.id;
  log("create deal", dealRes.status === 201 && Boolean(dealId), `status ${dealRes.status}`);

  const checklist = await apiJson("GET", `/fundraising/deals/${dealId}/checklist`, undefined, token);
  const items = checklist.json?.data || [];
  for (const item of items) {
    await apiJson("PATCH", `/fundraising/deals/${dealId}/checklist`, { itemKey: item.itemKey, isComplete: true }, token);
  }
  log("complete checklist items", checklist.status === 200, `items ${items.length}`);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = readFileSync(join(__dirname, "..", "tmp-uat-pet", "cert-1781508091254.pdf"));
  } catch {
    pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  }

  const form = new FormData();
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "subscription.pdf");

  const uploadRes = await fetch(`${BASE}/fundraising/deals/${dealId}/agreement/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadJson = await uploadRes.json().catch(() => ({}));
  log("upload signed agreement", uploadRes.status === 200 && uploadJson?.data?.status === "SIGNED", `status ${uploadRes.status}`);

  const dealAfter = await apiJson("GET", `/fundraising/deals/${dealId}`, undefined, token);
  const clientId = dealAfter.json?.data?.clientId;
  log("deal provisioned client", Boolean(clientId), clientId ? `client ${clientId}` : "missing");

  if (wonStage && dealAfter.json?.data?.stage?.stageCode !== "WON_SIGNED") {
    const move = await apiJson("PATCH", `/fundraising/deals/${dealId}/stage`, { stageId: wonStage.id }, token);
    log("move to WON", move.status === 200, `status ${move.status}`);
  } else {
    log("move to WON", dealAfter.json?.data?.stage?.stageCode === "WON_SIGNED", "already won");
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT fundraising close: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
