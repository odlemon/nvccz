// @ts-nocheck
import PDFDocument from "pdfkit";
import { prisma } from "../utils/database";
import { drawLetterhead } from "../utils/letterheadPdf";
import {
  loadCapitalCallAccountingLetterhead,
  type CapitalCallAccountingLetterhead,
} from "../utils/capitalCallAccountingLetterhead";

/**
 * Suite 04.3 — Purchase Order PDF with shared letterhead, QR placeholder, and signature block.
 *
 * The same letterhead pipeline used by payslips, capital call notices, sales/procurement invoices,
 * and vendor quotations is applied here, so all outbound NVCCZ documents render an identical header.
 */
export class ProcurementPoPdfService {
  /**
   * Render PO PDF.
   * @param poId Purchase order id.
   * @param opts.letterhead Pre-loaded letterhead (avoid double-fetching when caller already has one).
   *                        When omitted the service loads it via `loadCapitalCallAccountingLetterhead`.
   */
  static async renderPurchaseOrderPdf(
    poId: string,
    opts?: { letterhead?: CapitalCallAccountingLetterhead | null }
  ): Promise<Buffer> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        vendor: true,
        currency: true,
        items: true,
      },
    });
    if (!po) throw new Error("Purchase order not found");

    const letterhead =
      opts && Object.prototype.hasOwnProperty.call(opts, "letterhead")
        ? opts.letterhead
        : await loadCapitalCallAccountingLetterhead().catch(() => null);

    const verifyToken = po.poPdfVerificationToken || "pending-send";

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const margin = 50;
    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;

    drawLetterhead(doc, letterhead);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#111111")
      .text("Purchase Order", margin, doc.y, { width: contentW, align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#333333")
      .text(`PO ${po.poNumber || po.id}`, { align: "center" });
    doc.moveDown(0.8);

    const headerStartY = doc.y;
    const gap = 20;
    const detailColW = 240;
    const detailsX = pageW - margin - detailColW;
    const leftColW = Math.max(160, detailsX - margin - gap);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("Vendor", margin, headerStartY, { width: leftColW });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(po.vendor?.name || "—", margin, doc.y, { width: leftColW });
    if (po.vendor?.email) doc.text(po.vendor.email, margin, doc.y, { width: leftColW });
    if (po.vendor?.phone) doc.text(po.vendor.phone, margin, doc.y, { width: leftColW });
    if (po.vendor?.address) doc.text(po.vendor.address, margin, doc.y, { width: leftColW });
    const leftEndY = doc.y;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("PO details", detailsX, headerStartY, { width: detailColW, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(`PO Number: ${po.poNumber || po.id}`, detailsX, doc.y, { width: detailColW, align: "right" });
    doc.text(`Date: ${po.createdAt.toISOString().slice(0, 10)}`, detailsX, doc.y, { width: detailColW, align: "right" });
    if (po.deliveryDate) {
      doc.text(`Delivery: ${new Date(po.deliveryDate).toISOString().slice(0, 10)}`, detailsX, doc.y, {
        width: detailColW,
        align: "right",
      });
    }
    const rightEndY = doc.y;

    doc.x = margin;
    doc.y = Math.max(leftEndY, rightEndY) + 10;

    drawPoItemsTable(doc, po.items || [], po.currency?.code || "");

    drawTotalsBlock(doc, {
      currencyCode: po.currency?.code || "",
      subtotal: Number(po.subtotal ?? po.totalAmount ?? 0),
      taxAmount: Number(po.taxAmount ?? 0),
      totalAmount: Number(po.totalAmount ?? 0),
    });

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Verification", margin, doc.y);
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#000000")
      .text("[QR placeholder — verification payload]", margin, doc.y, { width: contentW });
    doc.font("Courier").fontSize(8).fillColor("#444444");
    doc.text(`VERIFY:${verifyToken}`, margin, doc.y, { width: contentW });
    doc.font("Helvetica").fillColor("#000000");

    doc.moveDown(1.5);
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text("_______________________________", margin, doc.y);
    doc.text("Authorised signature (placeholder)", margin, doc.y);
    doc.text("VC CFO / delegated approver — digital signature block (MVP)", margin, doc.y);

    doc.moveDown(1.0);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#666666")
      .text(
        "This purchase order has been issued by the buyer. Please confirm receipt and acknowledge the agreed terms.",
        margin,
        doc.y,
        { width: contentW }
      );
    doc.moveDown(0.4);
    doc.text(letterhead?.displayName || process.env.COMPANY_NAME_SHORT || "NVCCZ", {
      align: "right",
    });

    doc.end();
    return done;
  }
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function drawPoItemsTable(
  doc: any,
  items: Array<any>,
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
  if (!items || items.length === 0) {
    doc.text("(no line items)", margin + 6, doc.y, { width: tableW - 12 });
    doc.moveDown(0.6);
    return;
  }

  for (const line of items) {
    const description = String(line.itemName || line.description || "—").trim();
    const qty = Number(line.quantity ?? 0) || 0;
    const unitPrice = Number(line.unitPrice ?? 0) || 0;
    const explicitTotal = Number(line.totalPrice ?? NaN);
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
  params: { currencyCode: string; subtotal: number; taxAmount: number; totalAmount: number }
): void {
  const margin = 50;
  const pageW = doc.page.width;
  const labelW = 200;
  const totalsX = pageW - margin - labelW - 140;
  const valW = 140;

  doc.moveDown(0.4);
  let y = doc.y;
  const ccy = params.currencyCode;
  const rows: Array<[string, string]> = [
    ["Subtotal", `${ccy} ${fmtMoney(params.subtotal)}`.trim()],
    ["Tax", `${ccy} ${fmtMoney(params.taxAmount)}`.trim()],
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
    `${ccy} ${fmtMoney(params.totalAmount)}`.trim(),
    totalsX + labelW,
    y + 11,
    { width: valW - 8, align: "right" }
  );
  doc.fillColor("#000000");
  doc.y = y + 32;
  doc.x = margin;
}
