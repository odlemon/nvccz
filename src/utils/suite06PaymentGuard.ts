//@ts-nocheck
import { getSuite06RequireMatchWhenPoGrnLinked } from "../config/suite06Config";
import { prisma } from "./database";

/**
 * Suite 6.3 / 6.4 — block submit/pay when match is disputed, intake awaits verification,
 * or (when configured) PO+GRN are linked but 3-way match is not MATCHED.
 */
export async function assertPurchaseInvoicePaymentAllowedForSuite06(
  purchaseInvoiceId: string
): Promise<void> {
  const [inv, intake] = await Promise.all([
    prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoiceId },
      select: {
        suite06MatchStatus: true,
        sourcePurchaseOrderId: true,
        sourceGoodsReceivedNoteId: true,
      },
    }),
    prisma.vendorInvoiceIntake.findFirst({
      where: { purchaseInvoiceId },
      select: { status: true },
    }),
  ]);

  if (intake?.status === "PENDING_VERIFICATION") {
    throw new Error(
      "Payment blocked (Suite 06): vendor invoice intake is pending human verification."
    );
  }

  const s = inv?.suite06MatchStatus;
  if (s === "DISPUTED") {
    throw new Error(
      "Payment blocked (Suite 06): 3-way match is DISPUTED (price/quantity). Resolve or issue credit note."
    );
  }
  if (s === "PENDING_VERIFICATION") {
    throw new Error(
      "Payment blocked (Suite 06): match flagged for verification."
    );
  }

  const poGrnLinked =
    Boolean(inv?.sourcePurchaseOrderId) && Boolean(inv?.sourceGoodsReceivedNoteId);
  if (getSuite06RequireMatchWhenPoGrnLinked() && poGrnLinked && s !== "MATCHED") {
    throw new Error(
      "Payment blocked (Suite 06): purchase order and GRN are linked — run 3-way match and obtain MATCHED status before submit or payment (POST /api/procurement/suite06/purchase-invoices/:purchaseInvoiceId/run-match)."
    );
  }
}
