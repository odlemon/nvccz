// @ts-nocheck
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { randomBytes } from "crypto";
import { prisma } from "../utils/database";
import { drawLetterhead } from "../utils/letterheadPdf";
import {
  loadCapitalCallAccountingLetterhead,
  type CapitalCallAccountingLetterhead,
} from "../utils/capitalCallAccountingLetterhead";
import { brandLogoBuffer, brandName } from "./p2p/BrandService";

/** Absolute API origin for Suite 04.3 verify links embedded in the PO PDF QR. */
function publicApiBaseUrl(): string {
  const raw =
    process.env.API_PUBLIC_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

/**
 * §21 Purchase Order PDF: the letterhead and approved logo of the environment, every field the order carries, its lines and totals,
 * the references it was raised from and the approvals it stands on, and a verification QR.
 *
 * This is the one rendering of a PO. The on-screen preview shows this same file, so what is previewed is what is downloaded and
 * what the supplier receives.
 */
export class ProcurementPoPdfService {
  static async renderPurchaseOrderPdf(
    poId: string,
    opts?: { letterhead?: CapitalCallAccountingLetterhead | null }
  ): Promise<Buffer> {
    let po: any = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        vendor: true,
        currency: true,
        items: { orderBy: { createdAt: "asc" } },
        requisition: { select: { requisitionNumber: true, title: true } },
        quotation: { select: { quotationNumber: true, rfqNumber: true } },
      },
    });
    if (!po) throw new Error("Purchase order not found");

    // Mint a verification token if the PDF is downloaded before send (send also mints one).
    if (!po.poPdfVerificationToken) {
      const poPdfVerificationToken = randomBytes(24).toString("hex");
      await prisma.purchaseOrder.update({ where: { id: poId }, data: { poPdfVerificationToken } });
      po = { ...po, poPdfVerificationToken };
    }

    const baseLetterhead: any =
      opts && Object.prototype.hasOwnProperty.call(opts, "letterhead")
        ? opts.letterhead
        : await loadCapitalCallAccountingLetterhead().catch(() => null);
    // The approved logo of this environment (Matanho on dev, NVCCZ on production), not whatever address a database holds.
    const logo = brandLogoBuffer();
    const letterhead = baseLetterhead ? { ...baseLetterhead, ...(logo ? { logoBuffer: logo } : {}) } : logo ? { displayName: brandName(), detailLines: [], logoBuffer: logo, logoUrlForEmail: null } : null;

    const [rfq, recommendation, approvals] = await Promise.all([
      po.rfqId ? prisma.procurementRfq.findUnique({ where: { id: po.rfqId }, select: { rfqNumber: true, title: true } }) : Promise.resolve(null),
      po.awardRecommendationId ? prisma.rfqAwardRecommendation.findUnique({ where: { id: po.awardRecommendationId }, select: { version: true, status: true } }) : Promise.resolve(null),
      import("./p2p/PurchaseOrderControlService").then((m) => m.PurchaseOrderControlService.describeApprovals(po.id)).catch(() => null),
    ]);

    const apiBase = publicApiBaseUrl();
    const verifyUrl = apiBase
      ? `${apiBase}/api/procurement/purchase-orders/verify?token=${encodeURIComponent(po.poPdfVerificationToken)}`
      : `VERIFY:${po.poPdfVerificationToken}`;
    let qrPng: Buffer | null = null;
    try {
      qrPng = await QRCode.toBuffer(verifyUrl, { type: "png", width: 120, margin: 1 });
    } catch (e) {
      console.error("PO PDF QR generation failed:", (e as Error)?.message || e);
    }

    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const margin = 50;
    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;
    const ccy = po.currency?.code || "";

    drawLetterhead(doc, letterhead);

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text("Purchase Order", margin, doc.y, { width: contentW, align: "center" });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(11).fillColor("#333333").text(`PO ${po.poNumber || po.id}`, { align: "center" });
    doc.moveDown(0.8);

    // Vendor (left) and order details (right)
    const headerStartY = doc.y;
    const gap = 20;
    const detailColW = 250;
    const detailsX = pageW - margin - detailColW;
    const leftColW = Math.max(160, detailsX - margin - gap);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Vendor", margin, headerStartY, { width: leftColW });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(po.vendor?.name || "—", margin, doc.y, { width: leftColW });
    if (po.vendorCode) doc.text(`Vendor code: ${po.vendorCode}`, margin, doc.y, { width: leftColW });
    if (po.vendor?.taxNumber) doc.text(`Tax number: ${po.vendor.taxNumber}`, margin, doc.y, { width: leftColW });
    if (po.vendor?.email) doc.text(po.vendor.email, margin, doc.y, { width: leftColW });
    if (po.vendor?.phone) doc.text(po.vendor.phone, margin, doc.y, { width: leftColW });
    if (po.vendor?.address) doc.text(po.vendor.address, margin, doc.y, { width: leftColW });
    const leftEndY = doc.y;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Order details", detailsX, headerStartY, { width: detailColW, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    const right = (label: string, value: any) => {
      if (value == null || value === "") return;
      doc.text(`${label}: ${value}`, detailsX, doc.y, { width: detailColW, align: "right" });
    };
    right("PO number", po.poNumber || po.id);
    right("Date", day(po.orderDate ?? po.createdAt));
    right("Currency", ccy);
    right("Delivery date", po.expectedDeliveryDate ? day(po.expectedDeliveryDate) : "");
    right("Payment terms", po.paymentTerms);
    right("Status", po.status);
    const rightEndY = doc.y;

    doc.x = margin;
    doc.y = Math.max(leftEndY, rightEndY) + 12;

    // Delivery and accounting references
    const block = (title: string, rows: Array<[string, any]>) => {
      const filled = rows.filter(([, v]) => v != null && String(v).trim() !== "");
      if (!filled.length) return;
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111111").text(title, margin, doc.y, { width: contentW });
      doc.moveDown(0.15);
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      for (const [k, v] of filled) {
        doc.text(`${k}: ${v}`, margin + 6, doc.y, { width: contentW - 6 });
      }
      doc.moveDown(0.5);
    };
    block("Delivery", [["Delivery address", po.shippingAddress], ["Delivery date", po.expectedDeliveryDate ? day(po.expectedDeliveryDate) : ""], ["Delivery terms", po.deliveryTerms]]);
    block("Accounting", [["Cost centre", po.costCentre], ["Budget code", po.budgetCode], ["GL code", po.glCode]]);
    block("Linked records", [
      ["Requisition", po.requisition ? `${po.requisition.requisitionNumber}${po.requisition.title ? ` (${po.requisition.title})` : ""}` : ""],
      ["RFQ / tender", rfq ? `${rfq.rfqNumber}${rfq.title ? ` (${rfq.title})` : ""}` : po.quotation?.rfqNumber],
      ["Award", po.quotation ? `Quotation ${po.quotation.quotationNumber}${recommendation ? `, recommendation version ${recommendation.version} (${String(recommendation.status).toLowerCase()})` : ""}` : ""],
    ]);

    drawPoItemsTable(doc, po.items || [], ccy);

    const subtotal = Number(po.subtotal ?? po.totalAmount ?? 0);
    const taxAmount = Number(po.taxAmount ?? 0);
    const rate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;
    drawTotalsBlock(doc, { currencyCode: ccy, subtotal, taxAmount, totalAmount: Number(po.totalAmount ?? 0), vatRate: rate });

    if (po.purchaseConditions) {
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111111").text("Purchase conditions", margin, doc.y, { width: contentW });
      doc.font("Helvetica").fontSize(9).fillColor("#000000").text(String(po.purchaseConditions), margin + 6, doc.y, { width: contentW - 6 });
    }

    if (approvals?.approvals?.length) {
      if (doc.y > doc.page.height - 170) doc.addPage();
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111111").text("Approvals", margin, doc.y, { width: contentW });
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      for (const a of approvals.approvals) {
        const last = a.decisions.filter((d) => d.action === "APPROVED" || d.action === "REJECTED").slice(-3);
        const who = last.length ? last.map((d) => `${d.actor || "—"} (${String(d.action).toLowerCase()} ${day(d.at)})`).join(", ") : "";
        doc.text(`${a.label}: ${String(a.status).toLowerCase().replace(/_/g, " ")}${who ? `; ${who}` : ""}`, margin + 6, doc.y, { width: contentW - 6 });
      }
    }

    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(8.5).fillColor("#666666").text("This purchase order has been issued by the buyer. Please confirm receipt and acknowledge the agreed terms.", margin, doc.y, { width: contentW });

    // Verification QR + signature block
    if (doc.y > doc.page.height - 190) doc.addPage();
    const blockY = doc.y + 14;
    doc.y = blockY;
    if (qrPng) {
      doc.image(qrPng, margin, blockY, { width: 72, height: 72 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text("Scan to verify this purchase order", margin + 84, blockY + 8, { width: contentW - 84 });
      doc.font("Helvetica").fontSize(7.5).fillColor("#555555").text(verifyUrl, margin + 84, blockY + 24, { width: contentW - 84 });
      doc.y = blockY + 80;
    } else {
      doc.font("Helvetica").fontSize(8).fillColor("#555555").text(`Verification token: ${po.poPdfVerificationToken}`, margin, doc.y, { width: contentW });
      doc.moveDown(0.6);
    }

    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(9).fillColor("#111111").text("Authorised signature", margin, doc.y, { width: contentW / 2 });
    doc.moveDown(1.4);
    doc.strokeColor("#333333").lineWidth(0.8).moveTo(margin, doc.y).lineTo(margin + 180, doc.y).stroke();
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(8).fillColor("#666666").text(letterhead?.displayName || brandName(), margin, doc.y);

    doc.end();
    return done;
  }
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function drawPoItemsTable(doc: any, items: Array<any>, currencyCode: string): void {
  const margin = 50;
  const pageW = doc.page.width;
  const tableW = pageW - margin * 2;
  const colDescW = Math.floor(tableW * 0.44);
  const colQtyW = Math.floor(tableW * 0.14);
  const colPriceW = Math.floor(tableW * 0.18);
  const colTotalW = tableW - colDescW - colQtyW - colPriceW;

  const head = () => {
    const headerY = doc.y;
    doc.save();
    doc.rect(margin, headerY, tableW, 18).fill("#f2f4f7");
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333");
    doc.text("Description", margin + 6, headerY + 5, { width: colDescW - 12 });
    doc.text("Qty", margin + colDescW, headerY + 5, { width: colQtyW, align: "right" });
    doc.text(`Unit price${currencyCode ? ` (${currencyCode})` : ""}`, margin + colDescW + colQtyW, headerY + 5, { width: colPriceW, align: "right" });
    doc.text("Amount", margin + colDescW + colQtyW + colPriceW, headerY + 5, { width: colTotalW - 6, align: "right" });
    doc.y = headerY + 22;
  };
  if (doc.y > doc.page.height - 130) doc.addPage();
  head();

  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  if (!items || items.length === 0) {
    doc.text("(no line items)", margin + 6, doc.y, { width: tableW - 12 });
    doc.moveDown(0.6);
    return;
  }

  for (const line of items) {
    if (doc.y > doc.page.height - 110) {
      doc.addPage();
      head();
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
    }
    const description = String(line.itemName || line.description || "—").trim();
    const qty = Number(line.quantity ?? 0) || 0;
    const unitPrice = Number(line.unitPrice ?? 0) || 0;
    const explicitTotal = Number(line.totalPrice ?? NaN);
    const lineTotal = Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice;
    const cancelled = String(line.lineStatus || "") === "CANCELLED";

    const y = doc.y;
    doc.text(`${description}${cancelled ? " (cancelled)" : ""}`, margin + 6, y, { width: colDescW - 12 });
    const afterDesc = doc.y;
    doc.text(`${String(qty)}${line.unit ? ` ${line.unit}` : ""}`, margin + colDescW, y, { width: colQtyW, align: "right" });
    doc.text(fmtMoney(unitPrice), margin + colDescW + colQtyW, y, { width: colPriceW, align: "right" });
    doc.text(fmtMoney(lineTotal), margin + colDescW + colQtyW + colPriceW, y, { width: colTotalW - 6, align: "right" });
    doc.y = Math.max(afterDesc, y + 12) + 4;
  }
}

function drawTotalsBlock(doc: any, params: { currencyCode: string; subtotal: number; taxAmount: number; totalAmount: number; vatRate: number }): void {
  const margin = 50;
  const pageW = doc.page.width;
  const labelW = 200;
  const totalsX = pageW - margin - labelW - 140;
  const valW = 140;

  if (doc.y > doc.page.height - 130) doc.addPage();
  doc.moveDown(0.4);
  let y = doc.y;
  const ccy = params.currencyCode;
  const rows: Array<[string, string]> = [
    ["Subtotal", `${ccy} ${fmtMoney(params.subtotal)}`.trim()],
    [`VAT${params.vatRate ? ` (${params.vatRate}%)` : ""}`, `${ccy} ${fmtMoney(params.taxAmount)}`.trim()],
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
  doc.text(`${ccy} ${fmtMoney(params.totalAmount)}`.trim(), totalsX + labelW, y + 11, { width: valW - 8, align: "right" });
  doc.fillColor("#000000");
  doc.y = y + 32;
  doc.x = margin;
}
