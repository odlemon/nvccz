// @ts-nocheck
/** Server-side capital call notice PDF (same facts as GET …/notice and the HTML email). */
const PDFDocument = require("pdfkit");
import type { CapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function safePdfFileBaseName(part: string): string {
  const s = part.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, 80) || "notice";
}

export function buildCapitalCallNoticePdfBuffer(params: {
  fundName: string;
  lpLegalName: string;
  currencyCode: string;
  callPercent: number;
  totalCommitment: number;
  uncalledCapitalBeforeCall: number;
  currentCallAmount: number;
  paymentDueDate: string;
  bankInstructions: string;
  /** Accounting module company profile + active letterhead address (logo + legal identity). */
  letterhead?: CapitalCallAccountingLetterhead | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ccy = params.currencyCode;
    const lh = params.letterhead;

    if (lh) {
      const pageW = doc.page.width;
      const margin = 50;
      const contentW = pageW - margin * 2;
      /** Letterhead logo: circle diameter ≈ 2×R, flush to the right margin. */
      const LOGO_RADIUS_PT = 40;
      const yStart = doc.y;

      if (lh.logoBuffer) {
        try {
          const pdfImg = doc.openImage(lh.logoBuffer);
          const iw = pdfImg.width;
          const ih = pdfImg.height;
          const cx = pageW - margin - LOGO_RADIUS_PT;
          const cy = yStart + LOGO_RADIUS_PT;
          const box = 2 * LOGO_RADIUS_PT;
          const scale = Math.max(box / iw, box / ih);
          const drawW = iw * scale;
          const drawH = ih * scale;
          const drawX = cx - drawW / 2;
          const drawY = cy - drawH / 2;

          doc.save();
          doc.circle(cx, cy, LOGO_RADIUS_PT).clip();
          doc.image(lh.logoBuffer, drawX, drawY, { width: drawW, height: drawH });
          doc.restore();

          doc.save();
          doc.lineWidth(0.75).strokeColor("#dddddd");
          doc.circle(cx, cy, LOGO_RADIUS_PT).stroke();
          doc.restore();

          doc.y = yStart + box + 8;
          doc.x = margin;
        } catch {
          doc.y = yStart;
          doc.x = margin;
        }
      }

      // Letterhead name should be visible but not overly bold.
      doc.font("Helvetica").fontSize(12).fillColor("#111111");
      doc.text(lh.displayName, margin, doc.y, { width: contentW, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor("#444444");
      for (const line of lh.detailLines) {
        doc.text(line, margin, doc.y, { width: contentW, align: "right" });
      }
      doc.moveDown(0.35);
      const yRule = doc.y;
      doc
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .moveTo(margin, yRule)
        .lineTo(pageW - margin, yRule)
        .stroke();
      doc.moveDown(0.85);
      doc.fillColor("#000000");
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#000000")
      .text("Capital Call Notice", { align: "center" });
    doc.moveDown(1.2);
    // Reset font after the title so the body is not bold.
    doc.font("Helvetica").fontSize(11).fillColor("#000000");
    doc.text(`Fund: ${params.fundName}`);
    doc.text(`Limited partner: ${params.lpLegalName}`);
    doc.moveDown(0.5);
    doc.text(`Call percent: ${params.callPercent}%`);
    doc.text(`Total commitment (${ccy}): ${fmtMoney(params.totalCommitment)}`);
    doc.text(`Uncalled capital before this call (${ccy}): ${fmtMoney(params.uncalledCapitalBeforeCall)}`);
    doc.text(`Current call amount (${ccy}): ${fmtMoney(params.currentCallAmount)}`);
    doc.text(`Payment due date: ${params.paymentDueDate}`);
    doc.moveDown(0.5);
    doc.fontSize(11).text("Bank instructions:", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).text(params.bankInstructions, { align: "left" });
    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).fillColor("#444444");
    doc.text(lh?.displayName || process.env.COMPANY_NAME_SHORT || "NVCCZ", 50, doc.y, {
      width: doc.page.width - 100,
      align: "right",
    });
    doc.end();
  });
}
