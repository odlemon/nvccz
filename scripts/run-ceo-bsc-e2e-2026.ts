/**
 * CEO scorecard + BSC data-entry E2E (HTTP + Prisma).
 *
 * Prerequisites: DB matches API (same DATABASE_URL). Server running at API_BASE.
 * Seed indicators: npm run db:seed:ceo-performance-contract (CEO_SEED_YEAR=2026)
 *
 * Auth: set E2E_LOGIN_PASSWORD (and optional E2E_LOGIN_EMAIL). If password unknown:
 *   npx ts-node scripts/set-user-password-by-id.ts <userId> <newPassword>
 *
 * Usage:
 *   npx ts-node scripts/run-ceo-bsc-e2e-2026.ts
 *   E2E_LOGIN_PASSWORD=secret npx ts-node scripts/run-ceo-bsc-e2e-2026.ts
 *
 * Optional: API_BASE (default http://localhost:$PORT), E2E_YEAR (default 2026),
 * E2E_CONTINUE_ON_ERROR=1 to run all steps after failures.
 *
 * CEO scorecards are built only from **performance_goals** linked to the CEO contract (`performanceContractId`).
 * This script logs a **full goal inventory** (baseline + after) so you can see every indicator that drives the CEO card.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/utils/database";

const YEAR = parseInt(process.env.E2E_YEAR || "2026", 10);
const API_BASE = (process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || "3000"}`).replace(
  /\/$/,
  ""
);
const CONTINUE_ON_ERROR = process.env.E2E_CONTINUE_ON_ERROR === "1" || process.env.E2E_CONTINUE_ON_ERROR === "true";
const LOG_PATH = path.join(process.cwd(), "tracking", "ceo-bsc-e2e-log.md");

function utcYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

type LogSection = string[];

type GoalRow = {
  id: string;
  title: string | null;
  formulaType: string | null;
  scorecardSection: string | null;
  displayOrder: number;
  targetValue: unknown;
  currentValue: unknown;
  syncConfig: unknown;
};

function bscKindFromGoal(g: { syncConfig?: unknown }): string {
  const sc =
    g.syncConfig && typeof g.syncConfig === "object" && !Array.isArray(g.syncConfig)
      ? (g.syncConfig as Record<string, unknown>)
      : null;
  return sc && typeof sc.bscEntryKind === "string" ? sc.bscEntryKind : "";
}

function mdCell(s: string): string {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function pushGoalsInventory(lines: LogSection, heading: string, rows: GoalRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const sa = String(a.scorecardSection || "");
    const sb = String(b.scorecardSection || "");
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });
  lines.push(heading);
  lines.push("");
  lines.push(
    "| id | section | title | formulaType | target | current | bscEntryKind |"
  );
  lines.push("|----|---------|-------|-------------|--------|---------|--------------|");
  for (const g of sorted) {
    lines.push(
      `| ${mdCell(g.id)} | ${mdCell(String(g.scorecardSection ?? ""))} | ${mdCell(String(g.title ?? ""))} | ${mdCell(String(g.formulaType ?? ""))} | ${mdCell(String(g.targetValue ?? ""))} | ${mdCell(String(g.currentValue ?? ""))} | ${mdCell(bscKindFromGoal(g))} |`
    );
  }
  lines.push("");
}

function summariseScorecardPayload(data: any): Record<string, unknown> {
  if (!data || typeof data !== "object") return { error: "no data" };
  const sections = data.sections || {};
  const secScores: Record<string, unknown> = {};
  for (const k of Object.keys(sections)) {
    const s = sections[k];
    secScores[k] = {
      sectionScore: s?.sectionScore,
      label: s?.performanceLabel,
      indicatorCount: Array.isArray(s?.indicators) ? s.indicators.length : 0
    };
  }
  let indicatorTotal = 0;
  for (const k of Object.keys(sections)) {
    indicatorTotal += Array.isArray(sections[k]?.indicators) ? sections[k].indicators.length : 0;
  }
  return {
    finalScore: data.scores?.finalScore,
    performanceLabel: data.scores?.performanceLabel,
    sectionBlendScore: data.scores?.sectionBlendScore,
    sectionScores: data.scores?.sectionScores,
    sectionSummary: secScores,
    totalIndicatorsSummarised: indicatorTotal,
    warnings: data.warnings,
    contractId: data.contract?.id
  };
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

async function main() {
  const lines: LogSection = [];
  const { periodStart, periodEnd, periodLabel } = utcYearBounds(YEAR);

  lines.push(`## CEO BSC E2E run`);
  lines.push("");
  lines.push(`- **Timestamp:** ${new Date().toISOString()}`);
  lines.push(`- **API_BASE:** ${API_BASE}`);
  lines.push(`- **E2E_YEAR:** ${YEAR}`);
  lines.push(`- **CONTINUE_ON_ERROR:** ${CONTINUE_ON_ERROR}`);
  lines.push("");

  const ceoUser =
    process.env.E2E_LOGIN_EMAIL?.trim() ?
      await prisma.user.findUnique({
        where: { email: process.env.E2E_LOGIN_EMAIL.trim().toLowerCase() },
        select: { id: true, email: true, firstName: true, lastName: true }
      })
    : await resolveCeoUser();

  if (!ceoUser?.email) {
    lines.push("**FATAL:** Could not resolve CEO user. Set E2E_LOGIN_EMAIL.");
    await appendLog(lines);
    console.error(lines.join("\n"));
    process.exit(1);
  }

  const password = process.env.E2E_LOGIN_PASSWORD || "";
  if (!password) {
    lines.push("**FATAL:** E2E_LOGIN_PASSWORD is not set.");
    lines.push(
      `Set a password first, e.g. \`npx ts-node scripts/set-user-password-by-id.ts ${ceoUser.id} <newPassword>\`, then export E2E_LOGIN_PASSWORD.`
    );
    await appendLog(lines);
    console.error(lines.join("\n"));
    process.exit(1);
  }

  lines.push(`- **Login user:** ${ceoUser.email} (${ceoUser.id})`);
  lines.push("");

  const contract = await prisma.performanceContract.findFirst({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      subjectUserId: ceoUser.id,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!contract) {
    lines.push(`**FATAL:** No CEO performance contract overlapping ${periodLabel}.`);
    await appendLog(lines);
    console.error(lines.join("\n"));
    process.exit(1);
  }

  const goalCount = await prisma.performanceGoal.count({
    where: { performanceContractId: contract.id }
  });

  lines.push(`- **CEO contract id:** ${contract.id}`);
  lines.push(`- **Goals on contract:** ${goalCount}`);
  lines.push("");

  async function loadContractGoals(contractId: string): Promise<GoalRow[]> {
    return prisma.performanceGoal.findMany({
      where: { performanceContractId: contractId },
      select: {
        id: true,
        title: true,
        formulaType: true,
        scorecardSection: true,
        displayOrder: true,
        targetValue: true,
        currentValue: true,
        syncConfig: true
      }
    });
  }

  const goalRows = await loadContractGoals(contract.id);

  const byFormula = new Map<string, string>();
  for (const g of goalRows) {
    const k = String(g.formulaType || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    if (k && !byFormula.has(k)) byFormula.set(k, g.id);
  }

  function need(formula: string): string {
    const id = byFormula.get(formula.toUpperCase());
    if (!id) throw new Error(`No goal with formulaType ${formula} on CEO contract`);
    return id;
  }

  let token: string;
  try {
    token = await login(ceoUser.email, password);
    lines.push("### Auth");
    lines.push("");
    lines.push("| Step | Result |");
    lines.push("|------|--------|");
    lines.push("| Login | OK |");
    lines.push("");
    pushGoalsInventory(
      lines,
      "### CEO contract goals — baseline (all rows drive the CEO scorecard)",
      goalRows
    );
  } catch (e: any) {
    lines.push("### Auth");
    lines.push("");
    lines.push(`**Login failed:** ${e?.message || e}`);
    lines.push("");
    await appendLog(lines);
    console.error(e);
    process.exit(1);
  }

  const periodFields = { periodLabel, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };

  /** Avoid false match on "Debt–equity ratio" (title contains "equity"). */
  const inclusionDiversityGoal = goalRows.find((g) => {
    const t = String(g.title || "").toLowerCase();
    if (t.includes("debt") && t.includes("equity")) return false;
    return (
      t.includes("diversity") ||
      t.includes("inclusion") ||
      (t.includes("equity") && !t.includes("debt")) ||
      /inclusive programming/i.test(g.title || "")
    );
  });
  /**
   * BSC assertGoalMatchesEntryKind for INCLUSION_DIVERSITY needs "inclusion" / "diversity" / "equity" in title haystack.
   * "Inclusive programming" does not contain substring "inclusion", so API rejects — only run when title matches.
   */
  const canRunInclusionDiversity =
    inclusionDiversityGoal &&
    (() => {
      const t = [
        inclusionDiversityGoal.title,
        inclusionDiversityGoal.formulaType
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (t.includes("debt") && t.includes("equity")) return false;
      return t.includes("diversity") || t.includes("inclusion") || (t.includes("equity") && !t.includes("debt"));
    })();

  const steps: { name: string; path: string; body: Record<string, unknown> }[] = [];

  try {
    steps.push({
      name: "financial-outcome-roi",
      path: "/api/performance/bsc-entry/financial-outcome-roi",
      body: {
        goalId: need("ROI"),
        netProfit: 240_000,
        totalCapitalInvested: 2_000_000,
        currencyCode: "USD",
        skipCeoBoardMirror: true,
        ...periodFields
      }
    });
    steps.push({
      name: "internal-process-funding-rate",
      path: "/api/performance/bsc-entry/internal-process-funding-rate",
      body: {
        goalId: need("FUNDING_RATE"),
        projectsFunded: 40,
        projectsApproved: 50,
        ...periodFields
      }
    });
    steps.push({
      name: "internal-process-projects-funded-output",
      path: "/api/performance/bsc-entry/internal-process-funding-rate",
      body: {
        goalId: need("PROJECTS_FUNDED"),
        projectsFunded: 18,
        projectsApproved: 20,
        ...periodFields
      }
    });
    steps.push({
      name: "internal-process-capital-disbursed",
      path: "/api/performance/bsc-entry/internal-process-funding-rate",
      body: {
        goalId: need("CAPITAL_DISBURSED"),
        projectsFunded: 85,
        projectsApproved: 100,
        ...periodFields
      }
    });
    steps.push({
      name: "stakeholder-survey",
      path: "/api/performance/bsc-entry/stakeholder-survey",
      body: {
        goalId: need("CUSTOMER_SATISFACTION_INDEX"),
        averageScore: 3.92,
        scoreTotal: 5,
        previousAverageScore: 3.5,
        ...periodFields
      }
    });
    steps.push({
      name: "service-delivery-customer-charter",
      path: "/api/performance/bsc-entry/service-delivery-customer-charter",
      body: {
        goalId: need("CHARTER_SCORE"),
        addPercent: 2,
        charterAvailableLocalLanguages: true,
        supportingDocumentUrls: ["https://example.com/evidence/charter-support-2026.pdf"],
        ...periodFields
      }
    });
    steps.push({
      name: "resource-budget-alignment",
      path: "/api/performance/bsc-entry/resource-budget-alignment",
      body: {
        goalId: need("STRATEGIC_ALLOCATION_COMPLIANCE"),
        actualSpend: 68_000_000,
        strategicAllocation: 100_000_000,
        criticalOverspendPercent: 15,
        currencyCode: "ZiG",
        ...periodFields
      }
    });

    /** GL net-profit push requires goal title/KPI to match “profit” / “earnings” hints; seed “EBIT” alone does not. */
    const netProfitGlGoal = goalRows.find((g) => {
      const t = `${g.title || ""} ${g.formulaType || ""}`.toLowerCase();
      return (
        t.includes("net profit") ||
        (t.includes("profit") && !/^ebit$/i.test(String(g.title || "").trim())) ||
        t.includes("earnings")
      );
    });
    if (byFormula.has("REVENUE_GROWTH")) {
      steps.push({
        name: "accounting-period-from-gl",
        path: "/api/performance/bsc-entry/accounting-period-from-gl",
        body: {
          periodStart: periodFields.periodStart,
          periodEnd: periodFields.periodEnd,
          periodLabel: periodFields.periodLabel,
          revenueGoalId: need("REVENUE_GROWTH"),
          ...(netProfitGlGoal ? { netProfitGoalId: netProfitGlGoal.id } : {}),
          currencyCode: "USD"
        }
      });
    }

    if (canRunInclusionDiversity && inclusionDiversityGoal) {
      steps.push({
        name: "inclusion-diversity-reporting",
        path: "/api/performance/bsc-entry/inclusion-diversity-reporting",
        body: {
          goalId: inclusionDiversityGoal.id,
          groupCounts: { women: 42, men: 38, youth: 25 },
          ...periodFields
        }
      });
    }
  } catch (e: any) {
    lines.push(`**Goal map error:** ${e?.message || e}`);
    lines.push("");
    lines.push(
      "Available formula types on contract:",
      [...new Set(goalRows.map((g) => g.formulaType))].join(", ")
    );
    await appendLog(lines);
    console.error(e);
    process.exit(1);
  }

  const cleanEnvGoal = goalRows.find((g) => /clean environment/i.test(g.title || ""));
  if (cleanEnvGoal) {
    steps.push({
      name: "csr-participation-rate",
      path: "/api/performance/bsc-entry/csr-participation-rate",
      body: {
        goalId: cleanEnvGoal.id,
        participantsCompleted: 46,
        participantsEligible: 50,
        ...periodFields
      }
    });
  }

  steps.push({
    name: "statutory-reports-output",
    path: "/api/performance/bsc-entry/statutory-reports-output",
    body: {
      goalId: need("STATUTORY_REPORTS"),
      incrementBy: 1,
      evidenceDocumentUrl: "https://example.com/evidence/statutory-report-2026.pdf",
      ...periodFields
    }
  });
  steps.push({
    name: "governance-checklist-score",
    path: "/api/performance/bsc-entry/governance-checklist-score",
    body: {
      goalId: need("CORPORATE_GOVERNANCE_INDEX"),
      complianceItemsMet: 23,
      totalGovernanceRequirements: 25,
      ...periodFields
    }
  });
  steps.push({
    name: "ease-of-doing-business-progress",
    path: "/api/performance/bsc-entry/ease-of-doing-business-progress",
    body: {
      goalId: need("EASE_OF_DOING_BUSINESS"),
      innovationsCompleted: 2,
      targetInnovations: 3,
      ...periodFields
    }
  });
  if (byFormula.has("E_GOVERNMENT_FLAGSHIPS")) {
    steps.push({
      name: "ease-of-doing-business-e-government-flagships",
      path: "/api/performance/bsc-entry/ease-of-doing-business-progress",
      body: {
        goalId: need("E_GOVERNMENT_FLAGSHIPS"),
        innovationsCompleted: 1,
        targetInnovations: 2,
        ...periodFields
      }
    });
  }

  lines.push("### Skipped (no matching seeded goal or needs multipart/GL)");
  lines.push("");
  lines.push(
    "- partnerships-signed (no partnership/MOU goal in CEO seed)",
    "- jobs-created-aggregate (no goal whose title matches jobs-created BSC hints in CEO seed)",
    "- procurement-plan-compliance (no procurement goal in CEO seed)",
    "- skills-development-progress (no skills/certificate goal in CEO seed)",
    "- accounting-period-from-gl net-profit half (skipped if no goal matches BSC net-profit hints; **Revenue growth** GL push runs when present)",
    "- inclusion-diversity-reporting (skipped unless a goal title contains diversity / inclusion / (non-debt) equity; CEO seed \"Inclusive programming\" fails BSC validation)",
    ""
  );

  lines.push("### BSC entry calls");
  lines.push("");
  lines.push("| Endpoint | HTTP | Message / note |");
  lines.push("|----------|------|----------------|");

  let hadFailure = false;
  for (const s of steps) {
    const { status, json } = await apiJson(token, "POST", s.path, s.body);
    const ok = status >= 200 && status < 300 && json?.success !== false;
    const msg = json?.message || (ok ? "OK" : JSON.stringify(json).slice(0, 200));
    lines.push(`| ${s.name} | ${status} | ${String(msg).replace(/\|/g, "\\|")} |`);
    if (!ok) {
      hadFailure = true;
      console.error(`FAIL ${s.name} ${status}`, json);
      if (!CONTINUE_ON_ERROR) break;
    }
  }
  lines.push("");

  const snap = await apiJson(
    token,
    "GET",
    `/api/performance/scorecards/ceo?periodLabel=${encodeURIComponent(periodLabel)}`
  );
  lines.push("### CEO scorecard preview (GET)");
  lines.push("");
  lines.push(`- **HTTP:** ${snap.status}`);
  lines.push(`- **Summary:** \`${JSON.stringify(summariseScorecardPayload(snap.json?.data), null, 0)}\``);
  lines.push("");

  const gen = await apiJson(token, "POST", "/api/performance/scorecards/ceo/generate", {
    periodLabel,
    sectionBlendMode: "redistribute"
  });
  lines.push("### CEO scorecard generate (POST)");
  lines.push("");
  lines.push(`- **HTTP:** ${gen.status}`);
  lines.push(`- **success:** ${gen.json?.success}`);
  lines.push(`- **message:** ${gen.json?.message || ""}`);
  lines.push(`- **savedRecord.id:** ${gen.json?.data?.savedRecord?.id || "n/a"}`);
  lines.push(
    `- **scores snapshot:** \`${JSON.stringify(summariseScorecardPayload(gen.json?.data), null, 0)}\``
  );
  lines.push("");

  const goalsAfter = await loadContractGoals(contract.id);
  pushGoalsInventory(
    lines,
    "### CEO contract goals — after BSC + generate (every row affects CEO scorecard calculations)",
    goalsAfter
  );

  lines.push("### Result");
  lines.push("");
  lines.push(
    hadFailure ?
      "- **BSC steps:** at least one failure (see table). Check CONTINUE_ON_ERROR."
    : "- **BSC steps:** all returned success."
  );
  lines.push(
    gen.status >= 200 && gen.status < 300 && gen.json?.success ?
      "- **Generate:** OK"
    : "- **Generate:** FAILED — inspect HTTP body above."
  );
  lines.push("");

  await appendLog(lines);

  if (hadFailure && !CONTINUE_ON_ERROR) process.exit(1);
  if (!(gen.status >= 200 && gen.status < 300 && gen.json?.success)) process.exit(1);
}

async function appendLog(lines: string[]) {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const chunk = "\n" + lines.join("\n") + "\n";
  await fs.promises.appendFile(LOG_PATH, chunk, "utf8");
  console.log(`Appended run log to ${LOG_PATH}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
