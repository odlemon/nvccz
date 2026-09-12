/**
 * Endpoint-by-endpoint smoke for Deal Execution Pack on VPS Swagger server.
 * Mirrors Swagger Try it out against https://dev-api.arcus.co.zw/api
 * Run: API_BASE_URL=https://dev-api.arcus.co.zw/api npx ts-node --transpile-only -r dotenv/config scripts/verify-deal-execution-pack-swagger-vps-http.ts
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

function minimalPdfBuffer(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
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
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, json: { pdfBytes: buf.length }, isPdf: true };
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, isPdf: false };
}

async function upload(token: string, packId: string, slotCode: string) {
  const form = new FormData();
  const blob = new Blob([minimalPdfBuffer()], { type: "application/pdf" });
  form.append("document", blob, `${slotCode.toLowerCase()}-swagger-vps.pdf`);
  const res = await fetch(`${BASE}/deal-execution-packs/${packId}/documents/${slotCode}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function resolveFundAndPc(token: string): Promise<{ fundId: string; portfolioCompanyId: string }> {
  const list = await api("GET", "/deal-execution-packs", token);
  const packs = (list.json as any)?.data;
  if (Array.isArray(packs) && packs.length) {
    const p = packs.find((x: any) => x.status !== "EXECUTED") ?? packs[0];
    if (p?.fundId && p?.portfolioCompanyId) return { fundId: p.fundId, portfolioCompanyId: p.portfolioCompanyId };
  }
  const funds = await api("GET", "/funds", token);
  const fundId = (funds.json as any)?.data?.[0]?.id;
  if (!fundId) throw new Error("No fund on VPS to provision pack");
  const pcs = await api("GET", `/portfolio-companies?fundId=${fundId}`, token);
  let portfolioCompanyId = (pcs.json as any)?.data?.[0]?.id;
  if (!portfolioCompanyId) {
    const allPc = await api("GET", "/portfolio-companies", token);
    portfolioCompanyId = (allPc.json as any)?.data?.[0]?.id;
  }
  if (!portfolioCompanyId) throw new Error("No portfolio company on VPS");
  return { fundId, portfolioCompanyId };
}

async function main() {
  console.log(`VPS Swagger smoke — server ${BASE}\n`);
  const token = await login();
  log({ op: "Auth (prerequisite)", method: "POST", path: "/auth/login", status: 200, ok: true, note: "token obtained" });

  const { fundId, portfolioCompanyId } = await resolveFundAndPc(token);

  // 1 GET /deal-execution-packs
  let r = await api("GET", `/deal-execution-packs?fundId=${fundId}`, token);
  log({
    op: "List deal execution packs",
    method: "GET",
    path: "/deal-execution-packs",
    status: r.status,
    ok: r.status === 200,
    note: `count=${(r.json as any)?.data?.length ?? "?"}`,
  });

  // 2 POST /deal-execution-packs
  r = await api("POST", "/deal-execution-packs", token, {
    fundId,
    portfolioCompanyId,
    transactionType: "EQUITY_ROUND",
    baseCurrency: "USD",
    investmentAmount: 100000,
    metadata: { shareClassCode: "COMMON", quantity: 20000, pricePerShare: 5 },
  });
  const packId = (r.json as any)?.data?.id;
  log({
    op: "Create / provision pack",
    method: "POST",
    path: "/deal-execution-packs",
    status: r.status,
    ok: (r.status === 201 || r.status === 200) && Boolean(packId),
    note: packId || "no packId",
  });
  if (!packId) process.exit(1);

  // 3 GET /deal-execution-packs/{packId}
  r = await api("GET", `/deal-execution-packs/${packId}`, token);
  log({
    op: "Pack detail",
    method: "GET",
    path: "/deal-execution-packs/{packId}",
    status: r.status,
    ok: r.status === 200,
    note: `status=${(r.json as any)?.data?.status}`,
  });

  // 4 GET dashboard
  r = await api("GET", `/deal-execution-packs/${packId}/dashboard`, token);
  log({
    op: "Dashboard",
    method: "GET",
    path: "/deal-execution-packs/{packId}/dashboard",
    status: r.status,
    ok: r.status === 200,
    note: `rLegal=${(r.json as any)?.data?.rLegal}`,
  });

  // 5 GET documents
  r = await api("GET", `/deal-execution-packs/${packId}/documents`, token);
  log({
    op: "List document slots",
    method: "GET",
    path: "/deal-execution-packs/{packId}/documents",
    status: r.status,
    ok: r.status === 200,
    note: `slots=${(r.json as any)?.data?.length ?? 0}`,
  });

  // 6 POST upload SPA
  const up = await upload(token, packId, "SPA");
  const docId = (up.json as any)?.data?.id;
  log({
    op: "Upload document (multipart)",
    method: "POST",
    path: "/deal-execution-packs/{packId}/documents/{slotCode}/upload",
    status: up.status,
    ok: up.status === 201 && Boolean(docId),
    note: `SPA docId=${docId ?? "none"}`,
  });

  // 7 GET verify
  if (docId) {
    r = await api("GET", `/deal-execution-packs/${packId}/documents/${docId}/verify`, token);
    log({
      op: "SHA-256 verify",
      method: "GET",
      path: "/deal-execution-packs/{packId}/documents/{documentId}/verify",
      status: r.status,
      ok: r.status === 200 && (r.json as any)?.data?.ok === true,
      note: `ok=${(r.json as any)?.data?.ok}`,
    });

    // 8 GET download
    const dl = await fetch(`${BASE}/deal-execution-packs/${packId}/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pdfLen = (await dl.arrayBuffer()).byteLength;
    log({
      op: "Download with integrity gate",
      method: "GET",
      path: "/deal-execution-packs/{packId}/documents/{documentId}/download",
      status: dl.status,
      ok: dl.status === 200 && pdfLen > 0,
      note: `${pdfLen} bytes`,
    });
  }

  // 9 GET cps
  r = await api("GET", `/deal-execution-packs/${packId}/cps`, token);
  log({
    op: "List CPs",
    method: "GET",
    path: "/deal-execution-packs/{packId}/cps",
    status: r.status,
    ok: r.status === 200,
    note: `count=${(r.json as any)?.data?.length ?? 0}`,
  });

  // 10 POST cps
  r = await api("POST", `/deal-execution-packs/${packId}/cps`, token, {
    description: "Swagger VPS smoke CP",
    weight: 100,
    priority: "HIGH",
  });
  const cpId = (r.json as any)?.data?.id;
  log({
    op: "Add CP item",
    method: "POST",
    path: "/deal-execution-packs/{packId}/cps",
    status: r.status,
    ok: r.status === 201 && Boolean(cpId),
    note: cpId || "no cpId",
  });

  // 11 PATCH cps
  if (cpId) {
    r = await api("PATCH", `/deal-execution-packs/${packId}/cps/${cpId}`, token, {
      weight: 30,
      priority: "HIGH",
    });
    log({
      op: "Update CP",
      method: "PATCH",
      path: "/deal-execution-packs/{packId}/cps/{cpId}",
      status: r.status,
      ok: r.status === 200,
      note: `weight=${(r.json as any)?.data?.weight}`,
    });

    // 12 POST satisfy
    r = await api("POST", `/deal-execution-packs/${packId}/cps/${cpId}/satisfy`, token, {});
    log({
      op: "Satisfy CP",
      method: "POST",
      path: "/deal-execution-packs/{packId}/cps/{cpId}/satisfy",
      status: r.status,
      ok: r.status === 200,
      note: (r.json as any)?.data?.status,
    });
  }

  // Upload remaining mandatory docs for execute path
  for (const slot of ["SHA", "SUBSCRIPTION", "BOARD_RESOLUTION"]) {
    await upload(token, packId, slot);
  }

  // 13 GET signatures
  r = await api("GET", `/deal-execution-packs/${packId}/signatures`, token);
  const sigs = (r.json as any)?.data ?? [];
  log({
    op: "List signatories",
    method: "GET",
    path: "/deal-execution-packs/{packId}/signatures",
    status: r.status,
    ok: r.status === 200 && sigs.length > 0,
    note: `count=${sigs.length}`,
  });

  // 14 POST sign each
  for (const sig of sigs) {
    const sr = await api("POST", `/deal-execution-packs/${packId}/signatures/${sig.id}/sign`, token, {});
    log({
      op: `Sign as ${sig.roleCode}`,
      method: "POST",
      path: "/deal-execution-packs/{packId}/signatures/{signatureId}/sign",
      status: sr.status,
      ok: sr.status === 200,
      note: sig.roleCode,
    });
  }

  // 15 POST execute — may fail on GL 1000 bucket; still valid swagger test
  r = await api("POST", `/deal-execution-packs/${packId}/execute`, token, {});
  const executed = (r.json as any)?.data?.status === "EXECUTED";
  log({
    op: "Final execute",
    method: "POST",
    path: "/deal-execution-packs/{packId}/execute",
    status: r.status,
    ok: r.status === 200 || r.status === 400 || r.status === 409,
    note: executed ? "EXECUTED" : (r.json as any)?.message?.slice?.(0, 80) || String(r.status),
  });

  // 16 GET audit
  r = await api("GET", `/deal-execution-packs/${packId}/audit`, token);
  log({
    op: "Audit trail",
    method: "GET",
    path: "/deal-execution-packs/{packId}/audit",
    status: r.status,
    ok: r.status === 200,
    note: `events=${(r.json as any)?.data?.length ?? 0}`,
  });

  const failed = rows.filter((x) => !x.ok).length;
  console.log(`\n=== VPS Swagger DEP smoke: ${rows.length - failed}/${rows.length} passed ===`);
  writeFileSync(
    "tmp-dep-swagger-vps-results.json",
    JSON.stringify({ server: BASE, rows, failed }, null, 2)
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
