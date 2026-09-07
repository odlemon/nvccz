// @ts-nocheck
import { prisma } from "../../utils/database";
import { isAdminViewer } from "../performanceScorecardSupport";
import { TaxReturnPackAccessService } from "./TaxReturnPackAccessService";
import { TaxReturnPackAuditService } from "./TaxReturnPackAuditService";
import { TaxReturnPackGlPostingService } from "./TaxReturnPackGlPostingService";
import { TaxReturnPackPdfService } from "./TaxReturnPackPdfService";
import { TaxReturnPackProvisionService } from "./TaxReturnPackProvisionService";
import { TaxReturnPackPublishService } from "./TaxReturnPackPublishService";
import { TRP_AUDIT_EVENTS, TRP_PACK_STATUSES, TRP_TAX_REGIMES } from "./taxReturnPackSupport";

export class TaxReturnPackApprovalService {
  static async submitReview(packId: string, userId: string) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    if (pack.status !== TRP_PACK_STATUSES.DRAFT_REVIEW) {
      throw Object.assign(new Error("Only DRAFT_REVIEW packs can be submitted"), { statusCode: 400 });
    }
    // SAF-T packs deliberately carry no reconciliation/cgt lines (see TaxReturnPackSaftCompileService) —
    // their compiled output lives in liabilitySnapshot instead, so gate on that for this regime.
    const hasCompiledOutput =
      pack.taxRegime === TRP_TAX_REGIMES.ZIMRA_SAFT
        ? pack.liabilitySnapshot != null
        : pack.reconciliationLines.length > 0 || pack.cgtLines.length > 0;
    if (!hasCompiledOutput) {
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
    const isVat = pack.taxRegime === TRP_TAX_REGIMES.ZIMRA_VAT;
    const isSaft = pack.taxRegime === TRP_TAX_REGIMES.ZIMRA_SAFT;
    // VAT can legitimately be negative (input tax > output tax = refundable position); CIT/WHT/SAF-T
    // liability going negative would indicate a real bug, so keep the guard for everything else.
    if (!isVat && totalTax < 0) {
      throw Object.assign(new Error("Total tax liability cannot be negative"), { statusCode: 400 });
    }

    // SAF-T is pack-tracking only — there is no document to generate (see TaxReturnPackSaftCompileService),
    // so packPdfUrl etc. deliberately stay null rather than faking a document.
    const pdf = isSaft ? null : await TaxReturnPackPdfService.generateAndStage(pack);
    let journalEntryId: string | null = null;

    // VAT output/input are already reflected in the GL via normal invoice/expense posting to the VAT
    // Output (2100) / VAT Input (2110) control accounts. Auto-accruing the net figure again here — the
    // way CIT does via postTaxAccrual, which posts to CIT-only accounts (5500/2210) with a "Corporate
    // tax accrual" description — would misclassify or double-count it. Remitting the net VAT payable is
    // a treasury settlement handled through the normal payment workflow, not an auto-post at sign-off.
    if (!isVat && totalTax > 0) {
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
    if (pack.fundId && pdf) {
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
        packPdfSha256: pdf?.sha256 ?? null,
        packPdfUrl: pdf?.fileUrl ?? null,
        packPdfStoragePath: pdf?.storagePath ?? null,
        journalEntryId,
        portalDocumentId,
      },
    });

    await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.SIGNED_OFF, checkerUserId, {
      totalTaxLiability: totalTax,
      journalEntryId,
      portalDocumentId,
      sha256: pdf?.sha256 ?? null,
    });

    return TaxReturnPackProvisionService.getDetail(packId);
  }
}
