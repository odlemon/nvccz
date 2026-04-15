// @ts-nocheck
import { prisma } from "./database";

/**
 * Suite 03: Staff must not see bid prices until RFQ closing time (service-layer redaction).
 */
export async function staffShouldRedactQuotationPrices(procurementRfqId: string | null | undefined): Promise<boolean> {
  if (!procurementRfqId) return false;
  const rfq = await prisma.procurementRfq.findUnique({
    where: { id: procurementRfqId },
    select: { closingAt: true },
  });
  if (!rfq?.closingAt) return false;
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
