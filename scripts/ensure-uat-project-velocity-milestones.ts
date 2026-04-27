/**
 * UAT wiring: Project Completion Rate / Project Velocity KPI (Internal Ops)
 *
 * Requirement:
 * - Move 3 milestones to "Done" in task module.
 * - Internal Ops pillar updates the "Project Velocity" KPI.
 * - Logic counts completed milestones vs total milestones.
 *
 * Implementation approach (matches existing backend roll-up):
 * - Create a company goal with targetValue = 100 (interpreted as 100%).
 * - Link N milestone tasks to that goal; each completed task contributes 100%, todo contributes 0%.
 * - Goal currentValue becomes completionRatePct (completed/total * 100).
 *
 * Run:
 *   npx ts-node --transpile-only scripts/ensure-uat-project-velocity-milestones.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";

const KPI_NAME = "Project Velocity";
const GOAL_TITLE = "UAT — Project Velocity (Milestone completion rate)";
const PILLAR = "Internal Operations";

const MILESTONE_COUNT = 5;

async function main() {
  const actor = await prisma.user.findFirst({ orderBy: { id: "asc" }, include: { role: true } });
  if (!actor) throw new Error("No user found to own the UAT records.");

  let kpi = await prisma.kPI.findFirst({
    where: { name: KPI_NAME },
    select: { id: true, name: true, type: true, isReverseKpi: true, scorecardPillar: true, isActive: true }
  });
  if (!kpi) {
    kpi = await prisma.kPI.create({
      data: {
        name: KPI_NAME,
        type: "Percentage",
        hasUnit: true,
        unitCategory: "Percentage",
        unit: "%",
        unitSymbol: "%",
        unitPosition: "suffix",
        isReverseKpi: false,
        isActive: true,
        scorecardPillar: PILLAR
      },
      select: { id: true, name: true, type: true, isReverseKpi: true, scorecardPillar: true, isActive: true }
    });
  } else if (!kpi.isActive || kpi.scorecardPillar !== PILLAR || kpi.isReverseKpi) {
    kpi = await prisma.kPI.update({
      where: { id: kpi.id },
      data: { isActive: true, scorecardPillar: PILLAR, isReverseKpi: false },
      select: { id: true, name: true, type: true, isReverseKpi: true, scorecardPillar: true, isActive: true }
    });
  }

  let goal = await prisma.performanceGoal.findFirst({
    where: { title: GOAL_TITLE },
    select: { id: true, kpiId: true, targetValue: true }
  });
  if (!goal) {
    goal = await prisma.performanceGoal.create({
      data: {
        title: GOAL_TITLE,
        description:
          "UAT: completion rate of linked milestone tasks. Mark 3 milestones done to move KPI. currentValue = (completed/total)*100.",
        type: "company",
        scorecardPillar: PILLAR,
        pillarId: "bsc_internal_operations",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        createdById: actor.id,
        kpiId: kpi.id,
        formulaType: "TASK_COMPLETION",
        targetValue: new Decimal(100),
        targetUnit: "%",
        currentValue: new Decimal(0),
        preciseCurrentValue: "0",
        progressPercentage: new Decimal(0),
        targetOperator: ">=",
        isReverseKpi: false,
        requiresManagerApproval: false,
        status: "active",
        stage: "in_progress",
        activities: { taskBasedProgress: true, uatKind: "project_velocity_milestones" }
      },
      select: { id: true, kpiId: true, targetValue: true }
    });
  }

  const existing = await prisma.task.findMany({
    where: {
      goalId: goal.id,
      isTrashed: false,
      category: "milestone"
    },
    select: { id: true, title: true, stage: true }
  });

  const toCreate = Math.max(0, MILESTONE_COUNT - existing.length);
  const created: any[] = [];
  for (let i = 0; i < toCreate; i++) {
    const idx = existing.length + i + 1;
    const t = await prisma.task.create({
      data: {
        title: `UAT Milestone ${idx}`,
        description: "UAT milestone for Project Velocity completion rate",
        stage: "todo",
        status: "todo",
        date: new Date(),
        priority: "medium",
        category: "milestone",
        performanceCategory: "performance",
        isPerformanceTask: true,
        isTrashed: false,
        goalId: goal.id,
        taskMetadata: { isMilestone: true, uatGoal: GOAL_TITLE },
        createdBy: actor.id,
        team: []
      } as any,
      select: { id: true, title: true, stage: true }
    });
    created.push(t);
  }

  const tasks = await prisma.task.findMany({
    where: {
      goalId: goal.id,
      isTrashed: false,
      category: "milestone"
    },
    select: { id: true, title: true, stage: true },
    orderBy: { createdAt: "asc" }
  });

  console.log(
    JSON.stringify(
      {
        kpi,
        goal: { id: goal.id, title: GOAL_TITLE, kpiId: kpi.id, targetValue: "100" },
        milestoneTasks: tasks,
        postman: {
          move3ToDone: {
            method: "PUT",
            path: "/api/tasks/bulk/status-update",
            bodyExample: {
              taskIds: tasks.slice(0, 3).map((t) => t.id),
              stage: "completed"
            }
          },
          viewGoal: { method: "GET", path: `/api/performance/goals/${goal.id}` },
          kpiAnalytics: {
            method: "GET",
            path: `/api/performance/analytics/kpi?kpiId=${kpi.id}`
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

