// @ts-nocheck
import { prisma } from "../../utils/database";
import { isAdminViewer } from "../performanceScorecardSupport";
import { QuarterlyStatementAccessService } from "./QuarterlyStatementAccessService";
import { QuarterlyStatementPublishService } from "./QuarterlyStatementPublishService";
import { QuarterlyStatementRunService } from "./QuarterlyStatementRunService";
import { QuarterlyStatementAuditService } from "./QuarterlyStatementRunService";
import type { QuarterlyLpMetrics } from "./QuarterlyStatementMetricsService";

export class QuarterlyStatementApprovalService {
  static async submitReview(runId: string, userId: string) {
    const run = await QuarterlyStatementRunService.get(runId);
    if (run.status !== "REVIEW") {
      throw Object.assign(new Error("Only REVIEW runs can be submitted"), { statusCode: 400 });
    }
    if (!run.recipients.length) {
      throw Object.assign(new Error("No compiled recipients to submit"), { statusCode: 400 });
    }

    await prisma.quarterlyStatementRun.update({
      where: { id: runId },
      data: { submittedById: userId },
    });

    await QuarterlyStatementAuditService.log({
      runId,
      eventType: "SUBMITTED_REVIEW",
      actorId: userId,
    });

    return QuarterlyStatementRunService.get(runId);
  }

  static async approve(runId: string, checkerUserId: string) {
    const run = await QuarterlyStatementRunService.get(runId);
    if (run.status !== "REVIEW") {
      throw Object.assign(new Error("Only REVIEW runs can be approved"), { statusCode: 400 });
    }

    const makerId = run.compiledById || run.submittedById || run.createdById;
    if (makerId === checkerUserId) {
      const checker = await prisma.user.findUnique({
        where: { id: checkerUserId },
        include: { role: true },
      });
      if (!isAdminViewer(checker)) {
        await QuarterlyStatementAccessService.assertCheckerNotMaker(makerId, checkerUserId);
      }
    }

    const now = new Date();

    for (const recipient of run.recipients) {
      const metrics = recipient.metricsSnapshot as QuarterlyLpMetrics;
      if (!metrics) continue;
      await QuarterlyStatementPublishService.publishRecipient({
        recipientId: recipient.id,
        fundId: run.fundId,
        metrics,
        approvedById: checkerUserId,
        periodEnd: run.periodEnd,
      });
    }

    await prisma.quarterlyStatementRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        approvedById: checkerUserId,
        approvedAt: now,
        lockedAt: now,
      },
    });

    await QuarterlyStatementAuditService.log({
      runId,
      eventType: "APPROVED_PUBLISHED",
      actorId: checkerUserId,
      details: { recipientCount: run.recipients.length },
    });

    return QuarterlyStatementRunService.get(runId);
  }
}
