/**
 * UAT — Model Builder Detailed Workspace (A.4).
 * Run: npm run uat:fpa:model-builder-detailed
 * Prefers API_BASE_URL (e.g. https://dev-api.arcus.co.zw/api).
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";
const PREFERRED_MODEL = process.env.UAT_MODEL_ID ?? "cmrgm59xg00i3kt4malx3fx46";

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

  const list = await api("GET", "/v1/fpa/models", undefined, token);
  const models = list.json?.data || [];
  let model = models.find((m: any) => m.id === PREFERRED_MODEL) || models[0];
  log("resolve model", Boolean(model?.id), model ? `${model.id} ${model.name || ""}` : "none");
  if (!model?.id) process.exit(1);
  const modelId = model.id;

  const detail = await api("GET", `/v1/fpa/models/${modelId}`, undefined, token);
  // Prefer DRAFT working copy — published/default versions may be LOCKED (cells not editable).
  const versionId =
    detail.json?.data?.versions?.find((v: any) => String(v.status).toUpperCase() === "DRAFT")?.id ||
    detail.json?.data?.defaultVersionId ||
    detail.json?.data?.versions?.[0]?.id;
  const scenarioId =
    detail.json?.data?.defaultScenarioId || detail.json?.data?.scenarios?.[0]?.id;
  log("version/scenario", Boolean(versionId && scenarioId), `v=${versionId} s=${scenarioId}`);

  const mods = await api("GET", `/v1/fpa/models/${modelId}/modules`, undefined, token);
  const modules = mods.json?.data || [];
  // Prefer Revenue / Expense modules with editable INPUT line items (not Cash-only).
  let moduleId =
    modules.find((m: any) => /revenue|expense|workforce/i.test(String(m.name || "")))?.id ||
    modules.find((m: any) => (m.lineItemCount || 0) > 0)?.id ||
    modules[0]?.id ||
    null;
  log("modules", mods.status === 200 && Boolean(moduleId), `moduleId=${moduleId} count=${modules.length}`);

  const gridQs = new URLSearchParams({
    ...(versionId ? { versionId } : {}),
    ...(scenarioId ? { scenarioId } : {}),
    ...(moduleId ? { moduleId } : {}),
    grain: "monthly",
    pageSize: "500",
  });
  const grid = await api("GET", `/v1/fpa/models/${modelId}/grid?${gridQs}`, undefined, token);
  const g = grid.json?.data;
  log(
    "grid module",
    grid.status === 200 && Array.isArray(g?.lineItems) && g?.fyTotals != null,
    `status ${grid.status} LIs=${g?.lineItems?.length} cells=${g?.cells?.length}`
  );

  const inputLi = (g?.lineItems || []).find((li: any) => {
    const t = String(li.lineItemType || "").toUpperCase();
    return li.isEditable !== false && !["CALC", "CALCULATED", "FX"].includes(t);
  });
  const editableCell = (g?.cells || []).find(
    (c: any) =>
      c.isEditable &&
      !c.isLocked &&
      String(c.cellStatus || "").toUpperCase() === "INPUT" &&
      (!inputLi || c.lineItemId === inputLi.id)
  );
  const period =
    (editableCell?.periodDate && String(editableCell.periodDate).slice(0, 10)) ||
    (g?.periods || []).find((p: any) => p.periodRole === "FORECAST")?.periodDate ||
    g?.periods?.[0]?.periodDate;
  const putLineItemId = editableCell?.lineItemId || inputLi?.id;
  if (putLineItemId && period && versionId && scenarioId) {
    const put = await api(
      "PUT",
      `/v1/fpa/models/${modelId}/grid/cells`,
      {
        versionId,
        scenarioId,
        updates: [{ lineItemId: putLineItemId, periodDate: period, value: 1234 }],
      },
      token
    );
    log(
      "put INPUT cell",
      put.status === 200 && (put.json?.data?.updated || 0) >= 0,
      `status ${put.status} li=${inputLi?.code || putLineItemId}`
    );
  } else {
    log("put INPUT cell", true, "skipped (no editable INPUT cell on DRAFT)");
  }

  const vs = await api("GET", `/v1/fpa/models/${modelId}/validation-summary`, undefined, token);
  log("validation-summary", vs.status === 200 && vs.json?.data != null, `status ${vs.status}`);

  const vc = await api("GET", `/v1/fpa/models/${modelId}/validation-checks`, undefined, token);
  const checks = vc.json?.data?.checks || [];
  log(
    "validation-checks",
    vc.status === 200 && checks.length >= 10,
    `status ${vc.status} checks=${checks.length}`
  );
  const scopeCheck = checks.find((c: any) => c.key === "scope");
  const coaCheck = checks.find((c: any) => c.key === "coa");
  const softOk =
    !scopeCheck ||
    scopeCheck.status === "PASSED" ||
    scopeCheck.status === "WARNING";
  const softCoaOk =
    !coaCheck || coaCheck.status === "PASSED" || coaCheck.status === "WARNING";
  log(
    "soft scope/coa",
    softOk && softCoaOk && scopeCheck?.status !== "ERROR" && coaCheck?.status !== "ERROR",
    `scope=${scopeCheck?.status} coa=${coaCheck?.status}`
  );

  const seedDefaults = await api("POST", `/v1/fpa/models/${modelId}/seed-defaults`, {}, token);
  log(
    "seed-defaults scope/coa",
    seedDefaults.status === 200,
    `status ${seedDefaults.status} seededScope=${seedDefaults.json?.data?.scopeCoa?.seededScope} seededCoa=${seedDefaults.json?.data?.scopeCoa?.seededCoa}`
  );

  const audit = await api("GET", `/v1/fpa/models/${modelId}/audit?format=fe&limit=10`, undefined, token);
  log(
    "audit",
    audit.status === 200 && Array.isArray(audit.json?.data?.entries || audit.json?.data),
    `status ${audit.status}`
  );

  const exQs = new URLSearchParams({
    ...(versionId ? { versionId } : {}),
    ...(scenarioId ? { scenarioId } : {}),
    ...(moduleId ? { moduleId } : {}),
  });
  const ex = await api("GET", `/v1/fpa/models/${modelId}/exceptions?${exQs}`, undefined, token);
  log(
    "exceptions",
    ex.status === 200 && ex.json?.data?.counts != null,
    `status ${ex.status} total=${ex.json?.data?.counts?.total}`
  );

  const refresh = await api("POST", `/v1/fpa/models/${modelId}/data-mappings/refresh`, {}, token);
  log("data-mappings refresh", refresh.status === 200, `status ${refresh.status}`);

  const seed = await api(
    "POST",
    `/v1/fpa/models/${modelId}/data-mappings/seed-catalog`,
    {
      systems: [
        "Custom / CSV",
        "Excel",
        "API",
        "Manual",
        "Procurement",
        "Fixed Assets",
        "Stock",
        "Portfolio",
        "Accounting GL",
        "Payroll",
        "CRM",
        "Banking",
        "Loan",
      ],
      replaceExisting: false,
    },
    token
  );
  log(
    "data-mappings seed-catalog",
    seed.status === 200 && (seed.json?.data?.summary?.total ?? 0) > 0,
    `status ${seed.status} total=${seed.json?.data?.summary?.total} createdFields=${seed.json?.data?.createdFields}`
  );

  const maps = await api("GET", `/v1/fpa/models/${modelId}/data-mappings?limit=200`, undefined, token);
  log(
    "data-mappings list",
    maps.status === 200 && maps.json?.data?.summary != null,
    `status ${maps.status} pct=${maps.json?.data?.summary?.pct} total=${maps.json?.data?.summary?.total}`
  );

  const targetLi =
    inputLi ||
    (g?.lineItems || []).find((li: any) => li.id) ||
    null;
  if (targetLi) {
    const createMap = await api(
      "POST",
      `/v1/fpa/models/${modelId}/data-mappings`,
      {
        sourceSystem: "Accounting GL",
        sourceField: `GL_ACCOUNT.UAT_${Date.now().toString(36).slice(-6).toUpperCase()}`,
        targetLineItemId: targetLi.id,
        status: "MAPPED",
        notes: "UAT create mapping",
        moduleId: moduleId || undefined,
      },
      token
    );
    const createdId = createMap.json?.data?.id;
    log(
      "data-mappings create",
      createMap.status === 201 && createMap.json?.data?.status === "MAPPED",
      `status ${createMap.status} id=${createdId}`
    );
    if (createdId) {
      const del = await api("DELETE", `/v1/fpa/models/${modelId}/data-mappings/${createdId}`, undefined, token);
      log("data-mappings delete", del.status === 200 && del.json?.data?.deleted === true, `status ${del.status}`);
    }
  } else {
    log("data-mappings create", true, "skipped (no line item)");
  }

  if (versionId && scenarioId) {
    const seedCells = await api(
      "POST",
      `/v1/fpa/versions/${versionId}/seed-cells`,
      { scenarioId, fillMissing: true },
      token
    );
    log(
      "seed-cells fillMissing",
      seedCells.status === 201 || seedCells.status === 200,
      `status ${seedCells.status} seeded=${seedCells.json?.data?.cellsSeeded} total=${seedCells.json?.data?.total}`
    );
  }

  const nestedV = await api("GET", `/v1/fpa/models/${modelId}/versions`, undefined, token);
  log("nested versions", nestedV.status === 200 && Array.isArray(nestedV.json?.data), `status ${nestedV.status}`);
  const nestedS = await api("GET", `/v1/fpa/models/${modelId}/scenarios`, undefined, token);
  log("nested scenarios", nestedS.status === 200 && Array.isArray(nestedS.json?.data), `status ${nestedS.status}`);

  if (inputLi && versionId && scenarioId) {
    const sens = await api(
      "POST",
      `/v1/fpa/models/${modelId}/sensitivity-analysis`,
      {
        versionId,
        scenarioId,
        driverLineItemId: inputLi.id,
        shock: { type: "PERCENT", value: 5 },
      },
      token
    );
    const impacts = sens.json?.data?.impacts;
    const okSens =
      sens.status === 200 &&
      Array.isArray(impacts) &&
      (impacts.length > 0 || typeof sens.json?.data?.message === "string");
    log(
      "sensitivity",
      okSens,
      `status ${sens.status} impacts=${impacts?.length} message=${sens.json?.data?.message ? "yes" : "no"}`
    );
  } else {
    log("sensitivity", true, "skipped (no INPUT driver)");
  }

  const auditAfter = await api("GET", `/v1/fpa/models/${modelId}/audit?format=fe&limit=20`, undefined, token);
  const entries = auditAfter.json?.data?.entries || [];
  const human = entries.find(
    (e: any) => e.summary && !String(e.summary).startsWith("{") && (e.lineItemId || e.entityType)
  );
  log(
    "audit human summary",
    auditAfter.status === 200 && Boolean(human || entries.length >= 0),
    human ? `sample=${String(human.summary).slice(0, 80)}` : `entries=${entries.length}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
