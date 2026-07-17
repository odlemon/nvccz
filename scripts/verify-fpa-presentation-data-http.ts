/**
 * Read-only verification for the DEV FP&A client presentation dataset.
 * HTTP POST checks are limited to non-persisted sensitivity and rejected locked writes.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";
const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: unknown, detail: string) {
  const passed = Boolean(ok);
  checks.push({ name, ok: passed, detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

async function api(method: string, route: string, token: string, body?: unknown) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    return { response, json: await response.json(), buffer: null as Buffer | null };
  }
  return {
    response,
    json: null as any,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

async function countForbiddenVisibleText() {
  const tables = [
    "planning_models",
    "planning_modules",
    "planning_line_items",
    "planning_versions",
    "planning_scenarios",
    "planning_drivers",
    "planning_comments",
    "planning_workflows",
    "planning_tasks",
    "planning_approvals",
    "planning_budget_cycles",
    "model_planning_cycles",
    "planning_audit_logs",
    "planning_data_sources",
    "planning_source_fields",
  ];
  const findings: Array<{ table: string; column: string; count: number }> = [];
  for (const table of tables) {
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND DATA_TYPE IN ('char','varchar','text','tinytext','mediumtext','longtext')`,
      table
    );
    for (const { column_name: column } of columns) {
      const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM \`${table}\`
         WHERE LOWER(COALESCE(\`${column}\`, '')) REGEXP '(^|[^a-z])(uat|test|demo|placeholder)([^a-z]|$)'
            OR COALESCE(\`${column}\`, '') LIKE '%—%'
            OR COALESCE(\`${column}\`, '') LIKE '%–%'`
      );
      const count = Number(rows[0]?.c || 0);
      if (count) findings.push({ table, column, count });
    }
  }
  return findings;
}

async function masterCounts() {
  const [users, departments, forecastEntities, entityAccounts, chartOfAccounts, journalEntries] =
    await Promise.all([
      prisma.user.count(),
      prisma.department.count(),
      prisma.forecastEntity.count(),
      prisma.entityChartOfAccount.count(),
      prisma.chartOfAccounts.count(),
      prisma.journalEntry.count(),
    ]);
  return { users, departments, forecastEntities, entityAccounts, chartOfAccounts, journalEntries };
}

async function main() {
  const database = await assertDevDatabase(prisma, "verify-fpa-presentation");
  if (database !== "nts") {
    throw new Error(`Presentation verification is restricted to nts; got ${database}`);
  }
  const loginResponse = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login: any = await loginResponse.json();
  const token = login.token || login.data?.token;
  check("presentation login", token, `status=${loginResponse.status}`);
  if (!token) throw new Error("Unable to authenticate presentation verifier");

  const model = await prisma.planningModel.findFirst({
    where: { code: "ARCUS_GROUP_FY2026" },
  });
  check("primary model", model, model?.name || "missing");
  if (!model) throw new Error("Primary presentation model missing");

  const [versions, scenarios, entities, departments, cells, actuals, variances, drivers] =
    await Promise.all([
      prisma.planningVersion.findMany({ where: { modelId: model.id } }),
      prisma.planningScenario.findMany({ where: { modelId: model.id } }),
      prisma.planningModelEntity.findMany({ where: { modelId: model.id } }),
      prisma.planningModelDepartment.findMany({ where: { modelId: model.id } }),
      prisma.planningCell.count({ where: { modelId: model.id } }),
      prisma.planningActualsSnapshot.count({ where: { modelId: model.id } }),
      prisma.planningVarianceResult.count({ where: { modelId: model.id } }),
      prisma.planningDriver.count({ where: { modelId: model.id } }),
    ]);
  check("model coverage", versions.length >= 3 && scenarios.length >= 4, `versions=${versions.length} scenarios=${scenarios.length}`);
  check("dimensional coverage", entities.length >= 1 && departments.length >= 3, `entities=${entities.length} departments=${departments.length}`);
  check("financial coverage", cells > 500 && actuals > 0 && variances > 0 && drivers > 0, `cells=${cells} actuals=${actuals} variances=${variances} drivers=${drivers}`);

  const mpcStatuses = new Set(
    (await prisma.modelPlanningCycle.findMany({ select: { status: true } })).map((row) =>
      String(row.status).toUpperCase()
    )
  );
  const requiredMpc = [
    "DRAFT",
    "OPEN",
    "SUBMITTED",
    "UNDER_REVIEW",
    "RETURNED_FOR_CORRECTION",
    "APPROVED",
    "LOCKED",
  ];
  check(
    "complete MPC lifecycle",
    requiredMpc.every((status) => mpcStatuses.has(status)),
    [...mpcStatuses].sort().join(",")
  );
  const budgetStatuses = new Set(
    (await prisma.planningBudgetCycle.findMany({ select: { status: true } })).map((row) =>
      String(row.status).toUpperCase()
    )
  );
  check("budget lifecycle", budgetStatuses.size >= 4, [...budgetStatuses].sort().join(","));

  const home = await api(
    "GET",
    `/v1/fpa/home/dashboard?modelId=${model.id}`,
    token
  );
  const homeData = home.json?.data;
  check(
    "home dashboard",
    home.response.status === 200 &&
      Number(homeData?.kpis?.revenue || 0) > 0 &&
      Number(homeData?.kpis?.opex || 0) > 0 &&
      homeData?.revenueExpenseTrend?.length >= 12 &&
      homeData?.scenarioCompare?.metrics?.length > 0 &&
      homeData?.recentActivity?.length > 0,
    `status=${home.response.status} revenue=${homeData?.kpis?.revenue} opex=${homeData?.kpis?.opex}`
  );

  const workingVersion =
    versions.find((version) => version.status === "DRAFT") || versions[0];
  const officialScenario =
    scenarios.find((scenario) => scenario.isOfficial) || scenarios[0];
  for (const category of ["workforce", "revenue", "expense", "cash"]) {
    const result = await api(
      "GET",
      `/v1/fpa/domain/${category}?modelId=${model.id}&versionId=${workingVersion.id}&scenarioId=${officialScenario.id}&periodFrom=2026-01-01&periodTo=2026-12-01`,
      token
    );
    const data = result.json?.data;
    const arrays =
      category === "cash"
        ? data?.rows
        : category === "workforce"
          ? data?.hirePlan
          : category === "revenue"
            ? data?.monthly
            : data?.monthlyBurn;
    check(`${category} domain`, result.response.status === 200 && arrays?.length > 0, `status=${result.response.status} rows=${arrays?.length || 0}`);
  }

  if (entities.length >= 2) {
    const scopedValues: number[] = [];
    for (const link of entities.slice(0, 2)) {
      const result = await api(
        "GET",
        `/v1/fpa/domain/revenue?modelId=${model.id}&versionId=${workingVersion.id}&scenarioId=${officialScenario.id}&entityId=${link.entityId}`,
        token
      );
      scopedValues.push(Number(result.json?.data?.kpis?.revenue || 0));
    }
    check("entity filters change values", scopedValues[0] !== scopedValues[1], scopedValues.join(","));
  }

  const driver = await prisma.planningDriver.findFirst({
    where: { modelId: model.id, versionId: workingVersion.id, scenarioId: officialScenario.id },
  });
  if (driver) {
    const before = String(driver.value);
    const sensitivity = await api(
      "POST",
      "/v1/fpa/domain/revenue/sensitivity",
      token,
      {
        modelId: model.id,
        versionId: workingVersion.id,
        scenarioId: officialScenario.id,
        overrides: [{ driverCode: driver.code, value: Number(driver.value) * 1.05 }],
      }
    );
    const after = await prisma.planningDriver.findUnique({ where: { id: driver.id } });
    check(
      "non-persisted sensitivity",
      sensitivity.response.status === 200 &&
        sensitivity.json?.data?.persisted === false &&
        String(after?.value) === before,
      `status=${sensitivity.response.status}`
    );
  }

  const variance = await api(
    "GET",
    `/v1/fpa/variance/summary?modelId=${model.id}&versionId=${workingVersion.id}`,
    token
  );
  check(
    "variance dashboard",
    variance.response.status === 200 &&
      variance.json?.data?.trend?.length > 0 &&
      variance.json?.data?.tornado?.length > 0 &&
      variance.json?.data?.departments?.length > 0,
    `status=${variance.response.status}`
  );

  const rolling = await api(
    "GET",
    `/v1/fpa/models/${model.id}/rolling-forecast?versionId=${workingVersion.id}`,
    token
  );
  check(
    "rolling forecast",
    rolling.response.status === 200 &&
      rolling.json?.data?.actualsCutoff === "2026-06-01" &&
      rolling.json?.data?.trend?.length > 0,
    `status=${rolling.response.status} cutoff=${rolling.json?.data?.actualsCutoff}`
  );

  const settings = await api("GET", "/v1/fpa/settings", token);
  check(
    "persisted settings",
    settings.response.status === 200 &&
      settings.json?.data?.variance?.commentaryThresholdPct === 5 &&
      settings.json?.data?.syncSources?.some(
        (source: any) => source.id === "netsuite" && source.status === "DISCONNECTED"
      ),
    `status=${settings.response.status}`
  );

  const exportsList = await api(
    "GET",
    `/v1/fpa/exports?modelId=${model.id}&limit=10`,
    token
  );
  const jobs = exportsList.json?.data || [];
  const exportCodes = new Set(jobs.map((job: any) => job.exportType));
  check(
    "four export types",
    ["BOARD_PACK", "MANAGEMENT_REPORT", "FINANCIAL_STATEMENTS", "DEPT_EXPENSES"].every(
      (code) => exportCodes.has(code)
    ),
    [...exportCodes].join(",")
  );
  for (const job of jobs.filter((row: any) => exportCodes.has(row.exportType)).slice(0, 4)) {
    const download = await api("GET", `/v1/fpa/exports/${job.id}/download`, token);
    check(
      `download ${job.exportType}`,
      download.response.status === 200 &&
        download.buffer &&
        download.buffer.length > 100 &&
        download.buffer[0] === 0x50 &&
        download.buffer[1] === 0x4b,
      `status=${download.response.status} bytes=${download.buffer?.length || 0}`
    );
  }

  const lockedCycle = await prisma.modelPlanningCycle.findFirst({ where: { status: "LOCKED" } });
  if (lockedCycle) {
    const lockedCell = await prisma.planningCell.findFirst({
      where: {
        modelId: lockedCycle.sourceModelId,
        versionId: lockedCycle.sourceModelVersionId,
        value: { not: null },
      },
    });
    if (lockedCell) {
      const before = String(lockedCell.value);
      const write = await api(
        "POST",
        `/v1/fpa/models/${lockedCell.modelId}/cells/update`,
        token,
        { cellId: lockedCell.id, value: Number(lockedCell.value), cycleId: lockedCycle.id }
      );
      const after = await prisma.planningCell.findUnique({ where: { id: lockedCell.id } });
      check(
        "locked write rejected",
        write.response.status === 423 &&
          write.json?.code === "LOCKED_VERSION" &&
          String(after?.value) === before,
        `status=${write.response.status} code=${write.json?.code}`
      );
    }
  }

  const forbidden = await countForbiddenVisibleText();
  check("professional visible text", forbidden.length === 0, JSON.stringify(forbidden));

  const manifestPath = path.join(process.cwd(), "storage", "fpa-presentation-reset-manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : null;
  const currentMasters = await masterCounts();
  check(
    "shared masters preserved",
    manifest?.database === "nts" &&
      JSON.stringify(manifest.sharedMasterCounts) === JSON.stringify(currentMasters),
    `current=${JSON.stringify(currentMasters)}`
  );

  const failed = checks.filter((row) => !row.ok);
  console.log(`\nPresentation verification: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
