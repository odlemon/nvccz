/**
 * Shared helpers for Stock Picker Cash HTTP UAT (DEV nts only).
 * Paths are under `/investment-ops/...` (api() already prefixes BASE ending in `/api`).
 */
// @ts-nocheck
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./assert-dev-database";

export { assertDevDatabase };

export const BASE =
  process.env.API_BASE ||
  process.env.UAT_BASE_URL ||
  process.env.API_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || 3009}/api`;

export const MAKER_EMAIL =
  process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
export const MAKER_PASSWORD =
  process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";

export const CHECKER_EMAIL =
  process.env.SP_CASH_CHECKER_EMAIL || "sp.cash.checker@example.com";
export const CHECKER_PASSWORD =
  process.env.SP_CASH_CHECKER_PASSWORD || "Password123!";

export const PORTFOLIO_ID = "SPF-ZSE-001";
export const CLIENT_A = "cli_sunrise";
export const CLIENT_B = "cli_client_b";
export const LEGAL_ENTITY_ID = "le_arcus";
export const TENANT_ID = "nts";
export const CURRENCY = "USD";
export const OPENING_SOURCE_EVENT_ID = "OPENING-SUNRISE-v1";

export type ApiResult = { status: number; json: any; headers: Headers; text?: string };

export async function assertApiHealthy(): Promise<void> {
  const origin = BASE.replace(/\/api\/?$/, "");
  const healthUrl = `${origin}/health`;
  try {
    const res = await fetch(healthUrl);
    if (res.ok) {
      console.log(`[ok] health ${healthUrl} → ${res.status}`);
      return;
    }
  } catch {
    /* fall through */
  }
  // Fallback: probe auth login endpoint (server up if it responds at all)
  try {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "probe@invalid", password: "x" }),
    });
    if (res.status > 0) {
      console.log(`[ok] API reachable at ${BASE} (login probe ${res.status})`);
      return;
    }
  } catch (e: any) {
    console.error(
      `\n[error] Stock Picker Cash UAT cannot reach the API.\n` +
        `  Expected server on port 3009 (BASE=${BASE}).\n` +
        `  Start with: npm run dev\n` +
        `  Detail: ${e?.message || e}\n`
    );
    process.exit(1);
  }
  console.error(
    `\n[error] Health check failed for ${healthUrl} and ${BASE}.\n` +
      `  Start the API: npm run dev  (port 3009)\n`
  );
  process.exit(1);
}

export async function login(
  email = MAKER_EMAIL,
  password = MAKER_PASSWORD
): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json: any = await res.json().catch(() => ({}));
  const token = json.token || json.data?.token;
  if (!token) {
    throw new Error(`Login failed for ${email}: ${json.message || res.status}`);
  }
  return token;
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
  console.log(`[${ok ? "pass" : "fail"}] ${step}: ${detail}`);
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

export function fingerprint(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex");
}

export function hashFile(content: string | Buffer): string {
  return createHash("sha256")
    .update(typeof content === "string" ? content : content)
    .digest("hex");
}

/** Ensure checker user exists with admin/investments access. */
export async function findOrCreateCheckerUser(prisma: PrismaClient): Promise<{
  id: string;
  email: string;
}> {
  const db = prisma as any;
  let adminRole =
    (await db.role.findFirst({
      where: {
        OR: [
          { name: "Admin" },
          { name: "admin" },
          { name: "System Administrator" },
        ],
      },
    })) ||
    (await db.role.findFirst({
      where: { name: { contains: "Admin" } },
    }));

  if (!adminRole) {
    adminRole = await db.role.create({
      data: {
        name: "Admin",
        description: "SP Cash UAT admin",
        permissions: [
          { name: "sp.cash.access", value: true },
          { name: "investments.admin", value: true },
          { name: "investments.*", value: true },
        ],
      },
    });
  } else {
    const perms = Array.isArray(adminRole.permissions) ? [...adminRole.permissions] : [];
    const names = new Set(perms.map((p: any) => p?.name));
    let changed = false;
    for (const name of ["sp.cash.access", "investments.admin", "investments.write", "investments.approve"]) {
      if (!names.has(name)) {
        perms.push({ name, value: true });
        changed = true;
      }
    }
    if (changed) {
      adminRole = await db.role.update({
        where: { id: adminRole.id },
        data: { permissions: perms },
      });
    }
  }

  const hash = await bcrypt.hash(CHECKER_PASSWORD, 10);
  let user = await db.user.findUnique({ where: { email: CHECKER_EMAIL } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: CHECKER_EMAIL,
        password: hash,
        firstName: "SP Cash",
        lastName: "Checker",
        roleId: adminRole.id,
        roleCode: "admin",
      },
    });
    console.log(`[ok] created checker ${CHECKER_EMAIL}`);
  } else {
    user = await db.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        roleId: adminRole.id,
        roleCode: user.roleCode || "admin",
      },
    });
    console.log(`[ok] upserted checker ${CHECKER_EMAIL}`);
  }
  return { id: user.id, email: CHECKER_EMAIL };
}

export async function loginMaker(): Promise<string> {
  return login(MAKER_EMAIL, MAKER_PASSWORD);
}

export async function loginChecker(): Promise<string> {
  return login(CHECKER_EMAIL, CHECKER_PASSWORD);
}

export function runStockPickerCashSeed(): void {
  console.log("Running npm run db:seed:stock-picker-cash …");
  const r = spawnSync("npm", ["run", "db:seed:stock-picker-cash"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`db:seed:stock-picker-cash failed with status ${r.status}`);
  }
}

export async function ensureSeed(prisma: PrismaClient, opts: { force?: boolean } = {}) {
  await assertDevDatabase(prisma, "sp-cash-uat");
  await findOrCreateCheckerUser(prisma);
  const db = prisma as any;
  const acct = await db.spCashClientAccount.findFirst({
    where: { portfolioId: PORTFOLIO_ID, clientOrVehicleId: CLIENT_A, currency: CURRENCY },
  });
  if (opts.force || !acct) {
    // Prefer importing seed function when available; else spawn npm script
    try {
      const mod = require("../seed-stock-picker-cash-demo");
      if (typeof mod.seedSunrise === "function") {
        await mod.seedSunrise(prisma);
        return;
      }
    } catch {
      /* spawn fallback */
    }
    runStockPickerCashSeed();
  } else {
    console.log(`[ok] seed fixtures present (account=${acct.id}); skip full re-seed`);
  }
}

export async function loadSeedIds(prisma: PrismaClient) {
  const db = prisma as any;
  const provider = await db.spCashProvider.findFirst({
    where: { OR: [{ code: "CBZ_CUSTODY" }, { displayName: { contains: "CBZ" } }] },
  });
  const account = await db.spCashClientAccount.findFirst({
    where: {
      portfolioId: PORTFOLIO_ID,
      clientOrVehicleId: CLIENT_A,
      accountType: "CUSTODY_CASH",
      currency: CURRENCY,
    },
  });
  const suspense = await db.spCashClientAccount.findFirst({
    where: {
      portfolioId: PORTFOLIO_ID,
      accountType: "SUSPENSE",
      currency: CURRENCY,
    },
  });
  const clientB = await db.spCashClientAccount.findFirst({
    where: { clientOrVehicleId: CLIENT_B, currency: CURRENCY },
  });
  const layout = provider
    ? await db.spCashFileLayout.findFirst({
        where: { providerId: provider.id },
        orderBy: { createdAt: "desc" },
      })
    : null;
  return {
    providerId: provider?.id as string | undefined,
    accountId: account?.id as string | undefined,
    portfolioId: PORTFOLIO_ID,
    suspenseAccountId: suspense?.id as string | undefined,
    clientBAccountId: clientB?.id as string | undefined,
    layoutId: layout?.id as string | undefined,
    legalEntityId: account?.legalEntityId || LEGAL_ENTITY_ID,
    tenantId: account?.tenantId || TENANT_ID,
    currency: CURRENCY,
  };
}

export function moneyEq(a: unknown, b: unknown, eps = 0.02): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= eps;
}

export function dataOf(res: ApiResult): any {
  return res.json?.data ?? res.json;
}
