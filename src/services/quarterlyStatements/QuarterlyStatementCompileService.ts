// @ts-nocheck
import { prisma } from "../../utils/database";
import { QuarterlyStatementPreflightService } from "./QuarterlyStatementPreflightService";
import { QuarterlyStatementLedgerFreezeService } from "./QuarterlyStatementLedgerFreezeService";
import { QuarterlyStatementMetricsService } from "./QuarterlyStatementMetricsService";
import { QuarterlyStatementRunService } from "./QuarterlyStatementRunService";
import { QuarterlyStatementAuditService } from "./QuarterlyStatementRunService";

export class QuarterlyStatementCompileService {
  static async resolveRecipients(fundId: string) {
    const commitments = await prisma.investmentCommitment.findMany({
      where: { fundId, status: { in: ["ACTIVE", "PENDING"] } },
      include: { client: { select: { id: true, legalName: true, email: true } } },
    });
    const seen = new Set<string>();
    const recipients: Array<{ clientId: string; lpLegalName: string }> = [];
    for (const c of commitments) {
      if (seen.has(c.clientId)) continue;
      seen.add(c.clientId);
      recipients.push({ clientId: c.clientId, lpLegalName: c.client.legalName });
    }
    return recipients;
  }

  static async compile(runId: string, userId: string) {
    const run = await QuarterlyStatementRunService.get(runId);
    if (!["COMPILING", "FAILED"].includes(run.status)) {
      throw Object.assign(new Error(`Cannot compile run in status ${run.status}`), { statusCode: 400 });
    }

    try {
      await QuarterlyStatementPreflightService.assertJournalsPosted(
        run.fundId,
        run.periodStart,
        run.periodEnd
      );

      await QuarterlyStatementLedgerFreezeService.freezeForRun(
        runId,
        run.fundId,
        run.periodStart,
        run.periodEnd
      );

      const lps = await QuarterlyStatementCompileService.resolveRecipients(run.fundId);

      await prisma.quarterlyStatementRecipient.deleteMany({ where: { runId } });

      for (const lp of lps) {
        const metrics = await QuarterlyStatementMetricsService.computeForRecipient({
          fundId: run.fundId,
          clientId: lp.clientId,
          lpLegalName: lp.lpLegalName,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          runId,
        });

        await prisma.quarterlyStatementRecipient.create({
          data: {
            runId,
            clientId: lp.clientId,
            lpLegalName: lp.lpLegalName,
            status: "REVIEW",
            metricsSnapshot: metrics,
            dpi: metrics.dpi,
            tvpi: metrics.tvpi,
            rvpi: metrics.rvpi,
            netIrr: metrics.netIrr,
            compiledAt: new Date(),
          },
        });
      }

      await prisma.quarterlyStatementRun.update({
        where: { id: runId },
        data: {
          status: "REVIEW",
          compiledById: userId,
          reconciled: true,
          errorMessage: null,
        },
      });

      await QuarterlyStatementAuditService.log({
        runId,
        eventType: "COMPILED",
        actorId: userId,
        details: { recipientCount: lps.length },
      });

      return QuarterlyStatementRunService.get(runId);
    } catch (e: any) {
      await prisma.quarterlyStatementRun.update({
        where: { id: runId },
        data: { status: "FAILED", errorMessage: String(e?.message || e) },
      });
      throw e;
    }
  }

  static async recomputeRecipient(runId: string, clientId: string, userId: string) {
    const run = await QuarterlyStatementRunService.get(runId);
    if (run.status !== "REVIEW" || run.lockedAt) {
      throw Object.assign(new Error("Recompute only allowed while run is in REVIEW and unlocked"), {
        statusCode: 400,
      });
    }

    const recipient = run.recipients.find((r) => r.clientId === clientId);
    if (!recipient) throw Object.assign(new Error("Recipient not found"), { statusCode: 404 });

    const metrics = await QuarterlyStatementMetricsService.computeForRecipient({
      fundId: run.fundId,
      clientId,
      lpLegalName: recipient.lpLegalName,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      runId,
    });

    await prisma.quarterlyStatementRecipient.update({
      where: { id: recipient.id },
      data: {
        metricsSnapshot: metrics,
        dpi: metrics.dpi,
        tvpi: metrics.tvpi,
        rvpi: metrics.rvpi,
        netIrr: metrics.netIrr,
        compiledAt: new Date(),
      },
    });

    await QuarterlyStatementAuditService.log({
      runId,
      eventType: "RECOMPUTED",
      actorId: userId,
      recipientId: recipient.id,
    });

    return prisma.quarterlyStatementRecipient.findUnique({ where: { id: recipient.id } });
  }

  static async getPreview(runId: string, clientId: string) {
    const run = await QuarterlyStatementRunService.get(runId);
    const recipient = run.recipients.find((r) => r.clientId === clientId);
    if (!recipient) throw Object.assign(new Error("Recipient not found"), { statusCode: 404 });
    return { run: { id: run.id, status: run.status, periodEnd: run.periodEnd }, recipient };
  }
}
