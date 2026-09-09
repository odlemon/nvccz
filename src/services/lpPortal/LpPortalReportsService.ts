// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalAccessService } from "./LpPortalAccessService";

export class LpPortalReportsService {
  static async listReports(ctx: { clientId: string }, page = 1, limit = 20) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.fundReportRecipientJob.findMany({
        where: { clientId: ctx.clientId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          run: {
            include: {
              fund: { select: { name: true } },
              template: { select: { name: true, reportLevel: true } },
            },
          },
        },
      }),
      prisma.fundReportRecipientJob.count({ where: { clientId: ctx.clientId } }),
    ]);
    return {
      data: rows.map((j) => ({
        jobId: j.id,
        runId: j.runId,
        fundName: j.run.fund.name,
        templateName: j.run.template.name,
        reportLevel: j.run.template.reportLevel,
        periodStart: j.run.periodStart,
        periodEnd: j.run.periodEnd,
        status: j.status,
        deliveredAt: j.deliveredAt,
        transportMethod: j.transportMethod,
        metrics: j.metricsSnapshot,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  static async downloadReport(ctx: { clientId: string }, jobId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const job = await prisma.fundReportRecipientJob.findUnique({
      where: { id: jobId },
      include: { run: { include: { fund: true, template: true } } },
    });
    if (!job || job.clientId !== ctx.clientId)
      throw Object.assign(new Error("Report not found"), { statusCode: 404 });
    if (!job.pdfFileUrl && !job.metricsSnapshot)
      throw Object.assign(new Error("PDF not yet available"), { statusCode: 404 });

    if (job.pdfFileUrl || job.pdfStoragePath) {
      // See LpPortalVaultService: the module exports a named class and a singleton, never a
      // default, so `.default` was undefined and this threw on every download.
      const { remoteUploadService } = await import("../RemoteUploadService");
      const url = job.pdfFileUrl || job.pdfStoragePath!;
      const buffer = await remoteUploadService.downloadFile(url);
      return {
        buffer,
        filename: `fund-performance-${job.run.fund.name.replace(/\s+/g, "-")}.pdf`,
      };
    }

    const { buildLpFundPerformancePdfBuffer } = await import("../../utils/lpFundPerformancePdf");
    const metrics = job.metricsSnapshot as any;
    const buffer = await buildLpFundPerformancePdfBuffer(
      metrics,
      job.run.template?.reportLevel || "INVESTOR"
    );
    return {
      buffer,
      filename: `fund-performance-${job.run.fund.name.replace(/\s+/g, "-")}.pdf`,
    };
  }
}
