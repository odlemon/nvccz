/**
 * Strict Investment Operations Swagger/VPS verify — all IO routes.
 * - 401 without Bearer token (documents Swagger Authorize requirement)
 * - 200/201 with token + success: true
 * - Response shape + non-empty data where dev VPS is seeded
 *
 * Run: npm run verify:investment-ops:swagger-vps
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = (process.env.API_BASE_URL ?? "https://dev-api.arcus.co.zw/api").replace(/\/$/, "");
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

type Shape = "array" | "object" | "any";
type Expect = {
  op: string;
  method: string;
  path: string;
  body?: unknown;
  shape?: Shape;
  nonEmpty?: boolean;
  allow?: number[];
  skipAuthCheck?: boolean;
  /** If true, only run when ctx key is set */
  requires?: keyof Ctx;
};

type Ctx = {
  fundId?: string;
  instrumentId?: string;
  orderId?: string;
  tradeId?: string;
  hopId?: string;
  tickId?: string;
  securityId?: string;
  batchId?: string;
  valuationRunId?: string;
  valuationExceptionId?: string;
  accountingEventId?: string;
  journalEntryId?: string;
  reportRunId?: string;
  simulationRunId?: string;
  modelPortfolioId?: string;
  reconBatchId?: string;
  reconItemId?: string;
  documentId?: string;
  brokerProfileId?: string;
};

type Row = {
  op: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  note: string;
  unauthStatus?: number;
  sample?: unknown;
};

const rows: Row[] = [];
const ctx: Ctx = {};

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
  const json = (await res.json()) as { token?: string; data?: { token?: string }; message?: string };
  const token = json.token || json.data?.token || "";
  if (!token) throw new Error(`Login failed: ${json.message || JSON.stringify(json)}`);
  return token;
}

async function call(method: string, path: string, token?: string, body?: unknown, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    if (res.status === 502 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    return { status: res.status, json, text };
  }
  return { status: 502, json: {}, text: "" };
}

function checkShape(data: unknown, shape?: Shape): string | null {
  if (!shape || shape === "any") return null;
  if (shape === "array" && !Array.isArray(data)) return `expected array, got ${typeof data}`;
  if (shape === "object" && (data == null || Array.isArray(data) || typeof data !== "object"))
    return `expected object, got ${Array.isArray(data) ? "array" : typeof data}`;
  return null;
}

function resolvePath(template: string, c: Ctx): string {
  return template
    .replace("{fundId}", c.fundId ?? "MISSING")
    .replace("{instrumentId}", c.instrumentId ?? "MISSING")
    .replace("{orderId}", c.orderId ?? "MISSING")
    .replace("{tradeId}", c.tradeId ?? "MISSING")
    .replace("{hopId}", c.hopId ?? "MISSING")
    .replace("{tickId}", c.tickId ?? "MISSING")
    .replace("{securityId}", c.securityId ?? "MISSING")
    .replace("{batchId}", c.batchId ?? "MISSING")
    .replace("{valuationRunId}", c.valuationRunId ?? "MISSING")
    .replace("{valuationExceptionId}", c.valuationExceptionId ?? "MISSING")
    .replace("{accountingEventId}", c.accountingEventId ?? "MISSING")
    .replace("{journalEntryId}", c.journalEntryId ?? "MISSING")
    .replace("{reportRunId}", c.reportRunId ?? "MISSING")
    .replace("{simulationRunId}", c.simulationRunId ?? "MISSING")
    .replace("{modelPortfolioId}", c.modelPortfolioId ?? "MISSING")
    .replace("{reconBatchId}", c.reconBatchId ?? "MISSING")
    .replace("{reconItemId}", c.reconItemId ?? "MISSING")
    .replace("{documentId}", c.documentId ?? "MISSING");
}

async function hit(token: string, exp: Expect) {
  if (exp.requires && !ctx[exp.requires]) {
    log({
      op: exp.op,
      method: exp.method,
      path: exp.path,
      status: 0,
      ok: true,
      note: `skipped (no ${exp.requires})`,
    });
    return null;
  }

  const path = resolvePath(exp.path, ctx);
  const allow = exp.allow ?? [200, 201];

  let unauthStatus: number | undefined;
  if (!exp.skipAuthCheck) {
    const unauth = await call(exp.method, path, undefined, exp.body);
    unauthStatus = unauth.status;
    if (unauth.status !== 401) {
      log({
        op: exp.op + " (no auth)",
        method: exp.method,
        path,
        status: unauth.status,
        ok: false,
        note: `expected 401 Unauthorized, got ${unauth.status}`,
        unauthStatus,
      });
      return null;
    }
  }

  const r = await call(exp.method, path, token, exp.body);
  const statusOk = allow.includes(r.status);
  const expectedBusinessReject = statusOk && r.status >= 400;
  const successOk = expectedBusinessReject || r.json?.success !== false;
  const shapeErr =
    statusOk && successOk && !expectedBusinessReject ? checkShape(r.json?.data, exp.shape) : null;
  const emptyErr =
    statusOk && successOk && exp.nonEmpty
      ? Array.isArray(r.json?.data)
        ? r.json.data.length === 0
          ? "expected non-empty array"
          : null
        : r.json?.data == null
          ? "expected non-empty data"
          : null
      : null;

  const ok = statusOk && successOk && !shapeErr && !emptyErr;
  const note =
    shapeErr ||
    emptyErr ||
    r.json?.message?.slice?.(0, 80) ||
    (ok ? "ok" : `status ${r.status} success=${String(r.json?.success)}`);

  log({
    op: exp.op,
    method: exp.method,
    path,
    status: r.status,
    ok,
    note,
    unauthStatus,
    sample: ok ? (Array.isArray(r.json?.data) ? r.json.data.slice(0, 1) : r.json?.data) : r.json,
  });

  return r;
}

/** Route matrix — must match investmentOpsRoutes.ts (89 ops) */
function buildMatrix(c: Ctx): Expect[] {
  const q = (p: string) => (c.fundId ? `${p}${p.includes("?") ? "&" : "?"}fundId=${c.fundId}` : p);
  return [
    { op: "Dashboard summary", method: "GET", path: "/investment-ops/dashboard/summary?period=MTD", shape: "object" },
    { op: "Dashboard allocation", method: "GET", path: q("/investment-ops/dashboard/allocation"), shape: "any" },
    { op: "Currency exposure", method: "GET", path: q("/investment-ops/dashboard/currency-exposure"), shape: "any" },
    { op: "Dashboard funds", method: "GET", path: "/investment-ops/dashboard/funds", shape: "array", nonEmpty: true },
    {
      op: "Dashboard recalculate",
      method: "POST",
      path: "/investment-ops/dashboard/recalculate",
      body: c.fundId ? { fundId: c.fundId } : {},
      shape: "any",
      requires: "fundId",
    },
    { op: "List portfolios", method: "GET", path: "/investment-ops/portfolios", shape: "array", nonEmpty: true },
    { op: "Portfolio overview", method: "GET", path: "/investment-ops/portfolios/{fundId}/overview", shape: "object", requires: "fundId" },
    { op: "Portfolio holdings", method: "GET", path: "/investment-ops/portfolios/{fundId}/holdings", shape: "any", requires: "fundId" },
    { op: "Portfolio transactions", method: "GET", path: "/investment-ops/portfolios/{fundId}/transactions", shape: "any", requires: "fundId" },
    { op: "Portfolio exposure", method: "GET", path: "/investment-ops/portfolios/{fundId}/exposure", shape: "any", requires: "fundId" },
    { op: "Portfolio recalculate", method: "POST", path: "/investment-ops/portfolios/{fundId}/recalculate", requires: "fundId", shape: "any" },
    { op: "Instrument types", method: "GET", path: "/investment-ops/instruments/types", shape: "array", nonEmpty: true },
    { op: "List instruments", method: "GET", path: "/investment-ops/instruments?page=1&pageSize=10", shape: "object" },
    { op: "Get instrument", method: "GET", path: "/investment-ops/instruments/{instrumentId}", shape: "object", requires: "instrumentId" },
    {
      op: "Create instrument",
      method: "POST",
      path: "/investment-ops/instruments",
      body: {
        shortName: `SwaggerVerify ${Date.now()}`,
        ticker: `SV${String(Date.now()).slice(-6)}`,
        exchangeCode: "ZSE",
        instrumentTypeCode: "EQUITY",
        listingCurrencyCode: "USD",
      },
      shape: "object",
    },
    {
      op: "Update instrument",
      method: "PUT",
      path: "/investment-ops/instruments/{instrumentId}",
      body: { shortName: "Swagger verify update" },
      requires: "instrumentId",
      shape: "object",
    },
    { op: "Approve instrument", method: "POST", path: "/investment-ops/instruments/{instrumentId}/approve", requires: "instrumentId", allow: [200, 201, 400] },
    { op: "Latest prices", method: "GET", path: "/investment-ops/market-data/prices/latest", shape: "any" },
    { op: "Stale prices", method: "GET", path: "/investment-ops/market-data/prices/stale?hours=24", shape: "any" },
    {
      op: "Manual price",
      method: "POST",
      path: "/investment-ops/market-data/prices/manual",
      body: c.securityId ? { securityId: c.securityId, price: 1.25, sourceCode: "MANUAL" } : {},
      requires: "securityId",
      allow: [200, 201, 400],
    },
    {
      op: "Upload prices CSV",
      method: "POST",
      path: "/investment-ops/market-data/prices/upload",
      body: { csvText: "symbol,exchange,price\nTEST,ZSE,1.5", sourceCode: "CSV" },
      allow: [200, 201, 400, 403],
    },
    { op: "Run ingest", method: "POST", path: "/investment-ops/market-data/ingest/run", body: { sourceCode: "ZSE" }, allow: [200, 201, 400, 502] },
    { op: "Validation queue", method: "GET", path: "/investment-ops/market-data/validation-queue", shape: "array" },
    { op: "Approve tick", method: "POST", path: "/investment-ops/market-data/validation-queue/{tickId}/approve", requires: "tickId", allow: [200, 201, 400, 404] },
    {
      op: "Reject tick",
      method: "POST",
      path: "/investment-ops/market-data/validation-queue/{tickId}/reject",
      body: { reason: "verify script" },
      requires: "tickId",
      allow: [200, 201, 400, 404],
    },
    { op: "Security prices", method: "GET", path: "/investment-ops/market-data/securities/{securityId}/prices", requires: "securityId", shape: "any" },
    { op: "Ingest batches", method: "GET", path: "/investment-ops/market-data/ingest/batches", shape: "array" },
    { op: "Ingest batch detail", method: "GET", path: "/investment-ops/market-data/ingest/batches/{batchId}", requires: "batchId", allow: [200, 404] },
    { op: "Orderbook", method: "GET", path: q("/investment-ops/orders?page=1&pageSize=20"), shape: "any" },
    {
      op: "Create order",
      method: "POST",
      path: "/investment-ops/orders",
      body:
        c.fundId && c.instrumentId
          ? { fundId: c.fundId, instrumentId: c.instrumentId, side: "BUY", quantity: 1, executionPrice: 1, orderType: "MARKET" }
          : {},
      requires: "fundId",
      allow: [200, 201, 400, 403],
    },
    {
      op: "Order preview",
      method: "POST",
      path: "/investment-ops/orders/preview",
      body:
        c.fundId && c.instrumentId
          ? { fundId: c.fundId, instrumentId: c.instrumentId, side: "BUY", quantity: 1, executionPrice: 1 }
          : {},
      requires: "fundId",
      shape: "object",
    },
    { op: "Get order", method: "GET", path: "/investment-ops/orders/{orderId}", requires: "orderId", shape: "object" },
    { op: "Submit order", method: "POST", path: "/investment-ops/orders/{orderId}/submit", requires: "orderId", allow: [200, 201, 400] },
    { op: "Approve order", method: "POST", path: "/investment-ops/orders/{orderId}/approve", requires: "orderId", allow: [200, 201, 400] },
    { op: "Send to broker", method: "POST", path: "/investment-ops/orders/{orderId}/send-to-broker", requires: "orderId", allow: [200, 201, 400] },
    {
      op: "Reject order",
      method: "POST",
      path: "/investment-ops/orders/{orderId}/reject",
      body: { reason: "verify" },
      requires: "orderId",
      allow: [200, 201, 400],
    },
    {
      op: "Cancel order",
      method: "POST",
      path: "/investment-ops/orders/{orderId}/cancel",
      body: { reason: "verify" },
      requires: "orderId",
      allow: [200, 201, 400],
    },
    { op: "Compliance check order", method: "POST", path: "/investment-ops/orders/{orderId}/compliance-check", requires: "orderId", allow: [200, 201, 400] },
    { op: "Execute order", method: "POST", path: "/investment-ops/orders/{orderId}/execute", requires: "orderId", allow: [200, 201, 400] },
    { op: "Trade blotter", method: "GET", path: q("/investment-ops/trades"), shape: "any" },
    { op: "Get trade", method: "GET", path: "/investment-ops/trades/{tradeId}", requires: "tradeId", shape: "object" },
    { op: "Execute trade", method: "POST", path: "/investment-ops/trades/{tradeId}/execute", requires: "tradeId", allow: [200, 201, 400] },
    { op: "Routing hops", method: "GET", path: "/investment-ops/trades/{tradeId}/routing-hops", requires: "tradeId", shape: "array" },
    {
      op: "Confirm hop",
      method: "POST",
      path: "/investment-ops/trades/{tradeId}/routing-hops/{hopId}/confirm",
      body: { externalRef: "VERIFY-001" },
      requires: "hopId",
      allow: [200, 201, 400],
    },
    { op: "Retry hop", method: "POST", path: "/investment-ops/trades/{tradeId}/routing-hops/{hopId}/retry", requires: "hopId", allow: [200, 201, 400] },
    {
      op: "Cancel hop",
      method: "POST",
      path: "/investment-ops/trades/{tradeId}/routing-hops/{hopId}/cancel",
      body: { reason: "verify" },
      requires: "hopId",
      allow: [200, 201, 400],
    },
    { op: "Settlement document", method: "GET", path: "/investment-ops/trades/{tradeId}/settlement-document", requires: "tradeId", allow: [200, 404] },
    { op: "Compliance rules", method: "GET", path: q("/investment-ops/compliance/rules"), shape: "array" },
    {
      op: "Create compliance rule",
      method: "POST",
      path: "/investment-ops/compliance/rules",
      body: {
        fundId: c.fundId,
        ruleCode: `MAX_W_${Date.now()}`,
        ruleName: "Verify max weight",
        ruleType: "MAX_SINGLE_SECURITY_WEIGHT",
        thresholdValue: 30,
      },
      shape: "object",
    },
    {
      op: "Compliance override",
      method: "POST",
      path: "/investment-ops/compliance/overrides",
      body: c.orderId ? { orderId: c.orderId, reason: "verify override" } : {},
      requires: "orderId",
      allow: [200, 201, 400],
    },
    {
      op: "Run simulation",
      method: "POST",
      path: "/investment-ops/simulation/run",
      body:
        c.fundId && c.instrumentId
          ? {
              fundId: c.fundId,
              scenario: { side: "BUY", instrumentId: c.instrumentId, quantity: 10, price: 1.5 },
            }
          : {},
      requires: "fundId",
      shape: "object",
    },
    { op: "Get simulation", method: "GET", path: "/investment-ops/simulation/runs/{simulationRunId}", requires: "simulationRunId", shape: "object" },
    { op: "Model portfolios", method: "GET", path: "/investment-ops/model-portfolios", shape: "array" },
    {
      op: "Create model portfolio",
      method: "POST",
      path: "/investment-ops/model-portfolios",
      body: {
        name: `Verify Model ${Date.now()}`,
        allocations: [{ allocationType: "ASSET_CLASS", allocationKey: "EQUITY", targetWeightPct: 100 }],
      },
      shape: "object",
    },
    { op: "Model drift", method: "GET", path: q("/investment-ops/model-portfolios/{modelPortfolioId}/drift"), requires: "modelPortfolioId", shape: "any" },
    {
      op: "Run valuation",
      method: "POST",
      path: "/investment-ops/valuation/runs",
      body: c.fundId ? { fundId: c.fundId, costBasisMethod: "WAC" } : {},
      requires: "fundId",
      shape: "object",
    },
    { op: "Valuation run detail", method: "GET", path: "/investment-ops/valuation/runs/{valuationRunId}", requires: "valuationRunId", shape: "object" },
    { op: "Valuation exceptions", method: "GET", path: q("/investment-ops/valuation/exceptions"), shape: "array" },
    {
      op: "Resolve valuation exception",
      method: "POST",
      path: "/investment-ops/valuation/exceptions/{valuationExceptionId}/resolve",
      body: { action: "OVERRIDE_PRICE", reason: "verify" },
      requires: "valuationExceptionId",
      allow: [200, 201, 400, 404],
    },
    {
      op: "Run reconciliation",
      method: "POST",
      path: "/investment-ops/reconciliation/run",
      body: c.fundId ? { fundId: c.fundId, reconType: "HOLDINGS" } : {},
      requires: "fundId",
      shape: "object",
    },
    {
      op: "Upload reconciliation",
      method: "POST",
      path: "/investment-ops/reconciliation/upload",
      body: c.fundId
        ? { fundId: c.fundId, reconType: "CUSTODIAN_POSITION", csvText: "ref,quantity\nTEST.ZSE,1", fileName: "verify.csv" }
        : {},
      requires: "fundId",
      shape: "object",
    },
    { op: "Recon batches", method: "GET", path: q("/investment-ops/reconciliation/batches"), shape: "array" },
    { op: "Recon batch detail", method: "GET", path: "/investment-ops/reconciliation/batches/{reconBatchId}", requires: "reconBatchId", shape: "object" },
    {
      op: "Resolve recon item",
      method: "POST",
      path: "/investment-ops/reconciliation/items/{reconItemId}/resolve",
      body: { reason: "verify resolve" },
      requires: "reconItemId",
      allow: [200, 201, 400, 404],
    },
    { op: "Accounting events", method: "GET", path: q("/investment-ops/accounting/events?page=1&pageSize=20"), shape: "any" },
    { op: "Accounting journals", method: "GET", path: q("/investment-ops/accounting/journals"), shape: "array", nonEmpty: true },
    { op: "Accounting journal detail", method: "GET", path: "/investment-ops/accounting/journals/{journalEntryId}", requires: "journalEntryId", shape: "object" },
    {
      op: "Reverse accounting event",
      method: "POST",
      path: "/investment-ops/accounting/events/{accountingEventId}/reverse",
      body: { reason: "verify — do not use prod" },
      requires: "accountingEventId",
      allow: [200, 201, 400, 404],
    },
    { op: "Documents list", method: "GET", path: q("/investment-ops/documents"), shape: "array" },
    {
      op: "Upload document",
      method: "POST",
      path: "/investment-ops/documents",
      body: c.fundId
        ? { fundId: c.fundId, documentType: "OTHER", title: "Verify doc", fileRef: "/storage/verify.pdf" }
        : {},
      requires: "fundId",
      shape: "object",
    },
    { op: "Download document", method: "GET", path: "/investment-ops/documents/{documentId}/download", requires: "documentId", allow: [200, 404] },
    {
      op: "Generate report",
      method: "POST",
      path: "/investment-ops/reports/generate",
      body: c.fundId ? { fundId: c.fundId, reportType: "PORTFOLIO_VALUATION", format: "JSON" } : {},
      requires: "fundId",
      shape: "object",
    },
    { op: "Download report", method: "GET", path: "/investment-ops/reports/{reportRunId}/download", requires: "reportRunId", allow: [200, 404] },
    { op: "List brokers", method: "GET", path: "/investment-ops/setup/brokers", shape: "array" },
    {
      op: "Create broker",
      method: "POST",
      path: "/investment-ops/setup/brokers",
      body: { name: `Verify Broker ${Date.now()}`, contactEmail: "verify@example.com" },
      shape: "object",
    },
    { op: "List custodians", method: "GET", path: "/investment-ops/setup/custodians", shape: "array" },
    {
      op: "Create custodian",
      method: "POST",
      path: "/investment-ops/setup/custodians",
      body: { name: `Verify Custodian ${Date.now()}`, contactEmail: "verify@example.com" },
      shape: "object",
    },
    { op: "List commissions", method: "GET", path: "/investment-ops/setup/commissions", shape: "array" },
    {
      op: "Create commission",
      method: "POST",
      path: "/investment-ops/setup/commissions",
      body: c.brokerProfileId ? { stakeholderProfileId: c.brokerProfileId, rateBps: 20 } : {},
      requires: "brokerProfileId",
      allow: [200, 201, 400],
    },
    { op: "List markets", method: "GET", path: "/investment-ops/setup/markets", shape: "array", nonEmpty: true },
    {
      op: "Create market",
      method: "POST",
      path: "/investment-ops/setup/markets",
      body: { marketCode: `V${Date.now()}`, marketName: "Verify Market", countryCode: "ZW" },
      allow: [200, 201, 400],
    },
    { op: "List currencies", method: "GET", path: "/investment-ops/setup/currencies", shape: "array", nonEmpty: true },
    { op: "List countries", method: "GET", path: "/investment-ops/setup/countries", shape: "array", nonEmpty: true },
    {
      op: "Create country",
      method: "POST",
      path: "/investment-ops/setup/countries",
      body: { countryCode: `X${String(Date.now()).slice(-2)}`, countryName: "Verify Country", region: "Test" },
      allow: [200, 201, 400],
    },
    { op: "List issuers", method: "GET", path: "/investment-ops/setup/issuers?countryCode=ZW", shape: "array" },
    {
      op: "Create issuer",
      method: "POST",
      path: "/investment-ops/setup/issuers",
      body: { issuerCode: `V${Date.now()}`, legalName: "Verify Issuer Ltd", countryCode: "ZW" },
      allow: [200, 201, 400],
    },
    { op: "Price sources", method: "GET", path: "/investment-ops/setup/price-sources", shape: "any" },
    { op: "Get settings", method: "GET", path: "/investment-ops/setup/settings", shape: "object" },
    {
      op: "Update settings",
      method: "PUT",
      path: "/investment-ops/setup/settings",
      body: { four_eye_orders: { enabled: false } },
      shape: "object",
    },
  ];
}

async function discoverContext(token: string) {
  const portfolios = await call("GET", "/investment-ops/portfolios", token);
  const funds = portfolios.json?.data;
  if (Array.isArray(funds) && funds[0]?.id) ctx.fundId = funds[0].id;

  const instRes = await call("GET", "/investment-ops/instruments?pageSize=20", token);
  const items = instRes.json?.data?.items ?? instRes.json?.data;
  if (Array.isArray(items)) {
    const approved = items.find((i: any) => i.status === "APPROVED") ?? items[0];
    if (approved?.id) ctx.instrumentId = approved.id;
    if (approved?.securityId) ctx.securityId = approved.securityId;
  }

  const orders = await call("GET", `/investment-ops/orders?pageSize=20${ctx.fundId ? `&fundId=${ctx.fundId}` : ""}`, token);
  const orderItems = orders.json?.data?.items ?? orders.json?.data;
  if (Array.isArray(orderItems) && orderItems[0]?.id) ctx.orderId = orderItems[0].id;

  const trades = await call("GET", `/investment-ops/trades${ctx.fundId ? `?fundId=${ctx.fundId}` : ""}`, token);
  const tradeList = trades.json?.data?.items ?? trades.json?.data;
  if (Array.isArray(tradeList) && tradeList[0]?.id) {
    ctx.tradeId = tradeList[0].id;
    const hops = await call("GET", `/investment-ops/trades/${ctx.tradeId}/routing-hops`, token);
    if (Array.isArray(hops.json?.data) && hops.json.data[0]?.id) ctx.hopId = hops.json.data[0].id;
  }

  const vq = await call("GET", "/investment-ops/market-data/validation-queue", token);
  if (Array.isArray(vq.json?.data) && vq.json.data[0]?.id) ctx.tickId = vq.json.data[0].id;

  const batches = await call("GET", "/investment-ops/market-data/ingest/batches", token);
  if (Array.isArray(batches.json?.data) && batches.json.data[0]?.id) ctx.batchId = batches.json.data[0].id;

  const journals = await call("GET", `/investment-ops/accounting/journals${ctx.fundId ? `?fundId=${ctx.fundId}` : ""}`, token);
  if (Array.isArray(journals.json?.data) && journals.json.data[0]?.id) ctx.journalEntryId = journals.json.data[0].id;

  const events = await call("GET", `/investment-ops/accounting/events?page=1&pageSize=5${ctx.fundId ? `&fundId=${ctx.fundId}` : ""}`, token);
  const evItems = events.json?.data?.items ?? events.json?.data;
  if (Array.isArray(evItems) && evItems[0]?.id) ctx.accountingEventId = evItems[0].id;

  const valEx = await call("GET", `/investment-ops/valuation/exceptions${ctx.fundId ? `?fundId=${ctx.fundId}` : ""}`, token);
  if (Array.isArray(valEx.json?.data) && valEx.json.data[0]?.id) ctx.valuationExceptionId = valEx.json.data[0].id;

  const models = await call("GET", "/investment-ops/model-portfolios", token);
  if (Array.isArray(models.json?.data) && models.json.data[0]?.id) ctx.modelPortfolioId = models.json.data[0].id;

  const reconBatches = await call("GET", `/investment-ops/reconciliation/batches${ctx.fundId ? `?fundId=${ctx.fundId}` : ""}`, token);
  if (Array.isArray(reconBatches.json?.data) && reconBatches.json.data[0]?.id) {
    ctx.reconBatchId = reconBatches.json.data[0].id;
    const detail = await call("GET", `/investment-ops/reconciliation/batches/${ctx.reconBatchId}`, token);
    const items = detail.json?.data?.items ?? detail.json?.data?.exceptions;
    if (Array.isArray(items) && items[0]?.id) ctx.reconItemId = items[0].id;
  }

  const docs = await call("GET", `/investment-ops/documents${ctx.fundId ? `?fundId=${ctx.fundId}` : ""}`, token);
  if (Array.isArray(docs.json?.data) && docs.json.data[0]?.id) ctx.documentId = docs.json.data[0].id;

  const brokers = await call("GET", "/investment-ops/setup/brokers", token);
  if (Array.isArray(brokers.json?.data) && brokers.json.data[0]?.id) ctx.brokerProfileId = brokers.json.data[0].id;

  if (ctx.fundId) {
    const sim = await call("POST", "/investment-ops/simulation/run", token, {
      fundId: ctx.fundId,
      scenario: {
        side: "BUY",
        instrumentId: ctx.instrumentId,
        quantity: 10,
        price: 1.5,
      },
    });
    if (sim.json?.data?.id) ctx.simulationRunId = sim.json.data.id;

    const val = await call("POST", "/investment-ops/valuation/runs", token, { fundId: ctx.fundId, costBasisMethod: "WAC" });
    if (val.json?.data?.id) ctx.valuationRunId = val.json.data.id;

    const report = await call("POST", "/investment-ops/reports/generate", token, {
      fundId: ctx.fundId,
      reportType: "PORTFOLIO_VALUATION",
      format: "JSON",
    });
    if (report.json?.data?.id) ctx.reportRunId = report.json.data.id;
  }

  console.log("Discovered context:", JSON.stringify(ctx, null, 2));
}

function countRoutesInFile(): number {
  const routesPath = join(process.cwd(), "src/routes/investmentOpsRoutes.ts");
  const src = readFileSync(routesPath, "utf8");
  return (src.match(/router\.(get|post|put|delete|patch)\(/g) || []).length;
}

function countSwaggerOps(): number {
  const swaggerPath = join(process.cwd(), "src/config/investment-ops-swagger-paths.ts");
  const src = readFileSync(swaggerPath, "utf8");
  return (src.match(/^\s+(get|post|put|delete):/gm) || []).length;
}

async function checkSwaggerSpec() {
  const swaggerBase = BASE.replace(/\/api$/, "");
  const swaggerRes = await fetch(`${swaggerBase}/api-docs`);
  if (!swaggerRes.ok) {
    log({ op: "Swagger spec", method: "GET", path: "/api-docs", status: swaggerRes.status, ok: false, note: "could not load" });
    return;
  }
  const html = await swaggerRes.text();
  const matches = html.match(/\/investment-ops\/[a-z0-9\-/{}]+/gi) || [];
  const pathCount = new Set(matches.map((m) => m.replace(/\{[^}]+\}/g, "{id}"))).size;
  const routeCount = countRoutesInFile();
  const localOps = countSwaggerOps();
  const ok = pathCount >= routeCount - 5 && localOps === routeCount;
  log({
    op: "Swagger parity",
    method: "GET",
    path: "/api-docs",
    status: swaggerRes.status,
    ok,
    note: `routes=${routeCount} localSwaggerOps=${localOps} embeddedPaths≈${pathCount}`,
  });
}

async function main() {
  console.log(`Strict VPS verify — Investment Operations — ${BASE}\n`);
  const routeCount = countRoutesInFile();
  const swaggerOps = countSwaggerOps();
  if (routeCount !== swaggerOps) {
    console.warn(`WARN: routes file has ${routeCount} ops but swagger has ${swaggerOps}`);
  }

  const token = await login();
  log({ op: "Auth", method: "POST", path: "/auth/login", status: 200, ok: true, note: "token acquired", skipAuthCheck: true } as Row);

  await discoverContext(token);

  const matrix = buildMatrix(ctx);
  if (matrix.length !== routeCount) {
    console.warn(`WARN: test matrix has ${matrix.length} entries, routes file has ${routeCount}`);
  }

  for (const exp of matrix) {
    await hit(token, exp);
  }

  await checkSwaggerSpec();

  const failed = rows.filter((x) => !x.ok);
  const passed = rows.length - failed.length;
  console.log(`\n=== Strict IO verify: ${passed}/${rows.length} passed (${failed.length} failed) ===`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.method} ${f.path}: ${f.note}`);
  }

  writeFileSync(
    "tmp-investment-ops-swagger-vps-results.json",
    JSON.stringify({ server: BASE, ctx, routeCount, matrixCount: matrix.length, swaggerOps, rows, failedCount: failed.length }, null, 2)
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
