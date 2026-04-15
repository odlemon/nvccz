// @ts-nocheck
import PDFDocument from "pdfkit";
import { prisma } from "../utils/database";

/**
 * Suite 04.3 — MVP PDF with QR placeholder + signature block (no cryptographic signing).
 */
export class ProcurementPoPdfService {
  static async renderPurchaseOrderPdf(poId: string): Promise<Buffer> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        vendor: true,
        currency: true,
        items: true,
      },
    });
    if (!po) throw new Error("Purchase order not found");

    const verifyToken = po.poPdfVerificationToken || "pending-send";
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    doc.fontSize(18).text("Purchase Order", { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`PO Number: ${po.poNumber}`);
    doc.text(`Vendor: ${po.vendor.name}`);
    doc.text(`Date: ${po.createdAt.toISOString().slice(0, 10)}`);
    doc.text(`Total: ${po.currency?.symbol || ""}${Number(po.totalAmount).toFixed(2)} ${po.currency?.code || ""}`);
    doc.moveDown();
    doc.text("[QR PLACEHOLDER — verification payload]", { continued: false });
    doc.font("Courier").fontSize(8).text(`VERIFY:${verifyToken}`, { width: 400 });
    doc.font("Helvetica");
    doc.moveDown();
    doc.text("Line items:", { underline: true });
    po.items.forEach((line) => {
      doc.fontSize(9).text(
        `${line.itemName}  Qty ${Number(line.quantity)} @ ${Number(line.unitPrice)} = ${Number(line.totalPrice)}`
      );
    });
    doc.moveDown();
    doc.text("_______________________________");
    doc.text("Authorised signature (placeholder)", { italics: true });
    doc.text("VC CFO / Delegated approver — digital signature block (MVP)");
    doc.end();
    return done;
  }
}
