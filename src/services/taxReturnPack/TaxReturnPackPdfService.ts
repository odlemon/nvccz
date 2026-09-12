// @ts-nocheck
const PDFDocument = require("pdfkit");
import { createHash } from "crypto";
import { remoteUploadService } from "../RemoteUploadService";
import { loadCapitalCallAccountingLetterhead } from "../../utils/capitalCallAccountingLetterhead";

function fmtAmount(n: number | null | undefined, ccy: string) {
  if (n == null || Number.isNaN(n)) return "N/A";
  const sym = ccy === "USD" ? "$" : `${ccy} `;
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export class TaxReturnPackPdfService {
  static sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  static async buildPackPdfBuffer(pack: any): Promise<Buffer> {
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

      const isVat = pack.taxRegime === "ZIMRA_VAT";
      const isWht = pack.taxRegime === "ZIMRA_WHT";
      const headingText = isVat
        ? "ZIMRA VAT Return Pack"
        : isWht
        ? "ZIMRA Withholding Tax Schedule"
        : "ZIMRA Tax Return Pack";
      const summaryHeading = isVat ? "VAT201 Summary" : isWht ? "WHT Schedule Summary" : "ITF 12C Summary";

      doc.font("Helvetica-Bold").fontSize(16).text(headingText, { align: "center" });
      doc.moveDown(0.5);
      doc
        .font("Helvetica")
        .fontSize(11)
        .text(`${pack.forecastEntity?.name || "Entity"} — ${pack.taxPeriod} ${pack.taxYear}`, { align: "center" });
      doc.moveDown(1);

      const periodLabel = `${pack.periodStart?.toISOString?.().slice(0, 10) ?? pack.periodStart} — ${pack.periodEnd?.toISOString?.().slice(0, 10) ?? pack.periodEnd}`;

      const summary: Array<[string, string]> = isVat
        ? [
            ["Pack ID", pack.id],
            ["Tax regime", pack.taxRegime],
            ["Period", periodLabel],
            ["VAT Output tax", fmtAmount(Number(pack.vatOutputTax), pack.baseCurrency)],
            ["VAT Input tax", fmtAmount(Number(pack.vatInputTax), pack.baseCurrency)],
            ["Net VAT payable / (refundable)", fmtAmount(Number(pack.vatNetPayable), pack.baseCurrency)],
          ]
        : isWht
        ? [
            ["Pack ID", pack.id],
            ["Tax regime", pack.taxRegime],
            ["Period", periodLabel],
            ["Scope", "Evidence/tracking pass only — no auto-computed liability (see reconciliation lines below)"],
          ]
        : [
            ["Pack ID", pack.id],
            ["Tax regime", pack.taxRegime],
            ["Period", periodLabel],
            ["Accounting profit", fmtAmount(Number(pack.accountingProfit), pack.baseCurrency)],
            ["Taxable income", fmtAmount(Number(pack.taxableIncome), pack.baseCurrency)],
            ["CIT liability", fmtAmount(Number(pack.citLiability), pack.baseCurrency)],
            ["CGT liability", fmtAmount(Number(pack.cgtLiability), pack.baseCurrency)],
            ["Total tax liability", fmtAmount(Number(pack.totalTaxLiability), pack.baseCurrency)],
            ["Weighted ETR", pack.weightedEtr != null ? `${Number(pack.weightedEtr).toFixed(2)}%` : "N/A"],
          ];

      doc.font("Helvetica-Bold").fontSize(12).text(summaryHeading);
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10);
      for (const [label, value] of summary) {
        doc.text(`${label}: ${value}`);
      }

      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(12).text("Taxable Income Reconciliation");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(9);
      for (const line of pack.reconciliationLines || []) {
        const adj =
          Number(line.taxAdjustment) !== 0
            ? ` (${Number(line.taxAdjustment) > 0 ? "+" : ""}${fmtAmount(Number(line.taxAdjustment), line.currencyCode)})`
            : "";
        doc.text(`${line.lineLabel}: ${fmtAmount(Number(line.glBalance), line.currencyCode)}${adj}`);
      }

      if (pack.cgtLines?.length) {
        doc.moveDown(1);
        doc.font("Helvetica-Bold").fontSize(12).text("Capital Gains Tax Schedule");
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(9);
        for (const cgt of pack.cgtLines) {
          doc.text(
            `${cgt.assetRef}: sale ${fmtAmount(Number(cgt.salePrice), cgt.currencyCode)}, gain ${fmtAmount(Number(cgt.capitalGain), cgt.currencyCode)}, CGT ${fmtAmount(Number(cgt.cgtLiability), cgt.currencyCode)}`
          );
        }
      }

      doc.moveDown(1);
      doc.fontSize(8).fillColor("#666666").text("Tamper-evident tax package. SHA-256 recorded at sign-off.");
      doc.end();
    });
  }

  static async generateAndStage(pack: any) {
    const pdfBuffer = await TaxReturnPackPdfService.buildPackPdfBuffer(pack);
    const sha256 = TaxReturnPackPdfService.sha256(pdfBuffer);
    const filename = `Tax-Return-Pack-${pack.forecastEntity?.name?.replace(/\s+/g, "-") || pack.id.slice(0, 8)}-${pack.taxYear}.pdf`;

    const upload = await remoteUploadService.uploadFiles(
      { buffer: pdfBuffer, originalname: filename, mimetype: "application/pdf" },
      "tax-return-packs"
    );

    if (!upload.success || !upload.files?.[0]) {
      throw Object.assign(new Error("PDF upload failed"), { statusCode: 500 });
    }

    const fileUrl = upload.files[0].url || upload.files[0].filename;
    const storagePath = upload.files[0].filename || null;

    return { sha256, fileUrl, storagePath, pdfBuffer };
  }
}
