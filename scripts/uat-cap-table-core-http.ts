/**
 * UAT — Cap Table core workflow (HTTP).
 * Run: npm run uat:cap-table:core
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

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  let company = await prisma.portfolioCompany.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  if (!company) {
    log("resolve portfolio company", false, "none in DB");
    process.exit(1);
  }
  log("resolve portfolio company", true, `${company.name} (${company.id})`);

  const boot = await api(
    "POST",
    "/cap-table/registries",
    { portfolioCompanyId: company.id, baseCurrencyCode: "USD" },
    token
  );
  log("bootstrap registry", boot.status === 200 || boot.status === 201, `status ${boot.status}`);

  const shareClass = await api(
    "POST",
    `/cap-table/registries/${company.id}/share-classes`,
    {
      classCode: `UAT_COMMON_${Date.now().toString(36).slice(-4)}`,
      className: "UAT Common",
      classType: "COMMON",
      parValue: 0.01,
      authorizedShares: 10000000,
      seniorityIndex: 99,
    },
    token
  );
  const shareClassId = shareClass.json?.data?.id;
  log("create share class", shareClass.status === 201 && Boolean(shareClassId), `status ${shareClass.status}`);

  const holder = await api(
    "POST",
    `/cap-table/registries/${company.id}/stakeholders`,
    { displayName: `UAT Holder ${Date.now().toString(36).slice(-4)}`, stakeholderType: "FOUNDER" },
    token
  );
  const stakeholderId = holder.json?.data?.id;
  log("create stakeholder", holder.status === 201 && Boolean(stakeholderId), `status ${holder.status}`);

  if (!shareClassId || !stakeholderId) {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
    process.exit(1);
  }

  const issuance = await api(
    "POST",
    `/cap-table/registries/${company.id}/transactions/issuance`,
    {
      shareClassId,
      toStakeholderId: stakeholderId,
      quantity: 100000,
      pricePerShare: 1.5,
      issuanceDate: new Date().toISOString().slice(0, 10),
    },
    token
  );
  const txId = issuance.json?.data?.id;
  log("create issuance DRAFT", issuance.status === 201 && Boolean(txId), `status ${issuance.status}`);

  if (txId) {
    const submit = await api(
      "POST",
      `/cap-table/registries/${company.id}/transactions/${txId}/submit`,
      {},
      token
    );
    log("submit transaction", submit.status === 200, `status ${submit.status}`);

    const approve = await api(
      "POST",
      `/cap-table/registries/${company.id}/transactions/${txId}/approve`,
      {},
      token
    );
    log("approve transaction", approve.status === 200, `status ${approve.status}`);

    const execute = await api(
      "POST",
      `/cap-table/registries/${company.id}/transactions/${txId}/execute`,
      {},
      token
    );
    log("execute transaction", execute.status === 200, `status ${execute.status} je=${execute.json?.data?.journalEntryId ?? "n/a"}`);
  }

  const register = await api("GET", `/cap-table/registries/${company.id}/register`, undefined, token);
  log("GET register", register.status === 200, `fd=${register.json?.data?.fullyDilutedShareCount ?? "?"}`);

  const sim = await api(
    "POST",
    `/cap-table/registries/${company.id}/simulator/run`,
    { preMoneyValuation: 10000000, roundInvestment: 2500000, optionPoolTopUpPct: 10 },
    token
  );
  log("dilution simulator", sim.status === 200, `postMoney=${sim.json?.data?.postMoneyValuation ?? "?"}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
