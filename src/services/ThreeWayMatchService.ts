//@ts-nocheck
import { prisma } from "../utils/database";

export type ThreeWayMatchFlag =
  | { type: "PRICE_OVER_PO"; lineIndex: number; poUnitPrice: number; invoiceUnitPrice: number; variancePct: number }
  | { type: "QTY_OVER_GRN"; lineIndex: number; purchaseOrderItemId: string; invoiceQty: number; grnAcceptedQty: number }
  | { type: "LINE_MISMATCH"; message: string }
  | { type: "TAX_MISMATCH"; expectedTaxable: boolean; vendorCompliance: string };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Suite 6.2–6.4 — PO vs GRN vs vendor bill line checks (deterministic; LLM is for extraction only).
 * Lines are paired by item name / description similarity first; index is only a last resort.
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
    const { resolveMatchPriceVariancePct } = await import("../config/suite06Config");
    const pricePct = await resolveMatchPriceVariancePct();

    const grnAcceptedByPoItem = new Map<string, number>();
    for (const gi of grn.items) {
      const pid = gi.purchaseOrderItemId;
      const prev = grnAcceptedByPoItem.get(pid) || 0;
      grnAcceptedByPoItem.set(pid, prev + Number(gi.quantityAccepted));
    }

    const flags: ThreeWayMatchFlag[] = [];

    const poItems = po.items;
    const invItems = inv.items;

    const tokenSet = (s: string) =>
      new Set(
        norm(s)
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 2)
      );
    const similarity = (a: string, b: string) => {
      const A = tokenSet(a);
      const B = tokenSet(b);
      if (!A.size || !B.size) return 0;
      let hit = 0;
      for (const t of A) if (B.has(t)) hit++;
      return hit / Math.max(A.size, B.size);
    };

    const byName = new Map<string, typeof poItems>();
    for (const l of poItems) {
      const k = norm(l.itemName);
      byName.set(k, [...(byName.get(k) ?? []), l]);
    }
    const used = new Set<string>();
    const pairs: Array<{ billIdx: number; poLine: (typeof poItems)[number] | null }> = [];

    invItems.forEach((billLine, idx) => {
      const candidates = (byName.get(norm(billLine.itemName)) ?? []).filter((l) => !used.has(l.id));
      let hit = candidates[0] ?? null;
      if (!hit) {
        let best: { line: (typeof poItems)[number]; score: number } | null = null;
        const hay = `${billLine.itemName || ""} ${billLine.description || ""}`;
        for (const l of poItems) {
          if (used.has(l.id)) continue;
          const score = Math.max(
            similarity(hay, String(l.itemName || "")),
            similarity(hay, `${l.itemName || ""} ${l.description || ""}`)
          );
          if (score >= 0.45 && (!best || score > best.score)) best = { line: l, score };
        }
        if (best) hit = best.line;
      }
      if (!hit && invItems.length === poItems.length && poItems[idx] && !used.has(poItems[idx].id)) {
        hit = poItems[idx];
      }
      if (hit) used.add(hit.id);
      pairs.push({ billIdx: idx, poLine: hit });
    });

    const unmatchedBills = pairs.filter((p) => !p.poLine).length;
    const unmatchedPo = poItems.filter((l) => !used.has(l.id)).length;
    if (unmatchedBills || unmatchedPo) {
      flags.push({
        type: "LINE_MISMATCH",
        message: `Could not pair all lines (PO ${poItems.length}, bill ${invItems.length}; ${unmatchedBills} bill line(s) and ${unmatchedPo} PO line(s) unmatched)`,
      });
    }

    for (const { billIdx, poLine } of pairs) {
      if (!poLine) continue;
      const billLine = invItems[billIdx];
      const poPrice = Number(poLine.unitPrice);
      const invPrice = Number(billLine.unitPrice);
      if (poPrice > 0 && invPrice > poPrice * (1 + pricePct / 100 + 1e-9)) {
        const variancePct = ((invPrice - poPrice) / poPrice) * 100;
        flags.push({
          type: "PRICE_OVER_PO",
          lineIndex: billIdx,
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
          lineIndex: billIdx,
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
      pairing: pairs.map((p) => ({
        billLineIndex: p.billIdx,
        purchaseOrderItemId: p.poLine?.id ?? null,
        poItemName: p.poLine?.itemName ?? null,
      })),
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
