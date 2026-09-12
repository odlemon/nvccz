// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import RemoteUploadService from "../RemoteUploadService";
import {
  addDays,
  FUND_REPORT_ATTACH_MAX_BYTES,
  FUND_REPORT_LINK_TTL_DAYS,
  generateDownloadToken,
  sha256Buffer,
} from "./fundReportingSupport";

export type StageResult =
  | { transportMethod: "DIRECT_ATTACH"; pdfBuffer: Buffer; pdfSha256: string; pdfFileSize: number }
  | {
      transportMethod: "SECURE_LINK";
      pdfBuffer: Buffer;
      pdfSha256: string;
      pdfFileSize: number;
      downloadToken: string;
      downloadUrl: string;
      storagePath: string;
      fileUrl: string;
    };

export class FundReportAssetStager {
  static async stagePdf(jobId: string, pdfBuffer: Buffer, filename: string): Promise<StageResult> {
    const pdfSha256 = sha256Buffer(pdfBuffer);
    const pdfFileSize = pdfBuffer.length;

    if (pdfFileSize <= FUND_REPORT_ATTACH_MAX_BYTES) {
      return { transportMethod: "DIRECT_ATTACH", pdfBuffer, pdfSha256, pdfFileSize };
    }

    const uploadService = new RemoteUploadService();
    const upload = await uploadService.uploadFiles(
      {
        buffer: pdfBuffer,
        originalname: filename,
        mimetype: "application/pdf",
        size: pdfFileSize,
      },
      "fund-performance-reports"
    );
    if (!upload.success || !upload.files?.[0]) {
      throw new Error(upload.error || "PDF upload failed");
    }
    const uploaded = upload.files[0];

    const { token, tokenHash } = generateDownloadToken();
    const expiresAt = addDays(new Date(), FUND_REPORT_LINK_TTL_DAYS);

    await prisma.fundReportDownloadToken.create({
      data: {
        jobId,
        tokenHash,
        expiresAt,
      },
    });

    const base = process.env.BASE_URL?.replace(/\/+$/, "") || "";
    const downloadUrl = base
      ? `${base}/api/fund-reporting/download/${token}`
      : `/api/fund-reporting/download/${token}`;

    return {
      transportMethod: "SECURE_LINK",
      pdfBuffer,
      pdfSha256,
      pdfFileSize,
      downloadToken: token,
      downloadUrl,
      storagePath: uploaded.filename || uploaded.path || "",
      fileUrl: uploaded.url || "",
    };
  }

  static async resolveDownloadByToken(token: string): Promise<{
    jobId: string;
    buffer: Buffer;
    filename: string;
  }> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const row = await prisma.fundReportDownloadToken.findUnique({
      where: { tokenHash },
      include: { job: true },
    });
    if (!row) throw Object.assign(new Error("Invalid download token"), { statusCode: 404 });
    if (row.revokedAt) throw Object.assign(new Error("Download link revoked"), { statusCode: 410 });
    if (row.expiresAt < new Date())
      throw Object.assign(new Error("Download link expired"), { statusCode: 410 });
    if (row.usedAt) throw Object.assign(new Error("Download link already used"), { statusCode: 410 });

    const job = row.job;
    if (!job.pdfStoragePath && !job.pdfFileUrl) {
      throw new Error("PDF not available");
    }

    let buffer: Buffer;
    if (job.pdfFileUrl) {
      const uploadService = new RemoteUploadService();
      buffer = await uploadService.downloadFile(job.pdfFileUrl);
    } else {
      throw new Error("PDF storage path not resolvable");
    }

    await prisma.fundReportDownloadToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await prisma.fundReportDistributionLog.create({
      data: {
        jobId: job.id,
        eventType: "DOWNLOAD",
        message: "Secure link download completed",
      },
    });

    const filename = `fund-performance-${job.id}.pdf`;
    return { jobId: job.id, buffer, filename };
  }
}
