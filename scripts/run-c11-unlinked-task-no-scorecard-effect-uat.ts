/**
 * C.11 Unlinked task should not affect scorecard.
 * - Create a task without goalId
 * - Verify task creation succeeds
 * - Verify org BSC snapshot is unchanged
 */
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";

function pickComparableSnapshot(data: any) {
  return {
    overallScore: data?.overallScore ?? null,
    pillars: (data?.pillars || []).map((pillar: any) => ({
      pillarName: pillar.pillarName,
      pillarScore: pillar.pillarScore,
      goals: (pillar.goals || []).map((g: any) => ({
        id: g.id,
        progressPct: g.progressPct,
        status: g.status
      }))
    }))
  };
}

async function main() {
  const viewer = await prisma.user.findFirst({
    include: { role: true }
  });
  if (!viewer) {
    throw new Error("C.11: no user found");
  }

  const before = await PerformanceScorecardService.getOrgBSCDashboard({
    viewer,
    meta: { source: "C11_UAT" }
  });
  const beforeCmp = pickComparableSnapshot(before);

  const task = await TaskService.createTask(
    {
      title: `C11 unlinked task ${Date.now()}`,
      description: "Task without goal link should not impact scorecard",
      team: [viewer.id],
      date: new Date(),
      priority: "medium",
      isPerformanceTask: true
    },
    viewer.id
  );

  const after = await PerformanceScorecardService.getOrgBSCDashboard({
    viewer,
    meta: { source: "C11_UAT" }
  });
  const afterCmp = pickComparableSnapshot(after);

  const unchanged = JSON.stringify(beforeCmp) === JSON.stringify(afterCmp);
  const createdWithoutGoal = Boolean(task?.id) && !task?.goalId;
  const pass = createdWithoutGoal && unchanged;

  console.log(
    JSON.stringify(
      {
        success: true,
        uat: "C.11",
        createdTask: {
          id: task?.id || null,
          goalId: task?.goalId || null,
          isPerformanceTask: task?.isPerformanceTask ?? null
        },
        scorecardUnchanged: unchanged,
        pass
      },
      null,
      2
    )
  );

  await prisma.activityLog.deleteMany({ where: { taskId: task.id } }).catch(() => undefined);
  await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);

  if (!pass) {
    throw new Error("C.11 assertions failed");
  }
}

main()
  .catch((e) => {
    console.error("C11_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

