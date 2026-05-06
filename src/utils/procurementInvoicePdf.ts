// @ts-nocheck
/**
 * Server-side PDF for procurement (vendor-submitted) `ProcurementInvoice` rows.
 * Used by `ProcurementService.approveProcurementInvoice` to email the vendor a copy.
 */
const PDFDocument = require("pdfkit");
import type { CapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";
import { drawLetterhead } from "./letterheadPdf";

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

export function safeProcurementInvoicePdfFileBaseName(part: string): string {
  const s = String(part || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s.slice(0, 80) || "Invoice";
}

export type ProcurementInvoicePdfInput = {
  invoiceNumber: string;
  invoiceDate: Date | string | null;
  dueDate?: Date | string | null;
  status?: string | null;
  paymentStatus?: string | null;
  currencyCode: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  poNumber?: string | null;
  vendor: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    bpNumber?: string | null;
    taxNumber?: string | null;
  };
  items?: Array<{
    itemName?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unitPrice?: number | string | null;
    totalPrice?: number | string | null;
  }> | null;
  letterhead?: CapitalCallAccountingLetterhead | null;
};

export async function buildProcurementInvoicePdfBuffer(
  input: ProcurementInvoicePdfInput
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
      .text("Vendor Invoice", margin, doc.y, { width: contentW, align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#333333")
      .text(`Invoice ${input.invoiceNumber || "—"}`, { align: "center" });
    doc.moveDown(0.8);

    const headerStartY = doc.y;
    const colW = (contentW - 22) / 2;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Vendor", margin, headerStartY, { width: colW });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(input.vendor.name || "—", margin, doc.y, { width: colW });
    if (input.vendor.email) doc.text(input.vendor.email, margin, doc.y, { width: colW });
    if (input.vendor.phone) doc.text(input.vendor.phone, margin, doc.y, { width: colW });
    if (input.vendor.address) doc.text(input.vendor.address, margin, doc.y, { width: colW });
    if (input.vendor.bpNumber) doc.text(`BP: ${input.vendor.bpNumber}`, margin, doc.y, { width: colW });
    if (input.vendor.taxNumber) doc.text(`Tax: ${input.vendor.taxNumber}`, margin, doc.y, { width: colW });
    const leftEndY = doc.y;

    const rightX = margin + colW + 22;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Invoice details", rightX, headerStartY, { width: colW });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(`Date: ${fmtDate(input.invoiceDate)}`, rightX, doc.y, { width: colW });
    if (input.dueDate) doc.text(`Due: ${fmtDate(input.dueDate)}`, rightX, doc.y, { width: colW });
    doc.text(`Currency: ${input.currencyCode}`, rightX, doc.y, { width: colW });
    if (input.poNumber) doc.text(`PO: ${input.poNumber}`, rightX, doc.y, { width: colW });
    if (input.status) doc.text(`Status: ${input.status}`, rightX, doc.y, { width: colW });
    if (input.paymentStatus) doc.text(`Payment: ${input.paymentStatus}`, rightX, doc.y, { width: colW });
    const rightEndY = doc.y;

    doc.x = margin;
    doc.y = Math.max(leftEndY, rightEndY) + 10;

    drawProcurementItemsTable(doc, input.items || [], input.currencyCode);

    drawTotalsBlock(doc, {
      currencyCode: input.currencyCode,
      subtotal: input.subtotal,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
    });

    doc.moveDown(1.2);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#666666")
      .text(
        "This invoice has been recorded and approved by the buyer. Payment will be processed per agreed terms.",
        margin,
        doc.y,
        { width: contentW }
      );
    doc.moveDown(0.4);
    doc.text(input.letterhead?.displayName || process.env.COMPANY_NAME_SHORT || "NVCCZ", {
      align: "right",
    });

    doc.end();
  });
}

function drawProcurementItemsTable(
  doc: any,
  items: Array<{
    itemName?: string | null;
    description?: string | null;
    quantity?: number | string | null;
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
  doc.text(`Unit price (${currencyCode})`, margin + colDescW + colQtyW, headerY + 5, {
    width: colPriceW,
    align: "right",
  });
  doc.text(`Amount (${currencyCode})`, margin + colDescW + colQtyW + colPriceW, headerY + 5, {
    width: colTotalW - 6,
    align: "right",
  });
  doc.y = headerY + 22;

  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  if (items.length === 0) {
    doc.text("(no line items)", margin + 6, doc.y, { width: tableW - 12 });
    doc.moveDown(0.6);
    return;
  }

  for (const r of items) {
    const description = String(r.itemName || r.description || "—").trim();
    const qty = Number(r.quantity ?? 0) || 0;
    const unitPrice = Number(r.unitPrice ?? 0) || 0;
    const explicitTotal = Number(r.totalPrice ?? NaN);
    const lineTotal = Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice;

    const y = doc.y;
    doc.text(description, margin + 6, y, { width: colDescW - 12 });
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
