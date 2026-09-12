import { prisma } from "../utils/database";

/** Thrown for bad input / invalid state transitions — controller maps statusCode to the HTTP response. */
class AccountingCloseTaskValidationError extends Error {
  statusCode = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "AccountingCloseTaskValidationError";
  }
}

const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETE"] as const;
type AccountingCloseTaskStatus = (typeof VALID_STATUSES)[number];

const OWNER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

export default class AccountingCloseTaskService {
  /** All checklist items for a period, oldest first. */
  static async listTasksForPeriod(fiscalPeriodId: string) {
    return prisma.accountingCloseTask.findMany({
      where: { fiscalPeriodId },
      orderBy: [{ createdAt: "asc" }],
      include: {
        owner: { select: OWNER_SELECT },
        completedBy: { select: OWNER_SELECT },
        dependsOn: { select: { id: true, task: true, status: true } },
      },
    });
  }

  static async createTask(params: {
    fiscalPeriodId: string;
    workstream: string;
    task: string;
    ownerId?: string | null;
    dueAt?: Date | null;
    dependsOnId?: string | null;
  }) {
    const fiscalPeriodId = params.fiscalPeriodId?.trim();
    const workstream = params.workstream?.trim();
    const task = params.task?.trim();

    if (!fiscalPeriodId) throw new AccountingCloseTaskValidationError("fiscalPeriodId is required");
    if (!workstream) throw new AccountingCloseTaskValidationError("workstream is required");
    if (!task) throw new AccountingCloseTaskValidationError("task is required");

    const period = await prisma.fiscalPeriod.findUnique({ where: { id: fiscalPeriodId } });
    if (!period) {
      throw new AccountingCloseTaskValidationError("fiscalPeriodId does not reference an existing fiscal period");
    }

    if (params.dependsOnId) {
      const dep = await prisma.accountingCloseTask.findUnique({ where: { id: params.dependsOnId } });
      if (!dep) {
        throw new AccountingCloseTaskValidationError("dependsOnId does not reference an existing task");
      }
      if (dep.fiscalPeriodId !== fiscalPeriodId) {
        throw new AccountingCloseTaskValidationError("dependsOnId must reference a task in the same fiscal period");
      }
    }

    return prisma.accountingCloseTask.create({
      data: {
        fiscalPeriodId,
        workstream,
        task,
        ownerId: params.ownerId ?? undefined,
        dueAt: params.dueAt ?? undefined,
        dependsOnId: params.dependsOnId ?? undefined,
      },
    });
  }

  /**
   * Moves a task to a new status. Moving to COMPLETE requires its `dependsOn` task (if any) to
   * already be COMPLETE. Moving away from COMPLETE clears completedAt/completedById.
   */
  static async updateTaskStatus(taskId: string, status: string, completedById?: string | null) {
    if (!VALID_STATUSES.includes(status as AccountingCloseTaskStatus)) {
      throw new AccountingCloseTaskValidationError(
        `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`
      );
    }

    const existing = await prisma.accountingCloseTask.findUnique({ where: { id: taskId } });
    if (!existing) {
      throw new AccountingCloseTaskValidationError("Task not found");
    }

    if (status === "COMPLETE" && existing.dependsOnId) {
      const dep = await prisma.accountingCloseTask.findUnique({ where: { id: existing.dependsOnId } });
      if (dep && dep.status !== "COMPLETE") {
        throw new AccountingCloseTaskValidationError(
          `Cannot complete this task until its dependency ("${dep.task}") is COMPLETE`
        );
      }
    }

    return prisma.accountingCloseTask.update({
      where: { id: taskId },
      data:
        status === "COMPLETE"
          ? { status, completedAt: new Date(), completedById: completedById ?? undefined }
          : { status, completedAt: null, completedById: null },
    });
  }

  /** Nothing blocks the lock when there are zero tasks for the period — checklist is opt-in. */
  static async canLockPeriod(fiscalPeriodId: string): Promise<{ canLock: boolean; openTaskCount: number }> {
    const openTaskCount = await prisma.accountingCloseTask.count({
      where: {
        fiscalPeriodId,
        status: { not: "COMPLETE" },
      },
    });
    return { canLock: openTaskCount === 0, openTaskCount };
  }
}
