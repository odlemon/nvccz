// @ts-nocheck
import { prisma } from "./database";

/** RFQ states after which bids have been opened and decided; sealing them serves nothing. */
const DECIDED_RFQ_STATUSES = new Set(["AWARDED", "CLOSED", "CANCELLED", "COMPLETED"]);

/**
 * Suite 03: Staff must not see bid prices while sealed bidding is in force.
 *
 * Sealed when:
 * - RFQ has `sealedBidding` true, OR visibility is PUBLIC_LISTING (legacy sealed path), AND
 * - Formal bid opening has not been stamped (`bidOpenedAt`), AND
 * - RFQ is not yet awarded/closed/cancelled/completed.
 *
 * Until closing time, PUBLIC tenders without an opening stamp stay sealed even if
 * `sealedBidding` was left false (backward compatible with Suite 03.2/3.3).
 */
export async function staffShouldRedactQuotationPrices(procurementRfqId: string | null | undefined): Promise<boolean> {
  if (!procurementRfqId) return false;
  const rfq = await prisma.procurementRfq.findUnique({
    where: { id: procurementRfqId },
    select: {
      closingAt: true,
      visibility: true,
      status: true,
      sealedBidding: true,
      bidOpenedAt: true,
    },
  });
  if (!rfq) return false;
  if (DECIDED_RFQ_STATUSES.has(String(rfq.status || "").toUpperCase())) return false;
  if (rfq.bidOpenedAt) return false;

  const publicListing = String(rfq.visibility || "").toUpperCase() === "PUBLIC_LISTING";
  const sealedFlag = !!rfq.sealedBidding || publicListing;
  if (!sealedFlag) return false;

  // Before closing: always seal. After closing: still seal until formal open-bids.
  if (rfq.closingAt && new Date() < new Date(rfq.closingAt)) return true;
  return true;
}

export function redactQuotationForStaffView(quotation: any): any {
  const items = (quotation.items || []).map((it: any) => ({
    ...it,
    unitPrice: null,
    totalPrice: null,
  }));
  return {
    ...quotation,
    subtotal: null,
    taxAmount: null,
    totalAmount: null,
    items,
    bidPricesSealed: true,
    bidPricesSealedReason: "Bid opening — prices sealed until formal bid opening after the RFQ closing time.",
  };
}

export async function maybeRedactQuotationForStaff(quotation: any): Promise<any> {
  if (!quotation) return quotation;
  const sealed = await staffShouldRedactQuotationPrices(quotation.procurementRfqId);
  if (!sealed) return quotation;
  return redactQuotationForStaffView(quotation);
}

export async function maybeRedactQuotationsListForStaff(quotations: any[]): Promise<any[]> {
  return Promise.all(quotations.map((q) => maybeRedactQuotationForStaff(q)));
}
