/**
 * Shared helpers for LP Portal HTTP UAT (DEV nts only).
 */
// @ts-nocheck
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./assert-dev-database";

export const BASE =
  process.env.UAT_BASE_URL ||
  process.env.API_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || 3009}/api`;

export const SIGNATORY_EMAIL =
  process.env.LP_UAT_SIGNATORY_EMAIL || "lp.signatory@example.com";
export const VIEWER_EMAIL = process.env.LP_UAT_VIEWER_EMAIL || "lp.viewer@example.com";
export const LP_PASSWORD = process.env.LP_UAT_PASSWORD || "Password123!";
export const GP_EMAIL = process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
export const GP_PASSWORD = process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";

export const CLIENT_INVESTOR_ID = "LP-ARCUS-001";
export const FUND_PC_NAME = "Arcus Growth Fund V";
export const FUND_OE_NAME = "Arcus Equity Opportunities";

export type ApiResult = { status: number; json: any; headers: Headers; text?: string };

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json: any = await res.json().catch(() => ({}));
  const token = json.token || json.data?.token;
  if (!token) throw new Error(`Login failed for ${email}: ${json.message || res.status}`);
  return token;
}

export async function resolveSignatoryToken(): Promise<string> {
  return login(SIGNATORY_EMAIL, LP_PASSWORD);
}

export async function resolveViewerToken(): Promise<string> {
  return login(VIEWER_EMAIL, LP_PASSWORD);
}

export async function resolveGpAdminToken(): Promise<string> {
  return login(GP_EMAIL, GP_PASSWORD);
}

export async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<ApiResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...(extraHeaders || {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text?.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers, text };
}

export function log(step: string, ok: boolean, detail: string) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

export function idem(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function summarizeFail(results: Array<{ step: string; ok: boolean; detail: string }>) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
    process.exit(1);
  }
}

/** Prefer spawning seed once; safe to re-run (idempotent). */
export function runLpPortalSeed(): void {
  console.log("Running npm run db:seed:lp-portal-srd …");
  const r = spawnSync("npm", ["run", "db:seed:lp-portal-srd"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`db:seed:lp-portal-srd failed with status ${r.status}`);
  }
}

export async function ensureSeed(prisma: PrismaClient, opts: { force?: boolean } = {}) {
  await assertDevDatabase(prisma, "lp-portal-uat");
  const client = await prisma.client.findFirst({
    where: { OR: [{ investorId: CLIENT_INVESTOR_ID }, { email: "lp-arcus-portal@example.com" }] },
  });
  const sig = await prisma.user.findUnique({ where: { email: SIGNATORY_EMAIL } });
  if (opts.force || !client || !sig) {
    runLpPortalSeed();
  } else {
    console.log(`[ok] seed fixtures present (client=${client.id}); skip re-seed`);
  }
}

export async function loadSeedIds(prisma: PrismaClient) {
  const client = await prisma.client.findFirst({
    where: { OR: [{ investorId: CLIENT_INVESTOR_ID }, { email: "lp-arcus-portal@example.com" }] },
  });
  if (!client) throw new Error("LP client missing — run npm run db:seed:lp-portal-srd");

  const otherClient = await prisma.client.findFirst({
    where: { investorId: "LP-OTHER-001" },
  });

  const fundPc = await prisma.fund.findFirst({ where: { name: FUND_PC_NAME } });
  const fundOe = await prisma.fund.findFirst({ where: { name: FUND_OE_NAME } });
  if (!fundPc || !fundOe) throw new Error("LP funds missing — run seed");

  const ccAlloc = await prisma.capitalCallAllocation.findFirst({
    where: { clientId: client.id, capitalCall: { fundId: fundPc.id } },
    orderBy: { createdAt: "desc" },
  });

  const otherAlloc = otherClient
    ? await prisma.capitalCallAllocation.findFirst({
        where: { clientId: otherClient.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const dist = await prisma.distributionAllocation.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
  });

  const doc = await (prisma as any).lpPortalDocument.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
  });

  const notice = await (prisma as any).lpNotice.findFirst({
    where: { OR: [{ clientId: client.id }, { targetType: "ALL" }], status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });

  const bank = await (prisma as any).lpBankAccount.findFirst({
    where: { clientId: client.id, status: "ACTIVE" },
  });

  const holding = await (prisma as any).lpHoldingPosition.findFirst({
    where: { clientId: client.id, fundId: fundOe.id, isActive: true },
  });

  const serviceReq = await (prisma as any).lpServiceRequest.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
  });

  const thread = await (prisma as any).lpMessageThread.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
  });

  return {
    clientId: client.id,
    otherClientId: otherClient?.id || null,
    fundPcId: fundPc.id,
    fundOeId: fundOe.id,
    capitalCallAllocationId: ccAlloc?.id || null,
    otherCapitalCallAllocationId: otherAlloc?.id || null,
    distributionAllocationId: dist?.id || null,
    documentId: doc?.id || null,
    noticeId: notice?.id || null,
    bankAccountId: bank?.id || null,
    holdingId: holding?.id || null,
    serviceRequestReference: serviceReq?.reference || null,
    messageThreadId: thread?.id || null,
  };
}

export { assertDevDatabase };
