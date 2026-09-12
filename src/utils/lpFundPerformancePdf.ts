// @ts-nocheck
const PDFDocument = require("pdfkit");
import type { LpFundMetricsSnapshot } from "../services/fundReporting/LpFundMetricsService";
import { fmtMoney } from "../services/fundReporting/fundReportingSupport";
import { loadCapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";
import type { CapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";

function writeLetterhead(doc: any, lh: CapitalCallAccountingLetterhead | null) {
  if (!lh) return;
  const pageW = doc.page.width;
  const margin = 50;
  const contentW = pageW - margin * 2;
  doc.font("Helvetica").fontSize(12).fillColor("#111111");
  doc.text(lh.displayName, margin, doc.y, { width: contentW, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#444444");
  for (const line of lh.detailLines) {
    doc.text(line, margin, doc.y, { width: contentW, align: "right" });
  }
  doc.moveDown(0.5);
  doc.fillColor("#000000");
}

export async function buildLpFundPerformancePdfBuffer(
  metrics: LpFundMetricsSnapshot,
  reportLevel: "INVESTOR" | "BOARD" = "INVESTOR"
): Promise<Buffer> {
  const letterhead = await loadCapitalCallAccountingLetterhead();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    writeLetterhead(doc, letterhead);

    doc.font("Helvetica-Bold").fontSize(16).text("Fund Performance Report", { align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).text(
      `${metrics.fundName} · Period ending ${metrics.periodEnd}`,
      { align: "center" }
    );
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text(`Limited Partner: ${metrics.lpLegalName}`);
    doc.moveDown(0.5);

    const rows: Array<[string, string]> = [
      ["Total Commitment", fmtMoney(metrics.totalCommitment, metrics.currencyCode)],
      ["Total Paid-In", fmtMoney(metrics.totalPaidIn, metrics.currencyCode)],
      ["Unfunded Commitment", fmtMoney(metrics.unfundedCommitment, metrics.currencyCode)],
      ["Cumulative Distributions", fmtMoney(metrics.totalDistributions, metrics.currencyCode)],
      ["Estimated NAV (LP share)", fmtMoney(metrics.nav, metrics.currencyCode)],
      ["TVPI", metrics.tvpi.toFixed(3)],
      ["DPI", metrics.dpi.toFixed(3)],
      ["RVPI", metrics.rvpi.toFixed(3)],
      ["Net IRR", metrics.netIrr != null ? `${(metrics.netIrr * 100).toFixed(2)}%` : "N/A"],
    ];

    doc.font("Helvetica-Bold").fontSize(11).text("Capital Account Summary");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    for (const [label, value] of rows) {
      doc.text(`${label}: ${value}`);
    }

    if (metrics.holdingsSummary) {
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(11).text("Portfolio Summary");
      doc.font("Helvetica").fontSize(10).text(metrics.holdingsSummary);
    }

    if (reportLevel === "BOARD" && metrics.boardExtras) {
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(11).text("Board-Level Analytics");
      doc.font("Helvetica").fontSize(10);
      doc.text(`Management expenses: ${metrics.boardExtras.managementExpenses ?? "—"}`);
      doc.text(`Other expenses: ${metrics.boardExtras.otherExpenses ?? "—"}`);
      doc.text(String(metrics.boardExtras.forecastVarianceNote || ""));
    }

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(8).fillColor("#666666").text(
      "This report was generated automatically by Arcus Fund Performance Reporting.",
      { align: "center" }
    );

    doc.end();
  });
}
