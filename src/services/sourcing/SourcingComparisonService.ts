import { prisma } from "../../utils/database";
import { SourcingAccessService, phaseOf } from "./SourcingAccessService";
import { EvaluationService } from "./EvaluationService";
import { BidOpeningService } from "./BidOpeningService";
import { AwardRecommendationService } from "./AwardRecommendationService";

const LIVE = ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"];
const METHOD_LABEL: Record<string, string> = { VENDOR_PORTAL: "Vendor portal", STAFF_CAPTURE: "Captured by procurement" };

/**
 * SRD §17: the supplier comparison. Suppliers are the columns; the rows are those the requirement names. Everything is filtered by
 * the caller's release level before it leaves the server, so a sealed event returns a count and nothing else.
 *
 * The system never selects a supplier. The ranking returned is labelled advisory, appears only when the evaluation is complete,
 * and excludes bids that failed a mandatory requirement. Recommending and awarding are separate, human, approved steps.
 */
export class SourcingComparisonService {
  static async compare(user: any, rfqIdOrNumber: string) {
    const rfq: any = await SourcingAccessService.loadRfq(rfqIdOrNumber);
    if (!rfq) throw Object.assign(new Error("Sourcing event not found"), { status: 404 });
    const ctx = await SourcingAccessService.resolve(user, rfq);
    const submissions = await prisma.vendorQuotation.count({ where: { procurementRfqId: rfq.id, status: { in: LIVE } } });
    const head = {
      rfq: {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        title: rfq.title,
        status: rfq.status,
        closingAt: rfq.closingAt,
        bidOpenedAt: rfq.bidOpenedAt,
        evaluationMode: rfq.evaluationMode,
        sealedBidding: !!rfq.sealedBidding,
      },
      phase: ctx.phase,
      sealed: ctx.sealed,
      level: ctx.level,
      priceVisible: ctx.priceVisible,
      reason: ctx.reason,
      submissions,
      autoSelection: false,
      autoSelectionNotice: "The system does not select a supplier. Any ranking shown is advisory; the recommendation and the award are human decisions.",
    };
    if (ctx.level === "COUNT") return { ...head, columns: [], rows: [], documents: {}, advisory: null, opening: await BidOpeningService.describe(rfq.id), fx: null, recommendation: null };

    const quotes: any[] = await prisma.vendorQuotation.findMany({
      where: { procurementRfqId: rfq.id, status: { in: LIVE } },
      include: { vendor: { select: { id: true, name: true, vendorCode: true } } },
      orderBy: { submittedAt: "asc" },
    });
    const result = await EvaluationService.consolidate(rfq.id, { level: ctx.level, member: ctx.member, priceVisible: ctx.priceVisible });
    const opening = await BidOpeningService.describe(rfq.id);
    const byQ = new Map<string, any>(result.rows.map((r: any) => [r.quotationId, r]));

    const docsRaw = await prisma.vendorDocumentAttachment.findMany({
      where: { entityType: "VENDOR_QUOTATION", entityId: { in: quotes.map((q) => q.id) } },
      orderBy: { createdAt: "asc" },
    });
    const documents: Record<string, any[]> = {};
    for (const d of docsRaw) {
      if (!ctx.priceVisible && d.envelope !== "TECHNICAL") continue;
      (documents[d.entityId as string] ||= []).push({
        id: d.id, fileName: d.originalFileName, envelope: d.envelope, version: d.version, status: d.status, sha256: d.sha256Checksum,
        uploadedVia: d.uploadSource, submittedAt: d.createdAt, downloadPath: `/api/procurement/document-attachments/${d.id}/download`,
      });
    }

    const withheld = ctx.priceVisible ? null : "Withheld until you submit your technical scorecard";
    const scoreVisible = !result.resultsWithheld;
    const val = (fn: (q: any) => any) => Object.fromEntries(quotes.map((q) => [q.id, fn(q)]));
    const fx = opening
      ? {
          reportingCurrencyCode: opening.reportingCurrencyCode,
          basis: "Converted at the exchange rates frozen at bid opening",
          asOf: opening.openedAt,
          rates: [...new Set([...Object.keys((opening.fxSnapshot as any) || {}), ...Object.keys(rfq.fxOverrides || {})])].map((code: string) => {
            const st = (rfq.fxOverrides || {})[code];
            const fz = ((opening.fxSnapshot as any) || {})[code];
            return st
              ? { currency: code, rate: Number(st.rate), source: "STATED", reason: st.reason, setAt: st.setAt }
              : { currency: code, rate: fz?.rate ?? null, source: fz?.rate != null ? "FROZEN_AT_OPENING" : "MISSING", note: fz?.rate != null ? undefined : "No exchange rate was available at opening: quotations in this currency are not comparable until a rate is stated." };
          }),
        }
      : null;
    const now = Date.now();
    const rows = [
      { key: "quotedAmount", label: "Quoted Amount", values: val((q) => (ctx.priceVisible ? Number(q.totalAmount) : null)) },
      { key: "currency", label: "Currency", values: val((q) => (ctx.priceVisible ? q.currencyCode : null)) },
      { key: "comparableAmount", label: `Comparable amount${fx?.reportingCurrencyCode ? ` (${fx.reportingCurrencyCode})` : ""}`, values: val((q) => (ctx.priceVisible ? byQ.get(q.id)?.comparableAmount ?? null : null)) },
      { key: "vat", label: "VAT", values: val((q) => (ctx.priceVisible ? { amount: Number(q.taxAmount), rate: q.vatRate == null ? null : Number(q.vatRate) } : null)) },
      { key: "deliveryPeriod", label: "Delivery Period", values: val((q) => ({ text: q.deliveryTime ?? null, days: q.deliveryPeriodDays ?? null })) },
      { key: "paymentTerms", label: "Payment Terms", values: val((q) => q.paymentTerms ?? null) },
      { key: "validity", label: "Quotation Validity", values: val((q) => ({ validUntil: q.validUntil ?? null, expired: q.validUntil ? new Date(q.validUntil).getTime() < now : false })) },
      { key: "compliance", label: "Compliance Status", values: val((q) => (scoreVisible ? byQ.get(q.id)?.compliance ?? "PENDING" : null)) },
      { key: "technicalScore", label: "Technical Score", values: val((q) => (scoreVisible ? byQ.get(q.id)?.technicalScore ?? null : null)) },
      { key: "commercialScore", label: "Commercial Score", values: val((q) => (scoreVisible && ctx.priceVisible ? byQ.get(q.id)?.commercialScore ?? null : null)) },
      { key: "totalScore", label: "Total Score", values: val((q) => (scoreVisible && ctx.priceVisible ? byQ.get(q.id)?.totalScore ?? null : null)) },
    ];
    const columns = quotes.map((q) => {
      const r = byQ.get(q.id);
      return {
        quotationId: q.id,
        quotationNumber: q.quotationNumber,
        quotationReference: q.quotationReference,
        quotationDate: q.quotationDate,
        supplier: { id: q.vendorId, name: q.companyName || q.vendor?.name || q.vendorName, code: q.vendor?.vendorCode ?? null },
        submittedAt: q.submittedAt,
        submissionMethod: q.submissionMethod,
        submissionMethodLabel: METHOD_LABEL[q.submissionMethod] || q.submissionMethod,
        captureChannel: q.captureChannel,
        status: q.status,
        disqualified: !!r?.disqualified,
        failedCriteria: r?.failedCriteria ?? [],
        advisoryRank: r?.advisoryRank ?? null,
        integrity: q.snapshotSha256 ? "recorded" : "legacy",
        comparable: ctx.priceVisible ? r?.comparableAmount != null : null,
        comparabilityNote: ctx.priceVisible && r && r.comparableAmount == null ? `Not comparable: no exchange rate from ${q.currencyCode} to ${fx?.reportingCurrencyCode ?? "the reporting currency"}. State a rate to include it.` : null,
      };
    });
    const advisory =
      ctx.level === "FULL" && result.complete && ctx.priceVisible
        ? {
            advisory: true,
            notice: "Advisory ranking of qualified, fully scored bids by total score. It is not a selection or a recommendation.",
            ranking: columns.filter((c) => c.advisoryRank).sort((a, b) => a.advisoryRank! - b.advisoryRank!).map((c) => ({ quotationId: c.quotationId, supplier: c.supplier.name, rank: c.advisoryRank })),
          }
        : null;
    return {
      ...head,
      priceNotice: withheld,
      columns,
      rows,
      documents,
      opening,
      fx,
      evaluation: { criteria: result.criteria, complete: result.complete, countedEvaluators: result.countedEvaluators, pendingEvaluators: result.pendingEvaluators, resultsWithheld: result.resultsWithheld, minEvaluators: result.minEvaluators, committee: result.committee },
      advisory,
      recommendation: ctx.level === "FULL" || ctx.canAward ? await AwardRecommendationService.describe(rfq.id) : null,
      phase: phaseOf(rfq),
    };
  }
}
