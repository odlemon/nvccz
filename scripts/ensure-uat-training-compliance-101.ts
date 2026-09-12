/**
 * UAT wiring for "Training Completion Sync":
 * - Ensure a real employee user has an ACTIVE EMPLOYEE performance contract for 2026
 * - Ensure an individual Learning, Growth & HR goal configured as TASK_COMPLETION exists
 * - Ensure a task titled "Compliance 101" exists and is linked to that goal
 *
 * After running:
 * - Mark the task completed (PUT /api/tasks/:id/stage {stage:"completed"})
 * - Refresh employee scorecard preview/generate to observe Learning & Growth movement
 *
 * Run:
 *   npx ts-node --transpile-only scripts/ensure-uat-training-compliance-101.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { createEmployeePerformanceContractInTransaction } from "../src/services/PerformanceContractSetupService";
import { Decimal } from "@prisma/client/runtime/library";

const PERIOD_LABEL = "2026";
const PERIOD_START = new Date("2026-01-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-12-31T23:59:59.999Z");

const GOAL_TITLE = "UAT — Compliance 101 Training Completion";
const TASK_TITLE = "Compliance 101";

async function main() {
  const actor = await prisma.user.findFirst({ orderBy: { id: "asc" }, include: { role: true } });
  if (!actor?.role) throw new Error("No user with role found (need actor).");

  // Pick an active, non-terminated payroll employee user.
  const emp = await prisma.employee.findFirst({
    where: { isActive: true, terminated: false },
    select: { userId: true }
  });
  if (!emp?.userId) throw new Error("No active non-terminated employee found.");

  const subjectUser = await prisma.user.findUnique({
    where: { id: emp.userId },
    select: { id: true, firstName: true, lastName: true, userDepartment: true }
  });
  if (!subjectUser) throw new Error("Employee user not found.");

  // Ensure ACTIVE employee performance contract for the year (required for BSC).
  const contract = await prisma.$transaction(async (tx) => {
    const out = await createEmployeePerformanceContractInTransaction(tx as any, {
      subjectUserId: subjectUser.id,
      departmentName: subjectUser.userDepartment ?? null,
      createdById: actor.id,
      employeeFirstName: subjectUser.firstName ?? "",
      employeeLastName: subjectUser.lastName ?? "",
      periodLabel: PERIOD_LABEL,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      rejectIfDuplicate: false
    });
    return out.contract;
  });

  // Ensure an individual goal in Learning, Growth & HR configured as task-based progress.
  let goal = await prisma.performanceGoal.findFirst({
    where: { title: GOAL_TITLE },
    select: { id: true, assignedToId: true, formulaType: true }
  });

  if (!goal) {
    goal = await prisma.performanceGoal.create({
      data: {
        title: GOAL_TITLE,
        description:
          "UAT wiring: task-based goal for training completion. Completing the linked task increments actual.",
        type: "individual",
        scorecardPillar: "Learning, Growth & HR",
        pillarId: "bsc_learning_growth_hr",
        assignedToId: subjectUser.id,
        createdById: actor.id,
        startDate: PERIOD_START,
        endDate: PERIOD_END,
        status: "active",
        stage: "in_progress",
        // Task-based scoring path in PerformanceScorecardService
        formulaType: "TASK_COMPLETION",
        // Weight on employee scorecard (the “completion weight” UAT refers to).
        scorecardWeight: new Decimal(10),
        activities: { taskBasedProgress: true }
      },
      select: { id: true, assignedToId: true, formulaType: true }
    });
  }

  // Ensure the task exists and is linked to the goal.
  let task = await prisma.task.findFirst({
    where: {
      isTrashed: false,
      goalId: goal.id,
      title: TASK_TITLE
    },
    select: { id: true, title: true, stage: true, goalId: true, updatedAt: true }
  });

  if (!task) {
    task = await prisma.task.create({
      data: {
        title: TASK_TITLE,
        description: "UAT: mark as completed to increment Learning & Growth score.",
        stage: "todo",
        priority: "medium",
        date: new Date(),
        performanceCategory: "performance",
        isPerformanceTask: true,
        isTrashed: false,
        goalId: goal.id,
        createdBy: actor.id
      } as any,
      select: { id: true, title: true, stage: true, goalId: true, updatedAt: true }
    });
  }

  console.log(
    JSON.stringify(
      {
        employeeUser: {
          id: subjectUser.id,
          name: `${subjectUser.firstName ?? ""} ${subjectUser.lastName ?? ""}`.trim()
        },
        contract: { id: contract.id, status: contract.status, periodLabel: contract.periodLabel },
        goal: { id: goal.id, title: GOAL_TITLE, formulaType: goal.formulaType, scorecardWeight: 10 },
        task,
        postman: {
          markTaskCompleted: {
            method: "PUT",
            path: `/api/tasks/${task.id}/stage`,
            body: { stage: "completed" }
          },
          previewEmployeeScorecard: {
            method: "GET",
            path: `/api/performance/scorecards/employee/${subjectUser.id}`,
            note: "Look for the row with goalName = UAT — Compliance 101 Training Completion and its progress/weighted score."
          },
          generateEmployeeScorecard: {
            method: "POST",
            path: `/api/performance/scorecards/employee/${subjectUser.id}/generate`,
            body: { periodLabel: PERIOD_LABEL }
          }
        }
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

