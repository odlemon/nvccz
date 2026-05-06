// @ts-nocheck
/**
 * Server-side PDF for sales invoices (`Invoice` model). Same letterhead pipeline as payslips.
 *
 * Used by `InvoiceService.sendInvoice` to attach the PDF to the customer email.
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

export function safeInvoicePdfFileBaseName(part: string): string {
  const s = String(part || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s.slice(0, 80) || "Invoice";
}

type InvoiceLine = {
  description?: string | null;
  itemName?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  unit_price?: number | string | null;
  price?: number | string | null;
  lineTotal?: number | string | null;
  total?: number | string | null;
  amount?: number | string | null;
};

export type SalesInvoicePdfInput = {
  invoiceNumber: string | null;
  transactionDate: Date | string | null;
  dueDate?: Date | string | null;
  description?: string | null;
  status?: string | null;
  currencyCode: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount?: number;
  outstandingAmount?: number;
  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  items?: InvoiceLine[] | null;
  letterhead?: CapitalCallAccountingLetterhead | null;
};

function normaliseItems(items: InvoiceLine[] | null | undefined): Array<{
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}> {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const description = String(
      raw.description ?? raw.itemName ?? raw.name ?? ""
    ).trim();
    const quantity = Number(raw.quantity ?? 0) || 0;
    const unitPrice = Number(raw.unitPrice ?? raw.unit_price ?? raw.price ?? 0) || 0;
    const explicitTotal = Number(raw.lineTotal ?? raw.total ?? raw.amount ?? NaN);
    const lineTotal = Number.isFinite(explicitTotal) ? explicitTotal : quantity * unitPrice;
    return { description, quantity, unitPrice, lineTotal };
  });
}

export async function buildInvoicePdfBuffer(input: SalesInvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
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
      .text("Tax Invoice", margin, doc.y, { width: contentW, align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#333333")
      .text(`Invoice ${input.invoiceNumber || "—"}`, { align: "center" });
    doc.moveDown(0.8);

    // Bill to (left) | Invoice details flush right
    const headerStartY = doc.y;
    const gap = 20;
    const detailColW = 240;
    const detailsX = pageW - margin - detailColW;
    const leftColW = Math.max(160, detailsX - margin - gap);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Bill to", margin, headerStartY, { width: leftColW });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(input.customer.name || "—", margin, doc.y, { width: leftColW });
    if (input.customer.email) doc.text(input.customer.email, margin, doc.y, { width: leftColW });
    if (input.customer.phone) doc.text(input.customer.phone, margin, doc.y, { width: leftColW });
    if (input.customer.address) doc.text(input.customer.address, margin, doc.y, { width: leftColW });
    const leftEndY = doc.y;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Invoice details", detailsX, headerStartY, { width: detailColW, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(`Date: ${fmtDate(input.transactionDate)}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (input.dueDate) {
      doc.text(`Due: ${fmtDate(input.dueDate)}`, detailsX, doc.y, { width: detailColW, align: "right" });
    }
    const rightEndY = doc.y;

    doc.x = margin;
    doc.y = Math.max(leftEndY, rightEndY) + 10;

    if (input.description) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Description");
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(10).fillColor("#000000").text(input.description, { width: contentW });
      doc.moveDown(0.6);
    }

    const items = normaliseItems(input.items);
    drawItemsTable(doc, items, input.currencyCode);

    drawTotalsBlock(doc, {
      currencyCode: input.currencyCode,
      subtotal: input.amount,
      vatAmount: input.vatAmount,
      totalAmount: input.totalAmount,
      paidAmount: input.paidAmount,
      outstandingAmount: input.outstandingAmount,
    });

    doc.moveDown(1.2);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#666666")
      .text(
        "This is a computer-generated tax invoice. Please contact the issuer for any queries.",
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

function drawItemsTable(
  doc: any,
  items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>,
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
    doc.text("(no line items)", margin + 6, doc.y, { width: tableW - 12 });
    doc.moveDown(0.6);
    return;
  }

  for (const r of items) {
    const y = doc.y;
    doc.text(r.description || "—", margin + 6, y, { width: colDescW - 12 });
    doc.text(String(r.quantity), margin + colDescW, y, { width: colQtyW, align: "right" });
    doc.text(fmtMoney(r.unitPrice), margin + colDescW + colQtyW, y, {
      width: colPriceW,
      align: "right",
    });
    doc.text(fmtMoney(r.lineTotal), margin + colDescW + colQtyW + colPriceW, y, {
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
    vatAmount: number;
    totalAmount: number;
    paidAmount?: number;
    outstandingAmount?: number;
  }
): void {
  const margin = 50;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const labelW = 200;
  const totalsX = pageW - margin - labelW - 140;
  const valW = 140;

  doc.moveDown(0.4);
  let y = doc.y;
  const rows: Array<[string, string]> = [
    ["Subtotal", `${params.currencyCode} ${fmtMoney(params.subtotal)}`],
    ["VAT", `${params.currencyCode} ${fmtMoney(params.vatAmount)}`],
  ];
  if (params.paidAmount && params.paidAmount > 0) {
    rows.push(["Paid", `${params.currencyCode} ${fmtMoney(params.paidAmount)}`]);
  }
  if (params.outstandingAmount && params.outstandingAmount > 0) {
    rows.push(["Outstanding", `${params.currencyCode} ${fmtMoney(params.outstandingAmount)}`]);
  }

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
