// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService } from "../RemoteUploadService";
import { buildQuarterlyClientStatementPdfBuffer } from "../../utils/quarterlyClientStatementPdf";
import type { QuarterlyLpMetrics } from "./QuarterlyStatementMetricsService";

export class QuarterlyStatementPdfService {
  static sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  static async generateAndStage(recipientId: string, metrics: QuarterlyLpMetrics) {
    const pdfBuffer = await buildQuarterlyClientStatementPdfBuffer(metrics);
    const sha256 = QuarterlyStatementPdfService.sha256(pdfBuffer);
    const filename = `Quarterly-Statement-${metrics.clientId.slice(0, 8)}-${metrics.periodEnd}.pdf`;

    const upload = await remoteUploadService.uploadFiles(
      { buffer: pdfBuffer, originalname: filename, mimetype: "application/pdf" },
      "quarterly-statements"
    );

    if (!upload.success || !upload.files?.[0]) {
      throw Object.assign(new Error("PDF upload failed"), { statusCode: 500 });
    }

    const fileUrl = upload.files[0].url || upload.files[0].filename;

    await prisma.quarterlyStatementRecipient.update({
      where: { id: recipientId },
      data: {
        pdfSha256: sha256,
        pdfStoragePath: upload.files[0].filename || null,
        pdfFileUrl: fileUrl,
        pdfFileSize: pdfBuffer.length,
      },
    });

    return { sha256, fileUrl, pdfBuffer };
  }
}
