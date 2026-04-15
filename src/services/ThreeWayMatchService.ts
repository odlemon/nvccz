//@ts-nocheck
import { prisma } from "../utils/database";
import {
  getSuite06PriceVariancePct,
} from "../config/suite06Config";

export type ThreeWayMatchFlag =
  | { type: "PRICE_OVER_PO"; lineIndex: number; poUnitPrice: number; invoiceUnitPrice: number; variancePct: number }
  | { type: "QTY_OVER_GRN"; lineIndex: number; purchaseOrderItemId: string; invoiceQty: number; grnAcceptedQty: number }
  | { type: "LINE_MISMATCH"; message: string }
  | { type: "TAX_MISMATCH"; expectedTaxable: boolean; vendorCompliance: string };

/**
 * Suite 6.2–6.4 — PO vs GRN vs vendor bill line checks (deterministic; LLM is for extraction only).
 */
export class ThreeWayMatchService {
  static async runMatch(purchaseInvoiceId: string): Promise<{
    status: "MATCHED" | "DISPUTED";
    flags: ThreeWayMatchFlag[];
    detail: Record<string, unknown>;
  }> {
    const inv = await prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoiceId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        vendor: true,
        sourcePurchaseOrder: { include: { items: { orderBy: { createdAt: "asc" } } } },
        sourceGoodsReceivedNote: {
          include: {
            items: { include: { purchaseOrderItem: true } },
          },
        },
      },
    });

    if (!inv) {
      throw new Error("Purchase invoice not found");
    }

    if (!inv.sourcePurchaseOrderId || !inv.sourcePurchaseOrder) {
      throw new Error("Link a source purchase order before running 3-way match");
    }

    if (!inv.sourceGoodsReceivedNoteId || !inv.sourceGoodsReceivedNote) {
      throw new Error("Link source_goods_received_note_id (GRN) before running 3-way match");
    }

    const po = inv.sourcePurchaseOrder;
    const grn = inv.sourceGoodsReceivedNote;
    const pricePct = getSuite06PriceVariancePct();

    const grnAcceptedByPoItem = new Map<string, number>();
    for (const gi of grn.items) {
      const pid = gi.purchaseOrderItemId;
      const prev = grnAcceptedByPoItem.get(pid) || 0;
      grnAcceptedByPoItem.set(pid, prev + Number(gi.quantityAccepted));
    }

    const flags: ThreeWayMatchFlag[] = [];

    const poItems = po.items;
    const invItems = inv.items;

    if (poItems.length !== invItems.length) {
      flags.push({
        type: "LINE_MISMATCH",
        message: `PO has ${poItems.length} lines, vendor bill has ${invItems.length}`,
      });
    }

    const n = Math.min(poItems.length, invItems.length);
    for (let idx = 0; idx < n; idx++) {
      const poLine = poItems[idx];
      const billLine = invItems[idx];
      const poPrice = Number(poLine.unitPrice);
      const invPrice = Number(billLine.unitPrice);
      if (poPrice > 0 && invPrice > poPrice * (1 + pricePct / 100 + 1e-9)) {
        const variancePct = ((invPrice - poPrice) / poPrice) * 100;
        flags.push({
          type: "PRICE_OVER_PO",
          lineIndex: idx,
          poUnitPrice: poPrice,
          invoiceUnitPrice: invPrice,
          variancePct,
        });
      }

      const accepted = grnAcceptedByPoItem.get(poLine.id) ?? 0;
      const invQty = Number(billLine.quantity);
      if (invQty > accepted + 1e-6) {
        flags.push({
          type: "QTY_OVER_GRN",
          lineIndex: idx,
          purchaseOrderItemId: poLine.id,
          invoiceQty: invQty,
          grnAcceptedQty: accepted,
        });
      }
    }

    const disputed = flags.some(
      (f) => f.type === "PRICE_OVER_PO" || f.type === "QTY_OVER_GRN" || f.type === "LINE_MISMATCH"
    );
    const status = disputed ? "DISPUTED" : "MATCHED";

    const detail = {
      poNumber: po.poNumber,
      grnNumber: grn.grnNumber,
      priceVarianceThresholdPct: pricePct,
      evaluatedAt: new Date().toISOString(),
      flags,
    };

    await prisma.purchaseInvoice.update({
      where: { id: purchaseInvoiceId },
      data: {
        suite06MatchStatus: status,
        suite06MatchResultJson: detail as object,
      },
    });

    return { status, flags, detail };
  }
}
