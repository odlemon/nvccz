// @ts-nocheck
import { prisma } from "../utils/database";
import { MultiCurrencyService } from "./MultiCurrencyService";
import AuditService from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";
import { normalizeRfqItemLinesFromBody, prItemsToNormalizedRfqLines, enrichRfqItemsSnapshotForApi } from "../utils/rfqItemInput";

class ClosedEventError extends Error {
  statusCode = 409;
  code = "RFQ_LOCKED";
}

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

    const { staffShouldRedactQuotationPrices, redactQuotationForStaffView } = await import(
      "../utils/quotationRedaction"
    );
    const sealed = await staffShouldRedactQuotationPrices(procurementRfqId);

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
      if (!sealed && reportingCurrencyId && cur?.id) {
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

      // Only the evaluation team's score counts. What a vendor submits in technicalScoreJson is a
      // declaration (warranty, ESG, local content), never its evaluation (PROC-FINDING-006).
      const evaluation =
        q.technicalScoreJson && typeof q.technicalScoreJson === "object"
          ? (q.technicalScoreJson as { evaluation?: { score?: unknown } }).evaluation
          : undefined;
      const evaluationScore =
        evaluation && evaluation.score !== null && evaluation.score !== undefined && Number.isFinite(Number(evaluation.score))
          ? Number(evaluation.score)
          : null;
      const technicalScore = evaluationScore ?? 0;

      const { vendor: vendorRow, items, reviewedBy, ...quotationFields } = q;
      const quotationPayload = sealed
        ? redactQuotationForStaffView({ ...quotationFields, items, vendor: vendorRow, reviewedBy })
        : { ...quotationFields, items, vendor: vendorRow, reviewedBy };

      rows.push({
        quotation: quotationPayload,
        comparison: {
          rawTotal: sealed ? null : Number(q.totalAmount),
          normalizedTotalReporting: sealed ? null : normalizedTotal,
          reportingCurrencyCode: rfq.reportingCurrency?.code ?? null,
          fxRateUsed: sealed ? null : fxRateUsed,
          vendorRating,
          technicalScore,
          /** The evaluation team's score, or null while this bid is unscored. */
          evaluationScore,
          technicalScoreJson: q.technicalScoreJson,
          // Set below, once every bid's total is known.
          priceScore: sealed ? null : 0,
          compositeScore: sealed ? technicalScore * tw : 0,
          priceWeight: pw,
          technicalWeight: tw,
          bidPricesSealed: sealed,
        },
      });
    }

    // Price scores are relative to the lowest bid, which scores 100. Skipped while sealed (Â§16).
    if (!sealed) {
      const comparableTotal = (r: any): number | null =>
        r.comparison.normalizedTotalReporting ?? (Number.isFinite(r.comparison.rawTotal) ? r.comparison.rawTotal : null);
      const lowestTotal = rows.reduce((min: number | null, r: any) => {
        const t = comparableTotal(r);
        return t != null && t > 0 && (min == null || t < min) ? t : min;
      }, null as number | null);
      for (const r of rows as any[]) {
        const t = comparableTotal(r);
        r.comparison.priceScore = lowestTotal != null && t != null && t > 0 ? (lowestTotal / t) * 100 : 0;
        r.comparison.compositeScore = r.comparison.priceScore * pw + r.comparison.technicalScore * tw;
      }
    }
    /** True once the evaluation team has scored every bid; until then a ranking is not a basis for award. */
    const evaluationComplete = rows.length > 0 && (rows as any[]).every((r) => r.comparison.evaluationScore != null);

    const lowestCost = sealed
      ? null
      : rows.reduce(
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
    const highestComposite = sealed
      ? null
      : rows.reduce(
          (best, r) =>
            (best == null || r.comparison.compositeScore > best.comparison.compositeScore) ? r : best,
          null as (typeof rows)[number] | null
        );

    const highlightSnapshot = (row: (typeof rows)[number] | null) => {
      if (!row) return null;
      const q = row.quotation as any;
      return {
        quotationId: q.id,
        quotationNumber: q.quotationNumber,
        rfqNumber: q.rfqNumber,
        vendorName: q.companyName || q.vendorName,
        vendorEmail: q.vendorEmail,
        currencyCode: q.currencyCode,
        status: q.status,
        subtotal: sealed ? null : Number(q.subtotal),
        taxAmount: sealed ? null : Number(q.taxAmount),
        totalAmount: sealed ? null : Number(q.totalAmount),
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
        bidOpenedAt: (rfq as any).bidOpenedAt ?? null,
        sealedBidding: !!(rfq as any).sealedBidding,
        expectedDeliveryDate: rfq.expectedDeliveryDate,
        deliveryAddress: rfq.deliveryAddress,
        specialRequirements: rfq.specialRequirements,
        priceWeight: pw,
        technicalWeight: tw,
        scoringConfig: rfq.scoringConfig,
        recommendationStatus: (rfq as any).recommendationStatus ?? null,
        reportingCurrency: rfq.reportingCurrency,
        awardedQuotationId: rfq.awardedQuotationId,
        awardRationale: rfq.awardRationale,
        itemsSnapshot: enrichRfqItemsSnapshotForApi(rfq.itemsSnapshot),
      },
      sealed,
      bidPricesSealed: sealed,
      bidPricesSealedReason: sealed
        ? "Bid opening â€” prices sealed until formal bid opening after the RFQ closing time."
        : null,
      quotationCount: quotations.length,
      evaluationComplete,
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

    if (!newClosingAt || Number.isNaN(newClosingAt.getTime())) throw new Error("New closing date is invalid.");
    // Extending is for an event that is still open. After the deadline the submissions are locked and only a formal,
    // reasoned, audited reopen (reopen()) can let suppliers change them.
    const st = String(rfq.status).toUpperCase();
    // A draft or approved event has sent nothing yet, so its closing date can be set to any future time.
    if (st === "DRAFT" || st === "APPROVED") {
      if (newClosingAt.getTime() <= Date.now()) throw new Error("The new deadline must be in the future");
      await prisma.procurementRfq.update({ where: { id: procurementRfqId }, data: { closingAt: newClosingAt } });
      return { success: true, status: st, closingAt: newClosingAt, notifiedVendors: 0 } as any;
    }
    const closedAlready =
      st !== "OPEN" || (rfq.closingAt != null && new Date(rfq.closingAt).getTime() <= Date.now());
    if (closedAlready) {
      throw new ClosedEventError("The deadline has passed and submissions are locked. Use the formal reopen action, with a reason, to let suppliers submit again.");
    }
    if (rfq.closingAt && newClosingAt.getTime() <= new Date(rfq.closingAt).getTime()) {
      throw new Error("The new deadline must be later than the current one");
    }
    if (newClosingAt.getTime() <= Date.now()) throw new Error("The new deadline must be in the future");
    const previousClosingAt = rfq.closingAt;

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
      oldValues: { closingAt: previousClosingAt },
      newValues: { closingAt: newClosingAt, note: "RFQ deadline extended (before the deadline)" },
    });

    return { success: true, closingAt: newClosingAt };
  }

  /**
   * Formal reopen of a sourcing event after its deadline (SRD §9 submission lock). Needs a reason and a future deadline;
   * refused once the event has been awarded. Recorded in rfq_reopen_events AND the audit trail, and every invited supplier
   * is sent a fresh link. Suppliers can then submit revised quotations again (each replaces their previous one).
   */
  static async reopen(params: { procurementRfqId: string; newClosingAt: Date; reason: string; reopenedById: string }) {
    const reason = String(params.reason || "").trim();
    if (reason.length < 10) throw new Error("A reason of at least 10 characters is required to reopen a sourcing event");
    if (!(params.newClosingAt instanceof Date) || Number.isNaN(params.newClosingAt.getTime()) || params.newClosingAt.getTime() <= Date.now()) {
      throw new Error("The new deadline must be a date in the future");
    }
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: params.procurementRfqId },
      include: { invitations: { include: { vendor: true } }, requisition: { include: { items: true } } },
    });
    if (!rfq) throw new Error("RFQ not found");
    const wasOpen = String(rfq.status).toUpperCase() === "OPEN" && !(rfq.closingAt && new Date(rfq.closingAt).getTime() <= Date.now());
    if (wasOpen) throw new Error("This event is still open; extend its deadline instead of reopening it");
    if (rfq.awardedQuotationId || ["AWARDED", "CANCELLED", "COMPLETED"].includes(String(rfq.status).toUpperCase())) {
      throw new Error(`This event is ${String(rfq.status).toLowerCase()} and cannot be reopened`);
    }
    const accepted = await prisma.vendorQuotation.count({ where: { procurementRfqId: rfq.id, status: "ACCEPTED" } });
    if (accepted > 0) throw new Error("A quotation has already been accepted for this event, so it cannot be reopened");

    const vendorIds = rfq.invitations.map((i) => i.vendorId);
    await prisma.$transaction([
      prisma.procurementRfq.update({ where: { id: rfq.id }, data: { status: "OPEN", closingAt: params.newClosingAt } }),
      prisma.rfqReopenEvent.create({
        data: {
          procurementRfqId: rfq.id,
          reopenedById: params.reopenedById,
          reason,
          previousStatus: rfq.status,
          previousClosingAt: rfq.closingAt,
          newClosingAt: params.newClosingAt,
          vendorIds,
        },
      }),
    ]);
    await AuditService.log({
      userId: params.reopenedById,
      action: "RFQ_REOPEN",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      oldValues: { status: rfq.status, closingAt: rfq.closingAt },
      newValues: { status: "OPEN", closingAt: params.newClosingAt, reason, notifiedVendors: vendorIds.length },
    });

    // Fresh links (their expiry follows the new deadline).
    const { EmailNotificationService: E } = await import("./EmailNotificationService");
    const { signVendorPortalToken, rfqPortalTokenExpiryUnixSeconds, VENDOR_PORTAL_KIND_RFQ_SUBMIT } = await import("../utils/vendorPortalToken");
    const exp = rfqPortalTokenExpiryUnixSeconds(params.newClosingAt);
    const snap = (rfq.itemsSnapshot as any)?.items;
    let emailItems = normalizeRfqItemLinesFromBody(Array.isArray(snap) ? snap : []);
    if (emailItems.length === 0 && rfq.requisitionId && rfq.requisition?.items?.length) emailItems = prItemsToNormalizedRfqLines(rfq.requisition.items);
    let emailed = 0;
    for (const inv of rfq.invitations) {
      if (!inv.vendor?.email) continue;
      try {
        await E.sendRFQToVendor({
          vendorName: inv.vendor.name,
          vendorEmail: inv.vendor.email,
          rfqNumber: rfq.rfqNumber,
          invitationToken: signVendorPortalToken({ k: VENDOR_PORTAL_KIND_RFQ_SUBMIT, v: inv.vendorId, r: rfq.id, exp }),
          rfqDate: new Date(),
          title: rfq.title,
          description: `(Reopened) ${rfq.description || ""}`,
          items: emailItems,
          deliveryAddress: rfq.deliveryAddress || undefined,
          expectedDeliveryDate: rfq.expectedDeliveryDate || undefined,
          rfqDeadline: params.newClosingAt,
          specialRequirements: rfq.specialRequirements || undefined,
          visibility: rfq.visibility,
          requisitionNumber: rfq.requisition?.requisitionNumber,
          requisitionTitle: rfq.requisition?.title,
          companyName: "NVCCZ",
        });
        emailed++;
      } catch (e: any) {
        console.error("RFQ reopen email failed", e?.message || e);
      }
    }
    return { success: true, status: "OPEN", closingAt: params.newClosingAt, notifiedVendors: emailed };
  }

  static async listReopenEvents(procurementRfqId: string) {
    return prisma.rfqReopenEvent.findMany({ where: { procurementRfqId }, orderBy: { createdAt: "desc" } });
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

  /**
   * Staff clarification: persisted with userId (vendorId stays null); emails all invited vendors.
   */
  static async postStaffClarification(params: {
    procurementRfqId: string;
    body: string;
    attachmentUrl?: string;
    userId: string;
    /** Target one invited supplier; omitted = every invitee (a general clarification). */
    vendorId?: string;
  }) {
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: params.procurementRfqId },
      include: {
        invitations: { include: { vendor: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!rfq) throw new Error("RFQ not found");
    if (params.vendorId && !rfq.invitations.some((i) => i.vendorId === params.vendorId)) {
      throw new Error("That supplier is not invited to this RFQ");
    }

    const staffUser = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { firstName: true, lastName: true },
    });
    const postedByName = staffUser
      ? `${staffUser.firstName || ""} ${staffUser.lastName || ""}`.trim()
      : undefined;

    const row = await ProcurementRfqService.addClarification({
      procurementRfqId: params.procurementRfqId,
      authorType: "STAFF",
      body: params.body,
      attachmentUrl: params.attachmentUrl,
      userId: params.userId,
      vendorId: params.vendorId,
    });

    const {
      signVendorPortalToken,
      rfqPortalTokenExpiryUnixSeconds,
      VENDOR_PORTAL_KIND_RFQ_SUBMIT,
    } = await import("../utils/vendorPortalToken");
    const rfqExp = rfqPortalTokenExpiryUnixSeconds(rfq.closingAt);

    let emailsSent = 0;
    const emailFailures: string[] = [];

    for (const inv of rfq.invitations) {
      if (!inv.vendor?.email) continue;
      if (params.vendorId && inv.vendorId !== params.vendorId) continue;
      try {
        const portalToken = signVendorPortalToken({
          k: VENDOR_PORTAL_KIND_RFQ_SUBMIT,
          v: inv.vendorId,
          r: rfq.id,
          exp: rfqExp,
        });
        await EmailNotificationService.sendRfqClarificationToVendor({
          vendorName: inv.vendor.name,
          vendorEmail: inv.vendor.email,
          rfqNumber: rfq.rfqNumber,
          rfqTitle: rfq.title,
          clarificationText: params.body,
          postedByName,
          attachmentUrl: params.attachmentUrl,
          invitationToken: portalToken,
          rfqDeadline: rfq.closingAt || undefined,
        });
        emailsSent += 1;
      } catch (e: any) {
        emailFailures.push(`${inv.vendor.email}: ${e?.message || e}`);
        console.error("RFQ clarification email failed", e);
      }
    }

    return { clarification: row, emailsSent, emailFailures };
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

  /** Â§16 â€” stamp formal bid opening; unseals staff price views. */
  static async openBids(params: {
    procurementRfqId: string;
    openedById: string;
    attendees?: Array<{ name: string; role?: string }>;
    notes?: string;
  }) {
    const rfq = await prisma.procurementRfq.findUnique({ where: { id: params.procurementRfqId } });
    if (!rfq) throw new Error("RFQ not found");
    if (rfq.bidOpenedAt) {
      return prisma.procurementRfq.findUnique({ where: { id: rfq.id } });
    }
    if (rfq.closingAt && new Date() < new Date(rfq.closingAt)) {
      throw new Error("Cannot open bids before the RFQ closing time");
    }
    const updated = await prisma.procurementRfq.update({
      where: { id: rfq.id },
      data: {
        bidOpenedAt: new Date(),
        bidOpenedById: params.openedById,
        bidOpeningAttendeesJson: {
          attendees: params.attendees || [],
          notes: params.notes || null,
          openedAt: new Date().toISOString(),
        } as object,
        sealedBidding: true,
      },
    });
    await AuditService.log({
      userId: params.openedById,
      action: "UPDATE",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      newValues: { note: "Formal bid opening (SRD Â§16)", attendees: params.attendees || [] },
    });
    return updated;
  }

  /** Â§17â€“18 â€” set configurable evaluation criteria on the RFQ. */
  static async setScoringConfig(params: {
    procurementRfqId: string;
    criteria: Array<{ id?: string; name: string; weight?: number; passFail?: boolean }>;
    updatedById: string;
  }) {
    const rfq = await prisma.procurementRfq.findUnique({ where: { id: params.procurementRfqId } });
    if (!rfq) throw new Error("RFQ not found");
    const criteria = (params.criteria || []).map((c, i) => ({
      id: c.id || `c${i + 1}`,
      name: String(c.name).trim(),
      weight: c.weight != null ? Number(c.weight) : 1,
      passFail: !!c.passFail,
    }));
    if (!criteria.length) throw new Error("At least one evaluation criterion is required");
    const existing =
      rfq.scoringConfig && typeof rfq.scoringConfig === "object" && !Array.isArray(rfq.scoringConfig)
        ? (rfq.scoringConfig as Record<string, unknown>)
        : {};
    const updated = await prisma.procurementRfq.update({
      where: { id: rfq.id },
      data: { scoringConfig: { ...existing, criteria } as object },
    });
    await AuditService.log({
      userId: params.updatedById,
      action: "UPDATE",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      oldValues: { scoringCriteria: (existing as any).criteria ?? null },
      newValues: { scoringCriteria: criteria },
    });
    return updated;
  }

  /** Â§20 â€” submit award recommendation package (pending approval before accept). */
  static async submitAwardRecommendation(params: {
    procurementRfqId: string;
    winningQuotationId: string;
    rationale: string;
    submittedById: string;
    packageNotes?: string;
    attachments?: string[];
  }) {
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: params.procurementRfqId },
      include: { quotations: { select: { id: true, status: true } } },
    });
    if (!rfq) throw new Error("RFQ not found");
    const winner = rfq.quotations.find((q) => q.id === params.winningQuotationId);
    if (!winner) throw new Error("Winning quotation is not on this RFQ");
    if (!params.rationale?.trim()) throw new Error("Award rationale is required");

    const packageJson = {
      winningQuotationId: params.winningQuotationId,
      rationale: params.rationale.trim(),
      packageNotes: params.packageNotes || null,
      attachments: params.attachments || [],
      submittedById: params.submittedById,
      submittedAt: new Date().toISOString(),
    };

    const updated = await prisma.procurementRfq.update({
      where: { id: rfq.id },
      data: {
        recommendationStatus: "PENDING_APPROVAL",
        awardRecommendationJson: packageJson as object,
        awardedQuotationId: params.winningQuotationId,
        awardRationale: params.rationale.trim(),
      },
    });

    await AuditService.log({
      userId: params.submittedById,
      action: "CREATE",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      newValues: { note: "Award recommendation submitted (SRD Â§20)", ...packageJson },
    });

    return updated;
  }

  /** Â§20 â€” approve or reject the award recommendation package. */
  static async decideAwardRecommendation(params: {
    procurementRfqId: string;
    decision: "APPROVED" | "REJECTED";
    decidedById: string;
    comments?: string;
  }) {
    const rfq = await prisma.procurementRfq.findUnique({ where: { id: params.procurementRfqId } });
    if (!rfq) throw new Error("RFQ not found");
    if (String(rfq.recommendationStatus || "").toUpperCase() !== "PENDING_APPROVAL") {
      throw new Error("No award recommendation is pending approval on this RFQ");
    }
    const existing =
      rfq.awardRecommendationJson && typeof rfq.awardRecommendationJson === "object"
        ? (rfq.awardRecommendationJson as Record<string, unknown>)
        : {};
    const updated = await prisma.procurementRfq.update({
      where: { id: rfq.id },
      data: {
        recommendationStatus: params.decision,
        awardRecommendationJson: {
          ...existing,
          decidedById: params.decidedById,
          decidedAt: new Date().toISOString(),
          decisionComments: params.comments || null,
        } as object,
      },
    });
    await AuditService.log({
      userId: params.decidedById,
      action: params.decision === "APPROVED" ? "APPROVE" : "REJECT",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      newValues: { recommendationStatus: params.decision, comments: params.comments || null },
    });
    return updated;
  }
}
