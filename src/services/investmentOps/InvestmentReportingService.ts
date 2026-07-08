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
