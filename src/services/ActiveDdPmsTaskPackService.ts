// @ts-nocheck
import { prisma } from "../utils/database";
import { TaskService } from "./TaskService";

/** Performance Management / deal workflow: tasks created when entering Active DD. */
export const PMS_ACTIVE_DD_TASK_CATEGORY = "PMS_ACTIVE_DD_ENTRY";

const WORKFLOW_PACK_ID = "ACTIVE_DD_ENTRY_V1";

const DEFAULT_DD_TASKS: Array<{ title: string; description: string }> = [
  {
    title: "Due diligence — Financial deep dive",
    description: "Complete financial assessment, projections review, and working capital analysis for this deal."
  },
  {
    title: "Due diligence — Legal & regulatory",
    description: "Review corporate structure, material contracts, litigation, and regulatory filings."
  },
  {
    title: "Due diligence — Market & commercial",
    description: "Validate market size, competition, and commercial traction assumptions."
  },
  {
    title: "Due diligence — Management & operations",
    description: "Assess management team, governance, and operational readiness."
  }
];

function pmsTaskMetadata(params: {
  dealReference: string | null;
  applicationId: string;
  packItemKey: string;
}) {
  const humanDealId = params.dealReference || params.applicationId;
  return {
    sourceModule: "PMS",
    dealId: humanDealId,
    applicationId: params.applicationId,
    workflowPack: WORKFLOW_PACK_ID,
    packItemKey: params.packItemKey
  };
}

export class ActiveDdPmsTaskPackService {
  /**
   * CF-2: Idempotent PMS task pack. **Assignee** = lead analyst (`assigneeUserId`); **creator** = `createdByUserId`.
   * `dealId` in metadata is the human `dealReference` when set.
   */
  static async ensureSeededForActiveDueDiligence(params: {
    applicationId: string;
    assigneeUserId: string;
    createdByUserId: string;
    dealReference: string | null;
  }): Promise<void> {
    const { applicationId, assigneeUserId, createdByUserId, dealReference } = params;
    if (!applicationId || !assigneeUserId || !createdByUserId) {
      return;
    }

    const existing = await prisma.task.findFirst({
      where: {
        applicationId,
        category: PMS_ACTIVE_DD_TASK_CATEGORY
      },
      select: { id: true }
    });

    if (existing) {
      return;
    }

    const due = new Date();
    due.setDate(due.getDate() + 14);

    await Promise.all(
      DEFAULT_DD_TASKS.map((item, i) => {
        const packItemKey = `item_${i + 1}`;
        return TaskService.createTask(
          {
            title: item.title,
            description: item.description,
            team: [assigneeUserId],
            stage: "todo",
            date: due,
            priority: "high",
            applicationId,
            fromDueDiligence: true,
            category: PMS_ACTIVE_DD_TASK_CATEGORY,
            taskMetadata: pmsTaskMetadata({
              dealReference,
              applicationId,
              packItemKey
            })
          },
          createdByUserId
        );
      })
    );
  }
}
