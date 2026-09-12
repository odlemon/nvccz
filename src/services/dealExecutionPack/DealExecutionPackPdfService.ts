// @ts-nocheck
const PDFDocument = require("pdfkit");
import { loadCapitalCallAccountingLetterhead } from "../../utils/capitalCallAccountingLetterhead";

export type ClosingSummaryInput = {
  fundName: string;
  portfolioCompanyName: string;
  dealReference?: string | null;
  investmentAmount?: number | null;
  preMoneyValuation?: number | null;
  baseCurrency: string;
  icpPct: number;
  executedAt: Date;
  packId: string;
};

function fmtAmount(n: number | null | undefined, ccy: string) {
  if (n == null || Number.isNaN(n)) return "N/A";
  const sym = ccy === "USD" ? "$" : `${ccy} `;
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export class DealExecutionPackPdfService {
  static async buildClosingSummaryPdfBuffer(input: ClosingSummaryInput): Promise<Buffer> {
    const letterhead = await loadCapitalCallAccountingLetterhead();
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      if (letterhead) {
        doc.font("Helvetica").fontSize(12).text(letterhead.displayName, { align: "right" });
        for (const line of letterhead.detailLines) {
          doc.fontSize(9).fillColor("#444444").text(line, { align: "right" });
        }
        doc.fillColor("#000000").moveDown(0.5);
      }

      doc.font("Helvetica-Bold").fontSize(16).text("Deal Execution Closing Summary", { align: "center" });
      doc.moveDown(0.5);
      doc
        .font("Helvetica")
        .fontSize(11)
        .text(`${input.fundName} → ${input.portfolioCompanyName}`, { align: "center" });
      if (input.dealReference) {
        doc.fontSize(10).text(`Deal reference: ${input.dealReference}`, { align: "center" });
      }
      doc.moveDown(1);

      const rows: Array<[string, string]> = [
        ["Pack ID", input.packId],
        ["Executed at", input.executedAt.toISOString()],
        ["Investment amount", fmtAmount(input.investmentAmount, input.baseCurrency)],
        ["Pre-money valuation", fmtAmount(input.preMoneyValuation, input.baseCurrency)],
        ["Conditions precedent (I_CP)", `${input.icpPct.toFixed(2)}%`],
      ];

      doc.font("Helvetica-Bold").fontSize(12).text("Closing Summary");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10);
      for (const [label, value] of rows) {
        doc.text(`${label}: ${value}`);
      }

      doc.moveDown(1);
      doc
        .fontSize(8)
        .fillColor("#666666")
        .text("Institutional closing record. Document checksums verified at execution.");
      doc.end();
    });
  }
}
