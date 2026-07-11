// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

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

    await FpaAuditService.log("EXPORT_BOARD_PACK", userId, { modelId, versionId, ip });
    return job;
  }

  static async createManagementReport(input: any, userId: string, ip?: string) {
    return FpaExportService.createBoardPack({ ...input, exportType: "MANAGEMENT_REPORT" }, userId, ip);
  }
}
