/**
 * UAT — Model Builder FE contract (aliases, publish version, graph, templates, audit).
 * Run: npm run uat:fpa:model-builder-fe
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
  start.setUTCFullYear(2026, 0, 1);
  const end = new Date(Date.UTC(2026, 11, 31));

  const create = await api(
    "POST",
    "/v1/fpa/models",
    {
      name: `UAT FE Contract ${Date.now()}`,
      modelType: "BUDGET",
      baseCurrency: "USD",
      startPeriod: start.toISOString().slice(0, 10),
      endPeriod: end.toISOString().slice(0, 10),
      timeGranularity: "MONTHLY",
    },
    token
  );
  const model = create.json?.data;
  const modelId = model?.id;
  const versionId = model?.defaultVersionId || model?.versions?.[0]?.id;
  const scenarioId = model?.defaultScenarioId || model?.scenarios?.[0]?.id;
  log(
    "create model shape",
    create.status === 201 && Boolean(modelId) && Boolean(versionId) && Array.isArray(model?.versions),
    `status ${create.status} versions=${model?.versions?.length}`
  );
  if (!modelId) {
    console.log(JSON.stringify(create.json, null, 2));
    process.exit(1);
  }

  const list = await api("GET", "/v1/fpa/models", undefined, token);
  const row = (list.json?.data || []).find((m: any) => m.id === modelId);
  log("list ownerName", list.status === 200 && row && ("ownerName" in row || row.ownerUserId), `ownerName=${row?.ownerName}`);

  const mod = await api(
    "POST",
    `/v1/fpa/models/${modelId}/modules`,
    { name: "Units & Pricing", parentModuleId: null, dimensionKeys: ["Time", "Product"] },
    token
  );
  const moduleId = mod.json?.data?.id;
  log(
    "create module dual fields",
    (mod.status === 201 || mod.status === 200) &&
      mod.json?.data?.parentModuleId === null &&
      Array.isArray(mod.json?.data?.dimensionKeys) &&
      mod.json?.data?.calculationOrder != null,
    `status ${mod.status}`
  );

  const li = await api(
    "POST",
    `/v1/fpa/models/${modelId}/line-items`,
    {
      code: `UNITS_${Date.now().toString(36).toUpperCase()}`,
      name: "Units Sold",
      lineItemType: "INPUT",
      moduleId,
      displayScale: 0,
      format: "Number",
    },
    token
  );
  const lineItemId = li.json?.data?.id;
  log("create LI displayScale", (li.status === 201 || li.status === 200) && li.json?.data?.displayScale === 0, `status ${li.status}`);

  const putLi = await api(
    "PUT",
    `/v1/fpa/line-items/${lineItemId}`,
    { description: "Volume driver", summaryMethod: "SUM", dimensionKeys: ["Time", "Product", "Region"] },
    token
  );
  log("PUT LI properties", putLi.status === 200 && putLi.json?.data?.description === "Volume driver", `status ${putLi.status}`);

  const graph = await api("GET", `/v1/fpa/models/${modelId}/dependency-graph?view=module`, undefined, token);
  log(
    "dependency-graph",
    graph.status === 200 && Array.isArray(graph.json?.data?.modules) && Array.isArray(graph.json?.data?.edges) && "circular" in (graph.json?.data || {}),
    `status ${graph.status} modules=${graph.json?.data?.modules?.length}`
  );

  const validate = await api("POST", `/v1/fpa/models/${modelId}/validate`, {}, token);
  const v = validate.json?.data || {};
  log(
    "validate FE shape",
    validate.status === 200 && Array.isArray(v.errors) && Array.isArray(v.warnings) && "circular" in v && "circularPath" in v,
    `passed=${v.passed} circular=${v.circular}`
  );

  const audit = await api("GET", `/v1/fpa/models/${modelId}/audit`, undefined, token);
  log("audit entries", audit.status === 200 && Array.isArray(audit.json?.data?.entries), `n=${audit.json?.data?.entries?.length}`);

  const tpls = await api("GET", "/v1/fpa/line-item-templates", undefined, token);
  log("templates", tpls.status === 200 && (tpls.json?.data?.length || 0) >= 1, `n=${tpls.json?.data?.length}`);

  const apply = await api(
    "POST",
    `/v1/fpa/models/${modelId}/modules/${moduleId}/apply-template`,
    { templateId: "discount-adj" },
    token
  );
  log("apply template", apply.status === 201 || apply.status === 200, `status ${apply.status}`);

  const dup = await api("POST", `/v1/fpa/modules/${moduleId}/duplicate`, {}, token);
  log("duplicate module", dup.status === 201 || dup.status === 200, `status ${dup.status}`);

  if (versionId && scenarioId && lineItemId) {
    const cells = await api(
      "PUT",
      `/v1/fpa/models/${modelId}/grid/cells`,
      {
        versionId,
        scenarioId,
        updates: [{ lineItemId, periodKey: "2026-01", value: 1000 }],
      },
      token
    );
    log("grid cells PUT", cells.status === 200, `status ${cells.status}`);

    const testCalc = await api("POST", `/v1/fpa/versions/${versionId}/test-calculation`, { scenarioId }, token);
    log("test-calculation", testCalc.status === 200, `status ${testCalc.status}`);
  }

  // Publish may 409 if setup validate still has ERRORS (missing scope etc.) — accept either success or PUBLISH_BLOCKED
  const pub = await api("POST", `/v1/fpa/versions/${versionId}/publish`, { notes: "UAT publish" }, token);
  const pubOk =
    pub.status === 200 ||
    (pub.status === 409 && (pub.json?.code === "PUBLISH_BLOCKED" || pub.json?.error === "PUBLISH_BLOCKED" || String(pub.json?.message || "").includes("validation")));
  log("version publish gate", Boolean(pubOk), `status ${pub.status} code=${pub.json?.code || pub.json?.error}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
