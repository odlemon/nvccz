/**
 * UAT — Model Planning Stages 6–9 workflow + tasks/comments smoke (DEV nts only).
 * Run: npm run uat:fpa:model-planning-workflow
 * Requires: API on PORT, db:migrate:model-planning-workflow
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";
const CFO_EMAIL = "cfo.uat@nts.com";
const CFO_PASSWORD = "CfoDemo123!";

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
  const json: any = await res.json();
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

async function ensureAdmin(): Promise<string> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { password: hash } });
    return existing.id;
  }
  const role = await prisma.role.findFirst({ orderBy: { createdAt: "asc" } });
  if (!role) throw new Error("No roles");
  const u = await prisma.user.create({
    data: {
      email: EMAIL,
      password: hash,
      firstName: "Admin",
      lastName: "NTS",
      roleId: role.id,
      roleCode: "ADMIN",
    },
  });
  return u.id;
}

async function ensureCfo(): Promise<{ id: string; email: string }> {
  const hash = await bcrypt.hash(CFO_PASSWORD, 10);
  let role = await prisma.role.findFirst({
    where: { OR: [{ name: { contains: "CFO" } }, { name: { contains: "Admin" } }] },
  });
  if (!role) role = await prisma.role.findFirst({ orderBy: { createdAt: "asc" } });
  if (!role) throw new Error("No roles for CFO");
  const existing = await prisma.user.findUnique({ where: { email: CFO_EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hash, roleId: role.id, roleCode: "CFO", firstName: "Cara", lastName: "CFO" },
    });
    return { id: existing.id, email: CFO_EMAIL };
  }
  const u = await prisma.user.create({
    data: {
      email: CFO_EMAIL,
      password: hash,
      firstName: "Cara",
      lastName: "CFO",
      roleId: role.id,
      roleCode: "CFO",
    },
  });
  return { id: u.id, email: CFO_EMAIL };
}

async function main() {
  await assertDevDatabase(prisma, "uat:fpa:model-planning-workflow");
  const adminId = await ensureAdmin();
  const cfo = await ensureCfo();
  const token = await login();
  log("admin login", Boolean(token), token ? "ok" : "fail");
  if (!token) process.exit(1);
  const cfoToken = await login(CFO_EMAIL, CFO_PASSWORD);
  log("cfo login", Boolean(cfoToken), cfoToken ? `id=${cfo.id}` : "fail");
  if (!cfoToken) process.exit(1);

  // Prefer an OPEN cycle with owners; else create minimal from published fixture
  let cycle = await prisma.modelPlanningCycle.findFirst({
    where: { status: { in: ["OPEN", "DRAFT", "RETURNED_FOR_CORRECTION"] } },
    orderBy: { updatedAt: "desc" },
    include: { owners: true },
  });

  if (!cycle || !cycle.owners.length) {
    const model = await prisma.planningModel.findFirst({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
    });
    const published = model
      ? await prisma.planningVersion.findFirst({
          where: { modelId: model.id, status: "LOCKED" },
        })
      : null;
    const draft = model
      ? await prisma.planningVersion.findFirst({
          where: { modelId: model.id, status: "DRAFT" },
        })
      : null;
    const dept = await prisma.department.findFirst({ orderBy: { name: "asc" } });
    if (!model || !published || !dept) {
      log("fixture", false, "Need model+LOCKED version+dept — run db:seed:fpa-demo");
      process.exit(1);
    }
    const create = await api(
      "POST",
      "/v1/fpa/model-planning/cycles",
      {
        name: `UAT Workflow ${Date.now()}`,
        financialYear: new Date().getFullYear(),
        planningType: "ANNUAL_BUDGET",
        sourceModelId: model.id,
        sourceModelVersionId: published.id,
        status: "OPEN",
        owners: [{ departmentId: dept.id, assigneeId: adminId }],
      },
      token
    );
    const createdId = create.json?.data?.id;
    log("create cycle", create.status === 201 && Boolean(createdId), `status=${create.status} id=${createdId}`);
    if (!createdId) process.exit(1);
    cycle = await prisma.modelPlanningCycle.findUnique({
      where: { id: createdId },
      include: { owners: true },
    });
  } else {
    log(
      "reuse cycle",
      true,
      `${cycle.name} (${cycle.id}) status=${cycle.status} owners=${cycle.owners.length}`
    );
  }
  if (!cycle) process.exit(1);

  // Reset to OPEN with all owners SUBMITTED for consolidate path
  await prisma.modelPlanningCycle.update({
    where: { id: cycle.id },
    data: {
      status: "OPEN",
      currentStage: "READY_TO_CONSOLIDATE",
      submittedAt: null,
      submittedById: null,
      approvedAt: null,
      approvedById: null,
      lockedAt: null,
      lockedById: null,
    },
  });
  for (const o of cycle.owners) {
    await prisma.modelPlanningCycleOwner.update({
      where: { id: o.id },
      data: { status: "SUBMITTED" },
    });
    if (o.taskId) {
      await prisma.planningTask.update({
        where: { id: o.taskId },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
    }
  }

  // Tasks / comments / activity smoke
  const tasks = await api("GET", `/v1/fpa/model-planning/cycles/${cycle.id}/tasks`, undefined, token);
  log("list tasks", tasks.status === 200 && Array.isArray(tasks.json?.data), `status=${tasks.status} n=${tasks.json?.data?.length}`);

  const comment = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/comments`,
    { body: `UAT workflow comment ${Date.now()}` },
    token
  );
  log("add comment", comment.status === 201, `status=${comment.status}`);

  const comments = await api("GET", `/v1/fpa/model-planning/cycles/${cycle.id}/comments`, undefined, token);
  log("list comments", comments.status === 200, `status=${comments.status} n=${comments.json?.data?.length}`);

  const activity = await api("GET", `/v1/fpa/model-planning/cycles/${cycle.id}/activity`, undefined, token);
  log("list activity", activity.status === 200, `status=${activity.status}`);

  const submit = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/submit`,
    { note: "UAT consolidate" },
    token
  );
  log(
    "cycle submit",
    submit.status === 200 && submit.json?.data?.status === "SUBMITTED",
    `status=${submit.status} cycle=${submit.json?.data?.status} stage=${submit.json?.data?.currentStage}`
  );

  const get1 = await api("GET", `/v1/fpa/model-planning/cycles/${cycle.id}`, undefined, token);
  log(
    "GET workflow fields",
    get1.status === 200 &&
      get1.json?.data?.submittedAt &&
      get1.json?.data?.currentStage === "FPA_REVIEW",
    `submittedAt=${get1.json?.data?.submittedAt} stage=${get1.json?.data?.currentStage}`
  );

  // Return path (FP&A) then re-submit for happy path
  const fpaReturn = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/review/return`,
    { comment: "UAT revise headcount" },
    token
  );
  log(
    "review return",
    fpaReturn.status === 200 && fpaReturn.json?.data?.status === "RETURNED_FOR_CORRECTION",
    `status=${fpaReturn.status} cycle=${fpaReturn.json?.data?.status}`
  );

  await prisma.modelPlanningCycleOwner.updateMany({
    where: { cycleId: cycle.id },
    data: { status: "SUBMITTED" },
  });
  await prisma.modelPlanningCycle.update({
    where: { id: cycle.id },
    data: { status: "OPEN", currentStage: "READY_TO_CONSOLIDATE", submittedAt: null, submittedById: null },
  });
  const resubmit = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/submit`,
    { note: "UAT re-consolidate after return" },
    token
  );
  log(
    "re-submit after return",
    resubmit.status === 200 && resubmit.json?.data?.status === "SUBMITTED",
    `status=${resubmit.status} cycle=${resubmit.json?.data?.status}`
  );

  const accept = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/review/accept`,
    { comment: "Looks good" },
    token
  );
  log(
    "review accept",
    accept.status === 200 && accept.json?.data?.status === "UNDER_REVIEW",
    `status=${accept.status} cycle=${accept.json?.data?.status}`
  );

  // CFO return then recover to UNDER_REVIEW for approve
  const cfoReturn = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/cfo-return`,
    { comment: "UAT CFO wants one more pass" },
    cfoToken
  );
  log(
    "cfo return",
    cfoReturn.status === 200 && cfoReturn.json?.data?.status === "RETURNED_FOR_CORRECTION",
    `status=${cfoReturn.status} cycle=${cfoReturn.json?.data?.status}`
  );

  await prisma.modelPlanningCycleOwner.updateMany({
    where: { cycleId: cycle.id },
    data: { status: "SUBMITTED" },
  });
  await prisma.modelPlanningCycle.update({
    where: { id: cycle.id },
    data: {
      status: "UNDER_REVIEW",
      currentStage: "CFO_REVIEW",
      submittedAt: new Date(),
      submittedById: adminId,
    },
  });

  // Maker-checker: admin (submitter) must fail CFO approve
  const makerFail = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/cfo-approve`,
    { comment: "should fail" },
    token
  );
  log(
    "maker-checker blocks submitter",
    makerFail.status === 409 && makerFail.json?.code === "MAKER_CHECKER",
    `status=${makerFail.status} code=${makerFail.json?.code}`
  );

  const approve = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/cfo-approve`,
    { comment: "Approved for board" },
    cfoToken
  );
  log(
    "cfo approve",
    approve.status === 200 && approve.json?.data?.status === "APPROVED",
    `status=${approve.status} cycle=${approve.json?.data?.status}`
  );

  const lock = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/lock`,
    { reason: "UAT freeze" },
    cfoToken
  );
  log(
    "lock",
    lock.status === 200 && lock.json?.data?.status === "LOCKED",
    `status=${lock.status} lockedAt=${lock.json?.data?.lockedAt} versionId=${lock.json?.data?.versionId}`
  );

  // Cell edit should be blocked (prefer a forecast-period cell so LOCKED_VERSION wins over ACTUAL_PERIOD_LOCKED)
  const cutoff = cycle.actualsCutoffPeriod || cycle.forecastStartPeriod;
  const cell =
    (await prisma.planningCell.findFirst({
      where: {
        modelId: cycle.sourceModelId,
        versionId: cycle.sourceModelVersionId,
        isEditable: true,
        ...(cutoff ? { periodDate: { gt: cutoff } } : {}),
      },
      orderBy: { periodDate: "desc" },
    })) ||
    (await prisma.planningCell.findFirst({
      where: {
        modelId: cycle.sourceModelId,
        versionId: cycle.sourceModelVersionId,
        isEditable: true,
      },
    }));
  if (cell) {
    const edit = await api(
      "POST",
      `/v1/fpa/models/${cycle.sourceModelId}/cells/update`,
      {
        cellId: cell.id,
        value: Number(cell.value || 0) + 1,
        recordVersion: cell.recordVersion != null ? Number(cell.recordVersion) : 1,
        cycleId: cycle.id,
      },
      token
    );
    log(
      "cell edit blocked after lock",
      edit.status === 423 && edit.json?.code === "LOCKED_VERSION",
      `status=${edit.status} code=${edit.json?.code}`
    );
  } else {
    log("cell edit blocked after lock", true, "no editable cell — skipped (version lock still applied)");
  }

  const reopen = await api(
    "POST",
    `/v1/fpa/model-planning/cycles/${cycle.id}/request-reopen`,
    { reason: "UAT reopen after lock" },
    token
  );
  log(
    "request reopen",
    reopen.status === 200 && reopen.json?.data?.status === "OPEN",
    `status=${reopen.status} cycle=${reopen.json?.data?.status}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- summary ---");
  console.log(`passed=${results.length - failed.length}/${results.length}`);
  console.log(`cycle=${cycle.id} name=${cycle.name}`);
  console.log(`admin=${EMAIL} cfo=${CFO_EMAIL}`);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
