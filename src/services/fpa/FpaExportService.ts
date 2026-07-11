// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

function downloadPath(jobId: string) {
  return `/api/v1/fpa/exports/${jobId}/download`;
}

export class FpaExportService {
  static async createBoardPack(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    const versionId = input.versionId;
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");

    const cells = await prisma.planningCell.findMany({
      where: { modelId, ...(versionId ? { versionId } : {}) },
      include: { lineItem: { select: { code: true, name: true, lineItemType: true } } },
      orderBy: [{ periodDate: "asc" }],
    });

    const payload = {
      exportType: input.exportType || "BOARD_PACK",
      modelId,
      versionId: versionId || null,
      generatedAt: new Date().toISOString(),
      cellCount: cells.length,
      cells: cells.map((c) => ({
        id: c.id,
        lineItemCode: c.lineItem?.code,
        lineItemName: c.lineItem?.name,
        periodDate: c.periodDate,
        value: c.value != null ? Number(c.value) : null,
        scenarioId: c.scenarioId,
        sourceType: c.sourceType,
      })),
      meta: input.meta || {},
    };

    const job = await prisma.planningExportJob.create({
      data: {
        modelId,
        versionId: versionId || null,
        exportType: String(input.exportType || "BOARD_PACK"),
        status: "COMPLETED",
        payloadJson: payload,
        createdById: userId,
        completedAt: new Date(),
      },
    });

    const fileUrl = downloadPath(job.id);
    const updated = await prisma.planningExportJob.update({
      where: { id: job.id },
      data: { fileUrl },
    });

    await FpaAuditService.log("EXPORT_BOARD_PACK", userId, { modelId, versionId, ip });
    return {
      ...updated,
      downloadUrl: fileUrl,
    };
  }

  static async createManagementReport(input: any, userId: string, ip?: string) {
    return FpaExportService.createBoardPack({ ...input, exportType: "MANAGEMENT_REPORT" }, userId, ip);
  }

  static async getJob(jobId: string) {
    const job = await prisma.planningExportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new FpaError(404, "NOT_FOUND", "Export job not found");
    return {
      ...job,
      downloadUrl: job.fileUrl || downloadPath(job.id),
    };
  }

  /** Returns payload + filename for controller to stream as attachment. */
  static async getDownload(jobId: string) {
    const job = await prisma.planningExportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new FpaError(404, "NOT_FOUND", "Export job not found");
    if (job.status !== "COMPLETED") {
      throw new FpaError(409, "NOT_READY", `Export status is ${job.status}`);
    }
    const payload = job.payloadJson ?? { exportType: job.exportType, modelId: job.modelId, cellCount: 0, cells: [] };
    const filename = `${String(job.exportType || "EXPORT").toLowerCase()}-${job.id}.json`;
    return { job, payload, filename, contentType: "application/json" };
  }
}
