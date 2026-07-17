/**
 * UAT — FP&A cross-tab contracts (DEV nts only).
 * Run: npm run uat:fpa:cross-tab-gaps
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

async function main() {
  await assertDevDatabase(prisma, "uat:fpa:cross-tab-gaps");
  const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  const token = login.json?.token || login.json?.data?.token;
  log("admin login", Boolean(token), token ? "ok" : `status=${login.status}`);
  if (!token) process.exit(1);

  // MPC-native collaboration, comment threading, and task decisions.
  const mpc = await prisma.modelPlanningCycle.findFirst({
    where: { workflowId: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!mpc?.workflowId) throw new Error("MPC workflow fixture missing");
  const parent = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${mpc.id}/comments`,
    { body: "UAT parent comment", parentCommentId: null },
    token
  );
  const child = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${mpc.id}/comments`,
    { body: "UAT threaded reply", parentCommentId: parent.json?.data?.id },
    token
  );
  const comments = await api(
    "GET",
    `/v1/fpa/model-planning/cycles/${mpc.id}/comments`,
    undefined,
    token
  );
  log(
    "MPC comment threading",
    parent.status === 201 &&
      child.status === 201 &&
      comments.json?.data?.some(
        (comment: any) =>
          comment.id === child.json?.data?.id &&
          comment.parentCommentId === parent.json?.data?.id &&
          comment.cycleId === mpc.id
      ),
    `parent=${parent.status} child=${child.status}`
  );

  const taskFixture = await prisma.planningTask.create({
    data: {
      workflowId: mpc.workflowId,
      title: `UAT task decision ${Date.now()}`,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
  const blankReturn = await api(
    "POST",
    `/v1/fpa/tasks/${taskFixture.id}/return`,
    { comment: "" },
    token
  );
  const taskApprove = await api(
    "POST",
    `/v1/fpa/tasks/${taskFixture.id}/approve`,
    { comment: "UAT approve" },
    token
  );
  const taskReturn = await api(
    "POST",
    `/v1/fpa/tasks/${taskFixture.id}/return`,
    { comment: "UAT return with comment" },
    token
  );
  const activity = await api(
    "GET",
    `/v1/fpa/model-planning/cycles/${mpc.id}/activity`,
    undefined,
    token
  );
  log(
    "MPC task approve/return",
    blankReturn.status === 400 &&
      blankReturn.json?.code === "COMMENT_REQUIRED" &&
      taskApprove.status === 200 &&
      taskReturn.status === 200 &&
      activity.json?.data?.some(
        (event: any) => event.cycleId === mpc.id && event.type === "WORKFLOW_EVENT"
      ),
    `blank=${blankReturn.status}/${blankReturn.json?.code} approve=${taskApprove.status} return=${taskReturn.status}`
  );
  await prisma.planningTask.delete({ where: { id: taskFixture.id } });
  if (child.json?.data?.id) {
    await prisma.planningComment.delete({ where: { id: child.json.data.id } });
  }
  if (parent.json?.data?.id) {
    await prisma.planningComment.delete({ where: { id: parent.json.data.id } });
  }

  // Settings persistence + honest connector failure.
  const settings = await api("GET", "/v1/fpa/settings", undefined, token);
  log(
    "settings GET",
    settings.status === 200 && settings.json?.data?.variance && settings.json?.data?.workflow,
    `status=${settings.status}`
  );
  const original = settings.json?.data;
  const save = await api(
    "PUT",
    "/v1/fpa/settings",
    {
      variance: { ...original.variance, commentaryThresholdPct: 7 },
      workflow: original.workflow,
    },
    token
  );
  const reload = await api("GET", "/v1/fpa/settings", undefined, token);
  log(
    "settings persist",
    save.status === 200 && reload.json?.data?.variance?.commentaryThresholdPct === 7,
    `status=${save.status} threshold=${reload.json?.data?.variance?.commentaryThresholdPct}`
  );
  await api(
    "PUT",
    "/v1/fpa/settings",
    { variance: original.variance, workflow: original.workflow },
    token
  );

  const connect = await api(
    "POST",
    "/v1/fpa/settings/sync-sources/netsuite/connect",
    {},
    token
  );
  log(
    "connector connect",
    connect.status === 200 && connect.json?.data?.status === "CONNECTED",
    `status=${connect.status} source=${connect.json?.data?.status}`
  );
  const sync = await api(
    "POST",
    "/v1/fpa/settings/sync-sources/netsuite/sync",
    {},
    token
  );
  log(
    "connector honest failure",
    sync.status === 502 &&
      sync.json?.code === "SYNC_FAILED" &&
      sync.json?.data?.source?.lastError,
    `status=${sync.status} code=${sync.json?.code}`
  );
  await api("POST", "/v1/fpa/settings/sync-sources/netsuite/disconnect", {}, token);

  // Canonical forecast-entity route + guarded archive.
  const admin = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!admin) throw new Error("Admin fixture missing");
  // Recover values if a prior interrupted UAT applied the legacy default reason.
  const interruptedGrowth = await prisma.planningAuditLog.findMany({
    where: {
      userId: admin.id,
      actionType: "CELL_UPDATE",
      reason: "APPLY_GROWTH_COMPOUND_3.5",
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
    orderBy: { createdAt: "asc" },
  });
  const originalInterruptedValues = new Map<string, any>();
  for (const audit of interruptedGrowth) {
    if (!audit.cellId || originalInterruptedValues.has(audit.cellId)) continue;
    originalInterruptedValues.set(audit.cellId, audit.oldValue);
  }
  for (const [cellId, value] of originalInterruptedValues) {
    await prisma.planningCell.update({ where: { id: cellId }, data: { value } });
  }
  const fixture = await prisma.forecastEntity.create({
    data: {
      name: `UAT Archive ${Date.now()}`,
      type: "INTERNAL_SUBSIDIARY",
      baseCurrency: "USD",
      isDefault: false,
      createdById: admin.id,
    },
  });
  const entityList = await api("GET", "/v1/forecast-entities", undefined, token);
  log(
    "canonical entity route",
    entityList.status === 200 && entityList.json?.data?.some((e: any) => e.id === fixture.id),
    `status=${entityList.status}`
  );
  const archived = await api(
    "DELETE",
    `/v1/forecast-entities/${fixture.id}`,
    { archive: true, reason: "UAT merged entity" },
    token
  );
  const afterArchive = await api("GET", "/v1/forecast-entities", undefined, token);
  log(
    "entity archive",
    archived.status === 200 &&
      archived.json?.data?.status === "ARCHIVED" &&
      !afterArchive.json?.data?.some((e: any) => e.id === fixture.id),
    `status=${archived.status} state=${archived.json?.data?.status}`
  );
  await prisma.forecastEntity.delete({ where: { id: fixture.id } });
  const defaultEntity = await prisma.forecastEntity.findFirst({ where: { isDefault: true } });
  if (defaultEntity) {
    const blocked = await api(
      "DELETE",
      `/v1/forecast-entities/${defaultEntity.id}`,
      { archive: true, reason: "UAT should fail" },
      token
    );
    log(
      "referenced/default entity blocked",
      blocked.status === 409 &&
        blocked.json?.code === "ENTITY_IN_USE" &&
        Array.isArray(blocked.json?.data?.references),
      `status=${blocked.status} code=${blocked.json?.code}`
    );
  }

  // Export capabilities.
  const capabilities = await api("GET", "/v1/fpa/exports/capabilities", undefined, token);
  const exportTypes = capabilities.json?.data?.exportTypes || [];
  log(
    "export capabilities",
    capabilities.status === 200 &&
      ["BOARD_PACK", "MANAGEMENT_REPORT", "FINANCIAL_STATEMENTS", "DEPT_EXPENSES"].every(
        (code) => exportTypes.some((type: any) => type.code === code)
      ),
    `status=${capabilities.status} count=${exportTypes.length}`
  );

  const version = await prisma.planningVersion.findFirst({
    where: { status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
  });
  if (!version) throw new Error("Draft version fixture missing");
  const model = await prisma.planningModel.findUnique({ where: { id: version.modelId } });
  if (!model) throw new Error("Model fixture missing");
  const scenario = await prisma.planningScenario.findFirst({ where: { modelId: model.id } });
  if (!scenario) throw new Error("Scenario fixture missing");

  // Domain applied scope and sensitivity.
  const scopedDomain = await api(
    "GET",
    `/v1/fpa/domain/revenue?modelId=${model.id}&versionId=${version.id}&scenarioId=${scenario.id}&periodFrom=2026-01-01&periodTo=2026-12-01`,
    undefined,
    token
  );
  log(
    "domain scope + filters",
    scopedDomain.status === 200 &&
      scopedDomain.json?.data?.scope?.periodFrom === "2026-01-01" &&
      Array.isArray(scopedDomain.json?.data?.availableFilters?.periods),
    `status=${scopedDomain.status}`
  );
  let driver = await prisma.planningDriver.findFirst({
    where: {
      modelId: model.id,
      OR: [
        { versionId: version.id, scenarioId: scenario.id },
        { versionId: null, scenarioId: null },
      ],
    },
  });
  let temporaryDriverId: string | null = null;
  if (!driver) {
    driver = await prisma.planningDriver.create({
      data: {
        modelId: model.id,
        versionId: version.id,
        scenarioId: scenario.id,
        code: `UAT_SENSITIVITY_${Date.now()}`,
        name: "UAT sensitivity driver",
        category: "REVENUE",
        value: 10,
        createdById: admin.id,
      },
    });
    temporaryDriverId = driver.id;
  }
  const preview = await api(
    "POST",
    "/v1/fpa/domain/revenue/sensitivity",
    {
      modelId: model.id,
      versionId: version.id,
      scenarioId: scenario.id,
      overrides: [{ driverCode: driver.code, value: Number(driver.value || 0) + 1 }],
    },
    token
  );
  log(
    "domain sensitivity preview",
    preview.status === 200 &&
      preview.json?.data?.persisted === false &&
      preview.json?.data?.base &&
      preview.json?.data?.preview,
    `status=${preview.status} persisted=${preview.json?.data?.persisted}`
  );
  if (temporaryDriverId) {
    await prisma.planningDriver.delete({ where: { id: temporaryDriverId } });
  }
  const unknownDriver = await api(
    "POST",
    "/v1/fpa/domain/revenue/sensitivity",
    {
      modelId: model.id,
      versionId: version.id,
      scenarioId: scenario.id,
      overrides: [{ driverCode: "__UNKNOWN_UAT__", value: 1 }],
    },
    token
  );
  log(
    "unknown sensitivity driver",
    unknownDriver.status === 400 && unknownDriver.json?.code === "UNKNOWN_DRIVER",
    `status=${unknownDriver.status} code=${unknownDriver.json?.code}`
  );

  // Preferred Apply Growth contract; restore modified values afterward.
  const candidateCells = await prisma.planningCell.findMany({
    where: {
      modelId: model.id,
      versionId: version.id,
      scenarioId: scenario.id,
      isEditable: true,
      isLocked: false,
      value: { not: null },
      lineItem: {
        isEditable: true,
        lineItemType: { in: ["INPUT", "DRIVER"] },
      },
    },
    orderBy: [{ lineItemId: "asc" }, { periodDate: "asc" }],
  });
  const groups = new Map<string, typeof candidateCells>();
  for (const cell of candidateCells) {
    const rows = groups.get(cell.lineItemId) || [];
    rows.push(cell);
    groups.set(cell.lineItemId, rows);
  }
  const growthCells = [...groups.values()].find((rows) => rows.length >= 2);
  if (growthCells) {
    const target = growthCells[growthCells.length - 1];
    const periodKey = target.periodDate.toISOString().slice(0, 10);
    const rangeTargets = growthCells.filter(
      (cell) => cell.periodDate.toISOString().slice(0, 10) === periodKey
    );
    const originalValues = rangeTargets.map((cell) => ({ id: cell.id, value: cell.value }));
    const growth = await api(
      "POST",
      `/v1/fpa/models/${model.id}/cells/apply-growth`,
      {
        versionId: version.id,
        scenarioId: scenario.id,
        lineItemIds: [target.lineItemId],
        periodFrom: periodKey,
        periodTo: periodKey,
        ratePercent: 3.5,
        mode: "COMPOUND",
        reason: "UAT_CROSS_TAB_GROWTH",
      },
      token
    );
    log(
      "preferred apply-growth contract",
      growth.status === 200 &&
        growth.json?.data?.lineItemIds?.[0] === target.lineItemId &&
        growth.json?.data?.updatedCells?.length === rangeTargets.length,
      `status=${growth.status} code=${growth.json?.code} updated=${growth.json?.data?.updatedCells?.length}`
    );
    for (const original of originalValues) {
      await prisma.planningCell.update({
        where: { id: original.id },
        data: { value: original.value },
      });
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\npassed=${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
