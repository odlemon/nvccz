// @ts-nocheck
import { prisma } from "../utils/database";
import { MultiCurrencyService } from "./MultiCurrencyService";
import AuditService from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";

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
        items: true,
      },
    });

    const now = new Date();
    const sealed = rfq.closingAt && now < new Date(rfq.closingAt);
    if (sealed) {
      return {
        sealed: true,
        closingAt: rfq.closingAt,
        rfqNumber: rfq.rfqNumber,
        message: "Comparison matrix is sealed until the RFQ closing time.",
        vendors: quotations.map((q) => ({
          quotationId: q.id,
          vendorName: q.companyName || q.vendorName,
          vendorEmail: q.vendorEmail,
        })),
      };
    }

    const reportingCurrencyId =
      rfq.reportingCurrencyId ||
      (await prisma.currency.findFirst({ where: { isDefault: true } }))?.id ||
      (await prisma.currency.findFirst({ where: { code: "ZIG" } }))?.id;

    const rows = [];
    for (const q of quotations) {
      const vendor = await prisma.vendor.findFirst({
        where: { email: q.vendorEmail },
        select: { id: true, vendorRating: true, name: true },
      });
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
      const pw = rfq.priceWeight != null ? Number(rfq.priceWeight) : 0.5;
      const tw = rfq.technicalWeight != null ? Number(rfq.technicalWeight) : 0.5;
      let technicalScore = 0;
      if (q.technicalScoreJson && typeof q.technicalScoreJson === "object") {
        const t = q.technicalScoreJson as { score?: number };
        technicalScore = Number(t.score ?? 0);
      }
      const priceScore =
        normalizedTotal != null && normalizedTotal > 0 ? 100 / (1 + normalizedTotal / 10000) : 50;
      const compositeScore = priceScore * Number(pw) + technicalScore * Number(tw);

      rows.push({
        quotationId: q.id,
        vendorName: q.companyName || q.vendorName,
        vendorEmail: q.vendorEmail,
        currencyCode: q.currencyCode,
        rawTotal: Number(q.totalAmount),
        normalizedTotalReporting: normalizedTotal,
        reportingCurrencyCode: rfq.reportingCurrency?.code,
        fxRateUsed,
        vendorRating: vendor?.vendorRating ? Number(vendor.vendorRating) : null,
        technicalScore,
        compositeScore,
        items: q.items,
      });
    }

    const lowestCost = rows.reduce(
      (best, r) =>
        r.normalizedTotalReporting != null &&
        (best == null || r.normalizedTotalReporting < best.normalizedTotalReporting)
          ? r
          : best,
      null as any
    );
    const highestRating = rows.reduce(
      (best, r) =>
        r.vendorRating != null && (best == null || r.vendorRating > best.vendorRating) ? r : best,
      null as any
    );

    return {
      sealed: false,
      rfqNumber: rfq.rfqNumber,
      reportingCurrencyId,
      rows,
      highlights: {
        lowestNormalizedCostQuotationId: lowestCost?.quotationId,
        highestVendorRatingQuotationId: highestRating?.quotationId,
      },
    };
  }

  static async awardRfq(params: {
    procurementRfqId: string;
    winningQuotationId: string;
    awardRationale: string;
    awardedById: string;
  }) {
    const { procurementRfqId, winningQuotationId, awardRationale, awardedById } = params;

    const rfq = await prisma.procurementRfq.findUnique({ where: { id: procurementRfqId } });
    if (!rfq) throw new Error("RFQ not found");
    if (rfq.status === "AWARDED") throw new Error("RFQ already awarded");

    const win = await prisma.vendorQuotation.findUnique({
      where: { id: winningQuotationId },
    });
    if (!win || win.procurementRfqId !== procurementRfqId) {
      throw new Error("Winning quotation does not belong to this RFQ");
    }

    const now = new Date();
    if (rfq.closingAt && now < new Date(rfq.closingAt)) {
      throw new Error("Cannot award before RFQ closing time");
    }

    await prisma.procurementRfq.update({
      where: { id: procurementRfqId },
      data: {
        status: "AWARDED",
        awardedQuotationId: winningQuotationId,
        awardRationale,
      },
    });

    await prisma.vendorQuotation.update({
      where: { id: winningQuotationId },
      data: { status: "ACCEPTED", reviewedById: awardedById, reviewedAt: new Date(), reviewNotes: awardRationale },
    });

    const others = await prisma.vendorQuotation.findMany({
      where: { procurementRfqId, id: { not: winningQuotationId } },
    });
    for (const o of others) {
      if (o.status === "SUBMITTED" || o.status === "UNDER_REVIEW") {
        await prisma.vendorQuotation.update({
          where: { id: o.id },
          data: {
            status: "REJECTED",
            reviewedById: awardedById,
            reviewedAt: new Date(),
            rejectionReason: "Not selected — another vendor was awarded this RFQ.",
          },
        });
        try {
          await EmailNotificationService.sendQuotationRejectedEmail({
            vendorName: o.companyName || o.vendorName,
            vendorEmail: o.vendorEmail,
            quotationNumber: o.quotationNumber,
            quotationAmount: Number(o.totalAmount),
            currencyCode: o.currencyCode,
            rejectionReason: "Regret — your bid was not selected for this tender.",
          });
        } catch (e) {
          console.error("Regret email failed", e);
        }
      }
    }

    try {
      await EmailNotificationService.sendQuotationAcceptedEmail({
        vendorName: win.companyName || win.vendorName,
        vendorEmail: win.vendorEmail,
        quotationNumber: win.quotationNumber,
        quotationAmount: Number(win.totalAmount),
        currencyCode: win.currencyCode,
        rfqNumber: win.rfqNumber,
        reviewNotes: `Awarded: ${awardRationale}`,
      });
    } catch (e) {
      console.error("Win email failed", e);
    }

    if (rfq.requisitionId) {
      const req = await prisma.purchaseRequisition.findUnique({
        where: { id: rfq.requisitionId },
        include: {
          requestedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });
      if (req?.requestedBy?.email) {
        try {
          await EmailNotificationService.sendRfqAwardedToSubmitter({
            submitterName: `${req.requestedBy.firstName} ${req.requestedBy.lastName}`.trim(),
            submitterEmail: req.requestedBy.email,
            requisitionNumber: req.requisitionNumber,
            requisitionTitle: req.title,
            rfqNumber: rfq.rfqNumber,
            winningQuotationNumber: win.quotationNumber,
            awardedVendorName: win.companyName || win.vendorName,
            awardRationale,
          });
        } catch (e) {
          console.error("RFQ award notification to PR submitter failed", e);
        }
      }
    }

    await AuditService.log({
      userId: awardedById,
      action: "UPDATE",
      entityType: "ProcurementRfq",
      entityId: rfq.rfqNumber,
      newValues: { status: "AWARDED", winningQuotationId, awardRationale },
    });

    return { success: true, procurementRfqId, winningQuotationId };
  }

  static async extendClosing(params: {
    procurementRfqId: string;
    newClosingAt: Date;
    extendedById: string;
  }) {
    const { procurementRfqId, newClosingAt, extendedById } = params;
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: procurementRfqId },
      include: { invitations: { include: { vendor: true } } },
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
    const snap = (rfq.itemsSnapshot as any)?.items || [];
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
          items: Array.isArray(snap) ? snap : [],
          deliveryAddress: rfq.deliveryAddress || undefined,
          expectedDeliveryDate: rfq.expectedDeliveryDate || undefined,
          rfqDeadline: newClosingAt,
          specialRequirements: rfq.specialRequirements || undefined,
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
