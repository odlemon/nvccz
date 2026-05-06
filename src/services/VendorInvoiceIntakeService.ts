//@ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { VendorInvoiceExtractionService } from "./VendorInvoiceExtractionService";
import { PurchaseInvoiceService } from "./PurchaseInvoiceService";
import { getSuite06MatchConfidenceThreshold } from "../config/suite06Config";
import AuditService from "./AuditService";

const INTAKE_PREFIX = "VIN";

export class VendorInvoiceIntakeService {
  private static async generateIntakeNumber(): Promise<string> {
    const y = new Date().getFullYear();
    const last = await prisma.vendorInvoiceIntake.findFirst({
      where: { intakeNumber: { startsWith: `${INTAKE_PREFIX}-${y}-` } },
      orderBy: { intakeNumber: "desc" },
      select: { intakeNumber: true },
    });
    let n = 1;
    if (last?.intakeNumber) {
      const m = last.intakeNumber.match(/-(\d+)$/);
      if (m) n = parseInt(m[1], 10) + 1;
    }
    return `${INTAKE_PREFIX}-${y}-${String(n).padStart(4, "0")}`;
  }

  static async getCorrectionMap(vendorId: string): Promise<Record<string, string>> {
    const rows = await prisma.vendorInvoiceFieldCorrection.findMany({
      where: { vendorId },
      select: { fieldKey: true, correctedValue: true },
    });
    const m: Record<string, string> = {};
    for (const r of rows) {
      m[r.fieldKey] = r.correctedValue;
    }
    return m;
  }

  static async createIntake(params: {
    documentUrl: string;
    vendorId: string;
    sourcePurchaseOrderId: string;
    goodsReceivedNoteId: string;
    createdById: string;
  }) {
    const intakeNumber = await this.generateIntakeNumber();
    return prisma.vendorInvoiceIntake.create({
      data: {
        intakeNumber,
        documentUrl: params.documentUrl,
        vendorId: params.vendorId,
        sourcePurchaseOrderId: params.sourcePurchaseOrderId,
        goodsReceivedNoteId: params.goodsReceivedNoteId,
        status: "DRAFT",
        createdById: params.createdById,
      },
    });
  }

  /**
   * Download PDF, extract text, run LLM parse, set status EXTRACTED or PENDING_VERIFICATION.
   */
  static async runExtraction(intakeId: string) {
    const intake = await prisma.vendorInvoiceIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new Error("Intake not found");

    const hints = await this.getCorrectionMap(intake.vendorId);
    const rawText = await VendorInvoiceExtractionService.extractTextFromUrl(
      intake.documentUrl,
      "invoice.pdf"
    );
    const { payload, rawAssistant } = await VendorInvoiceExtractionService.parseExtractedTextWithLlm(
      rawText,
      { correctionHints: hints }
    );

    const threshold = getSuite06MatchConfidenceThreshold();
    const status =
      payload.overallConfidence < threshold ? "PENDING_VERIFICATION" : "EXTRACTED";

    let taxParseStatus: string | null = "OK";
    const vendor = await prisma.vendor.findUnique({
      where: { id: intake.vendorId },
      select: { taxComplianceStatus: true },
    });
    if (payload.taxTreatment === "VAT_15" && vendor?.taxComplianceStatus === "INVALID") {
      taxParseStatus = "MISMATCH";
    }

    const updated = await prisma.vendorInvoiceIntake.update({
      where: { id: intakeId },
      data: {
        rawExtractedText: rawText.slice(0, 65000),
        extractedPayloadJson: payload as object,
        llmMetaJson: { rawAssistantLength: rawAssistant.length } as object,
        overallConfidence: new Decimal(payload.overallConfidence),
        status,
        taxParseStatus,
      },
    });

    await AuditService.log({
      userId: intake.createdById,
      action: "UPDATE",
      entityType: "VendorInvoiceIntake",
      entityId: intakeId,
      newValues: { status, overallConfidence: payload.overallConfidence },
    });

    return updated;
  }

  static async applyFieldCorrection(params: {
    vendorId: string;
    fieldKey: string;
    correctedValue: string;
    createdById: string;
  }) {
    const row = await prisma.vendorInvoiceFieldCorrection.upsert({
      where: {
        vendorId_fieldKey: {
          vendorId: params.vendorId,
          fieldKey: params.fieldKey,
        },
      },
      create: {
        vendorId: params.vendorId,
        fieldKey: params.fieldKey,
        correctedValue: params.correctedValue,
        createdById: params.createdById,
      },
      update: { correctedValue: params.correctedValue, createdById: params.createdById },
    });
    return row;
  }

  static async getIntakeById(intakeId: string) {
    const row = await prisma.vendorInvoiceIntake.findUnique({
      where: { id: intakeId },
      include: {
        vendor: { select: { id: true, name: true, bpNumber: true, taxComplianceStatus: true } },
        sourcePurchaseOrder: { select: { id: true, poNumber: true } },
        goodsReceivedNote: { select: { id: true, grnNumber: true } },
        purchaseInvoice: { select: { id: true, invoiceNumber: true, suite06MatchStatus: true } },
      },
    });
    if (!row) throw new Error("Intake not found");
    return row;
  }

  static async listVerificationQueue(take = 50) {
    return prisma.vendorInvoiceIntake.findMany({
      where: { status: "PENDING_VERIFICATION" },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        vendor: { select: { id: true, name: true, bpNumber: true } },
      },
    });
  }

  static async getCfoDashboardSummary() {
    const [matched, disputed, pendingVer, intakes] = await Promise.all([
      prisma.purchaseInvoice.count({ where: { suite06MatchStatus: "MATCHED" } }),
      prisma.purchaseInvoice.count({ where: { suite06MatchStatus: "DISPUTED" } }),
      prisma.vendorInvoiceIntake.count({ where: { status: "PENDING_VERIFICATION" } }),
      prisma.vendorInvoiceIntake.count(),
    ]);
    return {
      vendorBillsMatched: matched,
      vendorBillsDisputed: disputed,
      intakesPendingHumanVerification: pendingVer,
      totalIntakes: intakes,
    };
  }

  /**
   * Create DRAFT vendor bill from extracted payload; links PO/GRN from intake; sets duplicate guard.
   */
  static async createDraftBillFromIntake(params: {
    intakeId: string;
    createdById: string;
  }) {
    const intake = await prisma.vendorInvoiceIntake.findUnique({
      where: { id: params.intakeId },
      include: { vendor: true },
    });
    if (!intake) throw new Error("Intake not found");
    if (intake.status === "DRAFT") {
      throw new Error("Run extraction first (POST .../extract)");
    }
    if (intake.purchaseInvoiceId) {
      throw new Error("Intake already linked to a vendor bill");
    }

    const payload = intake.extractedPayloadJson as any;
    if (!payload?.lines?.length) {
      throw new Error("No extracted lines; re-run extraction");
    }

    const supRef = (payload.invoiceNumber || "").trim();
    if (!supRef) {
      throw new Error("Extracted invoice number is required to create vendor bill");
    }

    const dup = await prisma.purchaseInvoice.findFirst({
      where: {
        vendorId: intake.vendorId,
        OR: [{ vendorInvoiceReference: supRef }, { invoiceNumber: supRef }],
      },
    });
    if (dup) {
      throw new Error(
        "Duplicate supplier invoice reference for this vendor (Suite 06.6)."
      );
    }

    const currency =
      (await prisma.currency.findFirst({
        where: { code: String(payload.currencyCode || "ZIG").toUpperCase() },
      })) || (await prisma.currency.findFirst({ where: { isActive: true } }));
    if (!currency) throw new Error("No currency found");

    const invoiceDate = payload.invoiceDate
      ? new Date(payload.invoiceDate)
      : new Date();

    const isTaxable = payload.taxTreatment === "VAT_15";

    const items = payload.lines.map((l: any) => ({
      itemName: String(l.description || "Line").slice(0, 500),
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }));

    const bill = await PurchaseInvoiceService.createPurchaseInvoice({
      vendorId: intake.vendorId,
      invoiceDate,
      currencyId: currency.id,
      description: `Suite 06 intake ${intake.intakeNumber}`,
      items,
      isTaxable,
      vendorInvoiceReference: supRef,
      notes: `Created from intake ${intake.intakeNumber}`,
      createdById: params.createdById,
      sourcePurchaseOrderId: intake.sourcePurchaseOrderId || undefined,
      sourceGoodsReceivedNoteId: intake.goodsReceivedNoteId || undefined,
    });

    let suite06: { suite06MatchStatus: string | null } = { suite06MatchStatus: null };
    if (intake.status === "PENDING_VERIFICATION") {
      await prisma.purchaseInvoice.update({
        where: { id: bill.id },
        data: { suite06MatchStatus: "PENDING_VERIFICATION" },
      });
      suite06 = { suite06MatchStatus: "PENDING_VERIFICATION" };
    }

    await prisma.vendorInvoiceIntake.update({
      where: { id: intake.id },
      data: { purchaseInvoiceId: bill.id },
    });

    return { ...bill, suite06MatchStatus: suite06.suite06MatchStatus ?? bill.suite06MatchStatus };
  }

  static async markIntakeVerified(intakeId: string, userId: string) {
    const intake = await prisma.vendorInvoiceIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new Error("Intake not found");
    const updated = await prisma.vendorInvoiceIntake.update({
      where: { id: intakeId },
      data: { status: "EXTRACTED" },
    });
    if (intake.purchaseInvoiceId) {
      await prisma.purchaseInvoice.updateMany({
        where: {
          id: intake.purchaseInvoiceId,
          suite06MatchStatus: "PENDING_VERIFICATION",
        },
        data: { suite06MatchStatus: null },
      });
    }
    await AuditService.log({
      userId,
      action: "UPDATE",
      entityType: "VendorInvoiceIntake",
      entityId: intakeId,
      newValues: { status: "EXTRACTED", note: "Human verified" },
    });
    return updated;
  }
}
