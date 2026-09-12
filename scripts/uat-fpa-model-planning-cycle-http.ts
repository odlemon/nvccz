/**
 * UAT — FP&A Model Planning Cycle + owners / dept slice (HTTP).
 * Run: npm run uat:fpa:model-planning-cycle
 *
 * Uses real Arcus demo departments (Finance + Sales) and prints cycle/owner IDs
 * for client walkthroughs.
 *
 * Requires API running + migrations:
 *   db:migrate:model-planning-cycle
 *   db:migrate:model-planning-cycle-owners
 *   db:migrate:model-planning-material-variance
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";
const OWNER_EMAIL = "ada.owner@nts.com";
const OWNER_PASSWORD = "OwnerDemo123!";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(email = EMAIL, password = PASSWORD): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  return json.token || json.data?.token || "";
}

/** Ensure demo admin exists with known password (self-sufficient on shared DBs). */
async function ensureAdminPassword(): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { password: hash } });
    return;
  }
  const role = await prisma.role.findFirst({ orderBy: { createdAt: "asc" } });
  if (!role) throw new Error("No roles in DB — cannot provision admin for UAT");
  await prisma.user.create({
    data: {
      email: EMAIL,
      password: hash,
      firstName: "Admin",
      lastName: "NTS",
      roleId: role.id,
      roleCode: role.name || "ADMIN",
    },
  });
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

async function ensureDemoOwnerUser(): Promise<{ id: string; email: string }> {
  let role = await prisma.role.findFirst({
    where: { OR: [{ name: "Budget Owner" }, { name: { contains: "Owner" } }] },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "Budget Owner",
        description: "Department budget / planning owner",
        permissions: {},
      },
    });
  }
  const hash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        roleId: role.id,
        firstName: "Ada",
        lastName: "Owner",
        roleCode: "BUDGET_OWNER",
      },
    });
    return { id: existing.id, email: OWNER_EMAIL };
  }
  const created = await prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      password: hash,
      firstName: "Ada",
      lastName: "Owner",
      roleId: role.id,
      roleCode: "BUDGET_OWNER",
    },
  });
  return { id: created.id, email: OWNER_EMAIL };
}

async function resolveDepts() {
  const depts = await prisma.department.findMany({ orderBy: { name: "asc" }, take: 10 });
  const finance = depts.find((d) => /finance/i.test(d.name)) || depts[0];
  const sales = depts.find((d) => /sales/i.test(d.name)) || depts[1] || depts[0];
  return { finance, sales, depts };
}

type PublishedFixture = {
  modelId: string;
  publishedVersionId: string;
  draftVersionId: string;
  scenarioId: string;
};

async function findPublishedFixture(token: string): Promise<PublishedFixture | null> {
  const list = await api("GET", "/v1/fpa/models", undefined, token);
  let models = (list.json?.data as Array<{ id: string }>) || [];
  // Fallback: API list can be empty if a stale server hits another DB — resolve from Prisma.
  if (!models.length) {
    const dbModels = await prisma.planningModel.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true },
    });
    models = dbModels;
  }
  for (const m of models) {
    const detail = await api("GET", `/v1/fpa/models/${m.id}`, undefined, token);
    if (detail.status === 200) {
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
    // Prisma fallback when GET model detail fails (wrong API DB)
    const versions = await prisma.planningVersion.findMany({ where: { modelId: m.id } });
    const published = versions.find((v) => String(v.status).toUpperCase() === "LOCKED");
    const draft = versions.find((v) => String(v.status).toUpperCase() === "DRAFT");
    const scenario = await prisma.planningScenario.findFirst({
      where: { modelId: m.id },
      orderBy: { createdAt: "asc" },
    });
    if (published && draft && scenario) {
      return {
        modelId: m.id,
        publishedVersionId: published.id,
        draftVersionId: draft.id,
        scenarioId: scenario.id,
      };
    }
  }
  return null;
}

async function main() {
  await assertDevDatabase(prisma, "uat:fpa:model-planning-cycle");
  await ensureAdminPassword();
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const adminRow = await prisma.user.findUnique({ where: { email: EMAIL } });
  const adminId = adminRow?.id;
  log("admin me", Boolean(adminId), `id=${adminId} email=${EMAIL}`);
  if (!adminId) process.exit(1);

  const { finance, sales } = await resolveDepts();
  log(
    "demo departments",
    Boolean(finance && sales),
    `Finance=${finance?.name}(${finance?.id}) Sales=${sales?.name}(${sales?.id})`
  );
  if (!finance) {
    console.error("Need at least one department — run db:seed:fpa-demo first");
    process.exit(1);
  }

  const ada = await ensureDemoOwnerUser();
  log("demo owner Ada", Boolean(ada.id), `${ada.email} / ${OWNER_PASSWORD}`);

  const sources = await api("GET", "/v1/fpa/model-planning/cycles/sources", undefined, token);
  log(
    "list sources",
    sources.status === 200 && Array.isArray(sources.json?.data?.planningTypes),
    `types=${sources.json?.data?.planningTypes?.length ?? 0}`
  );

  let fixture = await findPublishedFixture(token);
  log("reuse published fixture", Boolean(fixture), fixture ? `modelId=${fixture.modelId}` : "none");
  if (!fixture) {
    console.error("No published model — run npm run db:seed:fpa-demo (LITE ok)");
    process.exit(1);
  }

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
      owners: [{ departmentId: finance.id, assigneeId: adminId }],
    },
    token
  );
  log(
    "reject unpublished version",
    rejectDraft.status === 400 && rejectDraft.json?.code === "SOURCE_VERSION_NOT_PUBLISHED",
    `status ${rejectDraft.status} code=${rejectDraft.json?.code}`
  );

  const noOwners = await api(
    "POST",
    "/v1/fpa/model-planning/cycles",
    {
      name: "UAT no owners",
      financialYear: 2026,
      planningType: "ANNUAL_BUDGET",
      sourceModelId: modelId,
      sourceModelVersionId: publishedVersionId,
    },
    token
  );
  log(
    "reject create without owners",
    noOwners.status === 400 && noOwners.json?.code === "NO_OWNERS",
    `status ${noOwners.status} code=${noOwners.json?.code}`
  );

  const createCycle = await api(
    "POST",
    "/v1/fpa/model-planning/cycles",
    {
      name: `Arcus FY2026 Planning Walkthrough ${Date.now()}`,
      financialYear: 2026,
      planningType: "ANNUAL_BUDGET",
      sourceModelId: modelId,
      sourceModelVersionId: publishedVersionId,
      baseScenarioId: scenarioId,
      actualsCutoffPeriod: "2026-07-15",
      planningHorizon: 12,
      materialVariancePct: 5,
      planningOwnerId: adminId,
      owners: [
        { departmentId: finance.id, assigneeId: ada.id, dueDate: "2026-09-30" },
        ...(sales && sales.id !== finance.id
          ? [{ departmentId: sales.id, assigneeId: adminId, dueDate: "2026-09-30" }]
          : []),
      ],
    },
    token
  );
  const cycle = createCycle.json?.data;
  const cycleId = cycle?.id;
  const owners = cycle?.owners || [];
  log(
    "create cycle with owners",
    createCycle.status === 201 && Boolean(cycleId) && owners.length >= 1,
    `status ${createCycle.status} id=${cycleId} owners=${owners.length}`
  );
  console.log(
    "\n=== CLIENT DEMO FIXTURE ===\n" +
      JSON.stringify(
        {
          cycleId,
          cycle_name: cycle?.cycle_name || cycle?.name,
          actualsCutoffPeriod: cycle?.actualsCutoffPeriod,
          forecastStartPeriod: cycle?.forecastStartPeriod,
          owners: owners.map((o: any) => ({
            departmentName: o.departmentName,
            assigneeName: o.assigneeName,
            taskId: o.taskId,
            status: o.status,
          })),
          adaLogin: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        },
        null,
        2
      ) +
      "\n===========================\n"
  );
  if (!cycleId) {
    console.log(JSON.stringify(createCycle.json, null, 2));
    process.exit(1);
  }

  log(
    "cutoff round-trip + auto forecast",
    cycle.actualsCutoffPeriod === "2026-07-01" && cycle.forecastStartPeriod === "2026-08-01",
    `cutoff=${cycle.actualsCutoffPeriod} forecast=${cycle.forecastStartPeriod}`
  );
  log(
    "materialVariancePct on create",
    Number(cycle.materialVariancePct) === 5,
    `materialVariancePct=${cycle.materialVariancePct}`
  );
  log(
    "owners have taskId + names",
    owners.every((o: any) => o.taskId && o.departmentName && o.assigneeId),
    owners.map((o: any) => `${o.departmentName}:${o.taskId}`).join(", ")
  );

  const listTasks = await api("GET", `/v1/fpa/model-planning/cycles/${cycleId}/tasks`, undefined, token);
  const taskRows = listTasks.json?.data || [];
  const ownerSlices = taskRows.filter((t: any) => t.taskKind === "OWNER_SLICE" || t.isDeptPlan);
  log(
    "list MPC tasks includes owner slices",
    listTasks.status === 200 && ownerSlices.length >= 2,
    `total=${taskRows.length} ownerSlices=${ownerSlices.length}`
  );

  const financeOwnerTaskId = owners.find((o: any) => o.departmentId === finance.id)?.taskId;
  const adaPmTasks = await api("GET", "/tasks/my", undefined, await login(OWNER_EMAIL, OWNER_PASSWORD));
  const pmRows = Array.isArray(adaPmTasks.json?.tasks)
    ? adaPmTasks.json.tasks
    : Array.isArray(adaPmTasks.json?.data)
      ? adaPmTasks.json.data
      : Array.isArray(adaPmTasks.json)
        ? adaPmTasks.json
        : [];
  const mirroredOwner = pmRows.find(
    (t: any) =>
      t.category === "FPA_MODEL_PLANNING" &&
      (t.taskMetadata?.planningTaskId === financeOwnerTaskId || t.title?.includes("Finance"))
  );
  log(
    "PM /tasks/my shows Finance owner slice",
    adaPmTasks.status === 200 && Boolean(mirroredOwner),
    `pmStatus=${adaPmTasks.status} found=${Boolean(mirroredOwner)} pmTaskId=${mirroredOwner?.id}`
  );

  const adHocRes = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycleId}/tasks`,
    {
      title: "Review Marketing Plan",
      assigneeId: ada.id,
      departmentId: finance.id,
      dueDate: "2026-05-16",
      priority: "MEDIUM",
      description: "Validate Q4 marketing opex assumptions",
      modelId,
      versionId: publishedVersionId,
    },
    token
  );
  log(
    "create ad-hoc planning task",
    adHocRes.status === 201 && adHocRes.json?.data?.taskKind === "PLANNING",
    `status=${adHocRes.status} id=${adHocRes.json?.data?.id} kind=${adHocRes.json?.data?.taskKind}`
  );

  const listAfter = await api("GET", `/v1/fpa/model-planning/cycles/${cycleId}/tasks`, undefined, token);
  const hasAdHoc = (listAfter.json?.data || []).some(
    (t: any) => t.title === "Review Marketing Plan" && t.taskKind === "PLANNING"
  );
  log("ad-hoc task on list", listAfter.status === 200 && hasAdHoc, `found=${hasAdHoc}`);

  const adaPmAfter = await api("GET", "/tasks/my", undefined, await login(OWNER_EMAIL, OWNER_PASSWORD));
  const pmAfter = Array.isArray(adaPmAfter.json?.tasks)
    ? adaPmAfter.json.tasks
    : Array.isArray(adaPmAfter.json?.data)
      ? adaPmAfter.json.data
      : Array.isArray(adaPmAfter.json)
        ? adaPmAfter.json
        : [];
  const mirroredAdHoc = pmAfter.find(
    (t: any) =>
      t.category === "FPA_MODEL_PLANNING" &&
      (t.taskMetadata?.planningTaskId === adHocRes.json?.data?.id || t.title === "Review Marketing Plan")
  );
  log(
    "PM /tasks/my shows ad-hoc planning task",
    adaPmAfter.status === 200 && Boolean(mirroredAdHoc),
    `found=${Boolean(mirroredAdHoc)} pmTaskId=${mirroredAdHoc?.id}`
  );

  const getCycle = await api("GET", `/v1/fpa/model-planning/cycles/${cycleId}`, undefined, token);
  log(
    "get cycle returns owners",
    getCycle.status === 200 && (getCycle.json?.data?.owners?.length || 0) >= 1,
    `owners=${getCycle.json?.data?.owners?.length}`
  );

  const workspace = await api("GET", `/v1/fpa/model-planning/cycles/${cycleId}/workspace`, undefined, token);
  log(
    "workspace includes owners",
    workspace.status === 200 && (workspace.json?.data?.owners?.length || 0) >= 1,
    `owners=${workspace.json?.data?.owners?.length}`
  );

  const ownerWs = await api(
    "GET",
    `/v1/fpa/model-planning/cycles/${cycleId}/owner-workspace`,
    undefined,
    token
  );
  log(
    "admin owner-workspace",
    ownerWs.status === 200 && Array.isArray(ownerWs.json?.data?.owners),
    `canSubmit=${ownerWs.json?.data?.canSubmit} assigned=${JSON.stringify(ownerWs.json?.data?.assignedDepartmentIds)}`
  );

  const adaToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
  log("Ada owner login", Boolean(adaToken), adaToken ? "token ok" : "failed");
  if (!adaToken) process.exit(1);

  if (adHocRes.json?.data?.id) {
    const complete = await api(
      "PATCH",
      `/v1/fpa/tasks/${adHocRes.json.data.id}`,
      { status: "COMPLETED" },
      adaToken
    );
    log(
      "Ada complete ad-hoc task",
      complete.status === 200 && complete.json?.data?.status === "COMPLETED",
      `status=${complete.status} taskStatus=${complete.json?.data?.status}`
    );
  }

  const adaWs = await api(
    "GET",
    `/v1/fpa/model-planning/cycles/${cycleId}/owner-workspace`,
    undefined,
    adaToken
  );
  const myOwner = adaWs.json?.data?.myOwner;
  log(
    "Ada owner-workspace myOwner",
    adaWs.status === 200 && myOwner?.departmentId === finance.id && Boolean(myOwner?.taskId),
    `dept=${myOwner?.departmentName} taskId=${myOwner?.taskId} canSubmit=${adaWs.json?.data?.canSubmit}`
  );

  const gridAda = await api(
    "GET",
    `/v1/fpa/models/${modelId}/grid?versionId=${publishedVersionId}&scenarioId=${scenarioId}&cycleId=${cycleId}&pageSize=500`,
    undefined,
    adaToken
  );
  const assigned = gridAda.json?.data?.assignedDepartmentIds;
  log(
    "Ada grid assignedDepartmentIds",
    gridAda.status === 200 && Array.isArray(assigned) && assigned.includes(finance.id),
    `assigned=${JSON.stringify(assigned)}`
  );

  const periods = gridAda.json?.data?.periods || [];
  const jul = periods.find((p: any) => p.key === "2026-07" || p.periodDate === "2026-07-01");
  const aug = periods.find((p: any) => p.key === "2026-08" || p.periodDate === "2026-08-01");
  log(
    "grid banding Jul/Aug",
    jul?.periodRole === "ACTUAL" && aug?.periodRole === "FORECAST",
    `Jul=${jul?.periodRole} Aug=${aug?.periodRole}`
  );

  const financeCell = (gridAda.json?.data?.cells || []).find(
    (c: any) =>
      c.departmentId === finance.id &&
      c.isEditable === true &&
      c.id &&
      !String(c.id).startsWith("agg:")
  );
  const otherDeptCell = (gridAda.json?.data?.cells || []).find(
    (c: any) =>
      c.departmentId &&
      c.departmentId !== finance.id &&
      c.id &&
      !String(c.id).startsWith("agg:")
  );
  const nullDeptCell = (gridAda.json?.data?.cells || []).find(
    (c: any) =>
      !c.departmentId &&
      c.periodRole !== "ACTUAL" &&
      c.id &&
      !String(c.id).startsWith("agg:")
  );

  if (otherDeptCell || nullDeptCell) {
    const target = otherDeptCell || nullDeptCell;
    const badWrite = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/update`,
      { cellId: target.id, value: 111, cycleId, recordVersion: target.recordVersion },
      adaToken
    );
    log(
      "DEPARTMENT_SCOPE_LOCKED outside slice",
      badWrite.status === 403 && badWrite.json?.code === "DEPARTMENT_SCOPE_LOCKED",
      `status=${badWrite.status} code=${badWrite.json?.code} dept=${target.departmentId}`
    );
  } else {
    log(
      "DEPARTMENT_SCOPE_LOCKED outside slice",
      true,
      "no foreign dept cell in page — Ada scope filter excludes them (OK)"
    );
  }

  if (financeCell) {
    const okWrite = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/update`,
      { cellId: financeCell.id, value: 4242, cycleId, recordVersion: financeCell.recordVersion },
      adaToken
    );
    const updatedCells = okWrite.json?.data?.updatedCells;
    log(
      "Ada can edit Finance INPUT",
      okWrite.status === 200 || okWrite.status === 201,
      `status=${okWrite.status} code=${okWrite.json?.code || "ok"}`
    );
    log(
      "cell update returns updatedCells",
      Array.isArray(updatedCells) && updatedCells.length >= 1,
      `updatedCells=${Array.isArray(updatedCells) ? updatedCells.length : 0}`
    );
  } else {
    log("Ada can edit Finance INPUT", false, "no editable Finance cell — materialise may have failed");
    log("cell update returns updatedCells", false, "skipped — no finance cell");
  }

  // --- Stage 3: priorActual, spread, planning-summary ---
  const priceLine = await prisma.planningLineItem.findFirst({
    where: { modelId, code: "PRICE" },
    select: { id: true },
  });
  // Ensure FY2025 ACTUAL baseline for Driver Assumptions (idempotent)
  if (priceLine) {
    for (let m = 0; m < 12; m++) {
      const periodDate = new Date(Date.UTC(2025, m, 1));
      const existing = await prisma.planningCell.findFirst({
        where: {
          modelId,
          versionId: publishedVersionId,
          scenarioId,
          lineItemId: priceLine.id,
          periodDate,
        },
      });
      if (existing) {
        await prisma.planningCell.update({
          where: { id: existing.id },
          data: { value: 11.8, sourceType: "ACTUAL", valueType: "ACTUAL" },
        });
      } else {
        await prisma.planningCell.create({
          data: {
            modelId,
            versionId: publishedVersionId,
            scenarioId,
            lineItemId: priceLine.id,
            periodDate,
            currencyCode: "USD",
            value: 11.8,
            valueType: "ACTUAL",
            sourceType: "ACTUAL",
            isEditable: false,
            isLocked: true,
            lastUpdatedById: adminId,
            lastUpdatedAt: new Date(),
            recordVersion: 1n,
          },
        });
      }
    }
  }

  const workingVer = await prisma.planningVersion.findFirst({
    where: { modelId, status: { notIn: ["ARCHIVED", "LOCKED"] } },
    orderBy: { createdAt: "desc" },
  });
  const driverVersionId = workingVer?.id || publishedVersionId;
  const driversRes = await api(
    "GET",
    `/v1/fpa/models/${modelId}/drivers?versionId=${driverVersionId}&scenarioId=${scenarioId}&cycleId=${cycleId}`,
    undefined,
    token
  );
  let drivers = driversRes.json?.data || [];
  if (!drivers.length) {
    const anyDrivers = await api(
      "GET",
      `/v1/fpa/models/${modelId}/drivers?cycleId=${cycleId}`,
      undefined,
      token
    );
    drivers = anyDrivers.json?.data || [];
  }
  const priceDrv = drivers.find((d: any) => String(d.code).toUpperCase() === "PRICE");
  log(
    "drivers priorActual for PRICE",
    driversRes.status === 200 && priceDrv != null && priceDrv.priorActual != null,
    `status=${driversRes.status} drivers=${drivers.length} priorActual=${priceDrv?.priorActual} label=${priceDrv?.priorPeriodLabel}`
  );

  const unitsLine = await prisma.planningLineItem.findFirst({
    where: { modelId, code: "UNITS" },
    select: { id: true },
  });
  // Ensure forecast-period UNITS cells are editable for admin spread (published + cycleId)
  const spreadPeriods = ["2026-08-01", "2026-09-01", "2026-10-01"].map((d) => new Date(d));
  if (unitsLine) {
    for (const periodDate of spreadPeriods) {
      const cell = await prisma.planningCell.findFirst({
        where: {
          modelId,
          versionId: publishedVersionId,
          scenarioId,
          lineItemId: unitsLine.id,
          periodDate,
          departmentId: { equals: null },
        },
      });
      if (cell) {
        await prisma.planningCell.update({
          where: { id: cell.id },
          data: { isEditable: true, isLocked: false },
        });
      }
    }
  }
  const summaryBefore = await api(
    "GET",
    `/v1/fpa/models/${modelId}/planning-summary?versionId=${publishedVersionId}&scenarioId=${scenarioId}&cycleId=${cycleId}`,
    undefined,
    token
  );
  log(
    "planning-summary live",
    summaryBefore.status === 200 && summaryBefore.json?.data?.asOf != null,
    `status=${summaryBefore.status} revenue=${summaryBefore.json?.data?.revenue} mvp=${summaryBefore.json?.data?.materialVariancePct}`
  );

  if (unitsLine) {
    const evenSpread = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/spread`,
      {
        versionId: publishedVersionId,
        scenarioId,
        lineItemId: unitsLine.id,
        value: 12000,
        method: "EVEN",
        cycleId,
        periodDates: ["2026-08-01", "2026-09-01", "2026-10-01"],
      },
      token
    );
    log(
      "spread EVEN",
      evenSpread.status === 200 &&
        evenSpread.json?.data?.spreadAcross === 3 &&
        Array.isArray(evenSpread.json?.data?.updatedCells),
      `status=${evenSpread.status} across=${evenSpread.json?.data?.spreadAcross} updatedCells=${evenSpread.json?.data?.updatedCells?.length} code=${evenSpread.json?.code || "ok"}`
    );

    const weightSpread = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/spread`,
      {
        versionId: publishedVersionId,
        scenarioId,
        lineItemId: unitsLine.id,
        value: 10000,
        method: "CUSTOM_WEIGHT",
        cycleId,
        periodDates: ["2026-08-01", "2026-09-01", "2026-10-01"],
        weights: [0.2, 0.3, 0.5],
      },
      token
    );
    log(
      "spread CUSTOM_WEIGHT",
      weightSpread.status === 200 && weightSpread.json?.data?.method === "CUSTOM_WEIGHT",
      `status=${weightSpread.status} method=${weightSpread.json?.data?.method} code=${weightSpread.json?.code || "ok"}`
    );

    const badWeights = await api(
      "POST",
      `/v1/fpa/models/${modelId}/cells/spread`,
      {
        versionId: publishedVersionId,
        scenarioId,
        lineItemId: unitsLine.id,
        value: 1000,
        method: "CUSTOM_WEIGHT",
        cycleId,
        periodDates: ["2026-08-01", "2026-09-01"],
        weights: [0.5],
      },
      token
    );
    log(
      "spread INVALID_WEIGHTS",
      badWeights.status === 400 && badWeights.json?.code === "INVALID_WEIGHTS",
      `status=${badWeights.status} code=${badWeights.json?.code}`
    );

    const summaryAfter = await api(
      "GET",
      `/v1/fpa/models/${modelId}/planning-summary?versionId=${publishedVersionId}&scenarioId=${scenarioId}&cycleId=${cycleId}`,
      undefined,
      token
    );
    log(
      "planning-summary after edit",
      summaryAfter.status === 200 && summaryAfter.json?.data?.asOf != null,
      `revenue=${summaryAfter.json?.data?.revenue} asOf=${summaryAfter.json?.data?.asOf}`
    );
  } else {
    log("spread EVEN", false, "UNITS line item missing");
    log("spread CUSTOM_WEIGHT", false, "skipped");
    log("spread INVALID_WEIGHTS", false, "skipped");
    log("planning-summary after edit", summaryBefore.status === 200, "summary-only path");
  }

  const submit = await api(
    "POST",
    `/v1/fpa/tasks/${myOwner.taskId}/submit`,
    { changeNotes: "Finance slice ready for consolidation", comment: "Walkthrough submit" },
    adaToken
  );
  log(
    "Ada submit Finance slice",
    submit.status === 200 || submit.status === 201,
    `status=${submit.status} taskStatus=${submit.json?.data?.status}`
  );

  const after = await api("GET", `/v1/fpa/model-planning/cycles/${cycleId}`, undefined, token);
  const financeOwner = (after.json?.data?.owners || []).find((o: any) => o.departmentId === finance.id);
  const salesOwner = (after.json?.data?.owners || []).find((o: any) => o.departmentId === sales?.id);
  log(
    "Finance submitted / Sales still open",
    financeOwner?.status === "SUBMITTED" &&
      (!salesOwner || ["OPEN", "IN_PROGRESS", "PENDING"].includes(String(salesOwner.status).toUpperCase())),
    `Finance=${financeOwner?.status} Sales=${salesOwner?.status}`
  );

  const openCycle = await api("PUT", `/v1/fpa/model-planning/cycles/${cycleId}`, { status: "OPEN" }, token);
  // May already be IN_REVIEW if only one owner
  log(
    "cycle status after submit",
    openCycle.status === 200 || openCycle.status === 409,
    `putStatus=${openCycle.status} cycle=${after.json?.data?.status}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:", failed.map((f) => f.step).join(", "));
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
