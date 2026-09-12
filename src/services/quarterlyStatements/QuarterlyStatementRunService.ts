// @ts-nocheck
import { prisma } from "../../utils/database";
import { quarterPeriodBounds, type CalendarQuarter } from "./quarterlyStatementSupport";

export class QuarterlyStatementAuditService {
  static async log(args: {
    runId: string;
    eventType: string;
    actorId: string;
    recipientId?: string;
    details?: object;
  }) {
    return prisma.quarterlyStatementAuditEvent.create({
      data: {
        runId: args.runId,
        eventType: args.eventType,
        actorId: args.actorId,
        recipientId: args.recipientId,
        details: args.details,
      },
    });
  }
}

export class QuarterlyStatementRunService {
  static async list(filters: { fundId?: string; status?: string } = {}) {
    const where: any = {};
    if (filters.fundId) where.fundId = filters.fundId;
    if (filters.status) where.status = filters.status;
    return prisma.quarterlyStatementRun.findMany({
      where,
      include: { fund: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  static async get(runId: string) {
    const run = await prisma.quarterlyStatementRun.findUnique({
      where: { id: runId },
      include: {
        fund: { select: { id: true, name: true } },
        recipients: { orderBy: { lpLegalName: "asc" } },
      },
    });
    if (!run) throw Object.assign(new Error("Statement run not found"), { statusCode: 404 });
    return run;
  }

  static async create(
    userId: string,
    body: { fundId: string; financialYear: number; calendarQuarter: string }
  ) {
    const fund = await prisma.fund.findUnique({ where: { id: body.fundId } });
    if (!fund) throw Object.assign(new Error("Fund not found"), { statusCode: 404 });

    const quarter = String(body.calendarQuarter).toUpperCase() as CalendarQuarter;
    const { periodStart, periodEnd } = quarterPeriodBounds(body.financialYear, quarter);

    const existing = await prisma.quarterlyStatementRun.findUnique({
      where: {
        fundId_financialYear_calendarQuarter: {
          fundId: body.fundId,
          financialYear: body.financialYear,
          calendarQuarter: quarter,
        },
      },
    });
    if (existing) {
      if (existing.status === "FAILED") {
        await prisma.quarterlyStatementRecipient.deleteMany({ where: { runId: existing.id } });
        await prisma.quarterlyStatementLedgerSnapshot.deleteMany({ where: { runId: existing.id } });
        await prisma.quarterlyStatementAuditEvent.deleteMany({ where: { runId: existing.id } });
        const run = await prisma.quarterlyStatementRun.update({
          where: { id: existing.id },
          data: {
            periodStart,
            periodEnd,
            status: "COMPILING",
            reconciled: false,
            compiledById: null,
            submittedById: null,
            approvedById: null,
            approvedAt: null,
            lockedAt: null,
            errorMessage: null,
            createdById: userId,
          },
        });
        await QuarterlyStatementAuditService.log({
          runId: run.id,
          eventType: "RUN_REINITIALIZED",
          actorId: userId,
        });
        return QuarterlyStatementRunService.get(run.id);
      }
      throw Object.assign(new Error("A statement run already exists for this fund and quarter"), {
        statusCode: 400,
      });
    }

    const run = await prisma.quarterlyStatementRun.create({
      data: {
        fundId: body.fundId,
        financialYear: body.financialYear,
        calendarQuarter: quarter,
        periodStart,
        periodEnd,
        status: "COMPILING",
        createdById: userId,
      },
    });

    await QuarterlyStatementAuditService.log({
      runId: run.id,
      eventType: "RUN_CREATED",
      actorId: userId,
      details: { financialYear: body.financialYear, calendarQuarter: quarter },
    });

    return QuarterlyStatementRunService.get(run.id);
  }

  static async getDashboard(runId: string) {
    const run = await QuarterlyStatementRunService.get(runId);
    let totalCommitment = 0;
    let totalCalled = 0;
    for (const r of run.recipients) {
      const snap = r.metricsSnapshot as any;
      if (snap) {
        totalCommitment += Number(snap.totalCommitmentUsd ?? 0);
        totalCalled += Number(snap.totalPaidInUsd ?? 0);
      }
    }
    return {
      runId: run.id,
      status: run.status,
      reconciled: run.reconciled,
      recipientCount: run.recipients.length,
      totalCommitmentUsd: totalCommitment,
      totalCalledUsd: totalCalled,
    };
  }
}
