// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

/**
 * Score each GRN 1–5 from promised (PO.expectedDeliveryDate) vs actual (GRN.receivedDate).
 * Averages over all qualifying GRNs for the vendor.
 */
function scoreGrn(expected: Date | null, received: Date): number | null {
  if (!expected) return null;
  const exp = new Date(expected);
  exp.setHours(23, 59, 59, 999);
  const diffMs = received.getTime() - exp.getTime();
  const lateDays = Math.floor(diffMs / (86400 * 1000));
  if (lateDays <= 0) return 5;
  if (lateDays <= 3) return 4;
  if (lateDays <= 7) return 3;
  if (lateDays <= 14) return 2;
  return 1;
}

export class VendorRatingService {
  static async recalculateForVendor(vendorId: string): Promise<{ rating: Decimal | null; samples: number }> {
    const grns = await prisma.goodsReceivedNote.findMany({
      where: {
        status: { in: ["APPROVED", "RECEIVED"] },
        purchaseOrder: { vendorId },
      },
      include: {
        purchaseOrder: {
          select: { expectedDeliveryDate: true },
        },
      },
    });

    const scores: number[] = [];
    for (const g of grns) {
      const s = scoreGrn(g.purchaseOrder.expectedDeliveryDate, g.receivedDate);
      if (s != null) scores.push(s);
    }

    if (scores.length === 0) {
      await prisma.vendor.update({
        where: { id: vendorId },
        data: { vendorRating: null, vendorRatingUpdatedAt: new Date() },
      });
      return { rating: null, samples: 0 };
    }

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const rounded = Math.round(avg * 100) / 100;
    const clamped = Math.min(5, Math.max(1, rounded));

    await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        vendorRating: new Decimal(clamped.toFixed(2)),
        vendorRatingUpdatedAt: new Date(),
      },
    });

    return { rating: new Decimal(clamped.toFixed(2)), samples: scores.length };
  }

  static async recalculateForGrnEntity(grnId: string): Promise<void> {
    const grn = await prisma.goodsReceivedNote.findUnique({
      where: { id: grnId },
      include: { purchaseOrder: { select: { vendorId: true } } },
    });
    if (!grn?.purchaseOrder?.vendorId) return;
    await this.recalculateForVendor(grn.purchaseOrder.vendorId);
  }
}
