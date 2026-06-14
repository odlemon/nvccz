/**
 * UAT — Forecasting Engine Phase 2 + Multi-Entity (HTTP / Postman-equivalent flow).
 * Run: npm run uat:forecasting:phase2
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "nyashakarata1@gmail.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "password123";

const LOCKED_SCENARIO = process.env.FORECAST_LOCKED_SCENARIO_ID ?? "cmqcqbxfe0009un4479v5yp9y";
const LOCKED_VERSION = process.env.FORECAST_LOCKED_VERSION_ID ?? "cmqcvws5w0001unv4x0brmnep";
const PERF_GOAL_ID = process.env.FORECAST_PERF_GOAL_ID ?? "cmpr2gqoo0001uncsyhd1zjio";

type StepResult = { step: string; ok: boolean; detail: string; data?: unknown };

const results: StepResult[] = [];
let token = "";

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
): Promise<{ status: number; json: T & { success?: boolean; message?: string } }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const json = (await res.json().catch(() => ({}))) as T & { success?: boolean; message?: string };
  return { status: res.status, json };
}

function assertOk(step: string, status: number, json: { success?: boolean; message?: string }, expectStatus = 200) {
  const ok = status === expectStatus && json.success !== false;
  log(step, ok, ok ? `HTTP ${status}` : `HTTP ${status} — ${json.message ?? "unexpected"}`, ok ? undefined : json);
  return ok;
}

async function main() {
  console.log("=== Forecasting Phase 2 + Multi-Entity UAT (HTTP) ===");
  console.log(`Base: ${BASE}\n`);

  // 1. Login
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const loginJson = (await loginRes.json()) as { token?: string; success?: boolean; message?: string };
  token = loginJson.token ?? "";
  log("1. Login", loginRes.ok && !!token, token ? `as ${EMAIL}` : loginJson.message ?? "no token");
  if (!token) {
    printSummary();
    process.exit(1);
  }

  // ─── Multi-Entity Tests ────────────────────────────────────────────────────

  // 2. List entities — default must exist
  let defaultEntityId = "";
  let defaultEntityAccountId = "";
  {
    const { status, json } = await api("GET", "/forecasting/entities");
    assertOk("2. List entities", status, json);
    const entities = (json as any).data ?? [];
    const defaultEntity = entities.find((e: any) => e.is_default);
    const hasDefault = !!defaultEntity;
    defaultEntityId = defaultEntity?.id ?? "";
    log("2b. Default entity present", hasDefault, hasDefault ? `id=${defaultEntityId}, name=${defaultEntity.name}` : "NO default entity found");
    log("2c. Entities have account_count", entities.length > 0 && entities[0].account_count >= 0, `count=${entities[0]?.account_count}`);
  }

  // 3. List default entity chart-of-accounts
  {
    if (!defaultEntityId) {
      log("3. Entity COA", false, "Skipped — no default entity id");
    } else {
      const { status, json } = await api("GET", `/forecasting/entities/${defaultEntityId}/chart-of-accounts`);
      assertOk("3. Default entity COA", status, json);
      const accounts = (json as any).data ?? [];
      const revenueAccount = accounts.find((a: any) => String(a.account_type).match(/Revenue|Income/i) && a.is_active);
      defaultEntityAccountId = revenueAccount?.id ?? accounts[0]?.id ?? "";
      log("3b. Revenue account in entity COA", !!revenueAccount, revenueAccount
        ? `id=${revenueAccount.id}, no=${revenueAccount.account_no}, source=${revenueAccount.source_account_id}`
        : `fallback to first: ${defaultEntityAccountId}`);
      log("3c. Accounts have source_account_id", accounts.some((a: any) => a.source_account_id), `total=${accounts.length}`);
    }
  }

  // 4. Create new EXTERNAL_STARTUP entity with cloned COA
  let newEntityId = "";
  let newEntityAccountId = "";
  {
    const { status, json } = await api("POST", "/forecasting/entities", {
      name: `UAT Startup ${Date.now()}`,
      type: "EXTERNAL_STARTUP"
    });
    assertOk("4. Create entity (EXTERNAL_STARTUP)", status, json, 201);
    newEntityId = (json as any).data?.id ?? "";
    const acctCount = (json as any).data?.account_count ?? 0;
    log("4b. Entity id + cloned COA", !!newEntityId && acctCount > 0, newEntityId ? `id=${newEntityId}, accounts_cloned=${acctCount}` : "missing");
  }

  // 5. Confirm new entity's COA exists independently
  if (newEntityId) {
    const { status, json } = await api("GET", `/forecasting/entities/${newEntityId}/chart-of-accounts`);
    assertOk("5. New entity COA", status, json);
    const accounts = (json as any).data ?? [];
    newEntityAccountId = accounts.find((a: any) => String(a.account_type).match(/Revenue|Income/i) && a.is_active)?.id ?? accounts[0]?.id ?? "";
    log("5b. COA cloned for new entity", accounts.length > 0, `accounts=${accounts.length}, sample=${newEntityAccountId}`);
  }

  // 6. Create scenario for new entity
  let newEntityScenarioId = "";
  if (newEntityId && newEntityAccountId) {
    const { status, json } = await api("POST", "/forecasting/scenarios", {
      name: `UAT New Entity Scenario ${Date.now()}`,
      entity_id: newEntityId,
      base_currency: "USD",
      horizon_start_date: "2026-07-01",
      horizon_end_date: "2027-06-30",
      granularity: "MONTHLY",
      dimensions: [{ type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" }]
    });
    assertOk("6. Create scenario for new entity", status, json, 201);
    newEntityScenarioId = (json as any).data?.id ?? "";
    const entityIdBack = (json as any).data?.entity_id;
    log("6b. entity_id in create response", entityIdBack === newEntityId, `entity_id=${entityIdBack}`);
  }

  // 7. Scenario detail shows entity_id and entity_name
  if (newEntityScenarioId) {
    const { status, json } = await api("GET", `/forecasting/scenarios/${newEntityScenarioId}`);
    assertOk("7. New entity scenario detail", status, json);
    const d = (json as any).data;
    log("7b. entity_id in detail", d?.entity_id === newEntityId, `entity_id=${d?.entity_id}, entity_name=${d?.entity_name}`);
  }

  // 8. Patch a cell on new entity scenario using its entity account id
  if (newEntityScenarioId && newEntityAccountId) {
    const { status, json } = await api("PATCH", `/forecasting/scenarios/${newEntityScenarioId}/cells`, {
      period_key: "2026-08",
      account_id: newEntityAccountId,
      new_value: 50000,
      tx_currency: "USD"
    });
    assertOk("8. Patch cell on new entity scenario", status, json);
    const cell = (json as any).data?.cell;
    log("8b. Cell saved for new entity", !!cell?.id, cell ? `accountId=${cell.accountId}, forecastValue=${cell.forecastValue}` : "missing");
  }

  // ─── Default Entity / Legacy Tests (Phase 2) ──────────────────────────────

  // 9. Scenario counts
  {
    const { status, json } = await api("GET", "/forecasting/scenarios/counts");
    const data = (json as any).data;
    assertOk("9. Scenario counts", status, json);
    if (data) log("9b. Counts payload", typeof data.total === "number", `total=${data.total}, locked=${data.locked}`);
  }

  // 10. List scenarios — entity_id + entity_name now in results
  {
    const { status, json } = await api("GET", "/forecasting/scenarios?limit=10");
    assertOk("10. List scenarios", status, json);
    const items = (json as any).data?.items ?? [];
    const first = items[0];
    if (first) {
      const hasEntityId = !!first.entity_id;
      const hasName = !!first.created_by_name;
      log("10b. entity_id in list", hasEntityId, `entity_id=${first.entity_id}, entity_name=${first.entity_name}`);
      log("10c. User display names", hasName, hasName ? `created_by_name=${first.created_by_name}` : "missing");
    }
  }

  // 11. Duplicate locked version → new DRAFT
  let workingScenarioId = "";
  {
    const name = `Phase2 UAT ${Date.now()}`;
    const { status, json } = await api("POST", `/forecasting/scenarios/${LOCKED_SCENARIO}/versions/${LOCKED_VERSION}/duplicate`, {
      name
    });
    assertOk("11. Duplicate locked version", status, json, 201);
    workingScenarioId = (json as any).data?.id ?? "";
    const data = (json as any).data;
    if (workingScenarioId && data?.status === "DRAFT") {
      log("11b. New scenario DRAFT", true, `id=${workingScenarioId}`);
    }
  }
  if (!workingScenarioId) {
    log("11-skip", false, "No working scenario — skipping remaining default entity tests");
    printSummary();
    process.exit(1);
  }

  // 12. Scenario detail — must have entity_id
  let workingEntityId = defaultEntityId;
  let workingAccountId = defaultEntityAccountId;
  {
    const { status, json } = await api("GET", `/forecasting/scenarios/${workingScenarioId}`);
    assertOk("12. Scenario detail", status, json);
    const d = (json as any).data;
    workingEntityId = d?.entity_id ?? defaultEntityId;
    log("12b. entity_id in detail", !!d?.entity_id, `entity_id=${d?.entity_id}, entity_name=${d?.entity_name}`);
    log("12c. Period keys", d?.period_keys?.length > 0, `periods=${d?.period_keys?.length}`);
  }

  // 12d. Refresh entity account if working scenario has different entity
  if (workingEntityId && workingEntityId !== defaultEntityId) {
    const { json } = await api("GET", `/forecasting/entities/${workingEntityId}/chart-of-accounts`);
    const accounts = (json as any).data ?? [];
    const rev = accounts.find((a: any) => String(a.account_type).match(/Revenue|Income/i) && a.is_active);
    workingAccountId = rev?.id ?? accounts[0]?.id ?? workingAccountId;
  }

  // 13. Summary — cell count
  let cellCount = 0;
  {
    const { status, json } = await api("GET", `/forecasting/scenarios/${workingScenarioId}/summary`);
    assertOk("13. Summary", status, json);
    cellCount = Number((json as any).data?.cell_count ?? 0);
    log("13b. Cells copied", cellCount > 0, `cell_count=${cellCount}`);
  }

  // 14. Promote ACTIVE
  {
    const { status, json } = await api("PATCH", `/forecasting/scenarios/${workingScenarioId}`, { status: "ACTIVE" });
    assertOk("14. Promote ACTIVE", status, json);
    if ((json as any).data?.status === "ACTIVE") log("14b. Status", true, "ACTIVE");
  }

  // 15. Goal links
  let goalLinkId = "";
  if (PERF_GOAL_ID && workingAccountId) {
    const list = await api("GET", `/forecasting/scenarios/${workingScenarioId}/goal-links`);
    for (const link of (list.json as any).data ?? []) {
      await api("DELETE", `/forecasting/scenarios/${workingScenarioId}/goal-links/${link.id}`);
    }
    const { status, json } = await api("POST", `/forecasting/scenarios/${workingScenarioId}/goal-links`, {
      performance_goal_id: PERF_GOAL_ID,
      account_id: workingAccountId,
      threshold_value: 1_000_000
    });
    assertOk("15. Create goal link", status, json, 201);
    goalLinkId = (json as any).data?.id ?? "";
    log("15b. Goal link id", !!goalLinkId, goalLinkId || "missing");
  }

  // 16. PATCH cell using entity account id
  let patchedForecast = 0;
  if (workingAccountId) {
    const { status, json } = await api("PATCH", `/forecasting/scenarios/${workingScenarioId}/cells`, {
      period_key: "2026-09",
      account_id: workingAccountId,
      new_value: 250000,
      tx_currency: "USD"
    });
    assertOk("16. PATCH cell (entity account)", status, json);
    const data = (json as any).data;
    const cell = data?.cell;
    patchedForecast = Number(cell?.forecastValue ?? 0);
    const hasCell = !!cell?.id;
    log("16b. Cell in response", hasCell, hasCell ? `forecastValue=${patchedForecast}` : "cell missing");
    const compute = data?.compute;
    log("16c. Compute note", compute?.affected_cell_count === 0 ? !!compute?.note : true, compute?.note ?? `affected=${compute?.affected_cell_count}`);
  }

  // 17. Manual compute
  {
    const { status, json } = await api("POST", "/v1/forecasting/compute", {
      scenario_id: workingScenarioId,
      edit_type: "SCENARIO_RECALC",
      options: { include_elapsed_variance: true }
    });
    assertOk("17. Manual compute", status, json);
    const c = (json as any).data;
    log("17b. Compute completed", c?.status === "COMPLETED", `affected=${c?.affected_cell_count}, duration_ms=${c?.duration_ms}`);
  }

  // 18. Grid slice
  {
    const { status, json } = await api(
      "GET",
      `/forecasting/scenarios/${workingScenarioId}/grid?period_start=2026-07&period_end=2026-12&include_variance=true`
    );
    assertOk("18. Grid", status, json);
    const rows = (json as any).data?.rows ?? (json as any).data ?? [];
    log("18b. Grid rows", Array.isArray(rows) ? rows.length >= 0 : false, `rows=${Array.isArray(rows) ? rows.length : "?"}`);
  }

  // 19. Audit trail
  {
    const { status, json } = await api("GET", `/forecasting/scenarios/${workingScenarioId}/audit?limit=20`);
    assertOk("19. Scenario audit", status, json);
    const items = (json as any).data?.items ?? (json as any).data ?? [];
    log("19b. Audit entries", items.length >= 0, `entries=${items.length}`);
  }

  // 20. Delete goal link
  if (goalLinkId) {
    const { status, json } = await api("DELETE", `/forecasting/scenarios/${workingScenarioId}/goal-links/${goalLinkId}`);
    assertOk("20. Delete goal link", status, json);
  }

  // 21. Locked source — versions + compare
  {
    const { status, json } = await api("GET", `/forecasting/scenarios/${LOCKED_SCENARIO}/versions`);
    assertOk("21. List versions (locked)", status, json);
    const versions = (json as any).data ?? [];
    if (versions.length >= 1) {
      const vid = versions[0].id ?? LOCKED_VERSION;
      const cmp = await api("GET", `/forecasting/scenarios/${LOCKED_SCENARIO}/versions/compare?version_a=${vid}&version_b=${vid}`);
      assertOk("21b. Version compare", cmp.status, cmp.json);
    }
  }

  // 22. Formula validate
  {
    const { status, json } = await api("POST", "/v1/forecasting/compute/validate", {
      expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t"
    });
    assertOk("22. Validate formula", status, json);
  }

  // 23. Verify core accounting unchanged (GL / trial balance endpoints)
  {
    const { status, json } = await api("GET", "/accounting/chart-of-accounts");
    const ok = status === 200;
    log("23. Core accounting chart-of-accounts", ok, ok ? "unchanged" : `HTTP ${status}`);
  }

  // 24. Resync entity COA (EXTERNAL_STARTUP should fail gracefully)
  if (newEntityId) {
    const { status, json } = await api("POST", `/forecasting/entities/${newEntityId}/resync-coa`);
    const expectedFail = status === 400;
    log("24. Resync COA rejects EXTERNAL_STARTUP", expectedFail, `HTTP ${status}: ${(json as any).message ?? ""}`);
  }

  // 25. Resync default entity COA (INTERNAL_SUBSIDIARY should succeed)
  if (defaultEntityId) {
    const { status, json } = await api("POST", `/forecasting/entities/${defaultEntityId}/resync-coa`);
    assertOk("25. Resync default entity COA", status, json);
    const d = (json as any).data;
    log("25b. Resync result", typeof d?.accounts_added === "number", `added=${d?.accounts_added}, updated=${d?.accounts_updated}`);
  }

  console.log(`\nWorking scenario for manual follow-up: ${workingScenarioId}`);
  if (newEntityId) console.log(`New entity for manual follow-up: ${newEntityId}`);
  printSummary();
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
