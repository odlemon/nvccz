// @ts-nocheck
import { prisma } from "../../utils/database";

export class FundReportingLpService {
  static async resolveClientForUser(userId: string) {
    const client = await prisma.client.findUnique({
      where: { userId },
      include: {
        investmentCommitments: {
          include: { fund: { select: { id: true, name: true } } },
        },
      },
    });
    if (!client) throw Object.assign(new Error("No LP profile linked to this user"), { statusCode: 404 });
    if (client.status !== "ACTIVE")
      throw Object.assign(new Error("LP profile is not active"), { statusCode: 403 });
    return client;
  }

  static async getPortal(userId: string) {
    const client = await this.resolveClientForUser(userId);
    const latestJobs = await prisma.fundReportRecipientJob.findMany({
      where: { clientId: client.id, status: { in: ["DELIVERED", "SENT", "COMPILED"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        run: {
          include: {
            fund: { select: { id: true, name: true } },
            template: { select: { reportLevel: true, name: true } },
          },
        },
      },
    });
    return {
      client: {
        id: client.id,
        legalName: client.legalName,
        email: client.email,
        investorId: client.investorId,
      },
      funds: client.investmentCommitments.map((ic) => ({
        fundId: ic.fund.id,
        fundName: ic.fund.name,
        commitmentAmount: Number(ic.amount.toString()),
        currency: ic.currency,
      })),
      latestReports: latestJobs.map((j) => ({
        jobId: j.id,
        runId: j.runId,
        fundName: j.run.fund.name,
        periodEnd: j.run.periodEnd,
        reportLevel: j.run.template.reportLevel,
        deliveredAt: j.deliveredAt,
        metrics: j.metricsSnapshot,
      })),
    };
  }

  static async listReports(userId: string, page = 1, limit = 20) {
    const client = await this.resolveClientForUser(userId);
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.fundReportRecipientJob.findMany({
        where: { clientId: client.id },
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
      prisma.fundReportRecipientJob.count({ where: { clientId: client.id } }),
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

  static async downloadOwnReport(userId: string, jobId: string) {
    const client = await this.resolveClientForUser(userId);
    const job = await prisma.fundReportRecipientJob.findUnique({
      where: { id: jobId },
      include: { run: { include: { fund: true } } },
    });
    if (!job || job.clientId !== client.id)
      throw Object.assign(new Error("Report not found"), { statusCode: 404 });
    if (!job.pdfFileUrl && !job.metricsSnapshot) {
      throw Object.assign(new Error("PDF not yet available"), { statusCode: 404 });
    }

    if (job.pdfFileUrl) {
      const RemoteUploadService = (await import("../RemoteUploadService")).default;
      const buffer = await new RemoteUploadService().downloadFile(job.pdfFileUrl);
      return {
        buffer,
        filename: `fund-performance-${job.run.fund.name.replace(/\s+/g, "-")}.pdf`,
      };
    }

    const { buildLpFundPerformancePdfBuffer } = await import("../../utils/lpFundPerformancePdf");
    const metrics = job.metricsSnapshot as any;
    const buffer = await buildLpFundPerformancePdfBuffer(
      metrics,
      (job.run as any).template?.reportLevel || "INVESTOR"
    );
    return {
      buffer,
      filename: `fund-performance-${job.run.fund.name.replace(/\s+/g, "-")}.pdf`,
    };
  }
}
