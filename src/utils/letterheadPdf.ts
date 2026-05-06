// @ts-nocheck
/**
 * Shared letterhead drawer for server-side PDFs.
 *
 * Mirrors the payslip header (clipped logo + right-aligned company name + detail lines + horizontal rule)
 * so all outbound documents (sales invoices, procurement invoices, purchase orders, vendor quotations,
 * payslips, capital call notices) render an identical header.
 */
import type { CapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";

export type LetterheadDrawOptions = {
  /** Logo radius in PDF points. Defaults to 34 (matches payslip). */
  logoRadiusPt?: number;
  /** Vertical space (in pt) added below the rule before the next content. Defaults to ~0.85em. */
  bottomGap?: number;
};

/**
 * Draws the standard NVCCZ letterhead at the current `doc.y`.
 *
 * Resets `doc.x` and `doc.fillColor` after drawing so the caller can start writing body content
 * without worrying about leftover state. Safe to call without a letterhead: simply no-ops.
 */
export function drawLetterhead(
  doc: any,
  letterhead: CapitalCallAccountingLetterhead | null | undefined,
  opts?: LetterheadDrawOptions
): void {
  if (!letterhead) return;

  const margin = 50;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const logoRadius = opts?.logoRadiusPt ?? 34;

  const yStart = doc.y;

  if (letterhead.logoBuffer) {
    try {
      const pdfImg = doc.openImage(letterhead.logoBuffer);
      const iw = pdfImg.width;
      const ih = pdfImg.height;
      const cx = pageW - margin - logoRadius;
      const cy = yStart + logoRadius;
      const box = 2 * logoRadius;
      const scale = Math.max(box / iw, box / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      const drawX = cx - drawW / 2;
      const drawY = cy - drawH / 2;

      doc.save();
      doc.circle(cx, cy, logoRadius).clip();
      doc.image(letterhead.logoBuffer, drawX, drawY, { width: drawW, height: drawH });
      doc.restore();

      doc.save();
      doc.lineWidth(0.75).strokeColor("#dddddd");
      doc.circle(cx, cy, logoRadius).stroke();
      doc.restore();

      doc.y = yStart + box + 6;
      doc.x = margin;
    } catch {
      doc.y = yStart;
      doc.x = margin;
    }
  }

  doc.font("Helvetica").fontSize(12).fillColor("#111111");
  doc.text(letterhead.displayName, margin, doc.y, { width: contentW, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#444444");
  for (const line of letterhead.detailLines || []) {
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
  doc.moveDown(opts?.bottomGap ?? 0.85);

  doc.fillColor("#000000");
  doc.x = margin;
}
