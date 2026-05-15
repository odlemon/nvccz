// @ts-nocheck
import { prisma } from "../utils/database";
import { MultiCurrencyService } from "./MultiCurrencyService";
import AuditService from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";
import { normalizeRfqItemLinesFromBody, prItemsToNormalizedRfqLines, enrichRfqItemsSnapshotForApi } from "../utils/rfqItemInput";

export class ProcurementRfqService {
  static async getById(id: string) {
    return prisma.procurementRfq.findUnique({
      where: { id },
      include: {
        requisition: { select: { id: true, requisitionNumber: true, title: true, portfolioCompanyId: true, fundId: true } },
        reportingCurrency: { select: { id: true, code: true, symbol: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        invitations: { include: { vendor: { select: { id: true, name: true, email: true, vendorRating: true } } } },
      },
    });
  }

  static async getByRfqNumber(rfqNumber: string) {
    return prisma.procurementRfq.findUnique({
      where: { rfqNumber },
    });
  }

  static async listPublicOpen() {
    const now = new Date();
    return prisma.procurementRfq.findMany({
      where: {
        visibility: "PUBLIC_LISTING",
        status: "OPEN",
        OR: [{ closingAt: null }, { closingAt: { gt: now } }],
      },
      select: {
        id: true,
        rfqNumber: true,
        title: true,
        description: true,
        closingAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  static async getComparisonMatrix(procurementRfqId: string) {
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: procurementRfqId },
      include: {
        reportingCurrency: { select: { id: true, code: true, symbol: true } },
      },
    });
    if (!rfq) throw new Error("RFQ not found");

    const quotations = await prisma.vendorQuotation.findMany({
      where: { procurementRfqId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            vendorRating: true,
            category: true,
            phone: true,
            address: true,
          },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { submittedAt: "asc" },
    });

    const reportingCurrencyId =
      rfq.reportingCurrencyId ||
      (await prisma.currency.findFirst({ where: { isDefault: true } }))?.id ||
      (await prisma.currency.findFirst({ where: { code: "ZIG" } }))?.id;

    const pw = rfq.priceWeight != null ? Number(rfq.priceWeight) : 0.5;
    const tw = rfq.technicalWeight != null ? Number(rfq.technicalWeight) : 0.5;

    const rows = [];
    for (const q of quotations) {
      let vendorRating: number | null = q.vendor?.vendorRating != null ? Number(q.vendor.vendorRating) : null;
      if (vendorRating == null && q.vendorEmail) {
        const vendorByEmail = await prisma.vendor.findFirst({
          where: { email: q.vendorEmail },
          select: { vendorRating: true },
        });
        vendorRating = vendorByEmail?.vendorRating != null ? Number(vendorByEmail.vendorRating) : null;
      }

      const cur = await prisma.currency.findFirst({ where: { code: q.currencyCode } });
      let normalizedTotal: number | null = null;
      let fxRateUsed: number | null = null;
      if (reportingCurrencyId && cur?.id) {
        try {
          const conv = await MultiCurrencyService.convertCurrency({
            amount: Number(q.totalAmount),
            fromCurrencyId: cur.id,
            toCurrencyId: reportingCurrencyId,
            date: new Date(),
          });
          normalizedTotal = conv.convertedAmount;
          fxRateUsed = conv.exchangeRate;
        } catch {
          normalizedTotal = null;
        }
      }

      let technicalScore = 0;
      if (q.technicalScoreJson && typeof q.technicalScoreJson === "object") {
        const t = q.technicalScoreJson as { score?: number };
        technicalScore = Number(t.score ?? 0);
      }
      const priceScore =
        normalizedTotal != null && normalizedTotal > 0 ? 100 / (1 + normalizedTotal / 10000) : 50;
      const compositeScore = priceScore * pw + technicalScore * tw;

      const { vendor: vendorRow, items, reviewedBy, ...quotationFields } = q;

      rows.push({
        quotation: {
          ...quotationFields,
          items,
          vendor: vendorRow,
          reviewedBy,
        },
        comparison: {
          rawTotal: Number(q.totalAmount),
          normalizedTotalReporting: normalizedTotal,
          reportingCurrencyCode: rfq.reportingCurrency?.code ?? null,
          fxRateUsed,
          vendorRating,
          technicalScore,
          technicalScoreJson: q.technicalScoreJson,
          priceScore,
          compositeScore,
          priceWeight: pw,
          technicalWeight: tw,
        },
      });
    }

    const lowestCost = rows.reduce(
      (best, r) =>
        r.comparison.normalizedTotalReporting != null &&
        (best == null ||
          r.comparison.normalizedTotalReporting < best.comparison.normalizedTotalReporting)
          ? r
          : best,
      null as (typeof rows)[number] | null
    );
    const highestRating = rows.reduce(
      (best, r) =>
        r.comparison.vendorRating != null &&
        (best == null || r.comparison.vendorRating > best.comparison.vendorRating)
          ? r
          : best,
      null as (typeof rows)[number] | null
    );
    const highestComposite = rows.reduce(
      (best, r) =>
        best == null || r.comparison.compositeScore > best.comparison.compositeScore ? r : best,
      null as (typeof rows)[number] | null
    );

    const highlightSnapshot = (row: (typeof rows)[number] | null) => {
      if (!row) return null;
      const q = row.quotation;
      return {
        quotationNumber: q.quotationNumber,
        rfqNumber: q.rfqNumber,
        vendorName: q.companyName || q.vendorName,
        vendorEmail: q.vendorEmail,
        currencyCode: q.currencyCode,
        status: q.status,
        subtotal: Number(q.subtotal),
        taxAmount: Number(q.taxAmount),
        totalAmount: Number(q.totalAmount),
        paymentTerms: q.paymentTerms,
        deliveryTerms: q.deliveryTerms,
        deliveryTime: q.deliveryTime,
        normalizedTotalReporting: row.comparison.normalizedTotalReporting,
        reportingCurrencyCode: row.comparison.reportingCurrencyCode,
        vendorRating: row.comparison.vendorRating,
        technicalScore: row.comparison.technicalScore,
        compositeScore: row.comparison.compositeScore,
      };
    };

    return {
      rfq: {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        requisitionId: rfq.requisitionId,
        title: rfq.title,
        description: rfq.description,
        status: rfq.status,
        visibility: rfq.visibility,
        closingAt: rfq.closingAt,
        expectedDeliveryDate: rfq.expectedDeliveryDate,
        deliveryAddress: rfq.deliveryAddress,
        specialRequirements: rfq.specialRequirements,
        priceWeight: pw,
        technicalWeight: tw,
        reportingCurrency: rfq.reportingCurrency,
        awardedQuotationId: rfq.awardedQuotationId,
        awardRationale: rfq.awardRationale,
        itemsSnapshot: enrichRfqItemsSnapshotForApi(rfq.itemsSnapshot),
      },
      quotationCount: quotations.length,
      reportingCurrencyId,
      rows,
      highlights: {
        lowestNormalizedCost: highlightSnapshot(lowestCost),
        highestVendorRating: highlightSnapshot(highestRating),
        highestCompositeScore: highlightSnapshot(highestComposite),
      },
    };
  }

  /** @deprecated Use `POST /api/vendor-quotations/:id/accept` instead. */
  static async awardRfq(_params: {
    procurementRfqId: string;
    winningQuotationId: string;
    awardRationale: string;
    awardedById: string;
  }) {
    throw new Error(
      "RFQ award is deprecated. Accept the winning quotation via POST /api/vendor-quotations/:id/accept and reject others via POST /api/vendor-quotations/:id/reject."
    );
  }

  static async extendClosing(params: {
    procurementRfqId: string;
    newClosingAt: Date;
    extendedById: string;
  }) {
    const { procurementRfqId, newClosingAt, extendedById } = params;
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: procurementRfqId },
      include: {
        invitations: { include: { vendor: true } },
        requisition: { include: { items: true } },
      },
    });
    if (!rfq) throw new Error("RFQ not found");

    await prisma.procurementRfq.update({
      where: { id: procurementRfqId },
      data: { closingAt: newClosingAt },
    });

    const { EmailNotificationService: E } = await import("./EmailNotificationService");
    const {
      signVendorPortalToken,
      rfqPortalTokenExpiryUnixSeconds,
      VENDOR_PORTAL_KIND_RFQ_SUBMIT,
    } = await import("../utils/vendorPortalToken");
    const rfqExp = rfqPortalTokenExpiryUnixSeconds(newClosingAt);
    const snapSource = (rfq.itemsSnapshot as any)?.items;
    let emailItems = normalizeRfqItemLinesFromBody(Array.isArray(snapSource) ? snapSource : []);
    if (
      emailItems.length === 0 &&
      rfq.requisitionId &&
      rfq.requisition?.items?.length
    ) {
      emailItems = prItemsToNormalizedRfqLines(rfq.requisition.items);
    }
    for (const inv of rfq.invitations) {
      if (inv.vendor?.email) {
        const portalToken = signVendorPortalToken({
          k: VENDOR_PORTAL_KIND_RFQ_SUBMIT,
          v: inv.vendorId,
          r: rfq.id,
          exp: rfqExp,
        });
        await E.sendRFQToVendor({
          vendorName: inv.vendor.name,
          vendorEmail: inv.vendor.email,
          rfqNumber: rfq.rfqNumber,
          invitationToken: portalToken,
          rfqDate: new Date(),
          title: rfq.title,
          description: `(Deadline extended) ${rfq.description || ""}`,
          items: emailItems,
          deliveryAddress: rfq.deliveryAddress || undefined,
          expectedDeliveryDate: rfq.expectedDeliveryDate || undefined,
          rfqDeadline: newClosingAt,
          specialRequirements: rfq.specialRequirements || undefined,
          visibility: rfq.visibility,
          requisitionNumber: rfq.requisition?.requisitionNumber,
          requisitionTitle: rfq.requisition?.title,
          companyName: "NVCCZ",
        });
      }
    }

    await AuditService.log({
      userId: extendedById,
      action: "UPDATE",
      entityType: "ProcurementRfq",
      entityId: rfq.rfqNumber,
      newValues: { closingAt: newClosingAt, note: "RFQ deadline extended" },
    });

    return { success: true, closingAt: newClosingAt };
  }

  static async addClarification(params: {
    procurementRfqId: string;
    authorType: "VENDOR" | "STAFF";
    body: string;
    attachmentUrl?: string;
    vendorId?: string;
    userId?: string;
  }) {
    return prisma.rfqClarification.create({
      data: {
        procurementRfqId: params.procurementRfqId,
        authorType: params.authorType,
        body: params.body,
        attachmentUrl: params.attachmentUrl,
        vendorId: params.vendorId,
        userId: params.userId,
      },
    });
  }

  static async listClarifications(procurementRfqId: string) {
    return prisma.rfqClarification.findMany({
      where: { procurementRfqId },
      orderBy: { createdAt: "asc" },
      include: {
        vendor: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
