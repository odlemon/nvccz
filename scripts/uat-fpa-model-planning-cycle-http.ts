/**
 * UAT — FP&A Model Planning Cycle API (HTTP).
 * Run: npm run uat:fpa:model-planning-cycle
 * Requires API running and db:migrate:model-planning-cycle applied.
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

type PublishedFixture = {
  modelId: string;
  publishedVersionId: string;
  draftVersionId: string;
  scenarioId: string;
};

async function findPublishedFixture(token: string): Promise<PublishedFixture | null> {
  const list = await api("GET", "/v1/fpa/models", undefined, token);
  const models = (list.json?.data as Array<{ id: string }>) || [];
  for (const m of models) {
    const detail = await api("GET", `/v1/fpa/models/${m.id}`, undefined, token);
    if (detail.status !== 200) continue;
    const data = detail.json?.data;
    const versions = (data?.versions as Array<{ id: string; status: string }>) || [];
    const published = versions.find((v) => String(v.status).toUpperCase() === "LOCKED");
    const draft =
      versions.find((v) => String(v.status).toUpperCase() === "DRAFT") ||
      (data?.workingVersionId ? { id: data.workingVersionId, status: "DRAFT" } : null);
    const scenarioId = data?.defaultScenarioId || data?.scenarios?.[0]?.id;
    if (published && draft && scenarioId) {
      return {
        modelId: m.id,
        publishedVersionId: published.id,
        draftVersionId: draft.id,
        scenarioId,
      };
    }
  }
  return null;
}

async function createAndPublishFixture(token: string): Promise<PublishedFixture | null> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCMonth(0);
  const end = new Date(start);
  end.setUTCMonth(11);

  const createModel = await api(
    "POST",
    "/v1/fpa/models",
    {
      name: `UAT Model Planning Cycle ${Date.now()}`,
      code: `UAT_MPC_${Date.now()}`,
      modelType: "BUDGET",
      baseCurrency: "USD",
      startPeriod: start.toISOString().slice(0, 10),
      endPeriod: end.toISOString().slice(0, 10),
      timeGranularity: "MONTHLY",
    },
    token
  );
  const modelId = createModel.json?.data?.id;
  if (!modelId) return null;

  const draftVersionId =
    createModel.json?.data?.defaultVersionId || createModel.json?.data?.versions?.[0]?.id;
  const scenarioId =
    createModel.json?.data?.defaultScenarioId || createModel.json?.data?.scenarios?.[0]?.id;
  if (!draftVersionId || !scenarioId) return null;

  const publish = await api(
    "POST",
    `/v1/fpa/versions/${draftVersionId}/publish`,
    { notes: "UAT model planning cycle publish" },
    token
  );
  const publishedVersionId =
    publish.json?.data?.publishedVersionId || publish.json?.data?.versionId || draftVersionId;
  const workingVersionId = publish.json?.data?.workingCopyVersionId || draftVersionId;

  if (!(publish.status === 200 || publish.status === 201)) return null;

  return {
    modelId,
    publishedVersionId,
    draftVersionId: workingVersionId,
    scenarioId,
  };
}

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const sources = await api("GET", "/v1/fpa/model-planning/cycles/sources", undefined, token);
  const planningTypes = sources.json?.data?.planningTypes;
  log(
    "list sources",
    sources.status === 200 && Array.isArray(planningTypes) && planningTypes.length >= 1,
    `status ${sources.status} types=${planningTypes?.length ?? 0}`
  );

  let fixture = await findPublishedFixture(token);
  if (!fixture) {
    fixture = await createAndPublishFixture(token);
    log("create+publish fixture", Boolean(fixture), fixture ? "created fresh model" : "failed");
  } else {
    log("reuse published fixture", true, `modelId=${fixture.modelId}`);
  }
  if (!fixture) process.exit(1);

  const { modelId, publishedVersionId, draftVersionId, scenarioId } = fixture;

  const rejectDraft = await api(
    "POST",
    "/v1/fpa/model-planning/cycles",
    {
      name: "UAT should reject draft version",
      financialYear: 2026,
      planningType: "ANNUAL_BUDGET",
      sourceModelId: modelId,
      sourceModelVersionId: draftVersionId,
      baseScenarioId: scenarioId,
    },
    token
  );
  log(
    "reject unpublished version",
    rejectDraft.status === 400 && rejectDraft.json?.code === "SOURCE_VERSION_NOT_PUBLISHED",
    `status ${rejectDraft.status} code=${rejectDraft.json?.code}`
  );

  const scopedSources = await api(
    "GET",
    `/v1/fpa/model-planning/cycles/sources?modelId=${modelId}`,
    undefined,
    token
  );
  const publishedVersions = scopedSources.json?.data?.versions || [];
  log(
    "sources published versions only",
    scopedSources.status === 200 &&
      publishedVersions.length >= 1 &&
      publishedVersions.every((v: { status: string }) => String(v.status).toUpperCase() === "LOCKED"),
    `count=${publishedVersions.length}`
  );

  const createCycle = await api(
    "POST",
    "/v1/fpa/model-planning/cycles",
    {
      name: `UAT FY2026 Budget Planning ${Date.now()}`,
      financialYear: 2026,
      planningType: "ANNUAL_BUDGET",
      sourceModelId: modelId,
      sourceModelVersionId: publishedVersionId,
      baseScenarioId: scenarioId,
      actualsCutoffPeriod: "2025-12-31",
      forecastStartPeriod: "2026-01-01",
      planningHorizon: 12,
    },
    token
  );
  const cycleId = createCycle.json?.data?.id;
  log(
    "create model planning cycle",
    createCycle.status === 201 && Boolean(cycleId),
    `status ${createCycle.status} id=${cycleId}`
  );
  if (!cycleId) {
    console.log(JSON.stringify(createCycle.json, null, 2));
    process.exit(1);
  }

  const workspace = await api("GET", `/v1/fpa/model-planning/cycles/${cycleId}/workspace`, undefined, token);
  const grid = workspace.json?.data?.grid;
  log(
    "workspace grid params",
    workspace.status === 200 && grid?.modelId === modelId && grid?.cycleId === cycleId,
    `modelId=${grid?.modelId} cycleId=${grid?.cycleId}`
  );

  const gridRes = await api(
    "GET",
    `/v1/fpa/models/${modelId}/grid?versionId=${publishedVersionId}&scenarioId=${scenarioId}&cycleId=${cycleId}`,
    undefined,
    token
  );
  const lineItems = gridRes.json?.data?.lineItems;
  log(
    "grid with model planning cycleId",
    gridRes.status === 200 && Array.isArray(lineItems),
    `status ${gridRes.status} lineItems=${lineItems?.length ?? 0}`
  );

  const openCycle = await api(
    "PUT",
    `/v1/fpa/model-planning/cycles/${cycleId}`,
    { status: "OPEN" },
    token
  );
  log(
    "status DRAFT -> OPEN",
    openCycle.status === 200 && openCycle.json?.data?.status === "OPEN",
    `status ${openCycle.status}`
  );

  const badTransition = await api(
    "PUT",
    `/v1/fpa/model-planning/cycles/${cycleId}`,
    { status: "LOCKED" },
    token
  );
  log(
    "reject invalid transition OPEN -> LOCKED",
    badTransition.status === 409 && badTransition.json?.code === "INVALID_STATUS_TRANSITION",
    `status ${badTransition.status} code=${badTransition.json?.code}`
  );

  const list = await api("GET", `/v1/fpa/model-planning/cycles?modelId=${modelId}`, undefined, token);
  log(
    "list by modelId",
    list.status === 200 && (list.json?.data?.items?.length ?? 0) >= 1,
    `count=${list.json?.data?.items?.length ?? 0}`
  );

  const draftCycle = await api(
    "POST",
    "/v1/fpa/model-planning/cycles",
    {
      name: `UAT delete me ${Date.now()}`,
      financialYear: 2026,
      planningType: "REFORECAST",
      sourceModelId: modelId,
      sourceModelVersionId: publishedVersionId,
    },
    token
  );
  const draftCycleId = draftCycle.json?.data?.id;
  if (draftCycleId) {
    const del = await api("DELETE", `/v1/fpa/model-planning/cycles/${draftCycleId}`, undefined, token);
    log("delete DRAFT cycle", del.status === 200 && del.json?.data?.deleted === true, `status ${del.status}`);
  } else {
    log("delete DRAFT cycle", false, "could not create draft cycle for delete test");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:", failed.map((f) => f.step).join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
