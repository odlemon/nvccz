// @ts-nocheck
import { createHash } from "crypto";
import { createReadStream, existsSync } from "fs";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { InvestmentAuditEventService } from "./InvestmentAuditEventService";
import { InvestmentOutboxService } from "./InvestmentOutboxService";
import { permittedActionsFor } from "./InvestmentCapabilitiesService";
import {
  InvestmentJobWorkerService,
  registerInvestmentJobHandler,
} from "./InvestmentJobWorkerService";
import "./InvestmentPlatformJobHandlers";
import { reportRef } from "./investmentOpsSupport";
import { DocxTemplateRenderService } from "./reporting/DocxTemplateRenderService";
import { InvestmentReportDataBuilderRegistry } from "./reporting/InvestmentReportDataBuilderRegistry";
import {
  getInvestmentReportTemplate,
  INVESTMENT_REPORT_TEMPLATES,
  INVESTMENT_REPORT_TEMPLATE_VERSION,
  requiresClientIdForScope,
  requiresFundIdForScope,
  resolveDocxTemplatePath,
} from "./reporting/investmentReportTemplates";

const REPORT_EXPIRY_MS = Number(process.env.INVESTMENT_REPORT_EXPIRY_MS || 7 * 24 * 60 * 60 * 1000);

type FlatReportPayload = {
  reportTitle: string;
  fundName: string;
  asOf: string;
  summary?: Array<{ label: string; value: string }>;
  sections: Array<{ title: string; columns: string[]; rows: Array<Record<string, string | number | null>> }>;
};

type ReportPlatformMeta = {
  jobId?: string | null;
  checksumSha256?: string | null;
  expiresAt?: string | null;
  templateVersion?: number;
  errorMessage?: string | null;
  cancelledAt?: string | null;
  byteSize?: number | null;
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
      Threshold:
        r.thresholdValue != null
          ? `${fmtNum(r.thresholdValue, 2)}${r.thresholdUnit ? ` ${r.thresholdUnit}` : ""}`
          : "—",
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
        {
          title: "Recent Compliance Results",
          columns: Object.keys(resultRows[0] || { Outcome: "" }),
          rows: resultRows,
        },
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

// FE report codes that share the flat PDF/XLSX/CSV builders (DOCX still preferred when format=DOCX).
REPORT_BUILDERS.HOLDINGS_REPORT = REPORT_BUILDERS.HOLDINGS_SUMMARY;
REPORT_BUILDERS.PERFORMANCE_REPORT = REPORT_BUILDERS.PORTFOLIO_VALUATION;
REPORT_BUILDERS.TRANSACTION_REPORT = REPORT_BUILDERS.TRADE_BLOTTER;
REPORT_BUILDERS.ASSET_ALLOCATION_REPORT = REPORT_BUILDERS.PORTFOLIO_VALUATION;
REPORT_BUILDERS.INCOME_REPORT = REPORT_BUILDERS.PORTFOLIO_VALUATION;

function isFlatReportPayload(payload: object): payload is FlatReportPayload {
  return Boolean((payload as FlatReportPayload)?.sections && (payload as FlatReportPayload)?.reportTitle);
}

function splitParameters(raw: any): { userParams: Record<string, unknown>; meta: ReportPlatformMeta } {
  const obj = raw && typeof raw === "object" ? { ...raw } : {};
  const meta = (obj._platform && typeof obj._platform === "object" ? obj._platform : {}) as ReportPlatformMeta;
  delete obj._platform;
  return { userParams: obj, meta };
}

function mergeParameters(userParams: Record<string, unknown>, meta: ReportPlatformMeta) {
  return { ...userParams, _platform: meta };
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

function formatExt(format?: string): string {
  const fmt = String(format || "json").toUpperCase();
  if (fmt === "EXCEL" || fmt === "XLSX") return "xlsx";
  return fmt.toLowerCase();
}

/** Professional download name — no database ids. e.g. "Performance Report - 05 Aug 2026.docx" */
function buildDownloadFilename(run: {
  reportType?: string;
  format?: string;
  createdAt?: Date | string;
  completedAt?: Date | string | null;
  parametersJson?: unknown;
}): string {
  let title = String(run.reportType || "Investment Report");
  try {
    title = getInvestmentReportTemplate(String(run.reportType || "")).name;
  } catch {
    /* keep code as title */
  }
  title = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const { userParams } = splitParameters(run.parametersJson);
  const asOfRaw =
    userParams?.asOf ||
    userParams?.valuationDate ||
    userParams?.periodEnd ||
    run.completedAt ||
    run.createdAt ||
    new Date();
  const asOf = new Date(asOfRaw);
  const dateLabel = Number.isNaN(asOf.getTime())
    ? new Date().toISOString().slice(0, 10)
    : asOf.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${title} - ${dateLabel}.${formatExt(run.format)}`;
}

function resolveStoredFileRef(fileRef: string): string {
  if (!fileRef) return fileRef;
  // Absolute paths (legacy Windows/Linux) — use as-is when present.
  if (path.isAbsolute(fileRef) && existsSync(fileRef)) return fileRef;
  // Prefer cwd-relative storage keys written by newer deploys.
  const fromCwd = path.resolve(process.cwd(), fileRef);
  if (existsSync(fromCwd)) return fromCwd;
  // Recover basename under the standard reports directory.
  const base = path.basename(fileRef.replace(/\\/g, "/"));
  const underReports = path.join(
    process.cwd(),
    "storage",
    "local-upload-mock",
    "investment-ops-reports",
    base
  );
  return underReports;
}

function serializeReport(run: any, user?: any) {
  if (!run) return run;
  const { userParams, meta } = splitParameters(run.parametersJson);
  const expired = meta.expiresAt ? new Date(meta.expiresAt).getTime() < Date.now() : false;
  let reportTypeName = run.reportType;
  try {
    reportTypeName = getInvestmentReportTemplate(run.reportType).name;
  } catch {
    /* keep code */
  }
  return {
    id: run.id,
    fundId: run.fundId,
    clientId: run.clientId,
    scopeType: run.scopeType,
    reportType: run.reportType,
    reportTypeName,
    format: run.format,
    status: run.status,
    parameters: userParams,
    jobId: meta.jobId ?? null,
    checksumSha256: meta.checksumSha256 ?? null,
    expiresAt: meta.expiresAt ?? null,
    expired,
    templateVersion: meta.templateVersion ?? INVESTMENT_REPORT_TEMPLATE_VERSION,
    errorMessage: meta.errorMessage ?? null,
    byteSize: meta.byteSize ?? null,
    requestedById: run.requestedById,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    downloadAvailable: Boolean(run.fileRef && run.status === "COMPLETED" && !expired),
    downloadFileName: buildDownloadFilename(run),
    permittedActions: user ? permittedActionsFor(user, "report", run.status) : undefined,
  };
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
      version: t.version,
      parameterSchema: t.parameterSchema,
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
      const serialized = serializeReport(r, user);
      return {
        ...serialized,
        fundName: r.fundId ? fundMap[r.fundId]?.name ?? null : null,
        clientName: r.clientId ? clientMap[r.clientId]?.legalName ?? null : null,
        scopeType: r.scopeType ?? template?.scopeType ?? null,
        reportTypeName: template?.name ?? r.reportType,
        requestedBy: requestedBy
          ? {
              id: requestedBy.id,
              name:
                `${requestedBy.firstName ?? ""} ${requestedBy.lastName ?? ""}`.trim() ||
                requestedBy.email,
              email: requestedBy.email,
            }
          : null,
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
      processNow?: boolean;
      idempotencyKey?: string;
    }
  ) {
    const templateDef = getInvestmentReportTemplate(data.reportType);
    const fmt = String(data.format || templateDef.supportedFormats[0]).toUpperCase();

    if (!templateDef.supportedFormats.includes(fmt as any)) {
      throw new InvestmentOpsError(
        "UNSUPPORTED_REPORT_FORMAT",
        `Format ${fmt} not supported for ${templateDef.code}. Use: ${templateDef.supportedFormats.join(", ")}`,
        400
      );
    }

    const needsFund =
      templateDef.requiresFundId || requiresFundIdForScope(templateDef.scopeType);
    const needsClient =
      templateDef.requiresClientId || requiresClientIdForScope(templateDef.scopeType);

    if (needsFund && !data.fundId) {
      throw new InvestmentOpsError("FUND_ID_REQUIRED", "fundId is required for this report", 400);
    }
    if (needsClient && !data.clientId) {
      throw new InvestmentOpsError("CLIENT_ID_REQUIRED", "clientId is required for this report", 400);
    }
    if (data.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, data.fundId, user);
    }

    const hasBuilder = Boolean(REPORT_BUILDERS[data.reportType]);
    const hasDocx = Boolean(templateDef.docxTemplate);
    if (!hasBuilder && !hasDocx) {
      throw new InvestmentOpsError(
        "REPORT_TEMPLATE_UNIMPLEMENTED",
        `Report template ${data.reportType} has no production builder`,
        501
      );
    }

    const userParams = { ...(data.parameters || {}) };
    const run = await prisma.investmentReportRun.create({
      data: {
        fundId: data.fundId,
        clientId: data.clientId,
        scopeType: templateDef.scopeType,
        reportType: data.reportType,
        format: fmt,
        status: "PENDING",
        parametersJson: mergeParameters(userParams, {
          templateVersion: templateDef.version,
          jobId: null,
        }),
        requestedById: userId,
      },
    });

    const idempotencyKey =
      data.idempotencyKey || `report-generate:${run.id}:${data.reportType}:${fmt}`;
    const job = await InvestmentJobWorkerService.enqueue({
      jobType: "REPORT_GENERATE",
      aggregateType: "ReportRun",
      aggregateId: run.id,
      payloadJson: {
        reportRunId: run.id,
        fundId: data.fundId ?? null,
        clientId: data.clientId ?? null,
        reportType: data.reportType,
        format: fmt,
        userId,
      },
      idempotencyKey,
      priority: 50,
    });

    await prisma.investmentReportRun.update({
      where: { id: run.id },
      data: {
        status: "QUEUED",
        parametersJson: mergeParameters(userParams, {
          templateVersion: templateDef.version,
          jobId: job.id,
        }),
      },
    });

    await InvestmentAuditEventService.append({
      aggregateType: "ReportRun",
      aggregateId: run.id,
      eventType: "REPORT_QUEUED",
      actorId: userId,
      afterJson: { reportType: data.reportType, format: fmt, jobId: job.id },
    });
    await InvestmentOutboxService.enqueue({
      aggregateType: "ReportRun",
      aggregateId: run.id,
      aggregateVersion: 1,
      eventType: "REPORT_QUEUED",
      payloadJson: { reportRunId: run.id, jobId: job.id, reportType: data.reportType },
      idempotencyKey: `outbox:report-queued:${run.id}`,
    });
    await InvestmentOpsAuditService.log(
      "REPORT_QUEUED",
      "ReportRun",
      run.id,
      { reportType: data.reportType, format: fmt, jobId: job.id },
      userId
    );

    if (data.processNow !== false) {
      await InvestmentJobWorkerService.processJobById(job.id);
    }

    return this.getDetail(run.id, userId, user);
  }

  static async processGenerateJob(job: any) {
    const reportRunId = job.payloadJson?.reportRunId || job.aggregateId;
    const run = await prisma.investmentReportRun.findUnique({ where: { id: reportRunId } });
    if (!run) throw new InvestmentOpsError("REPORT_NOT_FOUND", "Report run not found", 404);
    if (run.status === "CANCELLED") return { skipped: true, reason: "cancelled" };
    if (run.status === "COMPLETED" && run.fileRef) {
      return { skipped: true, reason: "already completed" };
    }

    const { userParams, meta } = splitParameters(run.parametersJson);
    await prisma.investmentReportRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        parametersJson: mergeParameters(userParams, { ...meta, jobId: job.id, errorMessage: null }),
      },
    });

    const templateDef = getInvestmentReportTemplate(run.reportType);
    const fmt = String(run.format || "PDF").toUpperCase();
    const userId = job.payloadJson?.userId || run.requestedById || "system";
    const user = { role: { name: "admin" } };

    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-reports");
    await mkdir(dir, { recursive: true });
    const base = reportRef();
    let fileRef: string;

    try {
      if (templateDef.docxTemplate && fmt === "DOCX") {
        const templatePath = resolveDocxTemplatePath(templateDef);
        const mergeData = await InvestmentReportDataBuilderRegistry.build({
          reportType: run.reportType,
          fundId: run.fundId || undefined,
          clientId: run.clientId || undefined,
          scopeType: templateDef.scopeType,
          userId,
          user,
          reportRunId: run.id,
          parameters: userParams as any,
        });
        const buffer = DocxTemplateRenderService.render(templatePath, mergeData);
        const absPath = path.join(dir, `${base}.docx`);
        await writeFile(absPath, buffer);
        fileRef = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
      } else {
        const builder = REPORT_BUILDERS[run.reportType];
        if (!builder || !run.fundId) {
          throw new InvestmentOpsError(
            "REPORT_TEMPLATE_UNIMPLEMENTED",
            `No production builder for ${run.reportType}`,
            501
          );
        }
        const payload = await builder(run.fundId, userId, user);
        let absPath: string;
        if (fmt === "PDF") {
          absPath = path.join(dir, `${base}.pdf`);
          await writePdf(absPath, templateDef.name || run.reportType, payload);
        } else if (fmt === "EXCEL" || fmt === "XLSX") {
          absPath = path.join(dir, `${base}.xlsx`);
          await writeExcel(absPath, payload);
        } else if (fmt === "CSV") {
          absPath = path.join(dir, `${base}.csv`);
          await writeCsv(absPath, payload);
        } else if (fmt === "JSON") {
          absPath = path.join(dir, `${base}.json`);
          await writeFile(absPath, JSON.stringify(payload, null, 2), "utf8");
        } else {
          throw new InvestmentOpsError("UNSUPPORTED_REPORT_FORMAT", `Unsupported format ${fmt}`, 400);
        }
        fileRef = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
      }

      const bytes = await readFile(resolveStoredFileRef(fileRef));
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      const expiresAt = new Date(Date.now() + REPORT_EXPIRY_MS).toISOString();

      await prisma.investmentReportRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          fileRef,
          completedAt: new Date(),
          parametersJson: mergeParameters(userParams, {
            ...meta,
            jobId: job.id,
            checksumSha256,
            expiresAt,
            byteSize: bytes.length,
            templateVersion: templateDef.version,
            errorMessage: null,
          }),
        },
      });

      await InvestmentAuditEventService.append({
        aggregateType: "ReportRun",
        aggregateId: run.id,
        eventType: "REPORT_GENERATED",
        actorId: userId,
        afterJson: { checksumSha256, expiresAt, format: fmt },
      });
      await InvestmentOutboxService.enqueue({
        aggregateType: "ReportRun",
        aggregateId: run.id,
        aggregateVersion: 2,
        eventType: "REPORT_GENERATED",
        payloadJson: { reportRunId: run.id, checksumSha256, expiresAt },
        idempotencyKey: `outbox:report-generated:${run.id}:${job.id}`,
      });
      await InvestmentOpsAuditService.log(
        "REPORT_GENERATED",
        "ReportRun",
        run.id,
        { reportType: run.reportType, format: fmt, checksumSha256 },
        userId
      );

      return { reportRunId: run.id, checksumSha256, expiresAt, byteSize: bytes.length };
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.investmentReportRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          parametersJson: mergeParameters(userParams, {
            ...meta,
            jobId: job.id,
            errorMessage: message,
          }),
        },
      });
      await InvestmentAuditEventService.append({
        aggregateType: "ReportRun",
        aggregateId: run.id,
        eventType: "REPORT_FAILED",
        actorId: userId,
        metadataJson: { errorMessage: message },
      });
      throw err;
    }
  }

  static async get(id: string, userId: string, user: any) {
    const run = await prisma.investmentReportRun.findUnique({ where: { id } });
    if (!run) return null;
    if (run.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, run.fundId, user);
    } else {
      const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
      if (scope !== "ALL") {
        throw new InvestmentOpsError(
          "FORBIDDEN_REPORT_ACCESS",
          "Firm-scoped report access requires admin portfolio scope",
          403
        );
      }
    }
    return run;
  }

  static async getDetail(id: string, userId: string, user: any) {
    const run = await this.get(id, userId, user);
    if (!run) throw new InvestmentOpsError("REPORT_NOT_FOUND", "Report run not found", 404);
    return serializeReport(run, user);
  }

  static async audit(id: string, userId: string, user: any) {
    await this.get(id, userId, user);
    const events = await InvestmentAuditEventService.listForAggregate("ReportRun", id);
    return { reportRunId: id, events };
  }

  static async cancel(id: string, userId: string, user: any, reason?: string) {
    const run = await this.get(id, userId, user);
    if (!run) throw new InvestmentOpsError("REPORT_NOT_FOUND", "Report run not found", 404);
    if (["COMPLETED", "CANCELLED"].includes(run.status)) {
      return serializeReport(run, user);
    }
    const { userParams, meta } = splitParameters(run.parametersJson);
    if (meta.jobId) {
      await InvestmentJobWorkerService.cancel(meta.jobId, reason || "report cancelled");
    }
    const updated = await prisma.investmentReportRun.update({
      where: { id },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        parametersJson: mergeParameters(userParams, {
          ...meta,
          cancelledAt: new Date().toISOString(),
          errorMessage: reason || "cancelled",
        }),
      },
    });
    await InvestmentAuditEventService.append({
      aggregateType: "ReportRun",
      aggregateId: id,
      eventType: "REPORT_CANCELLED",
      actorId: userId,
      metadataJson: { reason: reason || null },
    });
    await InvestmentOutboxService.enqueue({
      aggregateType: "ReportRun",
      aggregateId: id,
      aggregateVersion: 3,
      eventType: "REPORT_CANCELLED",
      payloadJson: { reportRunId: id },
      idempotencyKey: `outbox:report-cancelled:${id}`,
    });
    return serializeReport(updated, user);
  }

  static async retry(id: string, userId: string, user: any, idempotencyKey?: string) {
    const run = await this.get(id, userId, user);
    if (!run) throw new InvestmentOpsError("REPORT_NOT_FOUND", "Report run not found", 404);
    if (!["FAILED", "CANCELLED"].includes(run.status)) {
      throw new InvestmentOpsError(
        "REPORT_RETRY_NOT_ALLOWED",
        `Cannot retry report in status ${run.status}`,
        409
      );
    }
    const { userParams } = splitParameters(run.parametersJson);
    return this.generate(userId, user, {
      fundId: run.fundId || undefined,
      clientId: run.clientId || undefined,
      reportType: run.reportType,
      format: run.format,
      parameters: userParams,
      idempotencyKey: idempotencyKey || `report-retry:${id}:${Date.now()}`,
      processNow: true,
    });
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

  static downloadFilename(run: {
    reportType?: string;
    format?: string;
    id?: string;
    createdAt?: Date | string;
    completedAt?: Date | string | null;
    parametersJson?: unknown;
  }): string {
    return buildDownloadFilename(run);
  }

  static resolveFileRef(fileRef: string): string {
    return resolveStoredFileRef(fileRef);
  }

  static openDownloadStream(fileRef: string) {
    return createReadStream(resolveStoredFileRef(fileRef));
  }

  static async assertDownloadable(id: string, userId: string, user: any) {
    const run = await this.get(id, userId, user);
    if (!run) throw new InvestmentOpsError("REPORT_NOT_FOUND", "Report run not found", 404);
    if (run.status !== "COMPLETED" || !run.fileRef) {
      throw new InvestmentOpsError("REPORT_NOT_READY", "Report output is not available", 409);
    }
    const { meta } = splitParameters(run.parametersJson);
    if (meta.expiresAt && new Date(meta.expiresAt).getTime() < Date.now()) {
      throw new InvestmentOpsError("REPORT_EXPIRED", "Report output has expired", 410);
    }
    const absolute = resolveStoredFileRef(run.fileRef);
    try {
      await access(absolute);
    } catch {
      throw new InvestmentOpsError(
        "REPORT_FILE_MISSING",
        "Report file is no longer on this server. Please generate the report again.",
        410
      );
    }
    return { ...run, fileRef: absolute };
  }
}

registerInvestmentJobHandler("REPORT_GENERATE", async (job) =>
  InvestmentReportingService.processGenerateJob(job)
);
