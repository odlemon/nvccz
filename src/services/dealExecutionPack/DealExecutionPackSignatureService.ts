// @ts-nocheck
import { prisma } from "../../utils/database";
import { isAdminViewer } from "../performanceScorecardSupport";
import { DealExecutionPackAccessService } from "./DealExecutionPackAccessService";
import { DealExecutionPackAuditService } from "./DealExecutionPackAuditService";
import {
  DEP_AUDIT_EVENTS,
  DEP_PACK_STATUSES,
  DEP_SIG_STATUSES,
} from "./dealExecutionPackSupport";

export class DealExecutionPackSignatureService {
  static async list(packId: string) {
    return prisma.dealExecutionPackSignature.findMany({
      where: { packId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async sign(packId: string, signatureId: string, user: any) {
    const pack = await DealExecutionPackAccessService.getPack(packId);
    if (pack.status === DEP_PACK_STATUSES.EXECUTED) {
      throw Object.assign(new Error("Pack is executed and locked"), { statusCode: 400 });
    }

    const sig = await prisma.dealExecutionPackSignature.findFirst({
      where: { id: signatureId, packId },
    });
    if (!sig) throw Object.assign(new Error("Signature slot not found"), { statusCode: 404 });
    if (sig.status === DEP_SIG_STATUSES.SIGNED) return sig;

    DealExecutionPackAccessService.assertSignerMatchesRole(user, sig.roleCode);

    const priorSigner = await prisma.dealExecutionPackSignature.findFirst({
      where: { packId, status: DEP_SIG_STATUSES.SIGNED, signedAt: { not: null } },
      orderBy: { signedAt: "desc" },
    });
    if (priorSigner?.signatoryUserId === user.id && !isAdminViewer(user)) {
      throw Object.assign(new Error("Checker must differ from prior signer unless admin bypass"), {
        statusCode: 400,
      });
    }

    const row = await prisma.dealExecutionPackSignature.update({
      where: { id: signatureId },
      data: {
        status: DEP_SIG_STATUSES.SIGNED,
        signatoryUserId: user.id,
        signedAt: new Date(),
      },
    });

    const pending = await prisma.dealExecutionPackSignature.count({
      where: { packId, status: DEP_SIG_STATUSES.PENDING },
    });
    if (pending === 0 && pack.status !== DEP_PACK_STATUSES.READY_FOR_SIGNOFF) {
      await prisma.dealExecutionPack.update({
        where: { id: packId },
        data: { status: DEP_PACK_STATUSES.READY_FOR_SIGNOFF },
      });
    }

    await DealExecutionPackAuditService.log(packId, DEP_AUDIT_EVENTS.SIGNATURE_RECORDED, user.id, {
      signatureId,
      roleCode: sig.roleCode,
    });

    return row;
  }
}
