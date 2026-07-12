/**
 * UAT — FP&A Model Builder (modules, map, validate, audit, publish).
 * Run: npm run uat:fpa:model-builder
 * Prefers API_BASE_URL (e.g. https://dev-api.arcus.co.zw/api).
 */
import "dotenv/config";

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
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  return json.token || json.data?.token || "";
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
  console.log(`API ${BASE}`);
  const token = await login();
  log("login", Boolean(token), token ? "ok" : "failed");
  if (!token) process.exit(1);

  const start = new Date();
  start.setUTCMonth(0, 1);
  const end = new Date(start);
  end.setUTCMonth(11, 31);

  const create = await api(
    "POST",
    "/v1/fpa/models",
    {
      name: `UAT Builder Model ${Date.now()}`,
      modelType: "BUDGET",
      baseCurrency: "USD",
      startPeriod: start.toISOString().slice(0, 10),
      endPeriod: end.toISOString().slice(0, 10),
      timeGranularity: "MONTHLY",
    },
    token
  );
  const modelId = create.json?.data?.id;
  log("create model", (create.status === 200 || create.status === 201) && Boolean(modelId), `status ${create.status}`);
  if (!modelId) {
    console.log(JSON.stringify(create.json, null, 2));
    process.exit(1);
  }

  const mod = await api(
    "POST",
    `/v1/fpa/models/${modelId}/modules`,
    { name: "Units & Pricing", code: "UNITS_PRICING" },
    token
  );
  const moduleId = mod.json?.data?.id;
  log("create module", (mod.status === 201 || mod.status === 200) && Boolean(moduleId), `status ${mod.status}`);

  const listMods = await api("GET", `/v1/fpa/models/${modelId}/modules`, undefined, token);
  log(
    "list modules",
    listMods.status === 200 && Array.isArray(listMods.json?.data),
    `count=${(listMods.json?.data || []).length}`
  );

  const li = await api(
    "POST",
    `/v1/fpa/models/${modelId}/line-items`,
    {
      code: "UNITS",
      name: "Units Sold",
      lineItemType: "INPUT",
      category: "REVENUE",
      moduleId,
      isEditable: true,
    },
    token
  );
  const lineId = li.json?.data?.id;
  log("create line item with moduleId", (li.status === 201 || li.status === 200) && Boolean(lineId), `status ${li.status}`);

  const price = await api(
    "POST",
    `/v1/fpa/models/${modelId}/line-items`,
    { code: "PRICE", name: "Price", lineItemType: "INPUT", category: "REVENUE", moduleId },
    token
  );
  const priceId = price.json?.data?.id;

  const rev = await api(
    "POST",
    `/v1/fpa/models/${modelId}/line-items`,
    { code: "REVENUE", name: "Revenue", lineItemType: "CALCULATED", category: "REVENUE", moduleId, isEditable: false },
    token
  );
  const revId = rev.json?.data?.id;

  if (revId) {
    const formula = await api(
      "POST",
      `/v1/fpa/models/${modelId}/formulas`,
      { lineItemId: revId, expression: "LINE('UNITS') * LINE('PRICE')" },
      token
    );
    log("create formula", formula.status === 201 || formula.status === 200, `status ${formula.status}`);
  }

  const filtered = await api("GET", `/v1/fpa/models/${modelId}/line-items?moduleId=${moduleId}`, undefined, token);
  log(
    "list line items by module",
    filtered.status === 200 && Array.isArray(filtered.json?.data) && filtered.json.data.length >= 1,
    `n=${(filtered.json?.data || []).length}`
  );

  if (lineId) {
    const upd = await api("PUT", `/v1/fpa/line-items/${lineId}`, { name: "Units Sold (upd)", decimalPlaces: 0 }, token);
    log("update line item", upd.status === 200, `status ${upd.status}`);
  }

  if (revId) {
    const deps = await api("GET", `/v1/fpa/line-items/${revId}/dependencies`, undefined, token);
    log("line item dependencies", deps.status === 200, `precedents=${(deps.json?.data?.precedents || []).length}`);
    const trace = await api("GET", `/v1/fpa/line-items/${revId}/trace`, undefined, token);
    log("line item trace", trace.status === 200 && Boolean(trace.json?.data?.expression), `status ${trace.status}`);
  }

  const map = await api("GET", `/v1/fpa/models/${modelId}/dependency-map?view=MODULE`, undefined, token);
  log(
    "dependency map",
    map.status === 200 && Array.isArray(map.json?.data?.nodes),
    `nodes=${(map.json?.data?.nodes || []).length} edges=${(map.json?.data?.edges || []).length}`
  );

  const validate = await api("POST", `/v1/fpa/models/${modelId}/validate`, {}, token);
  const vdata = validate.json?.data;
  log(
    "enriched validate",
    validate.status === 200 && vdata?.circularCheck != null && vdata?.summary != null,
    `passed=${vdata?.passed} errors=${vdata?.summary?.errors}`
  );

  const summary = await api("GET", `/v1/fpa/models/${modelId}/validation-summary`, undefined, token);
  log("validation summary", summary.status === 200 && summary.json?.data?.total != null, `status ${summary.status}`);

  const audit = await api("GET", `/v1/fpa/models/${modelId}/audit-logs`, undefined, token);
  log(
    "audit logs",
    audit.status === 200 && Array.isArray(audit.json?.data) && audit.json.data.length >= 1,
    `n=${(audit.json?.data || []).length}`
  );

  const pub = await api("POST", `/v1/fpa/models/${modelId}/publish`, {}, token);
  if (vdata?.passed) {
    log("publish when valid", pub.status === 200 && pub.json?.data?.status === "PUBLISHED", `status ${pub.status}`);
  } else {
    log(
      "publish blocked when invalid",
      pub.status === 409 || pub.status === 400,
      `status ${pub.status} code=${pub.json?.code}`
    );
  }

  if (priceId) {
    const del = await api("DELETE", `/v1/fpa/line-items/${priceId}`, undefined, token);
    log("delete line item", del.status === 200 && del.json?.data?.deleted === true, `status ${del.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
