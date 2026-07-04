/**
 * Endpoint-by-endpoint smoke for Tax Return Pack on VPS Swagger server.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/verify-tax-return-pack-swagger-vps-http.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE = (process.env.API_BASE_URL ?? "https://dev-api.arcus.co.zw/api").replace(/\/$/, "");
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

type Row = { op: string; method: string; path: string; status: number; ok: boolean; note: string };

const rows: Row[] = [];

function log(row: Row) {
  rows.push(row);
  console.log(`[${row.ok ? "PASS" : "FAIL"}] ${row.method} ${row.path} — ${row.status} — ${row.note}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  const token = json.token || json.data?.token || "";
  if (!token) throw new Error(`Login failed: ${JSON.stringify(json)}`);
  return token;
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, json: { pdfBytes: buf.length }, isPdf: true };
  }
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json, isPdf: false };
}

async function resolveForecastEntityId(token: string): Promise<string> {
  const list = await api("GET", "/forecasting/entities", token);
  const entities = (list.json as any)?.data;
  if (Array.isArray(entities) && entities.length) {
    const internal =
      entities.find((e: any) => e.type === "INTERNAL_SUBSIDIARY" && e.isActive !== false) ?? entities[0];
    if (internal?.id) return internal.id;
  }
  throw new Error("No forecast entity on VPS");
}

async function resolveFundId(token: string): Promise<string | undefined> {
  const funds = await api("GET", "/funds", token);
  return (funds.json as any)?.data?.[0]?.id;
}

async function main() {
  console.log(`VPS Swagger smoke — Tax Return Pack — ${BASE}\n`);
  const token = await login();
  log({ op: "Auth (prerequisite)", method: "POST", path: "/auth/login", status: 200, ok: true, note: "token obtained" });

  const forecastEntityId = await resolveForecastEntityId(token);
  const fundId = await resolveFundId(token);
  const taxYear = 2088;

  // 1 GET /tax-return-packs
  let r = await api("GET", `/tax-return-packs?forecastEntityId=${forecastEntityId}`, token);
  log({
    op: "List tax return packs",
    method: "GET",
    path: "/tax-return-packs",
    status: r.status,
    ok: r.status === 200,
    note: `count=${(r.json as any)?.data?.length ?? "?"}`,
  });

  // 2 POST /tax-return-packs
  r = await api("POST", "/tax-return-packs", token, {
    forecastEntityId,
    taxYear,
    taxPeriod: "ANNUAL",
    taxRegime: "ZIMRA_CIT",
    baseCurrency: "USD",
    fundId,
  });
  const packId = (r.json as any)?.data?.id;
  log({
    op: "Provision tax return pack",
    method: "POST",
    path: "/tax-return-packs",
    status: r.status,
    ok: (r.status === 201 || r.status === 200) && Boolean(packId),
    note: packId || JSON.stringify(r.json).slice(0, 80),
  });
  if (!packId) process.exit(1);

  // 3 GET detail
  r = await api("GET", `/tax-return-packs/${packId}`, token);
  log({
    op: "Pack detail",
    method: "GET",
    path: "/tax-return-packs/{packId}",
    status: r.status,
    ok: r.status === 200,
    note: `status=${(r.json as any)?.data?.status}`,
  });

  // 4 GET dashboard
  r = await api("GET", `/tax-return-packs/${packId}/dashboard`, token);
  log({
    op: "Dashboard",
    method: "GET",
    path: "/tax-return-packs/{packId}/dashboard",
    status: r.status,
    ok: r.status === 200,
    note: `glSync=${(r.json as any)?.data?.glSyncBadge}`,
  });

  // 5 POST compile
  r = await api("POST", `/tax-return-packs/${packId}/compile`, token, {});
  log({
    op: "Compile",
    method: "POST",
    path: "/tax-return-packs/{packId}/compile",
    status: r.status,
    ok: r.status === 200 && (r.json as any)?.data?.status === "DRAFT_REVIEW",
    note: (r.json as any)?.data?.status || (r.json as any)?.message,
  });

  // 6 GET reconciliation
  r = await api("GET", `/tax-return-packs/${packId}/reconciliation`, token);
  const lines = (r.json as any)?.data ?? [];
  log({
    op: "ITF 12C reconciliation",
    method: "GET",
    path: "/tax-return-packs/{packId}/reconciliation",
    status: r.status,
    ok: r.status === 200,
    note: `lines=${lines.length}`,
  });

  // 7 PATCH reconciliation line
  const patchLine = lines.find((l: any) => l.lineCode !== "NET_INCOME_BOOK") ?? lines[0];
  if (patchLine?.id) {
    r = await api("PATCH", `/tax-return-packs/${packId}/reconciliation/${patchLine.id}`, token, {
      taxCategory: "ADD_BACK",
      reason: "Swagger VPS smoke override",
    });
    log({
      op: "Override tax categorization",
      method: "PATCH",
      path: "/tax-return-packs/{packId}/reconciliation/{lineId}",
      status: r.status,
      ok: r.status === 200,
      note: patchLine.lineCode,
    });
  } else {
    log({
      op: "Override tax categorization",
      method: "PATCH",
      path: "/tax-return-packs/{packId}/reconciliation/{lineId}",
      status: 0,
      ok: true,
      note: "skipped — no lines",
    });
  }

  // 8 GET cgt
  r = await api("GET", `/tax-return-packs/${packId}/cgt`, token);
  log({
    op: "CGT schedule",
    method: "GET",
    path: "/tax-return-packs/{packId}/cgt",
    status: r.status,
    ok: r.status === 200,
    note: `lines=${(r.json as any)?.data?.length ?? 0}`,
  });

  // 9 POST submit-review
  r = await api("POST", `/tax-return-packs/${packId}/submit-review`, token, {});
  log({
    op: "Maker submit for review",
    method: "POST",
    path: "/tax-return-packs/{packId}/submit-review",
    status: r.status,
    ok: r.status === 200,
    note: `status=${(r.json as any)?.data?.status}`,
  });

  // 10 POST sign-off
  r = await api("POST", `/tax-return-packs/${packId}/sign-off`, token, {});
  const signed = (r.json as any)?.data?.status === "SIGNED_OFF";
  log({
    op: "Checker sign-off",
    method: "POST",
    path: "/tax-return-packs/{packId}/sign-off",
    status: r.status,
    ok: r.status === 200 && signed,
    note: signed
      ? `sha256=${((r.json as any)?.data?.packPdfSha256 || "").slice(0, 16)}`
      : (r.json as any)?.message?.slice?.(0, 80),
  });

  // 11 GET pdf
  const pdfRes = await fetch(`${BASE}/tax-return-packs/${packId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  log({
    op: "Download signed PDF",
    method: "GET",
    path: "/tax-return-packs/{packId}/pdf",
    status: pdfRes.status,
    ok: pdfRes.status === 200 || pdfRes.status === 302,
    note: `content-type=${pdfRes.headers.get("content-type")}`,
  });

  // 12 GET audit
  r = await api("GET", `/tax-return-packs/${packId}/audit`, token);
  log({
    op: "Audit trail",
    method: "GET",
    path: "/tax-return-packs/{packId}/audit",
    status: r.status,
    ok: r.status === 200,
    note: `events=${(r.json as any)?.data?.length ?? 0}`,
  });

  const failed = rows.filter((x) => !x.ok).length;
  console.log(`\n=== VPS Swagger TRP smoke: ${rows.length - failed}/${rows.length} passed ===`);
  writeFileSync(
    "tmp-trp-swagger-vps-results.json",
    JSON.stringify({ server: BASE, packId, rows, failed }, null, 2)
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
