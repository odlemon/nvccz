/**
 * Smoke — A.4 Detailed workspace gap regression (post cell-canonical + demo seed).
 * Run: node -r dotenv/config -r ts-node/register/transpile-only scripts/smoke-a4-detailed-gaps.js
 * Or:  npx ts-node --transpile-only -r dotenv/config scripts/smoke-a4-detailed-gaps.js
 *
 * Prefers API_BASE_URL (e.g. http://31.220.82.129:3009/api).
 */
require("dotenv").config();

const BASE = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3009}/api`;
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";
const PUBLISHED = process.env.UAT_PUBLISHED_MODEL_ID || "cmriumdfwef94e1434fe0d35b";
const DRAFT = process.env.UAT_DRAFT_MODEL_ID || "cmriumdwu250b3836adf652d4";

const results = [];
function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  return json.token || json.data?.token || "";
}

async function api(method, path, body, token) {
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

function coordBuckets(cells) {
  const map = new Map();
  for (const c of cells || []) {
    const k = `${c.lineItemId}|${String(c.periodDate).slice(0, 10)}|${c.departmentId || ""}`;
    (map.get(k) || map.set(k, []).get(k)).push(c);
  }
  return map;
}

async function main() {
  console.log(`API ${BASE}`);
  const token = await login();
  log("login", Boolean(token), token ? "ok" : "failed");
  if (!token) process.exit(1);

  // --- Published model ---
  const pub = await api("GET", `/v1/fpa/models/${PUBLISHED}`, undefined, token);
  const published = pub.json?.data;
  const versionId =
    published?.versions?.find((v) => String(v.status).toUpperCase() === "DRAFT")?.id ||
    published?.defaultVersionId ||
    published?.versions?.[0]?.id;
  const scenarioId = published?.defaultScenarioId || published?.scenarios?.[0]?.id;
  log("published resolve", Boolean(versionId && scenarioId), `v=${versionId} s=${scenarioId}`);

  const grid = await api(
    "GET",
    `/v1/fpa/models/${PUBLISHED}/grid?versionId=${versionId}&scenarioId=${scenarioId}&grain=monthly&pageSize=500`,
    undefined,
    token
  );
  const cells = grid.json?.data?.cells || [];
  const buckets = coordBuckets(cells);
  let dupes = 0;
  for (const [, rows] of buckets) if (rows.length > 1) dupes += 1;
  log("grid no duplicate coords", dupes === 0, `dupeCoords=${dupes} cells=${cells.length}`);

  const unitsLi = (grid.json?.data?.lineItems || []).find(
    (l) => String(l.code).toUpperCase() === "UNITS"
  );
  const ex = await api(
    "GET",
    `/v1/fpa/models/${PUBLISHED}/exceptions?versionId=${versionId}&scenarioId=${scenarioId}`,
    undefined,
    token
  );
  const emptyUnits = (ex.json?.data?.items || []).filter(
    (i) =>
      i.code === "EMPTY_VALUE" &&
      unitsLi &&
      i.lineItemId === unitsLi.id &&
      cells.some(
        (c) =>
          c.lineItemId === unitsLi.id &&
          String(c.periodDate).slice(0, 10) === String(i.periodDate).slice(0, 10) &&
          c.value != null
      )
  );
  log(
    "no false EMPTY_VALUE for valued cells",
    emptyUnits.length === 0,
    `falsePositives=${emptyUnits.length}`
  );

  if (unitsLi) {
    const sens = await api(
      "POST",
      `/v1/fpa/models/${PUBLISHED}/sensitivity-analysis`,
      {
        versionId,
        scenarioId,
        driverLineItemId: unitsLi.id,
        shock: { type: "PERCENT", value: 5 },
      },
      token
    );
    const impacts = sens.json?.data?.impacts || [];
    const nonzero = impacts.filter((i) => Math.abs(Number(i.deltaTotal || 0)) > 0);
    const series = sens.json?.data?.series || {};
    const moved =
      Array.isArray(series.baseCase) &&
      series.baseCase.some((b, i) => Number(b) !== Number(series.shocked?.[i]));
    log(
      "sensitivity nonzero deltas",
      sens.status === 200 && (nonzero.length > 0 || (impacts.length === 0 && sens.json?.data?.message)),
      `status=${sens.status} nonzero=${nonzero.length} movedSeries=${!!moved} message=${sens.json?.data?.message ? "yes" : "no"}`
    );
    if (nonzero.length === 0 && impacts.length > 0) {
      log("sensitivity no fake zeros", false, "returned zero impacts without filtering");
    }
  } else {
    log("sensitivity nonzero deltas", true, "skipped (no UNITS LI)");
  }

  const calcLi = (grid.json?.data?.lineItems || []).find((l) => {
    const t = String(l.lineItemType || "").toUpperCase();
    return ["CALC", "CALCULATED"].includes(t) || /GROSS|REVENUE/.test(String(l.code || ""));
  });
  const calcCell = cells.find((c) => calcLi && c.lineItemId === calcLi.id && c.value != null);
  if (calcCell) {
    const tr = await api("GET", `/v1/fpa/models/${PUBLISHED}/cells/${calcCell.id}/trace`, undefined, token);
    const lineNodes = (tr.json?.data?.nodes || []).filter((n) => n.kind === "LINE");
    const valued = lineNodes.filter((n) => n.value != null);
    log(
      "trace LINE node values",
      tr.status === 200 && (lineNodes.length === 0 || valued.length > 0),
      `status=${tr.status} lineNodes=${lineNodes.length} valued=${valued.length}`
    );
  } else {
    log("trace LINE node values", true, "skipped (no calc cell)");
  }

  const graph = await api("GET", `/v1/fpa/models/${PUBLISHED}/dependency-graph`, undefined, token);
  const nodes = graph.json?.data?.nodes || [];
  log(
    "dependency-graph nodes",
    graph.status === 200 && nodes.length > 0,
    `status=${graph.status} nodes=${nodes.length} edges=${(graph.json?.data?.edges || []).length}`
  );

  const vs = await api("GET", `/v1/fpa/models/${PUBLISHED}/validation-summary`, undefined, token);
  const vc = await api("GET", `/v1/fpa/models/${PUBLISHED}/validation-checks`, undefined, token);
  const sumTotal = vs.json?.data?.total;
  const chkTotal = vc.json?.data?.summary?.total;
  log(
    "validation-summary aligns checks",
    vs.status === 200 && vc.status === 200 && sumTotal === chkTotal,
    `summary.total=${sumTotal} checks.total=${chkTotal}`
  );

  // --- Draft demo seed ---
  const seed = await api("POST", `/v1/fpa/models/${DRAFT}/seed-defaults`, {}, token);
  log("draft seed-defaults", seed.status === 200, `status=${seed.status} demo=${JSON.stringify(seed.json?.data?.demo || {}).slice(0, 120)}`);

  const draftDetail = await api("GET", `/v1/fpa/models/${DRAFT}`, undefined, token);
  const dVersion =
    draftDetail.json?.data?.versions?.find((v) => String(v.status).toUpperCase() === "DRAFT")?.id ||
    draftDetail.json?.data?.defaultVersionId;
  const dScenario =
    draftDetail.json?.data?.defaultScenarioId || draftDetail.json?.data?.scenarios?.[0]?.id;
  const dGrid = await api(
    "GET",
    `/v1/fpa/models/${DRAFT}/grid?versionId=${dVersion}&scenarioId=${dScenario}&grain=monthly&pageSize=500`,
    undefined,
    token
  );
  const dLis = dGrid.json?.data?.lineItems || [];
  const hasUnits = dLis.some((l) => String(l.code).toUpperCase() === "UNITS");
  const hasGross = dLis.some((l) => String(l.code).toUpperCase() === "GROSS_REVENUE");
  const dUnits = dLis.find((l) => String(l.code).toUpperCase() === "UNITS");
  const dSens = dUnits
    ? await api(
        "POST",
        `/v1/fpa/models/${DRAFT}/sensitivity-analysis`,
        {
          versionId: dVersion,
          scenarioId: dScenario,
          driverLineItemId: dUnits.id,
          shock: { type: "PERCENT", value: 5 },
        },
        token
      )
    : { status: 0, json: {} };
  const dNonzero = (dSens.json?.data?.impacts || []).filter((i) => Math.abs(Number(i.deltaTotal || 0)) > 0);
  log(
    "draft demo richness",
    hasUnits && hasGross && (dNonzero.length > 0 || dSens.json?.data?.message),
    `units=${hasUnits} gross=${hasGross} sensNonzero=${dNonzero.length}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
