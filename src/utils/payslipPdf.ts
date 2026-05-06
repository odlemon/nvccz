// @ts-nocheck
/**
 * Server-side payslip PDF generator (for emailing as attachment).
 * Uses accounting Company Profile + active letterhead address (same identity as capital call notices).
 */
const PDFDocument = require("pdfkit");
import type { CapitalCallAccountingLetterhead } from "./capitalCallAccountingLetterhead";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function safePayslipPdfFileBaseName(part: string): string {
  const s = part.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, 80) || "payslip";
}

function drawKeyValueRow(
  doc: any,
  key: string,
  val: string,
  opts?: { keyW?: number; valW?: number; x?: number; y?: number; ellipsis?: boolean }
) {
  const keyW = opts?.keyW ?? 140;
  const startX = opts?.x ?? doc.x;
  const startY = opts?.y ?? doc.y;
  const valW = opts?.valW ?? doc.page.width - (startX + keyW) - 50;
  doc.font("Helvetica-Bold").fillColor("#333333").text(key, startX, startY, { width: keyW });
  doc.font("Helvetica").fillColor("#000000").text(val, startX + keyW, startY, {
    width: valW,
    ellipsis: Boolean(opts?.ellipsis),
  });
  doc.y = Math.max(doc.y, startY + 14);
  doc.x = 50;
}

function drawTwoColumnDetails(doc: any, params: { left: Array<[string, string]>; right: Array<[string, string]> }) {
  const margin = 50;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const colGap = 22;
  const colW = (contentW - colGap) / 2;
  const keyW = 118;
  const valW = colW - keyW;

  const startY = doc.y;
  const maxRows = Math.max(params.left.length, params.right.length);
  let y = startY;
  doc.fontSize(10);

  for (let i = 0; i < maxRows; i++) {
    const l = params.left[i];
    const r = params.right[i];
    if (l) {
      drawKeyValueRow(doc, l[0], l[1], { x: margin, y, keyW, valW, ellipsis: true });
    }
    if (r) {
      drawKeyValueRow(doc, r[0], r[1], { x: margin + colW + colGap, y, keyW, valW, ellipsis: true });
    }
    y += 18;
  }
  doc.y = y;
  doc.x = margin;
}

function drawTable(
  doc: any,
  params: {
    title: string;
    rows: Array<{ label: string; amount: string }>;
    totalLabel?: string;
    totalAmount?: string;
  }
) {
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(params.title);
  doc.moveDown(0.35);

  const margin = 50;
  const pageW = doc.page.width;
  const tableW = pageW - margin * 2;
  const col1W = Math.floor(tableW * 0.7);
  const col2W = tableW - col1W;

  const headerY = doc.y;
  doc.save();
  doc.rect(margin, headerY, tableW, 18).fill("#f2f4f7");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333");
  doc.text("Description", margin + 6, headerY + 5, { width: col1W - 12 });
  doc.text("Amount", margin + col1W + 6, headerY + 5, { width: col2W - 12, align: "right" });
  doc.moveDown(1.2);

  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  for (const r of params.rows) {
    const y = doc.y;
    doc.text(r.label, margin + 6, y, { width: col1W - 12 });
    doc.text(r.amount, margin + col1W + 6, y, { width: col2W - 12, align: "right" });
    doc.moveDown(0.9);
  }

  if (params.totalLabel && params.totalAmount) {
    doc.save();
    const y = doc.y + 2;
    doc.rect(margin, y, tableW, 18).fill("#f8fafc");
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111");
    doc.text(params.totalLabel, margin + 6, doc.y + 7, { width: col1W - 12 });
    doc.text(params.totalAmount, margin + col1W + 6, doc.y + 7, { width: col2W - 12, align: "right" });
    doc.moveDown(1.4);
  } else {
    doc.moveDown(0.4);
  }
}

export async function buildPayslipPdfBuffer(params: {
  payslipNumber: string;
  payPeriod: string;
  paymentDateLabel: string;
  currencyCode: string;
  employeeName: string;
  employeeNumber: string | null;
  employeeEmail: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  basicSalary: number | null;
  allowances?: Array<{ name: string; amount: number }>;
  deductions?: Array<{ name: string; amount: number }>;
  letterhead?: CapitalCallAccountingLetterhead | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const lh = params.letterhead;
    const margin = 50;
    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;

    if (lh) {
      const LOGO_RADIUS_PT = 34;
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

          doc.y = yStart + box + 6;
          doc.x = margin;
        } catch {
          doc.y = yStart;
          doc.x = margin;
        }
      }

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

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text("Payslip", { align: "center" });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(11).fillColor("#333333").text(params.payPeriod, { align: "center" });
    doc.moveDown(1.0);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text("Employee details");
    doc.moveDown(0.35);
    drawTwoColumnDetails(doc, {
      left: [
        ["Employee name", params.employeeName],
        ["Employee number", params.employeeNumber || "—"],
      ],
      right: [
        ["Email", params.employeeEmail || "—"],
        ["Payment date", params.paymentDateLabel],
      ],
    });
    doc.moveDown(0.6);

    const ccy = params.currencyCode;
    const allowances = params.allowances || [];
    const deductions = params.deductions || [];

    const allowanceRows = allowances
      .filter((a) => Number(a.amount || 0) !== 0)
      .map((a) => ({ label: a.name, amount: `${ccy} ${fmtMoney(Number(a.amount || 0))}` }));

    const earningsRows: Array<{ label: string; amount: string }> = [];
    if (params.basicSalary !== null && params.basicSalary !== undefined) {
      earningsRows.push({ label: "Basic salary", amount: `${ccy} ${fmtMoney(Number(params.basicSalary))}` });
    }
    earningsRows.push(...allowanceRows);
    earningsRows.push({ label: "Gross pay", amount: `${ccy} ${fmtMoney(params.grossPay)}` });
    drawTable(doc, { title: "Earnings", rows: earningsRows });

    const deductionRows = deductions
      .filter((d) => Number(d.amount || 0) !== 0)
      .map((d) => ({ label: d.name, amount: `${ccy} ${fmtMoney(Number(d.amount || 0))}` }));
    if (deductionRows.length === 0) {
      deductionRows.push({ label: "Total deductions", amount: `${ccy} ${fmtMoney(params.totalDeductions)}` });
    }
    drawTable(doc, { title: "Deductions", rows: deductionRows, totalLabel: "Total deductions", totalAmount: `${ccy} ${fmtMoney(params.totalDeductions)}` });

    // Net pay band
    doc.save();
    const bandY = doc.y + 6;
    doc.rect(margin, bandY, contentW, 28).fill("#111827");
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff");
    doc.text("Net pay", margin + 10, bandY + 8, { width: contentW * 0.5 });
    doc.text(`${ccy} ${fmtMoney(params.netPay)}`, margin + 10, bandY + 8, { width: contentW - 20, align: "right" });
    doc.moveDown(2.2);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text("Bank details");
    doc.moveDown(0.35);
    drawTwoColumnDetails(doc, {
      left: [
        ["Bank", params.bankName || "—"],
        ["Account number", params.bankAccountNumber || "—"],
      ],
      right: [["Branch code", params.bankBranchCode || "—"]],
    });

    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(8.5).fillColor("#666666");
    doc.text(
      "This is a computer-generated payslip. If you have any queries, please contact the HR/Payroll department.",
      { align: "left" }
    );
    doc.moveDown(0.4);
    doc.text(lh?.displayName || process.env.COMPANY_NAME_SHORT || "NVCCZ", {
      align: "right",
    });

    doc.end();
  });
}

