/**
 * Department scorecard audit — existing data only (no new goals).
 *
 * 1. Prisma inventory: contract, department goals, children, finalised employee scorecards
 * 2. In-process preview (PerformanceScorecardService, persist=false) with step logs
 * 3. HTTP POST generate (same as UI)
 * 4. Recompute department score from API goals; compare preview vs API
 *
 * Usage:
 *   DEPT_SCORECARD_DEPARTMENT=Finance npm run uat:department-scorecard-audit
 *   DEPT_SCORECARD_ALL=1 npm run uat:department-scorecard-audit
 *
 * Env: API_BASE, HDF_LOGIN_EMAIL, HDF_LOGIN_PASSWORD, DEPT_YEAR (default 2026)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/utils/database";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";
import {
  computeRawRating,
  departmentGoalRowStatus,
  departmentMatrixVarianceStatus,
  normaliseVariance,
  performanceLabelFromDepartmentScore,
  toNumber,
  round
} from "../src/services/performanceScorecardSupport";

const YEAR = parseInt(process.env.DEPT_YEAR || process.env.HDF_YEAR || "2026", 10);
const API_BASE = (process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || "3000"}`).replace(
  /\/$/,
  ""
);
const LOGIN_EMAIL = (process.env.HDF_LOGIN_EMAIL || process.env.E2E_LOGIN_EMAIL || "admin@nts.com")
  .trim()
  .toLowerCase();
const LOGIN_PASSWORD = process.env.HDF_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || "admin123";
const DEPT_FILTER = (process.env.DEPT_SCORECARD_DEPARTMENT || "Finance").trim();
const RUN_ALL = process.env.DEPT_SCORECARD_ALL === "1" || process.env.DEPT_SCORECARD_ALL === "true";
const LOG_PATH = path.join(process.cwd(), "tracking", "department-scorecard-audit-log.md");

type Lines = string[];

function utcYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

function md(s: string) {
  return String(s).replace(/\|/g, "\\|");
}

function nearEqual(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * 1e-4, 0.02);
}

function assertRow(lines: Lines, label: string, actual: unknown, expected: unknown): boolean {
  const aNum = toNumber(actual, NaN);
  const eNum = toNumber(expected, NaN);
  const pass =
    Number.isFinite(aNum) && Number.isFinite(eNum)
      ? nearEqual(aNum, eNum)
      : String(actual ?? "") === String(expected ?? "");
  lines.push(`| ${md(label)} | ${actual} | ${expected} | ${pass ? "PASS" : "**FAIL**"} |`);
  console.log(`${pass ? "PASS" : "FAIL"}: ${label} — got ${actual}, expected ${expected}`);
  return pass;
}

async function login(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) {
    throw new Error(`Login failed ${r.status}: ${j.message || JSON.stringify(j)}`);
  }
  return j.token as string;
}

async function apiGenerate(token: string, departmentName: string, periodLabel: string) {
  const encoded = encodeURIComponent(departmentName);
  const r = await fetch(`${API_BASE}/api/performance/scorecards/department/${encoded}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ periodLabel })
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function discoverDepartments(periodStart: Date, periodEnd: Date): Promise<string[]> {
  const goals = await prisma.performanceGoal.findMany({
    where: {
      type: "department",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
      departmentName: { not: null }
    },
    select: { departmentName: true },
    distinct: ["departmentName"]
  });
  const names = goals.map((g) => String(g.departmentName)).filter(Boolean);
  const withContract: string[] = [];
  for (const name of names) {
    const c = await prisma.performanceContract.findFirst({
      where: {
        contractType: "DEPARTMENT",
        departmentName: name,
        status: { notIn: ["ARCHIVED", "CANCELLED"] },
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart }
      }
    });
    if (c) withContract.push(name);
  }
  return [...new Set(withContract)].sort();
}

async function inventoryDepartment(
  lines: Lines,
  departmentName: string,
  periodStart: Date,
  periodEnd: Date
) {
  lines.push("### Prisma inventory (existing data)");
  lines.push("");

  const contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "DEPARTMENT",
      departmentName,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!contract) {
    lines.push(`- **No DEPARTMENT contract** for ${departmentName} overlapping ${YEAR}`);
    lines.push("");
    return null;
  }

  lines.push(`- **Contract:** ${contract.id} — ${contract.title}`);
  lines.push(`- **Period:** ${contract.periodLabel}`);
  lines.push("");

  const deptGoals = await prisma.performanceGoal.findMany({
    where: {
      type: "department",
      departmentName,
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart }
    },
    include: {
      kpi: { select: { name: true } }
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
  });

  const goalIds = deptGoals.map((g) => g.id);
  const children = goalIds.length
    ? await prisma.performanceGoal.findMany({
        where: { parentGoalId: { in: goalIds }, type: "individual" },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } }
        }
      })
    : [];

  const users = await prisma.user.findMany({
    where: { userDepartment: departmentName },
    select: { id: true, firstName: true, lastName: true }
  });

  const employeeScorecards = await prisma.performanceScorecard.findMany({
    where: {
      scorecardType: "EMPLOYEE",
      periodStart,
      periodEnd,
      subjectUser: { userDepartment: departmentName }
    },
    select: { subjectUserId: true, status: true, finalScore: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }
  });

  const finals = employeeScorecards.filter((s) => s.status === "FINAL");
  const drafts = employeeScorecards.filter((s) => s.status === "DRAFT");
  const latestByUser = new Map<string, (typeof employeeScorecards)[0]>();
  for (const sc of employeeScorecards) {
    if (!sc.subjectUserId) continue;
    const prev = latestByUser.get(sc.subjectUserId);
    if (!prev || new Date(sc.updatedAt) > new Date(prev.updatedAt)) {
      latestByUser.set(sc.subjectUserId, sc);
    }
  }

  lines.push(`| Dept goals | ${deptGoals.length} |`);
  lines.push(`| Individual children | ${children.length} |`);
  lines.push(`| Dept users | ${users.length} |`);
  lines.push(`| Employee scorecards (FINAL) | ${finals.length} |`);
  lines.push(`| Employee scorecards (DRAFT) | ${drafts.length} |`);
  lines.push(`| Latest per user (rollup-eligible) | ${latestByUser.size} |`);
  lines.push("");

  lines.push("| Goal | Target | Achieved | Weight % | Parent |");
  lines.push("|------|--------|----------|----------|--------|");
  for (const g of deptGoals) {
    lines.push(
      `| ${md(g.title ?? "")} | ${g.targetValue} | ${g.currentValue} | ${g.scorecardWeight ?? "(even split)"} | ${g.parentGoalId ? "yes" : "no"} |`
    );
  }
  lines.push("");

  if (children.length) {
    lines.push("| Child (individual) | Assignee | Target | Achieved | Parent goal |");
    lines.push("|--------------------|----------|--------|----------|-------------|");
    for (const c of children) {
      const parent = deptGoals.find((p) => p.id === c.parentGoalId);
      lines.push(
        `| ${md(c.title ?? "")} | ${c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : "—"} | ${c.targetValue} | ${c.currentValue} | ${md(parent?.title ?? c.parentGoalId ?? "")} |`
      );
    }
    lines.push("");
  }

  if (latestByUser.size) {
    lines.push("**Latest employee scorecards (DRAFT or FINAL — used for roll-up):**");
    for (const s of latestByUser.values()) {
      const u = users.find((x) => x.id === s.subjectUserId);
      lines.push(
        `- ${u ? `${u.firstName} ${u.lastName}` : s.subjectUserId}: **${s.status}** finalScore **${s.finalScore}**`
      );
    }
    lines.push("");
  }

  return contract;
}

function logGoalFormulaAudit(lines: Lines, goal: any, periodEnd: Date) {
  const target = toNumber(goal.targetValue, 0);
  const directActual = toNumber(goal.directActualValue ?? goal.selectedActualValue, 0);
  const directPct = toNumber(goal.directProgressPct, 0);
  const rollupPct = toNumber(goal.rollupProgressPct, 0);
  const selectedPct = toNumber(goal.selectedProgressPct, 0);
  const selectedActual = toNumber(goal.selectedActualValue, 0);
  const av = normaliseVariance(goal.allowableVariance ?? 0.1);
  const reverse = Boolean(goal.isReverseKpi);

  lines.push(`#### ${goal.goalName || goal.id}`);
  lines.push("");
  lines.push(`- **Target:** ${target} | **Direct actual:** ${directActual} | **Direct progress:** ${directPct}%`);
  lines.push(`- **Roll-up progress:** ${rollupPct}% | **Selected:** ${goal.selectedSource} → ${selectedPct}% (actual ${selectedActual})`);
  lines.push(`- **Variance band (standard):** [${target * (1 - av)}, ${target * (1 + av)}] | reverse: ${reverse}`);

  const expectedRating = goal.isPendingApproval
    ? null
    : computeRawRating({
        actualValue: selectedActual,
        targetValue: target,
        allowableVariance: av,
        isReverseKpi: reverse
      });

  if (expectedRating != null) {
    const pass = nearEqual(expectedRating, goal.rawRating);
    lines.push(
      `- **rawRating:** ${goal.rawRating} (recomputed ${expectedRating}) — ${pass ? "PASS" : "**FAIL**"}`
    );
    const variance = selectedActual - target;
    const matrixStatus = departmentMatrixVarianceStatus({
      variance,
      targetValue: target,
      allowableVariance: av,
      isReverseKpi: reverse,
      missingValue: Boolean(goal.missingValue)
    });
    const rowStatus = departmentGoalRowStatus(selectedPct, av, periodEnd);
    lines.push(`- **Matrix variance status:** ${matrixStatus} | **Row status (progress+escalation):** ${goal.status || rowStatus}`);
  }

  const ew = toNumber(goal.effectiveWeight ?? goal.weight, 0);
  const ws = toNumber(goal.weightedScore, 0);
  const expectedWs =
    goal.isPendingApproval ? 0 : round((ew * toNumber(goal.rawRating, 0)) / 100, 4);
  if (!goal.isPendingApproval) {
    lines.push(
      `- **Weight:** ${goal.weight}% → effective **${ew}%** | weightedScore ${ws} (expected ${expectedWs}) — ${nearEqual(ws, expectedWs) ? "PASS" : "FAIL"}`
    );
  }
  if (goal.childContributions?.length) {
    lines.push("- **Child contributions:**");
    for (const c of goal.childContributions) {
      lines.push(
        `  - ${c.employeeName}: progress ${c.progressPct}%, roll-up weight ${c.contributionWeight}%`
      );
    }
  }
  lines.push("");
}

function recomputeDepartmentScore(goals: any[]): {
  departmentScore: number;
  performanceLabel: string;
  activeWeight: number;
} {
  const active = goals.filter((g) => !g.isPendingApproval && !g.excludedFromScoring);
  const activeWeight = active.reduce((s, g) => s + toNumber(g.effectiveWeight ?? g.weight, 0), 0);
  const totalWeighted = active.reduce((s, g) => s + toNumber(g.weightedScore, 0), 0);
  const departmentScore =
    activeWeight > 0 ? round((totalWeighted * 100) / activeWeight, 2) : 0;
  return {
    departmentScore,
    performanceLabel: performanceLabelFromDepartmentScore(departmentScore),
    activeWeight
  };
}

async function auditDepartment(
  lines: Lines,
  departmentName: string,
  viewer: { id: string; email: string },
  token: string
) {
  const { periodStart, periodEnd, periodLabel } = utcYearBounds(YEAR);
  const periodEndDate = periodEnd;

  lines.push(`## Department: ${departmentName}`);
  lines.push("");
  lines.push(`- **Timestamp:** ${new Date().toISOString()}`);
  lines.push(`- **Period:** ${periodLabel}`);
  lines.push("");

  const contract = await inventoryDepartment(lines, departmentName, periodStart, periodEnd);
  if (!contract) {
    lines.push("**SKIP:** No contract — cannot generate.");
    lines.push("");
    return false;
  }

  let preview: any;
  try {
    console.log(`\n>>> Service preview (persist=false): ${departmentName}`);
    preview = await PerformanceScorecardService.getDepartmentScorecard({
      viewer,
      departmentName,
      periodLabel,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      persist: false,
      meta: {}
    });
  } catch (e: any) {
    lines.push(`**FATAL (service preview):** ${e?.message || e}`);
    lines.push("");
    return false;
  }

  lines.push("### Step 1 — Service preview (in-process, no save)");
  lines.push("");
  if (preview.warnings?.length) {
    for (const w of preview.warnings) {
      lines.push(`- Warning: ${w}`);
    }
    lines.push("");
  }

  lines.push("#### Per-goal formula audit (preview)");
  lines.push("");
  for (const g of preview.goals || []) {
    logGoalFormulaAudit(lines, g, periodEndDate);
    console.log(
      `[preview] ${g.goalName}: selected ${g.selectedProgressPct}% → rating ${g.rawRating}, weighted ${g.weightedScore}`
    );
  }

  const previewRecompute = recomputeDepartmentScore(preview.goals || []);
  lines.push("#### Department score (preview)");
  lines.push("");
  lines.push(`- formula: Σ(effectiveWeight × rawRating / 100) / Σ(effectiveWeight) × 100`);
  lines.push(`- activeWeight sum: **${previewRecompute.activeWeight}%**`);
  lines.push(`- **departmentScore:** ${preview.scores?.departmentScore} (recomputed **${previewRecompute.departmentScore}**)`);
  lines.push(`- **performanceLabel:** ${preview.scores?.performanceLabel}`);
  lines.push("");

  let allPass = assertRow(
    lines,
    "Preview score vs recompute",
    preview.scores?.departmentScore,
    previewRecompute.departmentScore
  );

  console.log(`\n>>> HTTP generate: ${departmentName}`);
  const gen = await apiGenerate(token, departmentName, periodLabel);
  lines.push("### Step 2 — HTTP POST generate");
  lines.push("");
  lines.push(`- **URL:** POST /api/performance/scorecards/department/${departmentName}/generate`);
  lines.push(`- **HTTP:** ${gen.status} | success: ${gen.json?.success}`);
  lines.push("");

  if (!(gen.status >= 200 && gen.status < 300 && gen.json?.success)) {
    lines.push(`\`\`\`json\n${JSON.stringify(gen.json, null, 2).slice(0, 2000)}\n\`\`\``);
    lines.push("");
    return false;
  }

  const data = gen.json.data;
  const apiGoals = data.goals || [];

  lines.push("#### Per-goal formula audit (API response)");
  lines.push("");
  for (const g of apiGoals) {
    logGoalFormulaAudit(lines, g, periodEndDate);
  }

  const apiRecompute = recomputeDepartmentScore(apiGoals);
  lines.push("#### Department score (API)");
  lines.push("");
  lines.push(`- **scores.departmentScore:** ${data.scores?.departmentScore}`);
  lines.push(`- **recomputed from goals:** ${apiRecompute.departmentScore}`);
  lines.push(`- **performanceLabel:** ${data.scores?.performanceLabel}`);
  lines.push(`- **savedRecord.finalScore:** ${data.savedRecord?.finalScore}`);
  lines.push("");

  allPass =
    assertRow(lines, "API score vs recompute", data.scores?.departmentScore, apiRecompute.departmentScore) &&
    allPass;
  allPass =
    assertRow(lines, "Preview vs API departmentScore", preview.scores?.departmentScore, data.scores?.departmentScore) &&
    allPass;
  allPass =
    assertRow(
      lines,
      "Preview vs API performanceLabel",
      preview.scores?.performanceLabel,
      data.scores?.performanceLabel
    ) && allPass;

  if (data.rollupSummary?.length) {
    lines.push("#### Employee roll-up summary");
    lines.push("");
    lines.push("| Employee | Final score | Roll-up weight % | Weighted contribution |");
    lines.push("|----------|-------------|------------------|----------------------|");
    for (const r of data.rollupSummary) {
      lines.push(
        `| ${md(r.employeeName)} | ${r.finalScore ?? "—"} | ${r.rollupWeight ?? "—"} | ${r.weightedContribution ?? "—"} |`
      );
    }
    lines.push("");
  }

  lines.push("### Comparison matrix");
  lines.push("");
  lines.push("| Check | Actual | Expected | Result |");
  lines.push("|-------|--------|----------|--------|");
  lines.push("");

  lines.push(allPass ? "**RESULT: PASS**" : "**RESULT: FAIL** — see rows above.");
  lines.push("");
  return allPass;
}

async function main() {
  const lines: Lines = [];
  lines.push(`# Department scorecard audit — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- **API_BASE:** ${API_BASE}`);
  lines.push(`- **Login:** ${LOGIN_EMAIL}`);
  lines.push(`- **Year:** ${YEAR}`);
  lines.push(`- **Mode:** ${RUN_ALL ? "all departments with contract" : `single (${DEPT_FILTER})`}`);
  lines.push("");

  const viewer = await prisma.user.findUnique({
    where: { email: LOGIN_EMAIL },
    include: { role: true }
  });
  if (!viewer) {
    throw new Error(`Login user not found: ${LOGIN_EMAIL}`);
  }

  const token = await login();
  lines.push("- **Auth:** OK");
  lines.push("");

  const { periodStart, periodEnd } = utcYearBounds(YEAR);
  const departments = RUN_ALL ? await discoverDepartments(periodStart, periodEnd) : [DEPT_FILTER];

  if (!departments.length) {
    lines.push("**No departments** with goals + DEPARTMENT contract for this period.");
    await fs.promises.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.promises.writeFile(LOG_PATH, lines.join("\n") + "\n");
    process.exit(1);
  }

  let allOk = true;
  for (const dept of departments) {
    const ok = await auditDepartment(lines, dept, viewer, token);
    if (!ok) allOk = false;
  }

  await fs.promises.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.promises.writeFile(LOG_PATH, lines.join("\n") + "\n");
  console.log(`\nLog: ${LOG_PATH}`);

  if (!allOk) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
