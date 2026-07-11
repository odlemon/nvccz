// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

export class FpaVersionService {
  static async create(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId || !input.name) throw new FpaError(400, "VALIDATION", "modelId and name required");
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");
    const version = await prisma.planningVersion.create({
      data: {
        modelId,
        name: String(input.name),
        status: "DRAFT",
        createdById: userId,
      },
    });
    await FpaAuditService.log("VERSION_CREATE", userId, { modelId, versionId: version.id, ip });
    return version;
  }

  static async lock(versionId: string, user: any, reason?: string, ip?: string) {
    FpaAccessService.assertCanLock(user);
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    if (String(version.status).toUpperCase() === "LOCKED") {
      throw new FpaError(400, "ALREADY_LOCKED", "Version is already locked");
    }

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.planningVersion.update({
        where: { id: versionId },
        data: {
          status: "LOCKED",
          lockedAt: new Date(),
          lockedById: user.id,
        },
      });
      await tx.planningCell.updateMany({
        where: { versionId },
        data: { isLocked: true, isEditable: false },
      });
      const lockRow = await tx.planningLock.create({
        data: {
          modelId: version.modelId,
          versionId,
          lockType: "VERSION",
          lockedById: user.id,
          reason: reason || "Version locked",
        },
      });
      return { version: locked, lock: lockRow };
    });

    await FpaAuditService.log("VERSION_LOCK", user.id, {
      modelId: version.modelId,
      versionId,
      reason,
      ip,
    });
    return result;
  }

  static async archive(versionId: string, user: any, ip?: string) {
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    if (String(version.status).toUpperCase() === "LOCKED") {
      FpaAccessService.assertCanLock(user);
    }
    const updated = await prisma.planningVersion.update({
      where: { id: versionId },
      data: { status: "ARCHIVED" },
    });
    await FpaAuditService.log("VERSION_ARCHIVE", user.id, {
      modelId: version.modelId,
      versionId,
      ip,
    });
    return updated;
  }
}
