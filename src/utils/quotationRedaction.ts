// @ts-nocheck
import { prisma } from "./database";

/** RFQ states after which bids have been opened and decided; sealing them serves nothing. */
const DECIDED_RFQ_STATUSES = new Set(["AWARDED", "CLOSED", "CANCELLED", "COMPLETED"]);

/**
 * Suite 03: Staff must not see bid prices until RFQ closing time for **public** tenders.
 * `INVITED_ONLY` RFQs are not sealed for staff list/detail so procurement can review amounts
 * before the deadline (vendors still only access their own submission via the portal token).
 *
 * Once the RFQ is awarded (or closed, cancelled, completed) the prices are no longer sealed. They stayed
 * hidden until the closing date even after an award, so a contract raised from the award read a total of
 * nothing and was saved with value 0.
 */
export async function staffShouldRedactQuotationPrices(procurementRfqId: string | null | undefined): Promise<boolean> {
  if (!procurementRfqId) return false;
  const rfq = await prisma.procurementRfq.findUnique({
    where: { id: procurementRfqId },
    select: { closingAt: true, visibility: true, status: true },
  });
  if (!rfq?.closingAt) return false;
  if (String(rfq.visibility || "").toUpperCase() !== "PUBLIC_LISTING") {
    return false;
  }
  if (DECIDED_RFQ_STATUSES.has(String(rfq.status || "").toUpperCase())) return false;
  return new Date() < new Date(rfq.closingAt);
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
    bidPricesSealedReason: "Bid opening — prices hidden until RFQ closing time.",
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
