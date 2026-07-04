// @ts-nocheck
import { prisma } from "../../utils/database";
import { isAdminViewer } from "../performanceScorecardSupport";
import { TaxReturnPackAccessService } from "./TaxReturnPackAccessService";
import { TaxReturnPackAuditService } from "./TaxReturnPackAuditService";
import { TaxReturnPackGlPostingService } from "./TaxReturnPackGlPostingService";
import { TaxReturnPackPdfService } from "./TaxReturnPackPdfService";
import { TaxReturnPackProvisionService } from "./TaxReturnPackProvisionService";
import { TaxReturnPackPublishService } from "./TaxReturnPackPublishService";
import { TRP_AUDIT_EVENTS, TRP_PACK_STATUSES } from "./taxReturnPackSupport";

export class TaxReturnPackApprovalService {
  static async submitReview(packId: string, userId: string) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    if (pack.status !== TRP_PACK_STATUSES.DRAFT_REVIEW) {
      throw Object.assign(new Error("Only DRAFT_REVIEW packs can be submitted"), { statusCode: 400 });
    }
    if (!pack.reconciliationLines.length && !pack.cgtLines.length) {
      throw Object.assign(new Error("Compile the pack before submitting for review"), { statusCode: 400 });
    }

    await prisma.taxReturnPack.update({
      where: { id: packId },
      data: { submittedById: userId },
    });

    await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.SUBMITTED_REVIEW, userId);
    return TaxReturnPackProvisionService.getDetail(packId);
  }

  static async signOff(packId: string, checkerUserId: string) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    if (pack.status !== TRP_PACK_STATUSES.DRAFT_REVIEW) {
      throw Object.assign(new Error("Only DRAFT_REVIEW packs can be signed off"), { statusCode: 400 });
    }
    if (pack.lockedAt) {
      throw Object.assign(new Error("Pack is already locked"), { statusCode: 400 });
    }

    const makerId = pack.compiledById || pack.submittedById || pack.createdById;
    if (makerId === checkerUserId) {
      const checker = await prisma.user.findUnique({
        where: { id: checkerUserId },
        include: { role: true },
      });
      if (!isAdminViewer(checker)) {
        await TaxReturnPackAccessService.assertCheckerNotMaker(makerId, checkerUserId);
      }
    }

    const totalTax = Number(pack.totalTaxLiability ?? 0);
    if (totalTax < 0) {
      throw Object.assign(new Error("Total tax liability cannot be negative"), { statusCode: 400 });
    }

    const pdf = await TaxReturnPackPdfService.generateAndStage(pack);
    let journalEntryId: string | null = null;

    if (totalTax > 0) {
      journalEntryId = await TaxReturnPackGlPostingService.postTaxAccrual({
        packId,
        entityName: pack.forecastEntity.name,
        amount: totalTax,
        createdById: checkerUserId,
        effectiveDate: pack.periodEnd,
      });
      await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.GL_POSTED, checkerUserId, { journalEntryId });
    }

    let portalDocumentId: string | null = null;
    if (pack.fundId) {
      portalDocumentId = await TaxReturnPackPublishService.publishPack({
        pack,
        pdfUrl: pdf.fileUrl,
        storagePath: pdf.storagePath,
        sha256: pdf.sha256,
        approvedById: checkerUserId,
      });
      await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.PORTAL_PUBLISHED, checkerUserId, {
        portalDocumentId,
      });
    }

    const now = new Date();
    await prisma.taxReturnPack.update({
      where: { id: packId },
      data: {
        status: TRP_PACK_STATUSES.SIGNED_OFF,
        approvedById: checkerUserId,
        approvedAt: now,
        lockedAt: now,
        packPdfSha256: pdf.sha256,
        packPdfUrl: pdf.fileUrl,
        packPdfStoragePath: pdf.storagePath,
        journalEntryId,
        portalDocumentId,
      },
    });

    await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.SIGNED_OFF, checkerUserId, {
      totalTaxLiability: totalTax,
      journalEntryId,
      portalDocumentId,
      sha256: pdf.sha256,
    });

    return TaxReturnPackProvisionService.getDetail(packId);
  }
}
