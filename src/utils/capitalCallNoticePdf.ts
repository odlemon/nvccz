// @ts-nocheck
/** Server-side capital call notice PDF (same facts as GET …/notice and the HTML email). */
const PDFDocument = require("pdfkit");

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
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ccy = params.currencyCode;

    doc.fontSize(18).text("Capital Call Notice", { align: "center" });
    doc.moveDown(1.2);
    doc.fontSize(11).fillColor("#000000");
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
    doc.fontSize(9).fillColor("#444444").text(process.env.COMPANY_NAME_SHORT || "NVCCZ", { align: "center" });
    doc.end();
  });
}
