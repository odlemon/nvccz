/**
 * Calls all four scorecard builders (same logic as GET preview / POST generate) and prints a compact summary.
 *
 * Usage:
 *   npx ts-node scripts/smoke-performance-scorecards-all.ts
 *
 * Env:
 *   PERIOD_LABEL (default 2026)
 *   PERIOD_START / PERIOD_END (optional ISO; default annual 2026)
 *   DEPT_NAME (optional; default first DEPARTMENT contract for period)
 *   EMPLOYEE_USER_ID (optional; default first EMPLOYEE contract subject for period)
 *
 * Uses persist=false to avoid "already finalised" errors while still exercising calculation paths.
 *
 * Diagnostics: the service resolves Board/CEO contracts by **date overlap** with the requested window
 * or by **periodLabel** (exact or same calendar year, e.g. FY 2026 ↔ 2026). If this script reports
 * "no board contract" but you created one, check `performance_contracts.contract_type`, `period_label`,
 * and that `period_start`/`period_end` overlap the requested year.
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";
import {
  isAdminViewer,
  isCEO,
  isDepartmentManager,
  isHRLeader
} from "../src/services/performanceScorecardSupport";

function pickViewer(users: any[], departmentName?: string) {
  return (
    users.find((u) => isAdminViewer(u) || isCEO(u) || isHRLeader(u)) ||
    (departmentName ? users.find((u) => isDepartmentManager(u, departmentName)) : undefined) ||
    users[0]
  );
}

function scoresSummary(payload: any) {
  const s = payload?.scores;
  if (!s) return null;
  return {
    finalScore: s.finalScore,
    performanceLabel: s.performanceLabel,
    sectionBlendScore: s.sectionBlendScore,
    sectionScores: s.sectionScores,
    budgetScore: s.budgetScore,
    budgetIncluded: s.budgetIncluded
  };
}

async function main() {
  const periodLabel = process.env.PERIOD_LABEL || "2026";
  const periodStart = process.env.PERIOD_START || "2026-01-01T00:00:00.000Z";
  const periodEnd = process.env.PERIOD_END || "2026-12-31T23:59:59.999Z";

  const users = await prisma.user.findMany({
    take: 120,
    include: { role: true }
  });

  const deptContract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "DEPARTMENT",
      periodLabel,
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: { departmentName: true }
  });
  const departmentName = process.env.DEPT_NAME || deptContract?.departmentName || "Finance";

  const empContract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "EMPLOYEE",
      periodLabel,
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: { subjectUserId: true }
  });
  const employeeUserId = process.env.EMPLOYEE_USER_ID || empContract?.subjectUserId;

  const viewer = pickViewer(users, departmentName);
  if (!viewer) {
    console.error("No users in DB.");
    process.exit(1);
  }

  const boardRows = await prisma.performanceContract.findMany({
    where: {
      contractType: { in: ["BOARD", "board"] },
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: { id: true, periodLabel: true, periodStart: true, periodEnd: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20
  });

  const ceoRows = await prisma.performanceContract.findMany({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      status: { notIn: ["ARCHIVED", "CANCELLED"] }
    },
    select: { id: true, periodLabel: true, periodStart: true, periodEnd: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20
  });

  const base = { periodStart, periodEnd, periodLabel, persist: false, meta: {} as any };
  const out: Record<string, unknown> = {
    viewerId: viewer.id,
    periodLabel,
    departmentName,
    employeeUserId: employeeUserId || "(none — skip employee)",
    diagnostics: {
      boardContractsInDb: boardRows.length,
      recentBoardContracts: boardRows.slice(0, 5),
      ceoContractsInDb: ceoRows.length,
      recentCeoContracts: ceoRows.slice(0, 5)
    }
  };

  try {
    const board = await PerformanceScorecardService.getBoardScorecard({ viewer, ...base });
    out.board = {
      scorecardType: board.scorecardType,
      scores: scoresSummary(board),
      warningsCount: board.warnings?.length ?? 0
    };
  } catch (e: any) {
    out.board = { error: e?.message || String(e) };
  }

  try {
    const ceo = await PerformanceScorecardService.getCEOScorecard({ viewer, ...base });
    out.ceo = {
      scorecardType: ceo.scorecardType,
      scores: scoresSummary(ceo),
      warningsCount: ceo.warnings?.length ?? 0
    };
  } catch (e: any) {
    out.ceo = { error: e?.message || String(e) };
  }

  try {
    const dept = await PerformanceScorecardService.getDepartmentScorecard({
      viewer,
      departmentName,
      ...base
    });
    out.department = {
      scorecardType: dept.scorecardType,
      department: dept.department,
      scores: scoresSummary(dept),
      warningsCount: dept.warnings?.length ?? 0
    };
  } catch (e: any) {
    out.department = { error: e?.message || String(e) };
  }

  if (employeeUserId) {
    try {
      const emp = await PerformanceScorecardService.getEmployeeScorecard({
        viewer,
        employeeUserId,
        ...base
      });
      out.employee = {
        scorecardType: emp.scorecardType,
        scores: scoresSummary(emp),
        warningsCount: emp.warnings?.length ?? 0,
        goalCount: emp.goals?.length ?? 0
      };
    } catch (e: any) {
      out.employee = { error: e?.message || String(e) };
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
