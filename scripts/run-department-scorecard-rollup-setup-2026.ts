/**
 * Ensure employee PCs + scorecards exist for goal assignees, then generate department scorecard
 * with roll-up data (DRAFT employee cards included).
 *
 * Usage:
 *   DEPT_SCORECARD_DEPARTMENT=Finance npm run uat:department-scorecard-rollup-setup
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { createEmployeePerformanceContractInTransaction } from "../src/services/PerformanceContractSetupService";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";
import {
  EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS,
  isCEO
} from "../src/services/performanceScorecardSupport";

const YEAR = parseInt(process.env.DEPT_YEAR || process.env.HDF_YEAR || "2026", 10);
const DEPT = (process.env.DEPT_SCORECARD_DEPARTMENT || "Finance").trim();
const API_BASE = (process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || "3000"}`).replace(
  /\/$/,
  ""
);
const LOGIN_EMAIL = (process.env.HDF_LOGIN_EMAIL || "admin@nts.com").trim().toLowerCase();
const LOGIN_PASSWORD = process.env.HDF_LOGIN_PASSWORD || "admin123";

function utcYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    periodLabel: String(year)
  };
}

async function login(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(`Login failed: ${j.message || r.status}`);
  return j.token;
}

async function main() {
  const { periodStart, periodEnd, periodLabel } = utcYearBounds(YEAR);

  const admin = await prisma.user.findUnique({
    where: { email: LOGIN_EMAIL },
    include: { role: true }
  });
  if (!admin) throw new Error(`Admin not found: ${LOGIN_EMAIL}`);

  const deptGoals = await prisma.performanceGoal.findMany({
    where: {
      type: "department",
      departmentName: DEPT,
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart }
    },
    select: { id: true, title: true }
  });
  const deptGoalIds = deptGoals.map((g) => g.id);

  const childGoals = deptGoalIds.length
    ? await prisma.performanceGoal.findMany({
        where: {
          type: "individual",
          parentGoalId: { in: deptGoalIds },
          assignedToId: { not: null }
        },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, userDepartment: true }
          }
        }
      })
    : [];

  const assigneeIds = [...new Set(childGoals.map((g) => g.assignedToId!).filter(Boolean))];
  console.log(`Department: ${DEPT} | dept goals: ${deptGoals.length} | child individual goals: ${childGoals.length}`);
  console.log(`Assignees to cover: ${assigneeIds.length}`);

  let contractsCreated = 0;
  let contractsExisting = 0;

  for (const userId of assigneeIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, userDepartment: true }
    });
    if (!user) continue;

    const existing = await prisma.performanceContract.findFirst({
      where: {
        contractType: "EMPLOYEE",
        subjectUserId: userId,
        status: { notIn: ["ARCHIVED", "CANCELLED"] },
        periodStart,
        periodEnd
      }
    });

    if (existing) {
      contractsExisting++;
      console.log(`  PC exists: ${user.firstName} ${user.lastName}`);
    } else {
      await prisma.$transaction((tx) =>
        createEmployeePerformanceContractInTransaction(tx, {
          subjectUserId: userId,
          departmentName: user.userDepartment || DEPT,
          createdById: admin.id,
          employeeFirstName: user.firstName || "",
          employeeLastName: user.lastName || "",
          periodYear: YEAR,
          periodLabel,
          rejectIfDuplicate: false
        })
      );
      contractsCreated++;
      console.log(`  PC created: ${user.firstName} ${user.lastName}`);
    }
  }

  let employeeGenerated = 0;
  for (const userId of assigneeIds) {
    try {
      await PerformanceScorecardService.getEmployeeScorecard({
        viewer: admin,
        employeeUserId: userId,
        periodLabel,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        persist: true,
        meta: {}
      });
      employeeGenerated++;
      console.log(`  Employee scorecard generated: ${userId}`);
    } catch (e: any) {
      console.error(`  Employee scorecard FAILED ${userId}: ${e?.message || e}`);
    }
  }

  const deptContract = await prisma.performanceContract.findFirst({
    where: {
      contractType: "DEPARTMENT",
      departmentName: DEPT,
      status: { notIn: ["ARCHIVED", "CANCELLED"] },
      periodStart,
      periodEnd
    },
    orderBy: { updatedAt: "desc" }
  });

  if (deptContract && !deptContract.reviewerUserId) {
    const ceo = await prisma.user.findMany({
      take: 30,
      include: { role: true }
    });
    const ceoUser = ceo.find((u) => isCEO(u));
    if (ceoUser) {
      await prisma.performanceContract.update({
        where: { id: deptContract.id },
        data: { reviewerUserId: ceoUser.id }
      });
      console.log(`  Department contract reviewer set: ${ceoUser.firstName} ${ceoUser.lastName}`);
    }
  }

  const token = await login();

  const qualBody = {
    periodLabel,
    qualitativeEvaluation: {
      personalAttributes: [
        {
          attribute: "Leadership and Management",
          columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label) => ({
            label,
            selected: label === "Satisfactory"
          }))
        }
      ]
    }
  };
  const qualRes = await fetch(
    `${API_BASE}/api/performance/scorecards/department/${encodeURIComponent(DEPT)}/qualitative-evaluation`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(qualBody)
    }
  );
  const qualJson = await qualRes.json().catch(() => ({}));
  if (!qualRes.ok || !qualJson.success) {
    throw new Error(`Qualitative PUT failed ${qualRes.status}: ${JSON.stringify(qualJson)}`);
  }
  const lm = qualJson.data?.qualitativeEvaluation?.personalAttributes?.find(
    (r: any) => r.attribute === "Leadership and Management"
  );
  const satSelected = lm?.columns?.find((c: any) => c.label === "Satisfactory")?.selected;
  console.log(`  Qualitative PUT: Leadership → Satisfactory selected=${satSelected}`);
  if (satSelected !== true) {
    throw new Error("Qualitative PUT did not persist Satisfactory selection");
  }

  const r = await fetch(
    `${API_BASE}/api/performance/scorecards/department/${encodeURIComponent(DEPT)}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ periodLabel })
    }
  );
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.success) {
    throw new Error(`Department generate failed ${r.status}: ${JSON.stringify(body)}`);
  }

  const rollup = body.data?.rollupSummary || [];
  const goals = body.data?.goals || [];
  const withScore = rollup.filter((x: any) => x.finalScore != null);
  const childContrib = goals.flatMap((g: any) => g.childContributions || []);

  console.log("\n--- Department scorecard result ---");
  console.log(`departmentScore: ${body.data?.scores?.departmentScore}`);
  console.log(`rollup rows with finalScore: ${withScore.length} / ${rollup.length}`);
  console.log(`childContributions on goals: ${childContrib.length}`);
  console.log(`contract.reviewer: ${body.data?.contract?.reviewer?.name ?? body.data?.contract?.reviewer ?? "null"}`);

  for (const row of rollup) {
    console.log(
      `  ${row.employeeName}: finalScore=${row.finalScore} rollupWeight=${row.rollupWeight} weighted=${row.weightedContribution}`
    );
  }

  if (assigneeIds.length > 0 && withScore.length === 0) {
    console.error("\nFAIL: Expected at least one roll-up row with finalScore after employee generate.");
    process.exit(1);
  }

  const ashleyRow = rollup.find((x: any) => String(x.employeeName).includes("Ashley"));
  if (childGoals.some((g) => g.assignedTo?.firstName === "Ashley") && ashleyRow?.finalScore == null) {
    console.error("\nFAIL: Ashley has a child goal but roll-up finalScore is still null.");
    process.exit(1);
  }

  const docQual =
    body.data?.document?.qualitativeSections?.personalAttributes ||
    body.data?.qualitativeSections?.personalAttributes;
  const genLm = docQual?.find((r: any) => r.attribute === "Leadership and Management");
  const genSat = genLm?.columns?.find((c: any) => c.label === "Satisfactory")?.selected;
  if (genSat !== true) {
    console.error("\nFAIL: Generate did not include saved qualitative evaluation.");
    process.exit(1);
  }

  console.log("\nPASS: Department scorecard roll-up and qualitative evaluation.");
  console.log(
    JSON.stringify({
      contractsCreated,
      contractsExisting,
      employeeGenerated,
      departmentScore: body.data?.scores?.departmentScore
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
