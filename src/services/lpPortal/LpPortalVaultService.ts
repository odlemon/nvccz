// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

export class LpPortalVaultService {
  static async listVault(
    ctx: LpPortalContext,
    opts: { category?: string; search?: string; fundId?: string }
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const where: any = { clientId: ctx.clientId };
    if (opts.category) where.category = opts.category;
    if (opts.fundId) where.fundId = opts.fundId;
    if (opts.search) where.title = { contains: opts.search };

    const rows = await prisma.lpPortalDocument.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      include: { fund: { select: { name: true } } },
    });

    return {
      data: rows
        .filter((r) => !r.fundId || LpPortalAccessService.fundAllowed(ctx, r.fundId))
        .map((d) => ({
          documentId: d.id,
          category: d.category,
          title: d.title,
          fundId: d.fundId,
          fundName: d.fund?.name ?? null,
          publishedAt: d.publishedAt,
          sourceType: d.sourceType,
          sha256: d.sha256,
        })),
    };
  }

  static async getDocumentForClient(ctx: LpPortalContext, documentId: string) {
    const doc = await prisma.lpPortalDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.clientId !== ctx.clientId)
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    if (doc.fundId && !LpPortalAccessService.fundAllowed(ctx, doc.fundId))
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    return doc;
  }

  static async download(ctx: LpPortalContext, documentId: string) {
    const doc = await this.getDocumentForClient(ctx, documentId);
    if (!doc.fileUrl && !doc.storagePath)
      throw Object.assign(new Error("File not available"), { statusCode: 404 });

    const fs = await import("fs");
    const localPath = doc.storagePath || "";
    let buffer: Buffer;
    if (localPath && fs.existsSync(localPath)) {
      buffer = fs.readFileSync(localPath);
    } else {
      const RemoteUploadService = (await import("../RemoteUploadService")).default;
      buffer = await new RemoteUploadService().downloadFile(doc.fileUrl || doc.storagePath!);
    }
    const ext = doc.mimeType?.includes("pdf")
      ? ".pdf"
      : doc.mimeType?.includes("spreadsheet")
        ? ".xlsx"
        : doc.mimeType?.includes("word")
          ? ".docx"
          : ".bin";
    const filename = doc.title.replace(/[^\w.-]+/g, "-") + ext;
    const contentType = doc.mimeType || "application/pdf";
    return { buffer, filename, contentType, sha256: doc.sha256 };
  }

  static async verifyIntegrity(ctx: LpPortalContext, documentId: string) {
    const doc = await this.getDocumentForClient(ctx, documentId);
    if (!doc.sha256) return { documentId, verified: false, reason: "No checksum on file" };
    const { buffer } = await this.download(ctx, documentId);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    return {
      documentId,
      verified: hash === doc.sha256,
      expectedSha256: doc.sha256,
      actualSha256: hash,
    };
  }

  static async indexPerformanceReport(jobId: string) {
    const job = await prisma.fundReportRecipientJob.findUnique({
      where: { id: jobId },
      include: { run: { include: { fund: true, template: true } } },
    });
    if (!job || job.status !== "DELIVERED") return null;

    const existing = await prisma.lpPortalDocument.findFirst({
      where: { sourceType: "FUND_REPORT_SYNC", sourceRefId: jobId },
    });
    if (existing) return existing;

    const title = `${job.run.fund.name} — Performance Report (${job.run.periodEnd.toISOString().slice(0, 10)})`;
    return prisma.lpPortalDocument.create({
      data: {
        clientId: job.clientId,
        fundId: job.run.fundId,
        category: "PERFORMANCE_REPORT",
        title,
        fileUrl: job.pdfFileUrl,
        storagePath: job.pdfStoragePath,
        sha256: job.pdfSha256,
        publishedAt: job.deliveredAt || new Date(),
        sourceType: "FUND_REPORT_SYNC",
        sourceRefId: jobId,
      },
    });
  }

  static async publishDocument(params: {
    clientId: string;
    fundId?: string;
    category: string;
    title: string;
    fileUrl: string;
    storagePath?: string;
    sha256?: string;
    publishedById: string;
    sourceType?: string;
    sourceRefId?: string;
  }) {
    return prisma.lpPortalDocument.create({
      data: {
        clientId: params.clientId,
        fundId: params.fundId || null,
        category: params.category,
        title: params.title,
        fileUrl: params.fileUrl,
        storagePath: params.storagePath || null,
        sha256: params.sha256 || null,
        publishedAt: new Date(),
        publishedById: params.publishedById,
        sourceType: params.sourceType || "GP_UPLOAD",
        sourceRefId: params.sourceRefId || null,
      },
    });
  }
}
