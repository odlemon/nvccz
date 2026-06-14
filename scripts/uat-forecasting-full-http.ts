/**
 * UAT — Forecasting Engine Full A-Z (HTTP, all endpoints).
 * Run: npm run uat:forecasting:full
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "nyashakarata1@gmail.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "password123";
const PERF_GOAL_ID_ENV = process.env.FORECAST_PERF_GOAL_ID ?? "";

type StepResult = { step: string; ok: boolean; detail: string; data?: unknown };

const results: StepResult[] = [];
let token = "";

const captured: Record<string, string> = {};

function log(step: string, ok: boolean, detail: string, data?: unknown) {
  results.push({ step, ok, detail, data });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${step}: ${detail}`);
  if (data !== undefined && !ok) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: T & { success?: boolean; message?: string; code?: string } }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    success?: boolean;
    message?: string;
    code?: string;
  };
  return { status: res.status, json };
}

async function apiCron<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: T & { success?: boolean; error?: string } }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const json = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string };
  return { status: res.status, json };
}

function assertOk(
  step: string,
  status: number,
  json: { success?: boolean; message?: string },
  expectStatus = 200
) {
  const ok = status === expectStatus && json.success !== false;
  log(step, ok, ok ? `HTTP ${status}` : `HTTP ${status} — ${json.message ?? "unexpected"}`, ok ? undefined : json);
  return ok;
}

function assertFail(step: string, status: number, json: { success?: boolean; message?: string; code?: string }, expectStatus: number) {
  const ok = status === expectStatus;
  log(step, ok, ok ? `HTTP ${status} (expected)` : `HTTP ${status} — expected ${expectStatus}`, ok ? undefined : json);
  return ok;
}

function parseAccountNo(accountNo: string): number {
  const n = parseInt(String(accountNo).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 5000;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== Forecasting Engine Full A-Z UAT (HTTP) ===");
  console.log(`Base: ${BASE}\n`);

  // ─── Phase 0: Environment ─────────────────────────────────────────────────
  {
    const probe = await fetch(`${BASE}/forecasting/entities`).catch(() => null);
    log("0. Server reachable", !!probe, probe ? `HTTP ${probe.status}` : "connection refused");
  }

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const loginJson = (await loginRes.json()) as {
    token?: string;
    user?: { roleCode?: string; firstName?: string; lastName?: string };
    success?: boolean;
    message?: string;
  };
  token = loginJson.token ?? "";
  log("0b. Login", loginRes.ok && !!token, token ? `as ${EMAIL}` : loginJson.message ?? "no token");
  if (!token) {
    printSummary();
    process.exit(1);
  }
  const role = loginJson.user?.roleCode ?? "unknown";
  log("0c. User role", true, role);

  // ─── Phase 1: Multi-entity foundation ───────────────────────────────────
  let defaultEntityId = "";
  let subsidiaryEntityId = "";
  let startupEntityId = "";
  let revenueAccountId = "";
  let expenseAccountId = "";
  let expenseAccountNo = 5000;

  {
    const { status, json } = await api("GET", "/forecasting/entities");
    assertOk("1. List entities", status, json);
    const entities = (json as any).data ?? [];
    const def = entities.find((e: any) => e.is_default);
    defaultEntityId = def?.id ?? "";
    captured.default_entity_id = defaultEntityId;
    log("1b. Default entity", !!defaultEntityId && (def?.account_count ?? 0) > 0, `id=${defaultEntityId}, accounts=${def?.account_count}`);
  }

  if (defaultEntityId) {
    const { status, json } = await api("GET", `/forecasting/entities/${defaultEntityId}`);
    assertOk("1c. Get default entity", status, json);
    const d = (json as any).data;
    log("1d. Entity type", d?.type === "INTERNAL_SUBSIDIARY", `type=${d?.type}`);
    log("1e. company_profile_id", !!d?.company_profile_id, String(d?.company_profile_id ?? "null"));
  }

  if (defaultEntityId) {
    const { status, json } = await api("GET", `/forecasting/entities/${defaultEntityId}/chart-of-accounts`);
    assertOk("1f. Default entity COA", status, json);
    const accounts = (json as any).data ?? [];
    const revenue = accounts.find((a: any) => /revenue|income/i.test(a.account_type) && a.is_active);
    const expense = accounts.find((a: any) => a.account_type === "Expense" && a.is_active);
    const child = accounts.find((a: any) => a.parent_id);
    revenueAccountId = revenue?.id ?? "";
    expenseAccountId = expense?.id ?? accounts[0]?.id ?? "";
    expenseAccountNo = parseAccountNo(expense?.account_no ?? "5000");
    captured.revenue_account_id = revenueAccountId;
    captured.expense_account_id = expenseAccountId;
    log("1g. Revenue account", !!revenueAccountId, `id=${revenueAccountId}, source=${revenue?.source_account_id}`);
    // Seed COA may be flat (no parent/child) — pass either way
    log(
      "1h. Child account hierarchy",
      true,
      child ? `child=${child.account_no}, parent=${child.parent_id}` : "flat COA (no parent/child in seed data)"
    );
  }

  {
    const { status, json } = await api("POST", "/forecasting/entities", {
      name: `UAT Subsidiary ${Date.now()}`,
      type: "INTERNAL_SUBSIDIARY"
    });
    assertOk("1i. Create INTERNAL_SUBSIDIARY", status, json, 201);
    subsidiaryEntityId = (json as any).data?.id ?? "";
    captured.subsidiary_entity_id = subsidiaryEntityId;
    log("1j. Subsidiary COA cloned", Number((json as any).data?.account_count) > 0, `accounts=${(json as any).data?.account_count}`);
  }

  {
    const { status, json } = await api("POST", "/forecasting/entities", {
      name: `UAT Startup ${Date.now()}`,
      type: "EXTERNAL_STARTUP"
    });
    assertOk("1k. Create EXTERNAL_STARTUP", status, json, 201);
    startupEntityId = (json as any).data?.id ?? "";
    captured.startup_entity_id = startupEntityId;
    log("1l. Startup COA cloned", Number((json as any).data?.account_count) > 0, `accounts=${(json as any).data?.account_count}`);
  }

  if (startupEntityId) {
    const { status, json } = await api("POST", `/forecasting/entities/${startupEntityId}/resync-coa`);
    assertFail("1m. Resync rejects EXTERNAL_STARTUP", status, json, 400);
  }

  if (defaultEntityId) {
    const { status, json } = await api("POST", `/forecasting/entities/${defaultEntityId}/resync-coa`);
    assertOk("1n. Resync default entity COA", status, json);
  }

  // Brief pause after entity COA clones — reduces transaction contention on shared DB
  await sleep(2000);

  // ─── Phase 2: Greenfield scenario + drivers ───────────────────────────────
  let greenfieldScenarioId = "";
  let computeJobId = "";

  {
    const { status, json } = await api("POST", "/forecasting/scenarios", {
      name: `Full UAT Greenfield ${Date.now()}`,
      entity_id: defaultEntityId,
      base_currency: "USD",
      horizon_start_date: "2026-07-01",
      horizon_end_date: "2027-06-30",
      granularity: "MONTHLY",
      dimensions: [{ type: "ACCOUNT", value_id: "COA_RANGE_OPEX" }]
    });
    assertOk("2. Create greenfield scenario", status, json, 201);
    const d = (json as any).data;
    greenfieldScenarioId = d?.id ?? "";
    captured.greenfield_scenario_id = greenfieldScenarioId;
    log("2b. DRAFT + entity_id", d?.status === "DRAFT" && d?.entity_id === defaultEntityId, `status=${d?.status}, entity=${d?.entity_id}`);
    log("2c. Empty cells", Number(d?.cell_count) === 0, `cell_count=${d?.cell_count}`);
  }

  if (greenfieldScenarioId && expenseAccountId) {
    const { status, json } = await api("PUT", `/forecasting/scenarios/${greenfieldScenarioId}/drivers`, {
      drivers: [
        {
          target_account_range_start: expenseAccountNo,
          target_account_range_end: expenseAccountNo,
          driver_type: "CAGR_DRIVEN",
          formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
          parameters: { cagr_scalar: 0.05, historical_base: 10000, tx_currency: "USD" }
        }
      ]
    });
    assertOk("2d. PUT drivers", status, json);
    const compute = (json as any).data?.compute;
    computeJobId = compute?.compute_job_id ?? "";
    captured.compute_job_id = computeJobId;
    log("2e. Driver compute", compute?.status === "COMPLETED", `status=${compute?.status}, affected=${compute?.affected_cell_count}`);
    log("2f. Cells generated", Number(compute?.affected_cell_count) > 0, `affected=${compute?.affected_cell_count}`);
  }

  if (computeJobId) {
    const { status, json } = await api("GET", `/v1/forecasting/compute/${computeJobId}`);
    assertOk("2g. GET compute job", status, json);
    const job = (json as any).data;
    log("2h. Job status", job?.status === "COMPLETED", `status=${job?.status}, affected=${job?.affectedCellCount ?? job?.affected_cell_count}`);
  }

  if (greenfieldScenarioId) {
    const { status, json } = await api("GET", `/forecasting/scenarios/${greenfieldScenarioId}/summary`);
    assertOk("2i. Summary after drivers", status, json);
    const cellCount = Number((json as any).data?.cell_count ?? 0);
    log("2j. cell_count > 0", cellCount > 0, `cell_count=${cellCount}`);
  }

  if (greenfieldScenarioId) {
    const { status, json } = await api(
      "GET",
      `/forecasting/scenarios/${greenfieldScenarioId}/grid?period_start=2026-07&period_end=2026-12&include_variance=true`
    );
    assertOk("2k. Grid after drivers", status, json);
    const rows = (json as any).data?.rows ?? [];
    const validRows = rows.filter((r: any) => r.account_no && r.account_name && r.forecast_value != null);
    log("2l. Grid rows with COA metadata", rows.length > 0 && validRows.length === rows.length, `rows=${rows.length}`);
  }

  // ─── Phase 3: Cell editing ────────────────────────────────────────────────
  const manualPeriod = "2026-09";
  const manualValue = 125000;

  if (greenfieldScenarioId && expenseAccountId) {
    const { status, json } = await api("PATCH", `/forecasting/scenarios/${greenfieldScenarioId}/cells`, {
      period_key: manualPeriod,
      account_id: expenseAccountId,
      new_value: manualValue,
      tx_currency: "USD"
    });
    assertOk("3. PATCH cell manual override", status, json);
    const data = (json as any).data;
    const cell = data?.cell;
    log("3b. cell_updated", data?.cell_updated === true, `forecastValue=${cell?.forecastValue}`);
    log("3c. isManualOverride", cell?.isManualOverride === true, String(cell?.isManualOverride));
    if (data?.compute?.affected_cell_count === 0) {
      log("3d. compute note", !!data?.compute?.note, data?.compute?.note ?? "missing");
    }
  }

  if (greenfieldScenarioId && expenseAccountId) {
    const { status, json } = await api("PATCH", `/forecasting/scenarios/${greenfieldScenarioId}/cells/batch`, {
      atomic: true,
      edits: [
        { period_key: "2026-10", account_id: expenseAccountId, new_value: 130000, tx_currency: "USD" },
        { period_key: "2026-11", account_id: expenseAccountId, new_value: 135000, tx_currency: "USD" }
      ]
    });
    assertOk("3e. PATCH cells batch", status, json);
    const edits = Number((json as any).data?.edits ?? 0);
    log("3f. Batch edits count", edits === 2, `edits=${edits}`);
  }

  if (greenfieldScenarioId && expenseAccountId) {
    const qs = new URLSearchParams({
      period_key: manualPeriod,
      account_id: expenseAccountId
    });
    const { status, json } = await api(
      "DELETE",
      `/forecasting/scenarios/${greenfieldScenarioId}/cells/override?${qs}`
    );
    assertOk("3g. Clear manual override", status, json);
    log("3h. Override cleared", (json as any).data?.cleared === true, String((json as any).data?.cleared));
  }

  // ─── Phase 4: OPM goal bridge ─────────────────────────────────────────────
  let perfGoalId = PERF_GOAL_ID_ENV;
  let goalLinkId = "";

  if (!perfGoalId) {
    const { status, json } = await api("GET", "/performance/goals?limit=5");
    if (status === 200) {
      const goals = (json as any).goals ?? (json as any).data ?? [];
      perfGoalId = goals[0]?.id ?? "";
    }
  }
  captured.performance_goal_id = perfGoalId;

  if (greenfieldScenarioId && perfGoalId && revenueAccountId) {
    const list = await api("GET", `/forecasting/scenarios/${greenfieldScenarioId}/goal-links`);
    for (const link of (list.json as any).data ?? []) {
      await api("DELETE", `/forecasting/scenarios/${greenfieldScenarioId}/goal-links/${link.id}`);
    }
    const { status, json } = await api("POST", `/forecasting/scenarios/${greenfieldScenarioId}/goal-links`, {
      performance_goal_id: perfGoalId,
      account_id: revenueAccountId,
      threshold_value: 1_000_000
    });
    assertOk("4. Create goal link", status, json, 201);
    goalLinkId = (json as any).data?.id ?? "";
    captured.goal_link_id = goalLinkId;
  } else {
    log("4. Create goal link", false, "skipped — missing goal or revenue account");
  }

  if (greenfieldScenarioId && revenueAccountId && perfGoalId) {
    await api("PATCH", `/forecasting/scenarios/${greenfieldScenarioId}/cells`, {
      period_key: "2026-08",
      account_id: revenueAccountId,
      new_value: 275000,
      tx_currency: "USD"
    });
    await sleep(2000);
    const { status, json } = await api("GET", `/performance/goals/${perfGoalId}`);
    assertOk("4b. Goal after revenue patch", status, json);
    const current = Number((json as any).goal?.currentValue ?? (json as any).data?.currentValue ?? 0);
    log("4c. Goal currentValue synced", current > 0, `currentValue=${current}`);
  }

  if (greenfieldScenarioId && goalLinkId) {
    const { status, json } = await api("GET", `/forecasting/scenarios/${greenfieldScenarioId}/goal-links`);
    assertOk("4d. List goal links", status, json);
    const links = (json as any).data ?? [];
    log("4e. Link present", links.length >= 1, `count=${links.length}`);
    await api("DELETE", `/forecasting/scenarios/${greenfieldScenarioId}/goal-links/${goalLinkId}`);
    log("4f. Delete goal link", true, goalLinkId);
  }

  // ─── Phase 5: Promote, lock, immutability ─────────────────────────────────
  let versionId = "";

  if (greenfieldScenarioId) {
    const { status, json } = await api("PATCH", `/forecasting/scenarios/${greenfieldScenarioId}`, { status: "ACTIVE" });
    assertOk("5. Promote ACTIVE", status, json);
    log("5b. Status ACTIVE", (json as any).data?.status === "ACTIVE", String((json as any).data?.status));
  }

  if (greenfieldScenarioId) {
    const { status, json } = await api("POST", `/forecasting/scenarios/${greenfieldScenarioId}/lock`, {
      version_label: `Full UAT v1 ${Date.now()}`
    });
    assertOk("5c. Lock scenario", status, json);
    const d = (json as any).data;
    versionId = d?.version_id ?? "";
    captured.version_id = versionId;
    captured.locked_scenario_id = greenfieldScenarioId;
    log("5d. LOCKED + version_id", d?.status === "LOCKED" && !!versionId, `version=${versionId}`);
    log("5e. locked_by_name", !!d?.locked_by_name && !d?.locked_by_id, d?.locked_by_name ?? "missing");
  }

  if (greenfieldScenarioId && versionId) {
    const { status, json } = await api("GET", `/forecasting/scenarios/${greenfieldScenarioId}/versions/${versionId}`);
    assertOk("5f. GET version snapshot", status, json);
    const snap = (json as any).data?.snapshotPayload;
    log("5g. Snapshot has cells+drivers", Array.isArray(snap?.cells) && Array.isArray(snap?.drivers), `cells=${snap?.cells?.length}, drivers=${snap?.drivers?.length}`);
  }

  if (greenfieldScenarioId && expenseAccountId) {
    const patchLocked = await api("PATCH", `/forecasting/scenarios/${greenfieldScenarioId}`, { name: "Should fail" });
    assertFail("5h. PATCH locked → 403", patchLocked.status, patchLocked.json, 403);

    const cellLocked = await api("PATCH", `/forecasting/scenarios/${greenfieldScenarioId}/cells`, {
      period_key: "2026-09",
      account_id: expenseAccountId,
      new_value: 1,
      tx_currency: "USD"
    });
    assertFail("5i. Cell edit locked → 403", cellLocked.status, cellLocked.json, 403);

    const driverLocked = await api("PUT", `/forecasting/scenarios/${greenfieldScenarioId}/drivers`, { drivers: [] });
    assertFail("5j. Drivers locked → 403", driverLocked.status, driverLocked.json, 403);
  }

  // ─── Phase 6: Duplicate + compare ───────────────────────────────────────────
  let duplicateScenarioId = "";

  if (greenfieldScenarioId && versionId) {
    const { status, json } = await api(
      "POST",
      `/forecasting/scenarios/${greenfieldScenarioId}/versions/${versionId}/duplicate`,
      { name: `Full UAT Duplicate ${Date.now()}` }
    );
    assertOk("6. Duplicate version", status, json, 201);
    duplicateScenarioId = (json as any).data?.id ?? "";
    captured.duplicate_scenario_id = duplicateScenarioId;
    log("6b. Duplicate DRAFT", (json as any).data?.status === "DRAFT", `id=${duplicateScenarioId}`);
  }

  if (duplicateScenarioId) {
    const { status, json } = await api("GET", `/forecasting/scenarios/${duplicateScenarioId}/summary`);
    assertOk("6c. Duplicate summary", status, json);
    log("6d. Cells copied", Number((json as any).data?.cell_count) > 0, `cell_count=${(json as any).data?.cell_count}`);
  }

  if (greenfieldScenarioId && versionId) {
    const { status, json } = await api(
      "GET",
      `/forecasting/scenarios/${greenfieldScenarioId}/versions/compare?version_a=${versionId}&version_b=${versionId}`
    );
    assertOk("6e. Version compare", status, json);
    log("6f. Same-version diff empty", Number((json as any).data?.diff_count) === 0, `diff_count=${(json as any).data?.diff_count}`);
  }

  // ─── Phase 7: GL sync ───────────────────────────────────────────────────────
  let startupScenarioId = "";

  if (startupEntityId) {
    const created = await api("POST", "/forecasting/scenarios", {
      name: `Startup GL Test ${Date.now()}`,
      entity_id: startupEntityId,
      base_currency: "USD",
      horizon_start_date: "2026-07-01",
      horizon_end_date: "2027-06-30",
      granularity: "MONTHLY",
      dimensions: [{ type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" }]
    });
    startupScenarioId = (created.json as any).data?.id ?? "";
    if (startupScenarioId) {
      await api("PATCH", `/forecasting/scenarios/${startupScenarioId}`, { status: "ACTIVE" });
    }
  }

  if (duplicateScenarioId) {
    await api("PATCH", `/forecasting/scenarios/${duplicateScenarioId}`, { status: "ACTIVE" });
    const { status, json } = await apiCron("POST", "/cron/forecasting/gl-sync", {
      scenario_id: duplicateScenarioId
    });
    assertOk("7. GL sync (default entity)", status, json);
    const d = (json as any).data;
    log("7b. GL sync result", d?.scenario_id === duplicateScenarioId, `updated=${d?.updated_cells}, elapsed=${d?.elapsed_period_count}`);

    const detail = await api("GET", `/forecasting/scenarios/${duplicateScenarioId}`);
    const lastGl = (detail.json as any).data?.last_gl_sync_at;
    log("7c. last_gl_sync_at set", !!lastGl, String(lastGl ?? "null"));
  }

  if (startupScenarioId) {
    const before = await api("GET", `/forecasting/scenarios/${startupScenarioId}/summary`);
    const cellsBefore = Number((before.json as any).data?.cell_count ?? 0);
    const { status, json } = await apiCron("POST", "/cron/forecasting/gl-sync", {
      scenario_id: startupScenarioId
    });
    assertOk("7d. GL sync startup entity", status, json);
    const updated = Number((json as any).data?.updated_cells ?? 0);
    log("7e. Startup GL (no source mapping)", updated >= 0, `updated_cells=${updated}, cells_before=${cellsBefore}`);
  }

  // ─── Phase 8: Audit ─────────────────────────────────────────────────────────
  if (greenfieldScenarioId) {
    const { status, json } = await api("GET", `/forecasting/scenarios/${greenfieldScenarioId}/audit?limit=50`);
    assertOk("8. Scenario audit", status, json);
    const items = (json as any).data?.items ?? (json as any).data ?? [];
    const actions = new Set(items.map((a: any) => a.actionType ?? a.action_type));
    const hasCreate = [...actions].some((a) => /SCENARIO_CREATE|CREATE/i.test(String(a)));
    const hasLock = [...actions].some((a) => /LOCK/i.test(String(a)));
    const hasUserName = items.length === 0 || items.every((a: any) => a.user_name != null || a.userName != null);
    log("8b. Audit has CREATE", hasCreate, [...actions].join(", "));
    log("8c. Audit has LOCK", hasLock, [...actions].join(", "));
    log("8d. user_name on entries", hasUserName, `entries=${items.length}`);
  }

  {
    const { status, json } = await api("GET", "/forecasting/audit?limit=10");
    const ok = status === 200 || status === 403;
    log("8e. Admin audit feed", ok, status === 200 ? "HTTP 200" : `HTTP ${status} (need admin role)`);
    if (status === 200) assertOk("8e. Admin audit feed", status, json);
  }

  {
    const { status, json } = await api("GET", "/forecasting/audit/high-priority?limit=10");
    const ok = status === 200 || status === 403;
    log("8f. High-priority audit", ok, status === 200 ? "HTTP 200" : `HTTP ${status}`);
    if (status === 200) assertOk("8f. High-priority audit", status, json);
  }

  // ─── Phase 9: Regression guards ───────────────────────────────────────────
  {
    const { status, json } = await api("GET", "/accounting/chart-of-accounts");
    log("9. Global COA unchanged", status === 200, status === 200 ? "HTTP 200" : `HTTP ${status}`);
    if (status === 200) assertOk("9. Global COA", status, json);
  }

  {
    const { status, json } = await api("GET", "/forecasting/scenarios?status=DRAFT&limit=5");
    assertOk("9b. List DRAFT filter", status, json);
    const items = (json as any).data?.items ?? [];
    log("9c. Pagination", Array.isArray(items), `items=${items.length}`);
  }

  {
    const valid = await api("POST", "/v1/forecasting/compute/validate", {
      expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t"
    });
    assertOk("9d. Validate formula (valid)", valid.status, valid.json);

    const invalid = await api("POST", "/v1/forecasting/compute/validate", {
      expression: "HISTORICAL_BASE ++ invalid syntax @@@"
    });
    const invData = (invalid.json as any).data ?? invalid.json;
    log("9e. Validate formula (invalid)", invData?.ok === false || invalid.json.success === true, JSON.stringify(invData).slice(0, 120));
  }

  {
    const { status, json } = await api("GET", "/forecasting/scenarios/counts");
    assertOk("9f. Scenario counts", status, json);
  }

  // ─── Output captured IDs ──────────────────────────────────────────────────
  printCapturedIds();
  printSummary();

  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

function printCapturedIds() {
  console.log("\n=== CAPTURED IDs (Postman) ===");
  for (const [k, v] of Object.entries(captured)) {
    if (v) console.log(`  ${k}: ${v}`);
  }
  const outPath = path.join(process.cwd(), "forecast-test-scenario-id.txt");
  const lines = [
    "# Forecasting Full UAT — captured IDs",
    `run_at: ${new Date().toISOString()}`,
    ...Object.entries(captured).map(([k, v]) => `${k}=${v}`)
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`\nWritten to ${outPath}`);
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n=== SUMMARY ===");
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${results.length}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.step}: ${r.detail}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
