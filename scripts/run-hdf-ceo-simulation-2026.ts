/**
 * HDF 2026 CEO scorecard simulation — automated UAT.
 *
 * Mirrors docs/fictional-performance-simulation-hdf-2026.md:
 *   admin login → 3 CEO goals → Finance/individual breakdown → $50k task progress → CEO scorecard
 *
 * Prerequisites:
 *   - npm run dev (API at API_BASE, same DATABASE_URL as this script)
 *   - Clean slate optional: npm run db:reset:performance-metrics-payroll -- --apply
 *
 * Usage:
 *   HDF_LOGIN_EMAIL=admin@nts.com HDF_LOGIN_PASSWORD=admin123 npm run uat:hdf-ceo-2026
 *
 * Optional env:
 *   API_BASE, HDF_YEAR (default 2026), HDF_FINANCE_USER_EMAIL, HDF_REVIEWER_USER_EMAIL,
 *   HDF_RUN_FULL_TARGET=1 (second $50k collection + re-generate)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";
import {
  computeRawRating,
  computeBudgetUtilisationRating,
  normaliseVariance,
  toNumber
} from "../src/services/performanceScorecardSupport";
import { deriveGoalProgressState } from "../src/services/performanceGoalRollupUtils";

const YEAR = parseInt(process.env.HDF_YEAR || process.env.E2E_YEAR || "2026", 10);
const API_BASE = (process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || "3000"}`).replace(
  /\/$/,
  ""
);
const LOGIN_EMAIL = (process.env.HDF_LOGIN_EMAIL || process.env.E2E_LOGIN_EMAIL || "admin@nts.com")
  .trim()
  .toLowerCase();
const LOGIN_PASSWORD = process.env.HDF_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || "admin123";
const RUN_FULL_TARGET = process.env.HDF_RUN_FULL_TARGET === "1" || process.env.HDF_RUN_FULL_TARGET === "true";
const SKIP_CLEANUP = process.env.HDF_SKIP_CLEANUP === "1" || process.env.HDF_SKIP_CLEANUP === "true";
const LOG_PATH = path.join(process.cwd(), "tracking", "hdf-ceo-simulation-log.md");
const MARKER = "HDF 2026 simulation";

type LogSection = string[];

function utcYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

function mdCell(s: string): string {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function nearEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * 1e-4, 0.02);
}

function assertCheck(lines: LogSection, label: string, actual: unknown, expected: unknown): boolean {
  const a = toNumber(actual, NaN);
  const e = toNumber(expected, NaN);
  const pass = Number.isFinite(a) && Number.isFinite(e) && nearEqual(a, e);
  const row = `| ${mdCell(label)} | ${mdCell(String(actual))} | ${mdCell(String(expected))} | ${pass ? "PASS" : "**FAIL**"} |`;
  lines.push(row);
  console.log(`${pass ? "PASS" : "FAIL"}: ${label} — got ${actual}, expected ${expected}`);
  return pass;
}

function explainRawRating(input: {
  actualValue: number;
  targetValue: number;
  allowableVariance?: number;
  isReverseKpi?: boolean;
}): { rating: number; branch: string; bands: Record<string, number> } {
  const targetValue = toNumber(input.targetValue, 0);
  const actualValue = toNumber(input.actualValue, 0);
  const allowableVariance = normaliseVariance(input.allowableVariance ?? 0.1);
  const isReverseKpi = Boolean(input.isReverseKpi);

  const upperVarianceBound = targetValue * (1 + allowableVariance);
  const lowerVarianceBound = targetValue * (1 - allowableVariance);
  const fiftyPctOfTarget = targetValue * 0.5;
  const oneFiftyPctOfTarget = targetValue * 1.5;

  const bands: Record<string, number> = {
    targetValue,
    actualValue,
    allowableVariance,
    lowerVarianceBound,
    upperVarianceBound,
    fiftyPctOfTarget,
    oneFiftyPctOfTarget
  };

  let branch = "";
  let rating = computeRawRating(input);

  if (targetValue <= 0 || actualValue <= 0) {
    branch = "target or actual <= 0 → rating 1";
  } else if (isReverseKpi) {
    if (actualValue < lowerVarianceBound) branch = "actual < lowerVarianceBound → 6";
    else if (actualValue < targetValue) branch = "actual < target (not equal) → 5";
    else if (Math.abs(actualValue - targetValue) <= Math.max(targetValue * 1e-9, 1e-6))
      branch = "actual ≈ target → 4";
    else if (actualValue <= upperVarianceBound) branch = "target < actual <= upperVarianceBound → 3";
    else if (actualValue <= oneFiftyPctOfTarget)
      branch = "upperVarianceBound < actual <= 150% target → 2";
    else branch = "actual > 150% target → 1";
  } else {
    if (actualValue > upperVarianceBound) branch = "actual > upperVarianceBound → 6";
    else if (actualValue > targetValue) branch = "target < actual <= upperVarianceBound → 5";
    else if (Math.abs(actualValue - targetValue) <= Math.max(targetValue * 1e-9, 1e-6))
      branch = "actual ≈ target → 4";
    else if (actualValue >= lowerVarianceBound) branch = "lowerVarianceBound <= actual < target → 3";
    else if (actualValue >= fiftyPctOfTarget)
      branch = "50% target <= actual < lowerVarianceBound → 2";
    else branch = "actual < 50% target → 1";
  }

  return { rating, branch, bands };
}

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) {
    throw new Error(`Login failed ${r.status}: ${j.message || JSON.stringify(j)}`);
  }
  return j.token as string;
}

async function apiJson(
  token: string,
  method: string,
  pathSuffix: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: any }> {
  const r = await fetch(`${API_BASE}${pathSuffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function resolveCeoUser() {
  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { name: "CEO" },
        { name: "Chief Executive Officer" },
        { name: { contains: "Chief Executive" } },
        { name: { contains: "CEO" } }
      ]
    },
    select: { id: true }
  });
  const byRole = roles.length
    ? await prisma.user.findFirst({
        where: { roleId: { in: roles.map((x) => x.id) } },
        select: { id: true, email: true, firstName: true, lastName: true }
      })
    : null;
  const byCode = await prisma.user.findFirst({
    where: { roleCode: { in: ["CEO", "CHIEF_EXECUTIVE", "chief_executive", "ceo"] } },
    select: { id: true, email: true, firstName: true, lastName: true }
  });
  return byRole || byCode;
}

async function resolveFinanceUser() {
  const email = process.env.HDF_FINANCE_USER_EMAIL?.trim().toLowerCase();
  if (email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true, userDepartment: true }
    });
  }
  const users = await prisma.user.findMany({
    select: { id: true, email: true, firstName: true, lastName: true, userDepartment: true, departmentRole: true },
    take: 200
  });
  return (
    users.find((u) => {
      const hay = [u.userDepartment, u.departmentRole].filter(Boolean).join(" ").toLowerCase();
      return hay.includes("finance");
    }) || users.find((u) => u.email !== LOGIN_EMAIL) || users[0]
  );
}

async function resolveReviewerUser(adminId: string) {
  const email = process.env.HDF_REVIEWER_USER_EMAIL?.trim().toLowerCase();
  if (email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true }
    });
  }
  return prisma.user.findFirst({
    where: { id: { not: adminId } },
    select: { id: true, email: true, firstName: true, lastName: true },
    orderBy: { createdAt: "asc" }
  });
}

async function findRevenueKpi() {
  return prisma.kPI.findFirst({
    where: {
      OR: [
        { name: { equals: "Revenue" } },
        { name: { contains: "Revenue" } },
        { accountType: "Revenue" }
      ]
    },
    orderBy: { name: "asc" }
  });
}

async function ensureCeoContract(
  ceoUserId: string,
  adminId: string,
  reviewerId: string,
  periodStart: Date,
  periodEnd: Date,
  periodLabel: string
) {
  let contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      subjectUserId: ceoUserId,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!contract) {
    contract = await prisma.performanceContract.create({
      data: {
        contractType: "CEO",
        title: `${MARKER} — CEO Performance Contract ${periodLabel}`,
        status: "ACTIVE",
        periodLabel,
        periodStart,
        periodEnd,
        subjectUserId: ceoUserId,
        reviewerUserId: reviewerId,
        createdById: adminId,
        sectionWeights: { A1: 50, A2: 30, D: 20 },
        allocatedBudget: 12_000_000,
        actualSpend: 11_100_000,
        metadata: { source: "run-hdf-ceo-simulation-2026.ts" }
      }
    });
  } else {
    contract = await prisma.performanceContract.update({
      where: { id: contract.id },
      data: {
        status: "ACTIVE",
        reviewerUserId: reviewerId,
        sectionWeights: { A1: 50, A2: 30, D: 20 },
        allocatedBudget: 12_000_000,
        actualSpend: 11_100_000
      }
    });
  }

  return contract;
}

async function createCompanyGoal(
  contractId: string,
  ceoUserId: string,
  adminId: string,
  row: {
    title: string;
    section: string;
    target: number;
    current: number;
    targetUnit: string;
    kpiId?: string | null;
    formulaType?: string;
  },
  periodStart: Date,
  periodEnd: Date
) {
  const progressState = deriveGoalProgressState({
    currentValue: row.current,
    targetValue: row.target,
    targetOperator: ">=",
    isReverseKpi: false,
    previousStage: row.current > 0 ? "in_progress" : "planning"
  });

  const goal = await prisma.performanceGoal.create({
    data: {
      title: `${MARKER} — ${row.title}`,
      description: `HDF simulation company goal (${row.section})`,
      type: "company",
      scorecardPillar: "Financial",
      pillarId: "bsc_financial",
      performanceContractId: contractId,
      startDate: periodStart,
      endDate: periodEnd,
      createdById: adminId,
      assignedToId: ceoUserId,
      status: progressState.status,
      stage: progressState.stage,
      progressPercentage: progressState.progressPercentage,
      targetValue: row.target,
      preciseTargetValue: String(row.target),
      currentValue: row.current,
      preciseCurrentValue: String(row.current),
      targetUnit: row.targetUnit,
      scorecardSection: row.section,
      scorecardWeight: 100,
      allowableVariance: 0.1,
      isReverseKpi: false,
      targetOperator: ">=",
      formulaType: row.formulaType || "DIRECT",
      kpiId: row.kpiId ?? null,
      displayOrder: row.section === "A1" ? 1 : row.section === "A2" ? 2 : 3
    }
  });
  return goal;
}

async function collectGoalSubtree(rootIds: string[]): Promise<string[]> {
  const seen = new Set<string>(rootIds);
  let frontier = [...rootIds];
  while (frontier.length > 0) {
    const children = await prisma.performanceGoal.findMany({
      where: { parentGoalId: { in: frontier } },
      select: { id: true }
    });
    frontier = [];
    for (const c of children) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        frontier.push(c.id);
      }
    }
  }
  return [...seen];
}

async function cleanupPriorSimulationGoals(contractId: string) {
  const roots = await prisma.performanceGoal.findMany({
    where: { performanceContractId: contractId, title: { contains: MARKER } },
    select: { id: true }
  });
  if (roots.length === 0) return;
  const ids = await collectGoalSubtree(roots.map((g) => g.id));
  const taskIds = (
    await prisma.task.findMany({ where: { goalId: { in: ids } }, select: { id: true } })
  ).map((t) => t.id);
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { goalId: { in: ids } },
        ...(taskIds.length ? [{ taskId: { in: taskIds } }] : [])
      ]
    }
  });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.performanceGoalProgressEvent.deleteMany({ where: { goalId: { in: ids } } });
  await prisma.performanceGoal.updateMany({
    where: { id: { in: ids } },
    data: { parentGoalId: null }
  });
  for (const type of ["individual", "department", "company"]) {
    const tierIds = (
      await prisma.performanceGoal.findMany({
        where: { id: { in: ids }, type },
        select: { id: true }
      })
    ).map((g) => g.id);
    if (tierIds.length) {
      await prisma.performanceGoal.deleteMany({ where: { id: { in: tierIds } } });
    }
  }
  await prisma.performanceScorecard.deleteMany({
    where: { contractId, periodLabel: String(YEAR) }
  });
  console.log(`Cleaned ${ids.length} prior ${MARKER} goal(s) in subtree`);
}

async function recordProgressOnTask(
  taskId: string,
  goalId: string,
  userId: string,
  amount: number,
  label: string
) {
  console.log(`\n>>> Recording task progress: ${label} — USD ${amount.toLocaleString()}`);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { monetaryValueAchieved: true, monetaryValue: true, kpi: true }
  });
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const currentAchieved = Number(task.monetaryValueAchieved ?? 0);
  const newAchieved = currentAchieved + amount;
  const target = Number(task.monetaryValue ?? 0);
  const stage = target > 0 && newAchieved >= target ? "completed" : "in_progress";

  await prisma.task.update({
    where: { id: taskId },
    data: { monetaryValueAchieved: newAchieved, stage }
  });

  // postTaskActivity defers sync via setImmediate — await rollup explicitly for UAT
  await TaskService.syncGoalProgressFromTaskComputation(goalId, taskId, userId, amount, {
    newGoalCurrent: newAchieved,
    taskStage: stage
  });
}

async function logGoalChain(lines: LogSection, ids: { individual: string; department: string; company: string }) {
  const goals = await prisma.performanceGoal.findMany({
    where: { id: { in: [ids.individual, ids.department, ids.company] } },
    select: { id: true, type: true, title: true, targetValue: true, currentValue: true, progressPercentage: true }
  });
  lines.push("### Goal chain after progress");
  lines.push("");
  lines.push("| Level | Target | Achieved | Progress % |");
  lines.push("|-------|--------|----------|------------|");
  for (const type of ["individual", "department", "company"]) {
    const g = goals.find((x) => x.type === type);
    if (!g) continue;
    lines.push(
      `| ${type} | ${mdCell(String(g.targetValue ?? ""))} | ${mdCell(String(g.currentValue ?? ""))} | ${mdCell(String(g.progressPercentage ?? ""))} |`
    );
  }
  lines.push("");
}

function logIndicatorRating(
  lines: LogSection,
  name: string,
  actual: number,
  target: number,
  expectedRating: number,
  isReverseKpi = false
) {
  const explained = explainRawRating({
    actualValue: actual,
    targetValue: target,
    allowableVariance: 0.1,
    isReverseKpi
  });
  lines.push(`#### ${name}`);
  lines.push("");
  lines.push(`- actual: **${actual}**, target: **${target}**, variance: **10%**, reverse: **${isReverseKpi}**`);
  lines.push(`- bands: \`${JSON.stringify(explained.bands)}\``);
  lines.push(`- branch: ${explained.branch}`);
  lines.push(`- rating: **${explained.rating}** (expected **${expectedRating}**) — ${explained.rating === expectedRating ? "PASS" : "**FAIL**"}`);
  lines.push("");
  console.log(`\n[formula] ${name}: actual=${actual} target=${target} → rating ${explained.rating} (${explained.branch})`);
  return explained.rating === expectedRating;
}

async function appendLog(lines: string[]) {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await fs.promises.writeFile(LOG_PATH, lines.join("\n") + "\n", "utf8");
  console.log(`\nLog written to ${LOG_PATH}`);
}

async function main() {
  const lines: LogSection = [];
  const { periodStart, periodEnd, periodLabel } = utcYearBounds(YEAR);
  let allPass = true;

  lines.push(`## HDF CEO simulation UAT — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- **API_BASE:** ${API_BASE}`);
  lines.push(`- **Year:** ${periodLabel}`);
  lines.push(`- **Doc:** docs/fictional-performance-simulation-hdf-2026.md`);
  lines.push("");

  const admin = await prisma.user.findUnique({
    where: { email: LOGIN_EMAIL },
    select: { id: true, email: true, firstName: true, lastName: true }
  });
  if (!admin) {
    throw new Error(`Admin user not found: ${LOGIN_EMAIL}`);
  }

  const ceoUser = await resolveCeoUser();
  if (!ceoUser) {
    throw new Error("Could not resolve CEO subject user (assign CEO role or set CEO_SEED_USER_EMAIL)");
  }

  const financeUser = await resolveFinanceUser();
  if (!financeUser) {
    throw new Error("Could not resolve Finance assignee. Set HDF_FINANCE_USER_EMAIL.");
  }

  const reviewer = await resolveReviewerUser(admin.id);
  if (!reviewer) {
    throw new Error("Could not resolve reviewer user. Set HDF_REVIEWER_USER_EMAIL.");
  }

  lines.push("### Identity mapping (fiction → NTS)");
  lines.push("");
  lines.push(`| Fiction | NTS user |`);
  lines.push(`|---------|----------|`);
  lines.push(`| Alex Nkomo (CEO) | ${mdCell(`${ceoUser.firstName} ${ceoUser.lastName} <${ceoUser.email}>`)} |`);
  lines.push(
    `| Tendai M (Finance) | ${mdCell(`${financeUser.firstName} ${financeUser.lastName} <${financeUser.email}>`)} |`
  );
  lines.push(
    `| Dr. Chipo Moyo (reviewer) | ${mdCell(`${reviewer.firstName} ${reviewer.lastName} <${reviewer.email}>`)} |`
  );
  lines.push(`| Admin (setup) | ${mdCell(`${admin.firstName} ${admin.lastName} <${admin.email}>`)} |`);
  lines.push("");

  let token: string;
  try {
    token = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
    lines.push("### Auth");
    lines.push("");
    lines.push("| Step | Result |");
    lines.push("|------|--------|");
    lines.push("| Login as admin | OK |");
    lines.push("");
  } catch (e: any) {
    lines.push(`**FATAL — Login failed:** ${e?.message || e}`);
    lines.push("");
    lines.push("Ensure `npm run dev` is running at API_BASE.");
    await appendLog(lines);
    throw e;
  }

  const contract = await ensureCeoContract(
    ceoUser.id,
    admin.id,
    reviewer.id,
    periodStart,
    periodEnd,
    periodLabel
  );
  if (!SKIP_CLEANUP) {
    await cleanupPriorSimulationGoals(contract.id);
  }
  lines.push("### CEO contract (2026)");
  lines.push("");
  lines.push(`- **id:** ${contract.id}`);
  lines.push(`- **sectionWeights:** A1=50%, A2=30%, D=20%`);
  lines.push(`- **budget:** allocated ZWL 12,000,000 / spent ZWL 11,100,000 (92%)`);
  lines.push("");

  const revenueKpi = await findRevenueKpi();
  lines.push(`- **Revenue KPI:** ${revenueKpi ? `${revenueKpi.name} (${revenueKpi.id})` : "none — goal created without KPI link"}`);
  lines.push("");

  const revenueGoal = await createCompanyGoal(
    contract.id,
    ceoUser.id,
    admin.id,
    { title: "Annual revenue", section: "A1", target: 100_000, current: 0, targetUnit: "USD", kpiId: revenueKpi?.id, formulaType: "DIRECT" },
    periodStart,
    periodEnd
  );
  const a2Goal = await createCompanyGoal(
    contract.id,
    ceoUser.id,
    admin.id,
    { title: "Statutory reports on time", section: "A2", target: 12, current: 12, targetUnit: "reports", formulaType: "DIRECT" },
    periodStart,
    periodEnd
  );
  const dGoal = await createCompanyGoal(
    contract.id,
    ceoUser.id,
    admin.id,
    { title: "Integrity & anti-corruption", section: "D", target: 100, current: 98, targetUnit: "%", formulaType: "DIRECT" },
    periodStart,
    periodEnd
  );

  lines.push("### Step 1 — Company goals created");
  lines.push("");
  lines.push("| Section | Title | Target | Achieved | id |");
  lines.push("|---------|-------|--------|----------|-----|");
  for (const g of [revenueGoal, a2Goal, dGoal]) {
    lines.push(
      `| ${mdCell(String(g.scorecardSection))} | ${mdCell(g.title)} | ${g.targetValue} | ${g.currentValue} | ${g.id} |`
    );
  }
  lines.push("");

  const deptBreakdown = await apiJson(token, "POST", "/api/performance/breakdown/departments", {
    parentGoalId: revenueGoal.id,
    selectedDepartments: ["Finance"],
    breakdownData: [
      {
        title: "Finance contribution — annual revenue",
        targetValue: 100_000,
        targetUnit: "USD",
        contributionWeightPercent: 100,
        description: `${MARKER} Finance department breakdown`
      }
    ]
  });

  lines.push("### Step 2 — Department breakdown (Finance)");
  lines.push("");
  lines.push(`- **HTTP:** ${deptBreakdown.status}`);
  lines.push(`- **success:** ${deptBreakdown.json?.success}`);
  if (!(deptBreakdown.status >= 200 && deptBreakdown.status < 300 && deptBreakdown.json?.success)) {
    lines.push(`- **error:** \`${JSON.stringify(deptBreakdown.json)}\``);
    await appendLog(lines);
    throw new Error("Department breakdown failed");
  }

  const deptGoalId =
    deptBreakdown.json?.goals?.[0]?.id ||
    (
      await prisma.performanceGoal.findFirst({
        where: { parentGoalId: revenueGoal.id, type: "department", departmentName: "Finance" },
        select: { id: true }
      })
    )?.id;

  if (!deptGoalId) {
    throw new Error("Finance department goal not found after breakdown");
  }
  lines.push(`- **Finance dept goal id:** ${deptGoalId}`);
  lines.push("");

  const indBreakdown = await apiJson(token, "POST", "/api/performance/breakdown/individuals", {
    departmentGoalId: deptGoalId,
    selectedUsers: [financeUser.id],
    breakdownData: [
      {
        title: "Individual revenue target",
        targetValue: 100_000,
        targetUnit: "USD",
        currentValue: 0
      }
    ]
  });

  lines.push("### Step 3 — Individual breakdown + auto-task");
  lines.push("");
  lines.push(`- **HTTP:** ${indBreakdown.status}`);
  lines.push(`- **success:** ${indBreakdown.json?.success}`);
  if (!(indBreakdown.status >= 200 && indBreakdown.status < 300 && indBreakdown.json?.success)) {
    lines.push(`- **error:** \`${JSON.stringify(indBreakdown.json)}\``);
    await appendLog(lines);
    throw new Error("Individual breakdown failed");
  }

  const individualGoalId =
    indBreakdown.json?.goals?.[0]?.id ||
    (
      await prisma.performanceGoal.findFirst({
        where: { parentGoalId: deptGoalId, type: "individual", assignedToId: financeUser.id },
        select: { id: true }
      })
    )?.id;

  if (!individualGoalId) {
    throw new Error("Individual goal not found after breakdown");
  }

  const task = await prisma.task.findFirst({
    where: { goalId: individualGoalId, isTrashed: false },
    select: { id: true, title: true, monetaryValue: true, monetaryValueAchieved: true }
  });

  if (!task) {
    throw new Error("Auto-created task not found on individual goal");
  }

  lines.push(`- **Individual goal id:** ${individualGoalId}`);
  lines.push(`- **Auto-task id:** ${task.id} (target ${task.monetaryValue})`);
  lines.push("");

  await recordProgressOnTask(task.id, individualGoalId, financeUser.id, 50_000, "First collection USD 50,000");

  await logGoalChain(lines, {
    individual: individualGoalId,
    department: deptGoalId,
    company: revenueGoal.id
  });

  const companyAfter = await prisma.performanceGoal.findUnique({
    where: { id: revenueGoal.id },
    select: { currentValue: true }
  });
  if (!assertCheck(lines, "Company revenue achieved", companyAfter?.currentValue, 50_000)) {
    allPass = false;
  }

  lines.push("### Step 4 — Formula audit (before generate)");
  lines.push("");

  if (!logIndicatorRating(lines, "A1 Annual revenue", 50_000, 100_000, 2)) allPass = false;
  if (!logIndicatorRating(lines, "A2 Statutory reports", 12, 12, 4)) allPass = false;
  if (!logIndicatorRating(lines, "D Integrity", 98, 100, 3)) allPass = false;

  const sectionBlend = 0.5 * 2 + 0.3 * 4 + 0.2 * 3;
  lines.push("#### Section blend");
  lines.push("");
  lines.push(`- formula: (50% × 2.00) + (30% × 4.00) + (20% × 3.00) = **${sectionBlend.toFixed(2)}**`);
  lines.push("");

  const budgetUtil = (11_100_000 / 12_000_000) * 100;
  const budgetRating = computeBudgetUtilisationRating(budgetUtil);
  const budgetExplained = explainRawRating({
    actualValue: budgetUtil,
    targetValue: 100,
    allowableVariance: 0.1,
    isReverseKpi: true
  });
  lines.push("#### Budget component");
  lines.push("");
  lines.push(`- utilisation: ${budgetUtil.toFixed(2)}% (11.1M / 12M)`);
  lines.push(`- reverse KPI rating: **${budgetRating}** (expected **5**) — ${budgetRating === 5 ? "PASS" : "**FAIL**"}`);
  lines.push(`- branch: ${budgetExplained.branch}`);
  lines.push("");
  if (budgetRating !== 5) allPass = false;

  const expectedFinal = round2(sectionBlend * 0.9 + budgetRating * 0.1);
  lines.push("#### Final score (expected)");
  lines.push("");
  lines.push(`- formula: 90% × ${sectionBlend.toFixed(2)} + 10% × ${budgetRating} = **${expectedFinal}**`);
  lines.push("");

  const gen = await apiJson(token, "POST", "/api/performance/scorecards/ceo/generate", {
    periodLabel,
    sectionBlendMode: "redistribute"
  });

  lines.push("### Step 5 — CEO scorecard generate");
  lines.push("");
  lines.push(`- **HTTP:** ${gen.status}`);
  lines.push(`- **success:** ${gen.json?.success}`);
  lines.push(`- **message:** ${gen.json?.message || ""}`);

  const data = gen.json?.data;
  if (data) {
    lines.push(`- **finalScore:** ${data.scores?.finalScore}`);
    lines.push(`- **sectionBlendScore:** ${data.scores?.sectionBlendScore}`);
    lines.push(`- **performanceLabel:** ${data.scores?.performanceLabel}`);
    lines.push(`- **budgetScore:** ${data.scores?.budgetPerformanceScore ?? data.budgetComponent?.score ?? "n/a"}`);
  }
  lines.push("");

  if (!(gen.status >= 200 && gen.status < 300 && gen.json?.success)) {
    lines.push(`- **error body:** \`${JSON.stringify(gen.json)}\``);
    await appendLog(lines);
    throw new Error("CEO scorecard generate failed");
  }

  lines.push("### Comparison vs simulation document");
  lines.push("");
  lines.push("| Check | Actual | Expected | Result |");
  lines.push("|-------|--------|----------|--------|");

  const sections = data?.sections || {};
  const findIndicator = (sectionKey: string) => {
    const sec = sections[sectionKey];
    const indicators = sec?.indicators;
    return Array.isArray(indicators) && indicators.length > 0 ? indicators[0] : null;
  };

  const a1Ind = findIndicator("A1");
  const a2Ind = findIndicator("A2");
  const dInd = findIndicator("D");

  if (a1Ind && !assertCheck(lines, "A1 rating", a1Ind.rating ?? a1Ind.rawRating, 2)) allPass = false;
  if (a2Ind && !assertCheck(lines, "A2 rating", a2Ind.rating ?? a2Ind.rawRating, 4)) allPass = false;
  if (dInd && !assertCheck(lines, "D rating", dInd.rating ?? dInd.rawRating, 3)) allPass = false;
  if (!assertCheck(lines, "Section blend", data?.scores?.sectionBlendScore, sectionBlend)) allPass = false;
  if (!assertCheck(lines, "Final score", data?.scores?.finalScore, expectedFinal)) allPass = false;

  if (RUN_FULL_TARGET) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Optional checkpoint — second $50k (full target)");
    lines.push("");

    await recordProgressOnTask(task.id, individualGoalId, financeUser.id, 50_000, "Second collection USD 50,000");

    const companyFull = await prisma.performanceGoal.findUnique({
      where: { id: revenueGoal.id },
      select: { currentValue: true }
    });
    assertCheck(lines, "Company revenue after 2×$50k", companyFull?.currentValue, 100_000);

    const fullSectionBlend = 0.5 * 4 + 0.3 * 4 + 0.2 * 3;
    const fullExpectedFinal = round2(fullSectionBlend * 0.9 + budgetRating * 0.1);

    logIndicatorRating(lines, "A1 Annual revenue (full)", 100_000, 100_000, 4);

    const gen2 = await apiJson(token, "POST", "/api/performance/scorecards/ceo/generate", {
      periodLabel,
      sectionBlendMode: "redistribute"
    });
    const data2 = gen2.json?.data;
    lines.push(`- **finalScore (full target):** ${data2?.scores?.finalScore} (expected ~${fullExpectedFinal})`);
    assertCheck(lines, "Final score (full target)", data2?.scores?.finalScore, fullExpectedFinal);
  }

  lines.push("");
  lines.push("### Overall");
  lines.push("");
  lines.push(allPass ? "- **RESULT: PASS** — matches simulation document." : "- **RESULT: FAIL** — see FAIL rows above.");
  lines.push("");

  await appendLog(lines);

  if (!allPass) {
    process.exit(1);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
