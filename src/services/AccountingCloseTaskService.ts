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

/** The month-end checklist the SRD lays out (UIR 12 / ACC-PER-06), by workstream; the ledger lock comes last. */
const STANDARD_CHECKLIST: Array<[string, string]> = [
  ["Cash & bank", "Complete all bank reconciliations"],
  ["Cash & bank", "Reconcile petty cash"],
  ["Payables", "Reconcile supplier statements"],
  ["Payables", "Review and post accruals for goods received not invoiced"],
  ["Receivables", "Reconcile debtor accounts"],
  ["Receivables", "Review ageing and the doubtful debts provision"],
  ["Payroll", "Post the payroll journal"],
  ["Fixed assets", "Run monthly depreciation"],
  ["Short-term investments", "Accrue investment interest to month end"],
  ["Tax", "Prepare the VAT return pack"],
  ["Tax", "Prepare PAYE and withholding tax returns"],
  ["Financial statements", "Review the trial balance"],
];

export default class AccountingCloseTaskService {
  /** Adds the standard checklist's tasks a period does not have yet (matched by task name); returns how many were added. */
  static async addStandardChecklist(fiscalPeriodId: string, ownerId?: string | null) {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: fiscalPeriodId }, select: { id: true, endDate: true } });
    if (!period) throw new AccountingCloseTaskValidationError("fiscalPeriodId does not reference an existing fiscal period");
    const have = new Set((await prisma.accountingCloseTask.findMany({ where: { fiscalPeriodId }, select: { task: true } })).map((t) => t.task.trim().toLowerCase()));
    // due on the fifth working day after month end
    const due = new Date(period.endDate.getTime());
    for (let n = 0; n < 5; ) { due.setUTCDate(due.getUTCDate() + 1); const wd = due.getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
    let added = 0;
    for (const [workstream, task] of STANDARD_CHECKLIST) {
      if (have.has(task.toLowerCase())) continue;
      await prisma.accountingCloseTask.create({ data: { fiscalPeriodId, workstream, task, ownerId: ownerId || null, dueAt: due, status: "OPEN" } });
      added++;
    }
    return { added, total: have.size + added };
  }

  /**
   * How ready a month is to close (ACC-PER-05): the checklist, draft journals dated in the month, bank lines not yet
   * reconciled, investment interest accrued to month end, depreciation for the month, and whether the ledger is locked.
   */
  static async readiness(fiscalPeriodId: string) {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: fiscalPeriodId }, select: { id: true, name: true, startDate: true, endDate: true } });
    if (!period) throw new AccountingCloseTaskValidationError("fiscalPeriodId does not reference an existing fiscal period");
    const start = period.startDate, end = new Date(period.endDate.getTime() + 86400000 - 1);
    const ym = period.startDate.toISOString().slice(0, 7);
    const monthEndIso = period.endDate.toISOString().slice(0, 10);
    const [tasks, drafts, unreconciled, lock, instruments, depreciation, depRun] = await Promise.all([
      prisma.accountingCloseTask.findMany({ where: { fiscalPeriodId }, select: { status: true } }),
      prisma.journalEntry.count({ where: { status: "PENDING", transactionDate: { gte: start, lte: end } } }),
      prisma.cashbookEntry.count({ where: { transactionDate: { gte: start, lte: end }, isReconciled: false, status: { not: "VOIDED" }, reversedAt: null } }).catch(() => null),
      prisma.modulePeriodLock.findUnique({ where: { moduleCode_fiscalPeriodId: { moduleCode: "GL", fiscalPeriodId } }, select: { lockStatus: true, reason: true, updatedAt: true } }),
      prisma.shortTermInvestmentInstrument.findMany({ where: { status: "ACTIVE", startDate: { lte: end } }, select: { id: true, accruals: { orderBy: { accrualDate: "desc" }, take: 1, select: { accrualDate: true } } } }),
      prisma.depreciationRecord.groupBy({ by: ["isPosted"], where: { period: ym }, _count: { _all: true } }).catch(() => [] as any[]),
      prisma.$queryRawUnsafe<any[]>("SELECT status, finished_at FROM accounting_job_runs WHERE job_key = 'assets.depreciation' AND JSON_UNQUOTE(JSON_EXTRACT(summary, '$.period')) = ? ORDER BY started_at DESC LIMIT 1", ym).catch(() => []),
    ]);
    // interest is due through month end, or through today while the month is still running
    const { default: FiscalCalendarService } = await import("./FiscalCalendarService");
    const tz = await FiscalCalendarService.getFiscalTimezone().catch(() => "Africa/Harare");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const dueThrough = monthEndIso < today ? monthEndIso : today;
    const behind = instruments.filter((i) => !i.accruals[0] || i.accruals[0].accrualDate.toISOString().slice(0, 10) < dueThrough).length;
    const depPosted = (depreciation as any[]).find((d: any) => d.isPosted)?._count?._all ?? 0;
    const depPending = (depreciation as any[]).find((d: any) => !d.isPosted)?._count?._all ?? 0;
    return {
      period: { id: period.id, name: period.name, startDate: period.startDate, endDate: period.endDate },
      ledgerLock: lock ? lock.lockStatus : "OPEN",
      tasks: { total: tasks.length, complete: tasks.filter((t) => t.status === "COMPLETE").length },
      draftJournals: drafts,
      unreconciledBankLines: unreconciled,
      investments: { active: instruments.length, notAccruedThrough: behind, dueThrough },
      depreciation: { posted: depPosted, pending: depPending, lastRun: depRun[0] ? { status: depRun[0].status, finishedAt: depRun[0].finished_at } : null },
    };
  }

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
