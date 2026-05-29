/**
 * Add B + C CEO indicators alongside existing HDF simulation goals (no delete),
 * then generate CEO scorecard with full formula audit.
 *
 * Usage:
 *   API_BASE=http://127.0.0.1:3009 HDF_LOGIN_EMAIL=admin@nts.com HDF_LOGIN_PASSWORD=admin123 \
 *     npm run uat:hdf-ceo-extended
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/utils/database";
import { deriveGoalProgressState } from "../src/services/performanceGoalRollupUtils";
import {
  computeRawRating,
  computeBudgetUtilisationRating,
  CEO_SECTION_WEIGHTS,
  normaliseVariance,
  resolveSectionWeights,
  toNumber
} from "../src/services/performanceScorecardSupport";

const YEAR = parseInt(process.env.HDF_YEAR || "2026", 10);
const API_BASE = (process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || "3000"}`).replace(
  /\/$/,
  ""
);
const LOGIN_EMAIL = (process.env.HDF_LOGIN_EMAIL || "admin@nts.com").trim().toLowerCase();
const LOGIN_PASSWORD = process.env.HDF_LOGIN_PASSWORD || "admin123";
const EXTENDED_MARKER = "HDF 2026 extended";
const LOG_PATH = path.join(process.cwd(), "tracking", "hdf-ceo-extended-scorecard-log.md");

const NEW_GOALS = [
  {
    title: "Corporate governance compliance score",
    section: "B",
    target: 100,
    current: 100,
    targetUnit: "%",
    formulaType: "DIRECT",
    displayOrder: 4
  },
  {
    title: "Staff training hours delivered",
    section: "C",
    target: 200,
    current: 180,
    targetUnit: "hours",
    formulaType: "DIRECT",
    displayOrder: 5
  }
] as const;

function utcYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function nearEqual(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * 1e-4, 0.02);
}

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(`Login failed ${r.status}: ${j.message || JSON.stringify(j)}`);
  return j.token as string;
}

async function apiJson(token: string, method: string, pathSuffix: string, body?: Record<string, unknown>) {
  const r = await fetch(`${API_BASE}${pathSuffix}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

function explainRawRating(input: {
  actualValue: number;
  targetValue: number;
  allowableVariance?: number;
  isReverseKpi?: boolean;
}) {
  const rating = computeRawRating(input);
  const targetValue = toNumber(input.targetValue, 0);
  const actualValue = toNumber(input.actualValue, 0);
  const v = normaliseVariance(input.allowableVariance ?? 0.1);
  const lower = targetValue * (1 - v);
  const upper = targetValue * (1 + v);
  return { rating, lower, upper, actualValue, targetValue };
}

function computeRedistributeSectionBlend(
  sectionWeights: Record<string, number>,
  sectionScores: Record<string, number>
) {
  let totalW = 0;
  let weightedSum = 0;
  for (const [key, score] of Object.entries(sectionScores)) {
    const w = toNumber(sectionWeights[key], 0);
    if (w <= 0) continue;
    totalW += w;
    weightedSum += w * score;
  }
  return totalW > 0 ? round2(weightedSum / totalW) : 0;
}

async function main() {
  const lines: string[] = [];
  const { periodStart, periodEnd, periodLabel } = utcYearBounds(YEAR);
  let allPass = true;

  lines.push(`## HDF CEO extended scorecard — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- **API_BASE:** ${API_BASE}`);
  lines.push(`- **Keeps existing HDF simulation goals** (no delete)`);
  lines.push("");

  const admin = await prisma.user.findUnique({
    where: { email: LOGIN_EMAIL },
    select: { id: true, email: true }
  });
  if (!admin) throw new Error(`Admin not found: ${LOGIN_EMAIL}`);

  const contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      periodLabel,
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!contract) throw new Error(`No active CEO contract for ${periodLabel}`);

  const existingCompany = await prisma.performanceGoal.findMany({
    where: { performanceContractId: contract.id, type: "company" },
    select: {
      id: true,
      title: true,
      scorecardSection: true,
      targetValue: true,
      currentValue: true,
      scorecardWeight: true,
      allowableVariance: true,
      isReverseKpi: true
    },
    orderBy: [{ scorecardSection: "asc" }, { displayOrder: "asc" }]
  });

  lines.push("### Existing company goals (unchanged)");
  lines.push("");
  lines.push("| Section | Title | Target | Achieved |");
  lines.push("|---------|-------|--------|----------|");
  for (const g of existingCompany) {
    lines.push(`| ${g.scorecardSection ?? ""} | ${g.title} | ${g.targetValue} | ${g.currentValue} |`);
  }
  lines.push("");

  const ceoUserId = contract.subjectUserId || admin.id;
  const created: typeof NEW_GOALS[number][] = [];

  for (const row of NEW_GOALS) {
    const exists = await prisma.performanceGoal.findFirst({
      where: {
        performanceContractId: contract.id,
        type: "company",
        scorecardSection: row.section,
        title: { contains: EXTENDED_MARKER }
      }
    });
    if (exists) {
      lines.push(`- **Skip (already exists):** ${row.section} — ${exists.title}`);
      continue;
    }

    const progressState = deriveGoalProgressState({
      currentValue: row.current,
      targetValue: row.target,
      targetOperator: ">=",
      isReverseKpi: false,
      previousStage: row.current > 0 ? "in_progress" : "planning"
    });

    await prisma.performanceGoal.create({
      data: {
        title: `${EXTENDED_MARKER} — ${row.title}`,
        description: `Extended HDF CEO indicator (${row.section})`,
        type: "company",
        scorecardPillar: row.section === "B" ? "Internal Operations" : "Learning, Growth & HR",
        pillarId: row.section === "B" ? "bsc_internal_operations" : "bsc_learning_growth_hr",
        performanceContractId: contract.id,
        startDate: periodStart,
        endDate: periodEnd,
        createdById: admin.id,
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
        formulaType: row.formulaType,
        displayOrder: row.displayOrder
      }
    });
    created.push(row);
    lines.push(`- **Created:** ${row.section} — ${row.title} (target ${row.target}, achieved ${row.current})`);
  }
  lines.push("");

  // Balanced 5-section weights (sum 100) — existing A1/A2/D goals stay; B/C now scoreable
  const sectionWeights = { A1: 35, A2: 25, B: 15, C: 15, D: 10 };
  await prisma.performanceContract.update({
    where: { id: contract.id },
    data: { sectionWeights }
  });
  lines.push("### Contract section weights (updated for 5 sections)");
  lines.push("");
  lines.push(`\`${JSON.stringify(sectionWeights)}\` (total 100%)`);
  lines.push("");

  const allCompany = await prisma.performanceGoal.findMany({
    where: { performanceContractId: contract.id, type: "company" },
    select: {
      title: true,
      scorecardSection: true,
      targetValue: true,
      currentValue: true,
      allowableVariance: true,
      isReverseKpi: true
    },
    orderBy: [{ scorecardSection: "asc" }, { displayOrder: "asc" }]
  });

  lines.push("### All company goals on CEO contract");
  lines.push("");
  lines.push("| Section | Title | Target | Achieved |");
  lines.push("|---------|-------|--------|----------|");
  for (const g of allCompany) {
    lines.push(`| ${g.scorecardSection ?? ""} | ${g.title} | ${g.targetValue} | ${g.currentValue} |`);
  }
  lines.push("");

  const sectionScores: Record<string, number> = {};
  lines.push("### Per-indicator formula audit");
  lines.push("");

  for (const g of allCompany) {
    const section = g.scorecardSection || "UNASSIGNED";
    const actual = toNumber(g.currentValue, 0);
    const target = toNumber(g.targetValue, 0);
    const explained = explainRawRating({
      actualValue: actual,
      targetValue: target,
      allowableVariance: g.allowableVariance,
      isReverseKpi: g.isReverseKpi
    });
    sectionScores[section] = explained.rating;
    lines.push(`#### ${section} — ${g.title}`);
    lines.push(`- actual **${actual}**, target **${target}**, rating **${explained.rating}**`);
    lines.push(`- variance band: [${explained.lower.toFixed(2)}, ${explained.upper.toFixed(2)}]`);
    lines.push("");
    console.log(`[formula] ${section}: ${actual}/${target} → rating ${explained.rating}`);
  }

  const resolvedWeights = resolveSectionWeights(sectionWeights, CEO_SECTION_WEIGHTS);
  const expectedSectionBlend = computeRedistributeSectionBlend(resolvedWeights, sectionScores);
  const budgetUtil = (toNumber(contract.actualSpend, 0) / toNumber(contract.allocatedBudget, 1)) * 100;
  const budgetRating = computeBudgetUtilisationRating(budgetUtil);
  const expectedFinal = round2(expectedSectionBlend * 0.9 + budgetRating * 0.1);

  lines.push("### Expected section blend (redistribute mode)");
  lines.push("");
  const parts = Object.entries(sectionScores)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sec, score]) => `${resolvedWeights[sec]}% × ${score} (${sec})`);
  lines.push(`- (${parts.join(" + ")}) / 100 = **${expectedSectionBlend}**`);
  lines.push("");
  lines.push("### Expected budget + final");
  lines.push("");
  lines.push(`- budget utilisation: **${round2(budgetUtil)}%** → rating **${budgetRating}**`);
  lines.push(`- final: 90% × ${expectedSectionBlend} + 10% × ${budgetRating} = **${expectedFinal}**`);
  lines.push("");

  const token = await login(LOGIN_EMAIL, LOGIN_PASSWORD);
  const gen = await apiJson(token, "POST", "/api/performance/scorecards/ceo/generate", {
    periodLabel,
    sectionBlendMode: "redistribute"
  });

  lines.push("### CEO scorecard generate (API)");
  lines.push("");
  lines.push(`- HTTP: ${gen.status}, success: ${gen.json?.success}`);

  const data = gen.json?.data;
  if (!data) {
    lines.push(`- error: \`${JSON.stringify(gen.json)}\``);
    await fs.promises.writeFile(LOG_PATH, lines.join("\n") + "\n");
    throw new Error("Generate failed");
  }

  lines.push(`- **finalScore:** ${data.scores?.finalScore}`);
  lines.push(`- **sectionBlendScore:** ${data.scores?.sectionBlendScore}`);
  lines.push(`- **performanceLabel:** ${data.scores?.performanceLabel}`);
  lines.push("");

  lines.push("### API indicators vs expected ratings");
  lines.push("");
  lines.push("| Section | Indicator | Actual | Target | API rating | Expected | Result |");
  lines.push("|---------|-----------|--------|--------|------------|----------|--------|");

  for (const secKey of ["A1", "A2", "B", "C", "D"]) {
    const sec = data.sections?.[secKey];
    if (!sec?.indicators?.length) continue;
    for (const ind of sec.indicators) {
      const expected = sectionScores[secKey];
      const apiRating = ind.rawRating ?? ind.rating;
      const pass = expected != null && nearEqual(toNumber(apiRating, NaN), expected);
      if (!pass) allPass = false;
      lines.push(
        `| ${secKey} | ${ind.indicatorName ?? ind.title ?? ""} | ${ind.computedActual ?? ind.actual} | ${ind.targetValue} | ${apiRating} | ${expected} | ${pass ? "PASS" : "FAIL"} |`
      );
    }
  }
  lines.push("");

  const check = (label: string, actual: unknown, expected: number) => {
    const pass = nearEqual(toNumber(actual, NaN), expected);
    if (!pass) allPass = false;
    lines.push(`| ${label} | ${actual} | ${expected} | ${pass ? "PASS" : "FAIL"} |`);
    console.log(`${pass ? "PASS" : "FAIL"}: ${label} — got ${actual}, expected ${expected}`);
    return pass;
  };

  lines.push("### Totals");
  lines.push("");
  lines.push("| Check | Actual | Expected | Result |");
  lines.push("|-------|--------|----------|--------|");
  check("Section blend", data.scores?.sectionBlendScore, expectedSectionBlend);
  check("Final score", data.scores?.finalScore, expectedFinal);
  lines.push("");
  lines.push(allPass ? "**RESULT: PASS**" : "**RESULT: FAIL** — see rows above.");
  lines.push("");

  await fs.promises.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.promises.writeFile(LOG_PATH, lines.join("\n") + "\n");
  console.log(`\nLog: ${LOG_PATH}`);

  if (!allPass) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
