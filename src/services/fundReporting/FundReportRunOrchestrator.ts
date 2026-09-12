// @ts-nocheck
import { prisma } from "../../utils/database";
import { buildLpFundPerformancePdfBuffer } from "../../utils/lpFundPerformancePdf";
import { LpFundMetricsService } from "./LpFundMetricsService";
import { FundReportTemplateService } from "./FundReportTemplateService";
import { FundReportDistributionService } from "./FundReportDistributionService";
import { FundReportAssetStager } from "./FundReportAssetStager";
import {
  buildFundPerformanceEmailHtml,
  FundPerformanceEmailService,
} from "./FundPerformanceEmailService";
import { FUND_REPORT_EMAIL_CONCURRENCY, runPool } from "./fundReportingSupport";

export class FundReportRunOrchestrator {
  static async createRun(params: {
    fundId: string;
    templateId: string;
    periodStart: Date;
    periodEnd: Date;
    triggeredById?: string;
    triggerType?: string;
    scheduleId?: string;
    distributionListId?: string;
    clientIds?: string[];
  }) {
    const template = await FundReportTemplateService.getById(params.templateId);
    const recipients = await FundReportDistributionService.resolveRecipients({
      fundId: params.fundId,
      distributionListId: params.distributionListId,
      clientIds: params.clientIds,
    });
    if (!recipients.length) throw new Error("No eligible recipients for this run");

    const run = await prisma.fundReportRun.create({
      data: {
        fundId: params.fundId,
        templateId: params.templateId,
        scheduleId: params.scheduleId || null,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        status: "QUEUED",
        triggerType: params.triggerType || "MANUAL",
        triggeredById: params.triggeredById || null,
        targetCount: recipients.length,
      },
    });

    await prisma.fundReportRecipientJob.createMany({
      data: recipients.map((r) => ({
        runId: run.id,
        clientId: r.clientId,
        userId: r.userId,
        email: r.email,
        lpLegalName: r.lpLegalName,
      })),
    });

    setImmediate(() => {
      FundReportRunOrchestrator.processRun(run.id, template.reportLevel as "INVESTOR" | "BOARD").catch(
        (e) => console.error("[fund-report-run]", run.id, e)
      );
    });

    return this.getRun(run.id);
  }

  static async getRun(runId: string) {
    const run = await prisma.fundReportRun.findUnique({
      where: { id: runId },
      include: {
        template: true,
        fund: { select: { id: true, name: true } },
        recipientJobs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!run) throw new Error("Run not found");
    return run;
  }

  static async listRuns(params: { fundId?: string; limit?: number }) {
    return prisma.fundReportRun.findMany({
      where: params.fundId ? { fundId: params.fundId } : {},
      orderBy: { createdAt: "desc" },
      take: params.limit || 50,
      include: { fund: { select: { name: true } }, template: { select: { name: true, reportLevel: true } } },
    });
  }

  static async getRunLogs(runId: string) {
    const jobs = await prisma.fundReportRecipientJob.findMany({
      where: { runId },
      select: { id: true },
    });
    const jobIds = jobs.map((j) => j.id);
    return prisma.fundReportDistributionLog.findMany({
      where: { jobId: { in: jobIds } },
      orderBy: { createdAt: "desc" },
    });
  }

  static async processRun(runId: string, reportLevel: "INVESTOR" | "BOARD") {
    const run = await prisma.fundReportRun.update({
      where: { id: runId },
      data: { status: "COMPILING", startedAt: new Date() },
      include: { recipientJobs: true, fund: true },
    });

    let compiled = 0;
    let dispatched = 0;
    let delivered = 0;
    let failed = 0;

    const compileFailures = await runPool(
      run.recipientJobs,
      FUND_REPORT_EMAIL_CONCURRENCY,
      async (job) => {
        try {
          const metrics = await LpFundMetricsService.computeForClient({
            fundId: run.fundId,
            clientId: job.clientId,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            reportLevel,
          });
          const pdf = await buildLpFundPerformancePdfBuffer(metrics, reportLevel);
          const filename = `fund-performance-${run.fund.name.replace(/\s+/g, "-")}-${job.clientId}.pdf`;
          const staged = await FundReportAssetStager.stagePdf(job.id, pdf, filename);

          await prisma.fundReportRecipientJob.update({
            where: { id: job.id },
            data: {
              pdfStatus: "COMPILED",
              status: "COMPILED",
              metricsSnapshot: metrics,
              pdfSha256: staged.pdfSha256,
              pdfFileSize: staged.pdfFileSize,
              transportMethod: staged.transportMethod,
              pdfStoragePath: staged.transportMethod === "SECURE_LINK" ? staged.storagePath : null,
              pdfFileUrl: staged.transportMethod === "SECURE_LINK" ? staged.fileUrl : null,
              compiledAt: new Date(),
            },
          });
          compiled++;
          await prisma.fundReportRun.update({
            where: { id: runId },
            data: { compiledCount: compiled },
          });

          await prisma.fundReportRun.update({ where: { id: runId }, data: { status: "DISPATCHING" } });

          const subject = `${run.fund.name} — Performance Report (${metrics.periodEnd})`;
          const html = buildFundPerformanceEmailHtml({
            lpLegalName: job.lpLegalName,
            fundName: run.fund.name,
            periodEnd: metrics.periodEnd,
            metrics: {
              totalPaidIn: metrics.totalPaidIn,
              tvpi: metrics.tvpi,
              dpi: metrics.dpi,
              currencyCode: metrics.currencyCode,
            },
            secureDownloadUrl:
              staged.transportMethod === "SECURE_LINK" ? staged.downloadUrl : undefined,
          });

          const attachments =
            staged.transportMethod === "DIRECT_ATTACH"
              ? [{ filename, content: staged.pdfBuffer, contentType: "application/pdf" }]
              : undefined;

          await FundPerformanceEmailService.sendFundPerformanceReportEmail({
            jobId: job.id,
            to: job.email,
            subject,
            html,
            attachments,
          });

          dispatched++;
          delivered++;
          await prisma.fundReportRecipientJob.update({
            where: { id: job.id },
            data: {
              status: "DELIVERED",
              dispatchedAt: new Date(),
              deliveredAt: new Date(),
            },
          });
          await prisma.fundReportDistributionLog.create({
            data: {
              jobId: job.id,
              eventType: "DELIVERED",
              message: "SMTP accept recorded",
            },
          });
          try {
            const { LpPortalVaultService } = await import("../lpPortal/LpPortalVaultService");
            await LpPortalVaultService.indexPerformanceReport(job.id);
          } catch (vaultErr) {
            console.error("[lp-portal-vault-sync]", job.id, vaultErr);
          }
          await prisma.fundReportRun.update({
            where: { id: runId },
            data: { dispatchedCount: dispatched, deliveredCount: delivered },
          });
        } catch (e: any) {
          failed++;
          await prisma.fundReportRecipientJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              lastError: e?.message || String(e),
              retryCount: { increment: 1 },
            },
          });
          await prisma.fundReportRun.update({
            where: { id: runId },
            data: { failedCount: failed },
          });
          throw e;
        }
      }
    );

    const finalStatus =
      compileFailures.length === run.recipientJobs.length ? "FAILED" : "COMPLETED";
    await prisma.fundReportRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        errorMessage:
          compileFailures.length > 0
            ? `${compileFailures.length} recipient job(s) failed`
            : null,
      },
    });
  }
}
