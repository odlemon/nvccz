import { prisma } from "../src/utils/database";
import { PerformanceIntegrationService } from "../src/services/PerformanceIntegrationService";

async function main() {
  const goalId = "cmnee5j090001un5gud5rlh16";
  const goalBefore = await prisma.performanceGoal.findUnique({
    where: { id: goalId },
    include: { createdBy: true, kpi: true }
  });
  if (!goalBefore) throw new Error("Goal not found for C.04");

  const actor = {
    id: goalBefore.createdById,
    role: { name: "admin" },
    userDepartment: goalBefore.departmentName || "Finance"
  };

  const sync = await PerformanceIntegrationService.runManualSync({
    goalId,
    endpointPath: "/api/accounting/v1/kpis/portfolio-irr",
    fieldPath: "data.metrics.irr",
    actor,
    transport: async () => ({
      data: {
        metrics: {
          irr: 12.345678
        }
      }
    }),
    sleep: async () => undefined
  });

  const afterSync = await prisma.performanceGoal.findUnique({
    where: { id: goalId }
  });
  if (!afterSync) throw new Error("Goal disappeared after sync");

  const pendingChecks = {
    isPendingApproval: afterSync.isPendingApproval === true,
    pendingActualValueSet: String(afterSync.pendingActualValue || "") === "12.345678",
    currentValueUnchanged: String(afterSync.currentValue || "") === String(goalBefore.currentValue || "")
  };

  const approved = await PerformanceIntegrationService.approvePendingSync({
    goalId,
    comment: "C.04 UAT approval",
    actor
  });

  const finalGoal = await prisma.performanceGoal.findUnique({
    where: { id: goalId }
  });
  const finalJob = finalGoal?.lastSyncJobId
    ? await prisma.performanceSyncJob.findUnique({ where: { id: finalGoal.lastSyncJobId } })
    : null;

  const approvalChecks = {
    pendingCleared: finalGoal?.isPendingApproval === false && finalGoal?.pendingActualValue == null,
    currentAppliedRounded: String(finalGoal?.currentValue || "") === "12.35",
    preciseApplied: String(finalGoal?.preciseCurrentValue || "") === "12.345678",
    approvedRecorded: String(finalGoal?.lastApprovedValue || "") === "12.345678",
    jobApproved:
      finalJob?.approvalStatus === "APPROVED" && finalJob?.status === "COMPLETED"
  };

  const pass =
    Object.values(pendingChecks).every(Boolean) &&
    Object.values(approvalChecks).every(Boolean);

  console.log(
    JSON.stringify(
      {
        success: true,
        uat: "C.04",
        goalId,
        kpiName: goalBefore.kpi?.name || null,
        before: {
          currentValue: goalBefore.currentValue,
          preciseCurrentValue: goalBefore.preciseCurrentValue,
          isPendingApproval: goalBefore.isPendingApproval
        },
        syncResult: {
          jobId: sync.syncJob.id,
          jobStatus: sync.syncJob.status,
          approvalStatus: sync.syncJob.approvalStatus,
          goal: {
            isPendingApproval: afterSync.isPendingApproval,
            pendingActualValue: afterSync.pendingActualValue,
            currentValue: afterSync.currentValue,
            preciseCurrentValue: afterSync.preciseCurrentValue
          },
          checks: pendingChecks
        },
        approvalResult: {
          approvedGoalId: approved.id,
          goal: {
            isPendingApproval: finalGoal?.isPendingApproval,
            pendingActualValue: finalGoal?.pendingActualValue,
            currentValue: finalGoal?.currentValue,
            preciseCurrentValue: finalGoal?.preciseCurrentValue,
            lastApprovedValue: finalGoal?.lastApprovedValue
          },
          job: finalJob
            ? {
                id: finalJob.id,
                status: finalJob.status,
                approvalStatus: finalJob.approvalStatus,
                approvedById: finalJob.approvedById
              }
            : null,
          checks: approvalChecks
        },
        pass
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("C04_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

