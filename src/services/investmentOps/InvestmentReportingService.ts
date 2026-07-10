// @ts-nocheck
import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { reportRef } from "./investmentOpsSupport";
import { DocxTemplateRenderService } from "./reporting/DocxTemplateRenderService";
import { InvestmentReportDataBuilderRegistry } from "./reporting/InvestmentReportDataBuilderRegistry";
import {
  getInvestmentReportTemplate,
  INVESTMENT_REPORT_TEMPLATES,
  requiresClientIdForScope,
  requiresFundIdForScope,
  resolveDocxTemplatePath,
} from "./reporting/investmentReportTemplates";

type FlatReportPayload = {
  reportTitle: string;
  fundName: string;
  asOf: string;
  summary?: Array<{ label: string; value: string }>;
  sections: Array<{ title: string; columns: string[]; rows: Array<Record<string, string | number | null>> }>;
};

function fmtNum(n: unknown, digits = 2): string {
  if (n == null || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(d: unknown): string {
  if (!d) return "—";
  try {
    return new Date(d as string | Date).toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

function flattenHolding(h: any) {
  return {
    Symbol: h.security?.symbol || h.security?.ticker || "—",
    Name: h.security?.name || h.security?.shortName || "—",
    Quantity: fmtNum(h.quantity, 2),
    WAC: fmtNum(h.wac, 4),
    "Current Price": fmtNum(h.currentPrice, 4),
    "Market Value": fmtNum(h.marketValue, 2),
    "Unrealized P&L": fmtNum(h.unrealizedPnl, 2),
  };
}

async function fundDisplayName(fundId: string): Promise<string> {
  const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { name: true } });
  return fund?.name || fundId;
}

const REPORT_BUILDERS: Record<string, (fundId: string, userId: string, user: any) => Promise<FlatReportPayload>> = {
  PORTFOLIO_VALUATION: async (fundId, userId, user) => {
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const pnl = await ListedEquityPortfolioService.getPnl(fundId, userId, user);
    const rows = holdings.map(flattenHolding);
    const totalMv = holdings.reduce((s: number, h: any) => s + (Number(h.marketValue) || 0), 0);
    return {
      reportTitle: "Portfolio Valuation",
      fundName: await fundDisplayName(fundId),
      asOf: new Date().toISOString().slice(0, 10),
      summary: [
        { label: "Positions", value: String(holdings.length) },
        { label: "Total Market Value (USD)", value: fmtNum(totalMv) },
        { label: "Unrealized P&L (USD)", value: fmtNum(pnl?.unrealized?.usd) },
        { label: "Realized P&L (USD)", value: fmtNum(pnl?.realized?.usd) },
      ],
      sections: [{ title: "Holdings", columns: Object.keys(rows[0] || flattenHolding({})), rows }],
    };
  },
  TRADE_BLOTTER: async (fundId) => {
    const trades = await prisma.listedEquityTrade.findMany({
      where: { fundId },
      include: { security: true, settlement: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const rows = trades.map((t) => ({
      "Trade Ref": t.tradeRef,
      Symbol: t.security?.symbol || "—",
      Side: t.side,
      Quantity: fmtNum(t.quantity, 2),
      Price: fmtNum(t.executionPrice, 4),
      Currency: t.executionCurrencyCode,
      Fees: fmtNum(t.fees, 2),
      Status: t.status,
      Executed: fmtDate(t.executedAt),
      Settled: fmtDate(t.settledAt),
      "Realized P&L": fmtNum(t.settlement?.realizedPnl, 2),
    }));
    return {
      reportTitle: "Trade Blotter",
      fundName: await fundDisplayName(fundId),
      asOf: new Date().toISOString().slice(0, 10),
      summary: [{ label: "Trades", value: String(trades.length) }],
      sections: [{ title: "Trades", columns: Object.keys(rows[0] || { "Trade Ref": "" }), rows }],
    };
  },
  HOLDINGS_SUMMARY: async (fundId, userId, user) => {
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const rows = holdings.map(flattenHolding);
    const totalMv = holdings.reduce((s: number, h: any) => s + (Number(h.marketValue) || 0), 0);
    return {
      reportTitle: "Holdings Summary",
      fundName: await fundDisplayName(fundId),
      asOf: new Date().toISOString().slice(0, 10),
      summary: [
        { label: "Positions", value: String(holdings.length) },
        { label: "Total Market Value (USD)", value: fmtNum(totalMv) },
      ],
      sections: [{ title: "Holdings", columns: Object.keys(rows[0] || flattenHolding({})), rows }],
    };
  },
  COMPLIANCE_SUMMARY: async (fundId) => {
    const rules = await prisma.investmentComplianceRule.findMany({
      where: { OR: [{ fundId }, { fundId: null }], isActive: true },
    });
    const results = await prisma.investmentComplianceResult.findMany({
      where: { order: { fundId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { order: true, rule: true },
    });
    const ruleRows = rules.map((r) => ({
      Code: r.ruleCode,
      Name: r.ruleName,
      Type: r.ruleType,
      Threshold: r.thresholdValue != null ? `${fmtNum(r.thresholdValue, 2)}${r.thresholdUnit ? ` ${r.thresholdUnit}` : ""}` : "—",
      Active: r.isActive ? "Yes" : "No",
    }));
    const resultRows = results.map((r) => ({
      "Order Ref": r.order?.orderRef || "—",
      Rule: r.rule?.ruleCode || "—",
      Outcome: r.outcome,
      Message: (r.message || "—").slice(0, 120),
      Date: fmtDate(r.createdAt),
    }));
    return {
      reportTitle: "Compliance Summary",
      fundName: await fundDisplayName(fundId),
      asOf: new Date().toISOString().slice(0, 10),
      summary: [
        { label: "Active Rules", value: String(rules.length) },
        { label: "Recent Results", value: String(results.length) },
      ],
      sections: [
        { title: "Compliance Rules", columns: Object.keys(ruleRows[0] || { Code: "" }), rows: ruleRows },
        { title: "Recent Compliance Results", columns: Object.keys(resultRows[0] || { Outcome: "" }), rows: resultRows },
      ],
    };
  },
  RECONCILIATION_SUMMARY: async (fundId) => {
    const batches = await prisma.investmentReconciliationBatch.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { items: true },
    });
    const batchRows = batches.map((b: any) => ({
      Type: b.reconType || b.batchType || "—",
      Status: b.status,
      Matched: b.matchedCount ?? b.items?.filter((i: any) => i.status === "MATCHED").length ?? 0,
      Unmatched: b.unmatchedCount ?? b.items?.filter((i: any) => i.status === "UNMATCHED").length ?? 0,
      Items: b.items?.length ?? 0,
      Created: fmtDate(b.createdAt),
    }));
    const itemRows = batches.flatMap((b: any) =>
      (b.items || []).slice(0, 50).map((i: any) => ({
        Batch: b.id.slice(0, 8),
        Status: i.status,
        Reference: i.externalRef || i.internalRef || i.symbol || "—",
        Message: (i.message || i.notes || "—").toString().slice(0, 100),
      }))
    );
    return {
      reportTitle: "Reconciliation Summary",
      fundName: await fundDisplayName(fundId),
      asOf: new Date().toISOString().slice(0, 10),
      summary: [{ label: "Batches", value: String(batches.length) }],
      sections: [
        { title: "Reconciliation Batches", columns: Object.keys(batchRows[0] || { Type: "" }), rows: batchRows },
        { title: "Sample Items", columns: Object.keys(itemRows[0] || { Status: "" }), rows: itemRows },
      ],
    };
  },
};

function isFlatReportPayload(payload: object): payload is FlatReportPayload {
  return Boolean((payload as FlatReportPayload)?.sections && (payload as FlatReportPayload)?.reportTitle);
}

async function writePdf(fileRef: string, title: string, payload: object) {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const stream = require("fs").createWriteStream(fileRef);
    doc.pipe(stream);

    const flat = isFlatReportPayload(payload)
      ? payload
      : {
          reportTitle: title.replace(/_/g, " "),
          fundName: "—",
          asOf: new Date().toISOString().slice(0, 10),
          summary: [],
          sections: [],
        };

    doc.fontSize(18).fillColor("#111827").text(flat.reportTitle, { underline: false });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#374151").text(`Fund: ${flat.fundName}`);
    doc.text(`As of: ${flat.asOf}`);
    doc.text(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`);
    doc.moveDown(0.8);

    if (flat.summary?.length) {
      doc.fontSize(12).fillColor("#111827").text("Summary", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#374151");
      for (const row of flat.summary) {
        doc.text(`${row.label}: ${row.value}`);
      }
      doc.moveDown(0.8);
    }

    for (const section of flat.sections) {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(12).fillColor("#111827").text(section.title, { underline: true });
      doc.moveDown(0.4);

      if (!section.rows.length) {
        doc.fontSize(10).fillColor("#6B7280").text("No data for this section.");
        doc.moveDown(0.8);
        continue;
      }

      const cols = section.columns;
      const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = Math.max(45, usableWidth / cols.length);
      const startX = doc.page.margins.left;

      const drawHeader = () => {
        let x = startX;
        doc.fontSize(8).fillColor("#111827");
        for (const col of cols) {
          doc.text(String(col), x, doc.y, { width: colWidth - 4, continued: false, lineBreak: false });
          x += colWidth;
        }
        doc.moveDown(0.6);
        doc
          .moveTo(startX, doc.y)
          .lineTo(startX + usableWidth, doc.y)
          .strokeColor("#D1D5DB")
          .stroke();
        doc.moveDown(0.3);
      };

      drawHeader();
      doc.fontSize(8).fillColor("#374151");
      for (const row of section.rows) {
        if (doc.y > 740) {
          doc.addPage();
          drawHeader();
          doc.fontSize(8).fillColor("#374151");
        }
        const rowY = doc.y;
        let x = startX;
        let maxH = 12;
        for (const col of cols) {
          const cell = String(row[col] ?? "—");
          const h = doc.heightOfString(cell, { width: colWidth - 4 });
          maxH = Math.max(maxH, h);
          doc.text(cell, x, rowY, { width: colWidth - 4, lineBreak: false });
          x += colWidth;
        }
        doc.y = rowY + maxH + 4;
      }
      doc.moveDown(0.8);
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function writeExcel(fileRef: string, payload: object) {
  const wb = XLSX.utils.book_new();
  if (isFlatReportPayload(payload)) {
    if (payload.summary?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payload.summary), "Summary");
    }
    for (const section of payload.sections) {
      const sheetName = section.title.slice(0, 31) || "Sheet";
      const data = section.rows.length ? section.rows : [{ note: "No data" }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName);
    }
  } else {
    for (const [k, v] of Object.entries(payload)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v), k.slice(0, 31));
      }
    }
  }
  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ note: "No data" }]), "Report");
  }
  XLSX.writeFile(wb, fileRef);
}

function writeCsv(fileRef: string, payload: object) {
  const lines: string[] = [];
  if (isFlatReportPayload(payload)) {
    lines.push(`Report,${JSON.stringify(payload.reportTitle)}`);
    lines.push(`Fund,${JSON.stringify(payload.fundName)}`);
    lines.push(`AsOf,${JSON.stringify(payload.asOf)}`);
    lines.push("");
    for (const section of payload.sections) {
      lines.push(section.title);
      if (!section.rows.length) {
        lines.push("No data");
        lines.push("");
        continue;
      }
      lines.push(section.columns.map((c) => JSON.stringify(c)).join(","));
      for (const row of section.rows) {
        lines.push(section.columns.map((c) => JSON.stringify(row[c] ?? "")).join(","));
      }
      lines.push("");
    }
  } else {
    for (const [k, v] of Object.entries(payload)) {
      if (Array.isArray(v) && v.length) {
        const headers = Object.keys(v[0]);
        lines.push(`${k}: ${headers.join(",")}`);
        for (const row of v) {
          lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
        }
      }
    }
  }
  return writeFile(fileRef, lines.join("\n"), "utf8");
}

export class InvestmentReportingService {
  static listTemplates() {
    return INVESTMENT_REPORT_TEMPLATES.map((t) => ({
      code: t.code,
      name: t.name,
      description: t.description,
      scopeType: t.scopeType,
      supportedFormats: t.supportedFormats,
      requiresFundId: t.requiresFundId,
      requiresClientId: Boolean(t.requiresClientId),
      hasDocxTemplate: Boolean(t.docxTemplate),
    }));
  }

  static async list(
    userId: string,
    user: any,
    filters: {
      fundId?: string;
      reportType?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const where: any = {};

    if (filters.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, filters.fundId, user);
      where.fundId = filters.fundId;
    } else if (scope !== "ALL") {
      where.OR = [{ fundId: { in: scope } }, { fundId: null }];
    }

    if (filters.reportType) where.reportType = filters.reportType;
    if (filters.status) where.status = filters.status;

    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 50));
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      prisma.investmentReportRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.investmentReportRun.count({ where }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.requestedById).filter(Boolean))] as string[];
    const fundIds = [...new Set(rows.map((r) => r.fundId).filter(Boolean))] as string[];
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))] as string[];

    const [users, funds, clients] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [],
      fundIds.length
        ? prisma.fund.findMany({
            where: { id: { in: fundIds } },
            select: { id: true, name: true },
          })
        : [],
      clientIds.length
        ? prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, legalName: true },
          })
        : [],
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const fundMap = Object.fromEntries(funds.map((f) => [f.id, f]));
    const clientMap = Object.fromEntries(clients.map((cl) => [cl.id, cl]));
    const templateMap = Object.fromEntries(INVESTMENT_REPORT_TEMPLATES.map((t) => [t.code, t]));

    const items = rows.map((r) => {
      const requestedBy = r.requestedById ? userMap[r.requestedById] : null;
      const template = templateMap[r.reportType];
      return {
        id: r.id,
        fundId: r.fundId,
        fundName: r.fundId ? fundMap[r.fundId]?.name ?? null : null,
        clientId: r.clientId,
        clientName: r.clientId ? clientMap[r.clientId]?.legalName ?? null : null,
        scopeType: r.scopeType ?? template?.scopeType ?? null,
        reportType: r.reportType,
        reportTypeName: template?.name ?? r.reportType,
        format: r.format,
        status: r.status,
        parameters: r.parametersJson ?? null,
        requestedBy: requestedBy
          ? {
              id: requestedBy.id,
              name: `${requestedBy.firstName ?? ""} ${requestedBy.lastName ?? ""}`.trim() || requestedBy.email,
              email: requestedBy.email,
            }
          : null,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        downloadAvailable: Boolean(r.fileRef && r.status === "COMPLETED"),
      };
    });

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  static async generate(
    userId: string,
    user: any,
    data: {
      fundId?: string;
      clientId?: string;
      reportType: string;
      format?: string;
      parameters?: Record<string, unknown>;
    }
  ) {
    const templateDef = getInvestmentReportTemplate(data.reportType);
    const fmt = String(data.format || templateDef.supportedFormats[0]).toUpperCase();

    if (!templateDef.supportedFormats.includes(fmt as any)) {
      throw new Error(`Format ${fmt} not supported for ${templateDef.code}. Use: ${templateDef.supportedFormats.join(", ")}`);
    }

    const needsFund =
      templateDef.requiresFundId ||
      requiresFundIdForScope(templateDef.scopeType);
    const needsClient =
      templateDef.requiresClientId ||
      requiresClientIdForScope(templateDef.scopeType);

    if (needsFund && !data.fundId) {
      throw new Error("fundId is required for this report");
    }
    if (needsClient && !data.clientId) {
      throw new Error("clientId is required for this report");
    }
    if (data.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, data.fundId, user);
    }

    const run = await prisma.investmentReportRun.create({
      data: {
        fundId: data.fundId,
        clientId: data.clientId,
        scopeType: templateDef.scopeType,
        reportType: data.reportType,
        format: fmt,
        status: "RUNNING",
        parametersJson: data.parameters ?? {},
        requestedById: userId,
      },
    });

    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-reports");
    await mkdir(dir, { recursive: true });
    const base = reportRef();
    let fileRef: string;

    try {
      if (templateDef.docxTemplate && fmt === "DOCX") {
        const templatePath = resolveDocxTemplatePath(templateDef);
        const mergeData = await InvestmentReportDataBuilderRegistry.build({
          reportType: data.reportType,
          fundId: data.fundId,
          clientId: data.clientId,
          scopeType: templateDef.scopeType,
          userId,
          user,
          reportRunId: run.id,
          parameters: data.parameters as any,
        });
        const buffer = DocxTemplateRenderService.render(templatePath, mergeData);
        fileRef = path.join(dir, `${base}.docx`);
        await writeFile(fileRef, buffer);
      } else {
        const builder = REPORT_BUILDERS[data.reportType];
        let payload: object = { message: "Report type stub", reportType: data.reportType };
        if (builder && data.fundId) {
          payload = await builder(data.fundId, userId, user);
        }

        if (fmt === "PDF") {
          fileRef = path.join(dir, `${base}.pdf`);
          await writePdf(fileRef, templateDef.name || data.reportType, payload);
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
    } catch (err: any) {
      await prisma.investmentReportRun.update({
        where: { id: run.id },
        data: { status: "FAILED", completedAt: new Date() },
      });
      throw err;
    }
  }

  static async get(id: string) {
    return prisma.investmentReportRun.findUnique({ where: { id } });
  }

  static contentTypeForRun(run: { format?: string; fileRef?: string | null }): string {
    const fmt = String(run.format || "").toUpperCase();
    if (fmt === "DOCX") {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (fmt === "PDF") return "application/pdf";
    if (fmt === "CSV") return "text/csv";
    if (fmt === "EXCEL" || fmt === "XLSX") {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return "application/json";
  }

  static downloadFilename(run: { reportType?: string; format?: string; id: string }): string {
    const ext =
      String(run.format || "json").toLowerCase() === "xlsx"
        ? "xlsx"
        : String(run.format || "json").toLowerCase();
    const safe = String(run.reportType || "report").replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${safe}-${run.id}.${ext}`;
  }

  static openDownloadStream(fileRef: string) {
    return createReadStream(fileRef);
  }
}
