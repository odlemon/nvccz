// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { DealExecutionPackIntegration } from "../capTable/DealExecutionPackIntegration";
import { remoteUploadService } from "../RemoteUploadService";
import { DealExecutionPackAccessService } from "./DealExecutionPackAccessService";
import { DealExecutionPackAuditService } from "./DealExecutionPackAuditService";
import { DealExecutionPackDocumentService } from "./DealExecutionPackDocumentService";
import { DealExecutionPackGlPostingService } from "./DealExecutionPackGlPostingService";
import { DealExecutionPackMetricsEngine } from "./DealExecutionPackMetricsEngine";
import { DealExecutionPackPdfService } from "./DealExecutionPackPdfService";
import { DealExecutionPackProvisionService } from "./DealExecutionPackProvisionService";
import {
  DEP_AUDIT_EVENTS,
  DEP_DOC_STATUSES,
  DEP_PACK_STATUSES,
} from "./dealExecutionPackSupport";

export class DealExecutionPackExecuteService {
  static async buildDashboard(packId: string) {
    const pack = await DealExecutionPackProvisionService.getDetail(packId);
    if (!pack) throw Object.assign(new Error("Pack not found"), { statusCode: 404 });

    const slots = pack.documentSlots.map((slot) => {
      const active = slot.documents.find((d) => d.status === DEP_DOC_STATUSES.ACTIVE) ?? null;
      return {
        slotCode: slot.slotCode,
        displayName: slot.displayName,
        isMandatory: slot.isMandatory,
        activeDocument: active
          ? { id: active.id, version: active.version, sha256: active.sha256, fileName: active.fileName }
          : null,
      };
    });

    const icpPct =
      pack.icpPct != null
        ? Number(pack.icpPct)
        : DealExecutionPackMetricsEngine.computeIcpPct(pack.cps);

    const gate = DealExecutionPackMetricsEngine.computeRLegal({
      icpPct,
      slots: slots.map((s) => ({
        slotCode: s.slotCode,
        isMandatory: s.isMandatory,
        activeDocument: s.activeDocument ? { sha256: s.activeDocument.sha256, verified: true } : null,
      })),
      signatures: pack.signatures,
    });

    return {
      packId: pack.id,
      status: pack.status,
      icpPct: gate.icpPct,
      rLegal: gate.rLegal,
      blockers: gate.blockers,
      documents: slots,
      cps: pack.cps,
      signatures: pack.signatures,
    };
  }

  static async execute(packId: string, user: any) {
    DealExecutionPackAccessService.assertCanExecute(user);
    const userId = user.id;

    const pack = await prisma.dealExecutionPack.findUnique({
      where: { id: packId },
      include: {
        fund: { select: { name: true } },
        portfolioCompany: { select: { id: true, name: true } },
        application: { select: { dealReference: true } },
        documentSlots: { include: { documents: true } },
        cps: true,
        signatures: true,
      },
    });
    if (!pack) throw Object.assign(new Error("Pack not found"), { statusCode: 404 });
    if (pack.status === DEP_PACK_STATUSES.EXECUTED) {
      throw Object.assign(new Error("Pack already executed"), { statusCode: 400 });
    }

    const dashboard = await DealExecutionPackExecuteService.buildDashboard(packId);
    if (!dashboard.rLegal) {
      await DealExecutionPackAuditService.log(packId, DEP_AUDIT_EVENTS.EXECUTE_ATTEMPT_BLOCKED, userId, {
        blockers: dashboard.blockers,
      });
      throw Object.assign(new Error(`Execute blocked: ${dashboard.blockers.join("; ")}`), { statusCode: 400 });
    }

    for (const slot of pack.documentSlots.filter((s) => s.isMandatory)) {
      const active = slot.documents.find((d) => d.status === DEP_DOC_STATUSES.ACTIVE);
      if (!active) continue;
      const verify = await DealExecutionPackDocumentService.verify(packId, active.id, userId);
      if (!verify.ok) {
        throw Object.assign(new Error(`Checksum failed for ${slot.slotCode}`), { statusCode: 409 });
      }
    }

    const pdfBuffer = await DealExecutionPackPdfService.buildClosingSummaryPdfBuffer({
      fundName: pack.fund.name,
      portfolioCompanyName: pack.portfolioCompany.name,
      dealReference: pack.application?.dealReference,
      investmentAmount: pack.investmentAmount ? Number(pack.investmentAmount) : null,
      preMoneyValuation: pack.preMoneyValuation ? Number(pack.preMoneyValuation) : null,
      baseCurrency: pack.baseCurrency,
      icpPct: dashboard.icpPct,
      executedAt: new Date(),
      packId: pack.id,
    });
    const closingSummarySha256 = createHash("sha256").update(pdfBuffer).digest("hex");
    const filename = `DEP-Closing-${pack.id.slice(0, 8)}.pdf`;
    const upload = await remoteUploadService.uploadSingleFile(
      { buffer: pdfBuffer, originalname: filename, mimetype: "application/pdf" },
      "deal-execution-pack"
    );

    let journalEntryId: string | null = null;
    const investmentAmount = pack.investmentAmount ? Number(pack.investmentAmount) : 0;
    if (investmentAmount > 0) {
      journalEntryId = await DealExecutionPackGlPostingService.postInvestment({
        packId: pack.id,
        portfolioCompanyName: pack.portfolioCompany.name,
        amount: investmentAmount,
        createdById: userId,
      });
    }

    const metadata = (pack.metadata as Record<string, unknown> | null) ?? {};
    const spaMetadata = Array.isArray(metadata.spaMetadata)
      ? metadata.spaMetadata
      : metadata.shareClassCode
        ? [
            {
              shareClassCode: String(metadata.shareClassCode),
              quantity: Number(metadata.quantity ?? 0),
              pricePerShare: Number(metadata.pricePerShare ?? 0),
              investorStakeholderRef: metadata.investorStakeholderRef
                ? String(metadata.investorStakeholderRef)
                : undefined,
            },
          ]
        : [];

    const now = new Date();
    await prisma.dealExecutionPack.update({
      where: { id: packId },
      data: {
        status: DEP_PACK_STATUSES.EXECUTED,
        executedById: userId,
        executedAt: now,
        lockedAt: now,
        icpPct: dashboard.icpPct,
        closingSummarySha256,
        closingSummaryUrl: upload.downloadURL,
        journalEntryId,
      },
    });

    if (spaMetadata.length) {
      await DealExecutionPackIntegration.onDealPackClosed(
        {
          dealExecutionPackId: pack.id,
          portfolioCompanyId: pack.portfolioCompanyId,
          closedAt: now.toISOString(),
          spaMetadata,
        },
        userId
      );
    }

    await DealExecutionPackAuditService.log(packId, DEP_AUDIT_EVENTS.PACK_EXECUTED, userId, {
      journalEntryId,
      closingSummarySha256,
      capTableItems: spaMetadata.length,
    });

    return prisma.dealExecutionPack.findUnique({ where: { id: packId } });
  }
}
