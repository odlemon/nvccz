// @ts-nocheck
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { reportRef } from "./investmentOpsSupport";

const REPORT_BUILDERS: Record<string, (fundId: string, userId: string, user: any) => Promise<object>> = {
  PORTFOLIO_VALUATION: async (fundId, userId, user) => {
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const pnl = await ListedEquityPortfolioService.getPnl(fundId, userId, user);
    return { holdings, pnl };
  },
  TRADE_BLOTTER: async (fundId) => {
    const trades = await prisma.listedEquityTrade.findMany({
      where: { fundId },
      include: { security: true, settlement: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return { trades };
  },
  HOLDINGS_SUMMARY: async (fundId, userId, user) => {
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    return { holdings, generatedAt: new Date().toISOString() };
  },
  COMPLIANCE_SUMMARY: async (fundId) => {
    const rules = await prisma.investmentComplianceRule.findMany({
      where: { OR: [{ fundId }, { fundId: null }], isActive: true },
    });
    const results = await prisma.investmentComplianceResult.findMany({
      where: { order: { fundId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { order: true },
    });
    return { rules, results };
  },
  RECONCILIATION_SUMMARY: async (fundId) => {
    const batches = await prisma.investmentReconciliationBatch.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { items: true },
    });
    return { batches };
  },
};

async function writePdf(fileRef: string, title: string, payload: object) {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = require("fs").createWriteStream(fileRef);
    doc.pipe(stream);
    doc.fontSize(16).text(title, { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(JSON.stringify(payload, null, 2), { width: 500 });
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function writeExcel(fileRef: string, payload: object) {
  const wb = XLSX.utils.book_new();
  const flatten = (obj: object) => {
    const rows: any[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        const sheet = XLSX.utils.json_to_sheet(v);
        XLSX.utils.book_append_sheet(wb, sheet, k.slice(0, 31));
      } else {
        rows.push({ key: k, value: JSON.stringify(v) });
      }
    }
    if (rows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Summary");
    }
  };
  flatten(payload);
  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ note: "No data" }]), "Report");
  }
  XLSX.writeFile(wb, fileRef);
}

function writeCsv(fileRef: string, payload: object) {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (Array.isArray(v) && v.length) {
      const headers = Object.keys(v[0]);
      lines.push(`${k}: ${headers.join(",")}`);
      for (const row of v) {
        lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
      }
    }
  }
  return writeFile(fileRef, lines.join("\n"), "utf8");
}

export class InvestmentReportingService {
  static async generate(
    userId: string,
    user: any,
    data: { fundId?: string; reportType: string; format?: string; parameters?: object }
  ) {
    if (data.fundId) await ListedEquityAccessService.assertFundAccess(userId, data.fundId, user);
    const run = await prisma.investmentReportRun.create({
      data: {
        fundId: data.fundId,
        reportType: data.reportType,
        format: data.format || "JSON",
        status: "RUNNING",
        parametersJson: data.parameters ?? {},
        requestedById: userId,
      },
    });

    const builder = REPORT_BUILDERS[data.reportType];
    let payload: object = { message: "Report type stub", reportType: data.reportType };
    if (builder && data.fundId) {
      payload = await builder(data.fundId, userId, user);
    }

    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-reports");
    await mkdir(dir, { recursive: true });
    const fmt = String(data.format || "JSON").toUpperCase();
    const base = reportRef();
    let fileRef: string;
    if (fmt === "PDF") {
      fileRef = path.join(dir, `${base}.pdf`);
      await writePdf(fileRef, data.reportType, payload);
    } else if (fmt === "EXCEL" || fmt === "XLSX") {
      fileRef = path.join(dir, `${base}.xlsx`);
      await writeExcel(fileRef, payload);
    } else if (fmt === "CSV") {
      fileRef = path.join(dir, `${base}.csv`);
      await writeCsv(fileRef, payload);
    } else {
      fileRef = path.join(dir, `${base}.json`);
      await writeFile(fileRef, JSON.stringify(payload, null, 2), "utf8");
    }

    await InvestmentOpsAuditService.log(
      "REPORT_GENERATED",
      "ReportRun",
      run.id,
      { reportType: data.reportType, format: fmt },
      userId
    );

    return prisma.investmentReportRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", fileRef, completedAt: new Date() },
    });
  }

  static async get(id: string) {
    return prisma.investmentReportRun.findUnique({ where: { id } });
  }
}
