// @ts-nocheck
/**
 * Server-side PDF for procurement vendor quotations (`VendorQuotation`).
 *
 * Includes a large diagonal `ACCEPTED` / `REJECTED` watermark when a decision is supplied,
 * letting vendors see the outcome at a glance.
 */
const PDFDocument = require("pdfkit");
import type { CapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";
import { drawLetterhead } from "./letterheadPdf";

export type VendorQuotationDecision = "ACCEPTED" | "REJECTED" | null | undefined;

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().slice(0, 10);
}

export function safeVendorQuotationPdfFileBaseName(part: string): string {
  const s = String(part || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s.slice(0, 80) || "Quotation";
}

export type VendorQuotationPdfInput = {
  quotationNumber: string;
  rfqNumber?: string | null;
  status?: string | null;
  submittedAt?: Date | string | null;
  validUntil?: Date | string | null;
  reviewedAt?: Date | string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  deliveryTime?: string | null;
  currencyCode: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  vendor: {
    name: string;
    email?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    taxEIN?: string | null;
  };
  items?: Array<{
    itemName?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unitPrice?: number | string | null;
    totalPrice?: number | string | null;
    brand?: string | null;
    model?: string | null;
    warranty?: string | null;
  }> | null;
  letterhead?: CapitalCallAccountingLetterhead | null;
  decision?: VendorQuotationDecision;
};

export async function buildVendorQuotationPdfBuffer(
  input: VendorQuotationPdfInput
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 50;
    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;

    drawLetterhead(doc, input.letterhead);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#111111")
      .text("Vendor Quotation", margin, doc.y, { width: contentW, align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#333333")
      .text(`Quotation ${input.quotationNumber || "—"}`, { align: "center" });
    if (input.rfqNumber) {
      doc.text(`RFQ: ${input.rfqNumber}`, { align: "center" });
    }
    doc.moveDown(0.8);

    const headerStartY = doc.y;
    const gap = 20;
    const detailColW = 260;
    const detailsX = pageW - margin - detailColW;
    const leftColW = Math.max(160, detailsX - margin - gap);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Vendor", margin, headerStartY, { width: leftColW });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    if (input.vendor.companyName) doc.text(input.vendor.companyName, margin, doc.y, { width: leftColW });
    doc.text(input.vendor.name || "—", margin, doc.y, { width: leftColW });
    if (input.vendor.contactPerson) doc.text(`Contact: ${input.vendor.contactPerson}`, margin, doc.y, { width: leftColW });
    if (input.vendor.email) doc.text(input.vendor.email, margin, doc.y, { width: leftColW });
    if (input.vendor.phoneNumber) doc.text(input.vendor.phoneNumber, margin, doc.y, { width: leftColW });
    if (input.vendor.address) doc.text(input.vendor.address, margin, doc.y, { width: leftColW });
    if (input.vendor.taxEIN) doc.text(`Tax/EIN: ${input.vendor.taxEIN}`, margin, doc.y, { width: leftColW });
    const leftEndY = doc.y;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Quotation details", detailsX, headerStartY, { width: detailColW, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(`Submitted: ${fmtDate(input.submittedAt)}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (input.validUntil) doc.text(`Valid until: ${fmtDate(input.validUntil)}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (input.reviewedAt) doc.text(`Reviewed: ${fmtDate(input.reviewedAt)}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (input.paymentTerms) doc.text(`Payment terms: ${input.paymentTerms}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (input.deliveryTerms) doc.text(`Delivery terms: ${input.deliveryTerms}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (input.deliveryTime) doc.text(`Delivery time: ${input.deliveryTime}`, detailsX, doc.y, { width: detailColW, align: "right" });
    const rightEndY = doc.y;

    doc.x = margin;
    doc.y = Math.max(leftEndY, rightEndY) + 10;

    drawQuotationItemsTable(doc, input.items || [], input.currencyCode);

    drawTotalsBlock(doc, {
      currencyCode: input.currencyCode,
      subtotal: input.subtotal,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
    });

    if (input.decision === "ACCEPTED" || input.decision === "REJECTED") {
      doc.moveDown(0.6);
      const label =
        input.decision === "ACCEPTED" ? "Acceptance notes" : "Rejection reason";
      const body =
        input.decision === "ACCEPTED"
          ? input.reviewNotes || "—"
          : input.rejectionReason || input.reviewNotes || "—";
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(label, margin, doc.y);
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(10).fillColor("#000000").text(body, margin, doc.y, {
        width: contentW,
      });
    }

    doc.moveDown(1.2);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#666666")
      .text(
        "This document confirms the procurement decision on the above quotation.",
        margin,
        doc.y,
        { width: contentW }
      );
    doc.moveDown(0.4);
    doc.text(input.letterhead?.displayName || process.env.COMPANY_NAME_SHORT || "NVCCZ", {
      align: "right",
    });

    drawDecisionWatermark(doc, input.decision);

    doc.end();
  });
}

function drawQuotationItemsTable(
  doc: any,
  items: Array<{
    itemName?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unitPrice?: number | string | null;
    totalPrice?: number | string | null;
  }>,
  currencyCode: string
): void {
  const margin = 50;
  const pageW = doc.page.width;
  const tableW = pageW - margin * 2;
  const colDescW = Math.floor(tableW * 0.5);
  const colQtyW = Math.floor(tableW * 0.12);
  const colPriceW = Math.floor(tableW * 0.18);
  const colTotalW = tableW - colDescW - colQtyW - colPriceW;

  const headerY = doc.y;
  doc.save();
  doc.rect(margin, headerY, tableW, 18).fill("#f2f4f7");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333");
  doc.text("Description", margin + 6, headerY + 5, { width: colDescW - 12 });
  doc.text("Qty", margin + colDescW, headerY + 5, { width: colQtyW, align: "right" });
  doc.text("Unit price", margin + colDescW + colQtyW, headerY + 5, {
    width: colPriceW,
    align: "right",
  });
  doc.text("Amount", margin + colDescW + colQtyW + colPriceW, headerY + 5, {
    width: colTotalW - 6,
    align: "right",
  });
  doc.y = headerY + 22;

  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  if (items.length === 0) {
    doc.text("(no items)", margin + 6, doc.y, { width: tableW - 12 });
    doc.moveDown(0.6);
    return;
  }

  for (const r of items) {
    const description = String(r.itemName || r.description || "—").trim();
    const unit = r.unit ? ` (${r.unit})` : "";
    const qty = Number(r.quantity ?? 0) || 0;
    const unitPrice = Number(r.unitPrice ?? 0) || 0;
    const explicitTotal = Number(r.totalPrice ?? NaN);
    const lineTotal = Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice;

    const y = doc.y;
    doc.text(`${description}${unit}`, margin + 6, y, { width: colDescW - 12 });
    doc.text(String(qty), margin + colDescW, y, { width: colQtyW, align: "right" });
    doc.text(fmtMoney(unitPrice), margin + colDescW + colQtyW, y, {
      width: colPriceW,
      align: "right",
    });
    doc.text(fmtMoney(lineTotal), margin + colDescW + colQtyW + colPriceW, y, {
      width: colTotalW - 6,
      align: "right",
    });
    doc.moveDown(0.9);
  }
}

function drawTotalsBlock(
  doc: any,
  params: {
    currencyCode: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  }
): void {
  const margin = 50;
  const pageW = doc.page.width;
  const labelW = 200;
  const totalsX = pageW - margin - labelW - 140;
  const valW = 140;

  doc.moveDown(0.4);
  let y = doc.y;
  const rows: Array<[string, string]> = [
    ["Subtotal", `${params.currencyCode} ${fmtMoney(params.subtotal)}`],
    ["Tax", `${params.currencyCode} ${fmtMoney(params.taxAmount)}`],
  ];

  doc.font("Helvetica").fontSize(10).fillColor("#000000");
  for (const [k, v] of rows) {
    doc.text(k, totalsX, y, { width: labelW, align: "right" });
    doc.text(v, totalsX + labelW, y, { width: valW, align: "right" });
    y += 14;
  }

  doc.save();
  doc.rect(totalsX, y + 4, labelW + valW, 24).fill("#111827");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff");
  doc.text("Total", totalsX + 8, y + 11, { width: labelW - 12, align: "right" });
  doc.text(
    `${params.currencyCode} ${fmtMoney(params.totalAmount)}`,
    totalsX + labelW,
    y + 11,
    { width: valW - 8, align: "right" }
  );
  doc.fillColor("#000000");
  doc.y = y + 32;
  doc.x = margin;
}

function drawDecisionWatermark(doc: any, decision: VendorQuotationDecision): void {
  if (decision !== "ACCEPTED" && decision !== "REJECTED") return;

  const text = decision;
  const color = decision === "ACCEPTED" ? "#16a34a" : "#dc2626";

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  doc.save();
  try {
    doc.fillColor(color);
    doc.fillOpacity(0.16);
    doc.font("Helvetica-Bold").fontSize(110);

    const cx = pageW / 2;
    const cy = pageH / 2;

    doc.rotate(-30, { origin: [cx, cy] });
    const w = doc.widthOfString(text);
    const h = 110;
    doc.text(text, cx - w / 2, cy - h / 2, { lineBreak: false });
  } finally {
    doc.restore();
  }
}
