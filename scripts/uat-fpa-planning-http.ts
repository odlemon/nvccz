/**
 * UAT — FP&A Planning core (HTTP).
 * Run: npm run uat:fpa
 * Requires API running (npm run dev) and db:migrate:fpa-planning applied.
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
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) {
    process.exit(1);
  }

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCMonth(0);
  const end = new Date(start);
  end.setUTCMonth(11);

  const create = await api(
    "POST",
    "/v1/fpa/models",
    {
      name: `UAT FPA Model ${Date.now()}`,
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
  log("create model", (create.status === 201 || create.status === 200) && Boolean(modelId), `status ${create.status}`);
  if (!modelId) {
    console.log(JSON.stringify(create.json, null, 2));
    process.exit(1);
  }

  const versionId = model?.defaultVersionId || model?.versions?.[0]?.id;
  const scenarioId = model?.defaultScenarioId || model?.scenarios?.[0]?.id;
  log("seeded version/scenario", Boolean(versionId && scenarioId), `v=${versionId} s=${scenarioId}`);

  const dims = await api("GET", "/v1/fpa/dimensions", undefined, token);
  log("list dimensions", dims.status === 200 && Array.isArray(dims.json?.data), `status ${dims.status}`);

  const setup = await api(
    "POST",
    "/v1/fpa/models/setup",
    {
      name: `UAT Setup Model ${Date.now()}`,
      modelType: "BUDGET",
      baseCurrency: "USD",
      startPeriod: start.toISOString().slice(0, 10),
      endPeriod: end.toISOString().slice(0, 10),
      timeGranularity: "MONTHLY",
      baseline: { mode: "NONE" },
      lineItems: [
        { code: "REVENUE", name: "Revenue", lineItemType: "REVENUE", category: "REVENUE" },
        { code: "COGS", name: "COGS", lineItemType: "EXPENSE", category: "EXPENSE" },
        { code: "EBITDA", name: "EBITDA", lineItemType: "CALC", category: "REVENUE" },
      ],
      formulas: [{ lineItemCode: "EBITDA", expression: "LINE('REVENUE') - LINE('COGS')" }],
      drivers: [{ code: "GROWTH", name: "Growth", value: 1.05, category: "GENERAL" }],
      workflow: {
        name: "UAT Setup Cycle",
        workflowType: "BUDGET",
        tasks: [{ title: "Finance input" }],
      },
    },
    token
  );
  const setupModelId = setup.json?.data?.model?.id;
  log(
    "atomic model setup",
    (setup.status === 201 || setup.status === 200) && Boolean(setupModelId),
    `status ${setup.status}`
  );

  if (setupModelId) {
    const scope = await api(
      "PUT",
      `/v1/fpa/models/${setupModelId}/scope`,
      { entityIds: [], departmentIds: [] },
      token
    );
    log("set scope", scope.status === 200, `status ${scope.status}`);

    const validate = await api("POST", `/v1/fpa/models/${setupModelId}/validate`, {}, token);
    log(
      "validate model",
      validate.status === 200 && typeof validate.json?.data?.passed === "boolean",
      `status ${validate.status} passed=${validate.json?.data?.passed}`
    );
  }

  const getModel = await api("GET", `/v1/fpa/models/${modelId}`, undefined, token);
  log("get model", getModel.status === 200, `status ${getModel.status}`);

  const grid = await api(
    "GET",
    `/v1/fpa/models/${modelId}/grid?versionId=${versionId}&scenarioId=${scenarioId}`,
    undefined,
    token
  );
  const cells = grid.json?.data?.cells || grid.json?.data?.rows || grid.json?.data || [];
  const cellList = Array.isArray(cells) ? cells : cells?.items || [];
  log("get grid", grid.status === 200, `status ${grid.status} cells~${Array.isArray(cellList) ? cellList.length : "?"}`);

  const firstCell =
    (Array.isArray(cellList) && cellList[0]) ||
    grid.json?.data?.items?.[0] ||
    null;
  const cellId = firstCell?.id || firstCell?.cellId;

  if (cellId && versionId) {
    const upd = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/update`,
      { cellId, value: 100000, versionId },
      token
    );
    log("update cell", upd.status === 200 || upd.status === 201, `status ${upd.status}`);
  } else {
    // Fallback: update by coordinates if service expects that
    const lineItems = await api("GET", `/v1/fpa/models/${modelId}/line-items`, undefined, token);
    const revenue = (lineItems.json?.data || []).find((x: any) => x.code === "REVENUE");
    const upd = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/update`,
      {
        versionId,
        scenarioId,
        lineItemId: revenue?.id,
        periodDate: start.toISOString().slice(0, 10),
        value: 100000,
      },
      token
    );
    log("update cell (coords)", upd.status === 200 || upd.status === 201, `status ${upd.status} ${upd.json?.message || ""}`);
  }

  const validate = await api(
    "POST",
    "/v1/fpa/formulas/validate",
    { expression: "LINE('REVENUE') - LINE('COGS')" },
    token
  );
  log("formula validate", validate.status === 200 && validate.json?.data?.valid !== false, `status ${validate.status}`);

  const circ = await api(
    "POST",
    "/v1/fpa/formulas/dependency-check",
    {
      modelId,
      expression: "LINE('EBITDA')",
      lineItemCode: "REVENUE",
      dependsOn: ["EBITDA", "REVENUE"],
    },
    token
  );
  log("circular dependency check endpoint", circ.status === 200 || circ.status === 400, `status ${circ.status}`);

  const upside = await api(
    "POST",
    "/v1/fpa/scenarios",
    { modelId, name: "Upside", scenarioType: "UPSIDE" },
    token
  );
  const upsideId = upside.json?.data?.id;
  log("create upside scenario", Boolean(upsideId), `status ${upside.status}`);

  if (upsideId && scenarioId) {
    const cmp = await api(
      "POST",
      `/v1/fpa/scenarios/${scenarioId}/compare`,
      { scenarioIds: [scenarioId, upsideId], versionId },
      token
    );
    log("scenario compare", cmp.status === 200, `status ${cmp.status}`);
  }

  const driver = await api(
    "POST",
    `/v1/fpa/models/${modelId}/drivers`,
    {
      code: "GROWTH_RATE",
      name: "Revenue Growth",
      category: "REVENUE",
      value: 0.05,
      scenarioId,
      versionId,
    },
    token
  );
  const driverId = driver.json?.data?.id;
  log("create driver", driver.status === 200 || driver.status === 201, `status ${driver.status}`);

  if (driverId) {
    const upd = await api("PUT", `/v1/fpa/drivers/${driverId}`, { value: 0.08, unit: "ratio" }, token);
    log("update driver", upd.status === 200, `status ${upd.status}`);
  }

  const wf = await api(
    "POST",
    "/v1/fpa/workflows",
    {
      modelId,
      name: "UAT Budget Cycle",
      workflowType: "ANNUAL_BUDGET",
      tasks: [{ title: "Finance input", assigneeId: undefined }],
    },
    token
  );
  const workflowId = wf.json?.data?.id;
  log("create workflow", Boolean(workflowId) || wf.status === 200 || wf.status === 201, `status ${wf.status}`);

  const wfList = await api("GET", `/v1/fpa/workflows?modelId=${modelId}`, undefined, token);
  log("list workflows", wfList.status === 200 && Array.isArray(wfList.json?.data), `status ${wfList.status}`);

  const tasks = await api("GET", `/v1/fpa/tasks/my-tasks?modelId=${modelId}`, undefined, token);
  const taskCount = Array.isArray(tasks.json?.data) ? tasks.json.data.length : 0;
  log("my tasks includes unassigned", tasks.status === 200 && taskCount > 0, `status ${tasks.status} count ${taskCount}`);

  if (taskCount > 0 && tasks.json.data[0]?.id) {
    const tid = tasks.json.data[0].id;
    const re = await api("POST", `/v1/fpa/tasks/${tid}/reassign`, { comment: "UAT keep unassigned" }, token);
    log("reassign task", re.status === 200, `status ${re.status}`);
  }

  if (upsideId) {
    const promo = await api("POST", `/v1/fpa/scenarios/${upsideId}/promote`, { scenarioType: "FORECAST" }, token);
    log("promote scenario", promo.status === 200, `status ${promo.status}`);
  }

  const exportJob = await api(
    "POST",
    "/v1/fpa/exports/board-pack",
    { modelId, versionId, exportType: "BOARD_PACK" },
    token
  );
  const exportId = exportJob.json?.data?.id;
  const downloadUrl = exportJob.json?.data?.downloadUrl;
  log("board-pack export", Boolean(exportId) && Boolean(downloadUrl), `status ${exportJob.status}`);
  if (exportId) {
    const dl = await api("GET", `/v1/fpa/exports/${exportId}/download`, undefined, token);
    log("export download", dl.status === 200, `status ${dl.status}`);
  }

  const home = await api("GET", `/v1/fpa/home/dashboard?modelId=${modelId}`, undefined, token);
  log("home dashboard", home.status === 200, `status ${home.status}`);

  const depts = await api("GET", "/departments", undefined, token);
  const deptId = Array.isArray(depts.json?.data)
    ? depts.json.data[0]?.id
    : Array.isArray(depts.json)
      ? depts.json[0]?.id
      : depts.json?.data?.departments?.[0]?.id;
  const fy = start.getUTCFullYear();
  if (deptId) {
    const bc = await api(
      "POST",
      "/v1/fpa/budget-cycles",
      {
        modelId,
        name: `UAT Budget ${Date.now()}`,
        fiscalYear: fy + 1000 + Math.floor(Math.random() * 100),
        versionId,
        scenarioId,
        loadPriorActuals: false,
        loadBaseline: false,
        owners: [{ departmentId: deptId, categories: ["REVENUE", "OPERATING_EXPENSES"] }],
      },
      token
    );
    const cycleId = bc.json?.data?.id;
    log("create budget cycle", (bc.status === 201 || bc.status === 200) && Boolean(cycleId), `status ${bc.status}`);
    if (cycleId) {
      const listBc = await api("GET", `/v1/fpa/budget-cycles?modelId=${modelId}`, undefined, token);
      log("list budget cycles", listBc.status === 200 && Array.isArray(listBc.json?.data), `status ${listBc.status}`);
      const val = await api("POST", `/v1/fpa/budget-cycles/${cycleId}/validate`, {}, token);
      log("validate budget cycle", val.status === 200, `status ${val.status} passed=${val.json?.data?.passed}`);
    }
  } else {
    log("create budget cycle", false, "no department available");
  }

  const domain = await api("GET", `/v1/fpa/domain/revenue?modelId=${modelId}`, undefined, token);
  log("domain revenue", domain.status === 200, `status ${domain.status}`);

  const variance = await api(
    "POST",
    "/v1/fpa/variance/calculate",
    { modelId, versionId, scenarioId, varianceType: "ACTUAL_VS_BUDGET" },
    token
  );
  log("variance calculate", variance.status === 200 || variance.status === 201, `status ${variance.status}`);

  const actuals = await api(
    "POST",
    "/v1/fpa/actuals/sync",
    { modelId, versionId, scenarioId, periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) },
    token
  );
  log("actuals sync", actuals.status === 200 || actuals.status === 201, `status ${actuals.status}`);

  const ai = await api(
    "POST",
    "/v1/fpa/ai/suggest",
    { modelId, lineItemCode: "REVENUE" },
    token
  );
  log("ai suggest stub", ai.status === 200 || ai.status === 201, `status ${ai.status}`);

  if (versionId) {
    const seeded = await api(
      "POST",
      `/v1/fpa/versions/${versionId}/seed-cells`,
      { scenarioId, force: true },
      token
    );
    log(
      "seed cells (skip-or-ok)",
      seeded.status === 200 || seeded.status === 409,
      `status ${seeded.status}`
    );

    const lock = await api("POST", `/v1/fpa/versions/${versionId}/lock`, {}, token);
    log("lock version", lock.status === 200 || lock.status === 201, `status ${lock.status}`);

    const denied = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/update`,
      {
        versionId,
        scenarioId,
        lineItemId: firstCell?.lineItemId,
        periodDate: start.toISOString().slice(0, 10),
        value: 1,
        cellId,
      },
      token
    );
    log("locked edit returns 403", denied.status === 403, `status ${denied.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== UAT FPA summary ===");
  console.log(`passed ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.step}: ${f.detail}`);
    process.exit(1);
  }
  console.log("UAT FPA complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
