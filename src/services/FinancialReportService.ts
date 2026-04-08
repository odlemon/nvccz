// @ts-nocheck
import { randomUUID } from 'crypto';
import { prisma } from '../utils/database';
import { remoteUploadService } from './RemoteUploadService';
import { EmailNotificationService } from './EmailNotificationService';
import { companyNameShortFromEnv } from "../config/companyDisplay";
import { PortfolioCompanyAccountingService } from './PortfolioCompanyAccountingService';
import { join } from 'path';
import { readFileSync } from 'fs';
import {
  canonicalFieldDefaults,
  cashflowStatementSchema,
  incomeStatementSchema,
  statementOfFinancialPositionLineItemsSchema,
} from "../config/financialReportFormSchemas";
import { InvestmentMonitoringKpiService } from "./InvestmentMonitoringKpiService";

export type FinancialReportType = 
  'INCOME_STATEMENTS' | 
  'STATEMENT_OF_FINANCIAL_POSITION' | 
  'CASHFLOW_STATEMENTS' | 
  'NON_FINANCIAL_KPIS' |
  // Doc-required categories (uploads can be PDFs for narrative/compliance)
  'BANK_STATEMENTS' |
  'TAX_COMPLIANCE' |
  'MANAGEMENT_ACCOUNTS' |
  'BUSINESS_PLAN' |
  // Keep old types for backward compatibility
  'BALANCE_SHEET' | 
  'INCOME_STATEMENT' | 
  'CASHFLOW_STATEMENT';
export type FinancialReportPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type FinancialReportStatus = 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS_REVISION';

interface CreateReportParams {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  submittedById: string;
  reportType: FinancialReportType;
  reportingPeriod: Date;
  periodType: FinancialReportPeriod;
  periodStart: Date;
  periodEnd: Date;
  title: string;
  description?: string;
  templateVersion?: string;
  dataSnapshot?: any; // manual-entry form fields for this reportType
  fileBuffer: Buffer;
  originalFileName: string;
}

interface CreateDraftReportParams {
  portfolioCompanyId: string;
  submittedById: string;
  reportType: FinancialReportType;
  reportingPeriod: Date;
  periodType: FinancialReportPeriod;
  periodStart: Date;
  periodEnd: Date;
  title: string;
  description?: string;
  templateVersion?: string;
  dataSnapshot?: any; // manual-entry form fields for this reportType
}

interface ReviewReportParams {
  reportId: string;
  reviewerId: string;
  action: 'ACCEPT' | 'REJECT' | 'NEEDS_REVISION';
  comment?: string;
  totalRevenue?: number | null;
  netProfit?: number | null;
  cashFlowNet?: number | null;
  /** Optional accounting actions to run on ACCEPT (replaces legacy `mapping`). */
  valuationAdjustment?: any;
  valuation?: any;
  dividend?: any;
  dividends?: any[];
  /** JWT used to post to Accounting API (prefer the caller's Bearer token). */
  authToken?: string;
}

export class FinancialReportService {
  private static normalizeNumericObjectDeep(value: any): any {
    if (value === null || value === undefined || value === "") return 0;
    if (Array.isArray(value)) return value.map((v) => this.normalizeNumericObjectDeep(v));
    if (typeof value === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.normalizeNumericObjectDeep(v);
      }
      return out;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return 0;
      // Convert numeric-ish strings, keep other labels as-is.
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  }

  /** Public URL fields for list/detail responses (empty DB placeholders → null; tolerate driver column casing). */
  private static reportFileFieldsFromRow(row: any): {
    reportUrl: string | null;
    fileUrl: string | null;
    storagePath: string | null;
  } {
    const rawUrl = row?.reportUrl ?? row?.reporturl;
    const url =
      rawUrl != null && String(rawUrl).trim() !== "" ? String(rawUrl).trim() : null;
    const rawPath = row?.storagePath ?? row?.storagepath;
    const path =
      rawPath != null && String(rawPath).trim() !== "" ? String(rawPath).trim() : null;
    return { reportUrl: url, fileUrl: url, storagePath: path };
  }

  /** `financial_reports.parsedSnapshot` → object for API (null if empty / invalid). */
  private static parseParsedSnapshotColumn(raw: any): any | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "object" && !Buffer.isBuffer(raw)) {
      return raw;
    }
    let s: string;
    if (typeof raw === "string") s = raw;
    else if (Buffer.isBuffer(raw)) s = raw.toString("utf8");
    else s = String(raw);
    const t = s.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }

  /** Legacy row → Arcus-style type label for a clean API. */
  private static canonicalReportTypeLabelForList(reportType: string): string {
    const u = String(reportType || "").toUpperCase();
    if (u === "INCOME_STATEMENT") return "INCOME_STATEMENTS";
    if (u === "BALANCE_SHEET") return "STATEMENT_OF_FINANCIAL_POSITION";
    if (u === "CASHFLOW_STATEMENT") return "CASHFLOW_STATEMENTS";
    return reportType;
  }

  /** Group key: income / balance / cashflow vs other types. */
  private static financialReportDedupeSlot(reportType: string): string | null {
    const u = String(reportType || "").toUpperCase();
    if (u === "INCOME_STATEMENTS" || u === "INCOME_STATEMENT") return "CORE_INCOME";
    if (u === "STATEMENT_OF_FINANCIAL_POSITION" || u === "BALANCE_SHEET") return "CORE_BALANCE";
    if (u === "CASHFLOW_STATEMENTS" || u === "CASHFLOW_STATEMENT") return "CORE_CASHFLOW";
    return null;
  }

  private static periodKeyForReportDedupe(row: any): string {
    const toDay = (d: any): string | null => {
      if (d == null) return null;
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt.toISOString().split("T")[0];
    };
    return toDay(row.reportingPeriod) || toDay(row.periodEnd) || toDay(row.periodStart) || `id:${row.id}`;
  }

  private static dataRichnessScore(data: any): number {
    if (data == null || typeof data !== "object") return 0;
    const keys = Object.keys(data);
    if (keys.length === 0) return 0;
    let extra = 0;
    if (data.currentPeriod && typeof data.currentPeriod === "object") {
      extra = Math.max(extra, Object.keys(data.currentPeriod).length);
    }
    if (data.priorPeriod && typeof data.priorPeriod === "object") {
      extra = Math.max(extra, Object.keys(data.priorPeriod).length);
    }
    return keys.length + extra;
  }

  private static dedupeFinancialReportListItems(items: any[]): any[] {
    const dedupeKey = (it: any) => {
      const slot = this.financialReportDedupeSlot(it.reportType);
      const co = it.portfolioCompanyId;
      const pk = this.periodKeyForReportDedupe(it);
      if (slot) return `${co}|${slot}|${pk}`;
      const rt = String(it.reportType || "").toUpperCase();
      return `${co}|${rt}|${pk}`;
    };

    const score = (it: any) => {
      let s = this.dataRichnessScore(it.data) * 100;
      const rt = String(it.reportType || "").toUpperCase();
      if (["INCOME_STATEMENTS", "STATEMENT_OF_FINANCIAL_POSITION", "CASHFLOW_STATEMENTS"].includes(rt)) {
        s += 80;
      }
      if (it.reportUrl != null && String(it.reportUrl).trim() !== "") s += 40;
      const t = new Date(it.updatedAt || it.createdAt || 0).getTime();
      return s * 1e12 + t;
    };

    const bestByKey = new Map<string, any>();
    for (const it of items) {
      const k = dedupeKey(it);
      const cur = bestByKey.get(k);
      if (!cur || score(it) > score(cur)) bestByKey.set(k, it);
    }

    const winners = new Set([...bestByKey.values()].map((x) => x.id));
    const kept = items.filter((it) => winners.has(it.id));
    kept.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return kept.map((it) => ({
      ...it,
      reportType: this.canonicalReportTypeLabelForList(it.reportType),
    }));
  }

  /** Public URLs for list responses (no internal storage path). */
  private static reportPublicUrlsForListRow(row: any): { reportUrl: string | null; fileUrl: string | null } {
    const u = this.reportFileFieldsFromRow(row);
    return { reportUrl: u.reportUrl, fileUrl: u.fileUrl };
  }

  /** Attach normalized `reportUrl` / `fileUrl` / `storagePath` onto a raw DB row for JSON APIs. */
  static mergeReportFileUrlsForApi(row: any | null): any | null {
    if (row == null) return null;
    const snap = row.parsedSnapshot ?? row.parsedsnapshot;
    const { parsedSnapshot: _a, parsedsnapshot: _b, ...rest } = row;
    const urls = this.reportFileFieldsFromRow(row);
    const data = this.parseParsedSnapshotColumn(snap);
    const out: any = { ...rest, ...urls };
    if (data !== null) out.data = data;
    return out;
  }

  private static normalizeReportDataOrThrow(reportType: string, dataSnapshot: any): any {
    if (dataSnapshot === null || dataSnapshot === undefined) return null;
    if (typeof dataSnapshot !== "object") {
      throw new Error("data must be a JSON object");
    }

    const rt = String(reportType || "").toUpperCase();
    if (rt === "INCOME_STATEMENTS" || rt === "INCOME_STATEMENT") {
      const defaults = canonicalFieldDefaults(incomeStatementSchema);
      const normalized = this.normalizeNumericObjectDeep(dataSnapshot);

      const out: any = {};
      for (const k of Object.keys(defaults)) {
        out[k] = normalized?.[k] ?? defaults[k];
      }
      return out;
    }

    if (rt === "STATEMENT_OF_FINANCIAL_POSITION" || rt === "BALANCE_SHEET") {
      const defaults = canonicalFieldDefaults(statementOfFinancialPositionLineItemsSchema);
      const raw = this.normalizeNumericObjectDeep(dataSnapshot);
      const hasNested =
        raw &&
        typeof raw === "object" &&
        (Object.prototype.hasOwnProperty.call(raw, "currentPeriod") ||
          Object.prototype.hasOwnProperty.call(raw, "priorPeriod"));

      const mergePeriod = (obj: any) => {
        const src = obj && typeof obj === "object" ? obj : {};
        const o: any = {};
        for (const k of Object.keys(defaults)) {
          o[k] = src[k] ?? defaults[k];
        }
        return o;
      };

      if (hasNested) {
        return {
          currentPeriod: mergePeriod(raw.currentPeriod),
          priorPeriod: mergePeriod(raw.priorPeriod),
        };
      }

      const flat: any = { ...raw };
      delete flat.currentPeriod;
      delete flat.priorPeriod;
      return {
        currentPeriod: mergePeriod(flat),
        priorPeriod: mergePeriod({}),
      };
    }

    if (rt === "CASHFLOW_STATEMENTS" || rt === "CASHFLOW_STATEMENT") {
      const defaults = canonicalFieldDefaults(cashflowStatementSchema);
      const normalized = this.normalizeNumericObjectDeep(dataSnapshot);
      const out: any = {};
      for (const k of Object.keys(defaults)) {
        out[k] = normalized?.[k] ?? defaults[k];
      }
      return out;
    }

    return this.normalizeNumericObjectDeep(dataSnapshot);
  }
  private static async assertOpenReportingRequestExists(portfolioCompanyId: string, reportingPeriod: Date | string) {
    const iso =
      reportingPeriod instanceof Date
        ? reportingPeriod.toISOString().split("T")[0]
        : new Date(String(reportingPeriod)).toISOString().split("T")[0];

    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) as c
         FROM reporting_notification_logs
        WHERE portfolio_company_id = ?
          AND reporting_period = ?
          AND event_type = 'REQUEST'`,
      portfolioCompanyId,
      iso
    );
    if (Number(rows?.[0]?.c ?? 0) <= 0) {
      const org = companyNameShortFromEnv();
      throw new Error(
        `No open reporting request found for reportingPeriod ${iso}. ${org} must open a request before KPI/file submission.`
      );
    }
  }
  private static reportingPeriodIso(date: Date): string {
    const instance = date instanceof Date ? date : new Date(date);
    return instance.toISOString().split("T")[0];
  }

  private static monthPrefixForFile(reportingPeriod: Date): string {
    // YYYY-MM
    return this.reportingPeriodIso(reportingPeriod).slice(0, 7);
  }

  private static validateFilenamePatternOrThrow(args: {
    originalFileName: string;
    reportingPeriod: Date;
  }): void {
    // Pattern: [YYYY-MM]_[CompanyName]_[DocType]_vNN.ext
    // We enforce the YYYY-MM prefix and version token; company/docType are flexible.
    const monthPrefix = this.monthPrefixForFile(args.reportingPeriod);
    const re = new RegExp(`^${monthPrefix}_.+_.+_v\\d+\\.[A-Za-z0-9]+$`);
    if (!re.test(args.originalFileName)) {
      throw new Error(
        `Invalid filename. Expected pattern: [YYYY-MM]_[CompanyName]_[DocType]_vNN.ext (e.g. ${monthPrefix}_Acme_IncomeStatement_v01.xlsx)`
      );
    }
  }

  static async createReport(params: CreateReportParams) {
    const id = randomUUID();
    await this.assertOpenReportingRequestExists(params.portfolioCompanyId, params.reportingPeriod);

    const timestamp = Date.now();

    // Generate a stored filename that conforms to the doc pattern even if the user uploads a "natural" filename.
    const originalExt = params.originalFileName.split(".").pop()?.toLowerCase() || "bin";
    const companySafe = (params.portfolioCompanyName || "PortfolioCompany").replace(/[^a-zA-Z0-9\-_]/g, "_");
    const reportSafe = String(params.reportType).replace(/[^a-zA-Z0-9\-_]/g, "_");
    const monthPrefix = this.monthPrefixForFile(params.reportingPeriod); // YYYY-MM
    const docTypeSafe = `${reportSafe}-${String(id).slice(0, 8)}`; // keep uniqueness while staying within pattern
    const versionToken = "v01";
    const storedName = `${monthPrefix}_${companySafe}_${docTypeSafe}_${versionToken}.${originalExt}`;

    this.validateFilenamePatternOrThrow({
      originalFileName: storedName,
      reportingPeriod: params.reportingPeriod,
    });
    
    const uploadResult = await remoteUploadService.uploadSingleFile(
      {
        buffer: params.fileBuffer,
        originalname: storedName,
        mimetype: this.getMimeType(params.originalFileName),
      },
      'financial-reports'
    );

      await prisma.$executeRawUnsafe(
      `INSERT INTO financial_reports (
        id,
        portfolioCompanyId,
        submittedById,
        reportType,
        periodType,
        periodStart,
        periodEnd,
        reportingPeriod,
        title,
        description,
        reportUrl,
        storagePath,
        templateVersion,
        parsedSnapshot,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
      id,
      params.portfolioCompanyId,
      params.submittedById,
      params.reportType,
      params.periodType,
      this.formatDate(params.periodStart),
      this.formatDate(params.periodEnd),
      this.formatDate(params.reportingPeriod),
      params.title,
      params.description || null,
      uploadResult.downloadURL,
      uploadResult.filePath,
      params.templateVersion || 'v1',
      params.dataSnapshot
        ? JSON.stringify(this.normalizeReportDataOrThrow(params.reportType, params.dataSnapshot))
        : null
    );

    const url = uploadResult.downloadURL;
    return {
      id,
      reportUrl: url,
      fileUrl: url,
      storagePath: uploadResult.filePath,
    };
  }

  /**
   * Create a DRAFT report row with manual-entry data (no file yet).
   * The file is uploaded later and attached to this report by ID.
   */
  static async createDraftReport(params: CreateDraftReportParams) {
    const id = randomUUID();
    await this.assertOpenReportingRequestExists(params.portfolioCompanyId, params.reportingPeriod);

    await prisma.$executeRawUnsafe(
      `INSERT INTO financial_reports (
        id,
        portfolioCompanyId,
        submittedById,
        reportType,
        periodType,
        periodStart,
        periodEnd,
        reportingPeriod,
        title,
        description,
        reportUrl,
        storagePath,
        templateVersion,
        parsedSnapshot,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
      id,
      params.portfolioCompanyId,
      params.submittedById,
      params.reportType,
      params.periodType,
      this.formatDate(params.periodStart),
      this.formatDate(params.periodEnd),
      this.formatDate(params.reportingPeriod),
      params.title,
      params.description || null,
      "", // placeholder until file is attached
      "", // placeholder until file is attached
      params.templateVersion || "v1",
      params.dataSnapshot
        ? JSON.stringify(this.normalizeReportDataOrThrow(params.reportType, params.dataSnapshot))
        : null
    );

    return {
      id,
      reportType: params.reportType,
      reportUrl: null,
      fileUrl: null,
      storagePath: null,
    };
  }

  /**
   * Attach/upload the file for an existing draft report.
   */
  static async attachFileToReport(params: {
    reportId: string;
    submittedById: string;
    originalFileName: string;
    fileBuffer: Buffer;
  }) {
    const report = await this.getReportById(params.reportId);
    if (!report) throw new Error("Financial report not found");
    if (report.submittedById !== params.submittedById) {
      throw new Error("Report does not belong to you");
    }
    if (!["DRAFT", "NEEDS_REVISION"].includes(report.status)) {
      throw new Error("Only DRAFT or NEEDS_REVISION reports can accept file uploads");
    }

    const reportingPeriod = report.reportingPeriod || report.periodEnd;
    const rp = new Date(reportingPeriod);
    if (Number.isNaN(rp.getTime())) throw new Error("Invalid reportingPeriod on report");

    const originalExt = params.originalFileName.split(".").pop()?.toLowerCase() || "bin";
    const companySafe = String(report.companyName || "PortfolioCompany").replace(/[^a-zA-Z0-9\-_]/g, "_");
    const reportSafe = String(report.reportType).replace(/[^a-zA-Z0-9\-_]/g, "_");
    const monthPrefix = this.monthPrefixForFile(rp);
    const docTypeSafe = `${reportSafe}-${String(report.id).slice(0, 8)}`;
    const versionToken = "v01";
    const storedName = `${monthPrefix}_${companySafe}_${docTypeSafe}_${versionToken}.${originalExt}`;

    this.validateFilenamePatternOrThrow({ originalFileName: storedName, reportingPeriod: rp });

    const uploadResult = await remoteUploadService.uploadSingleFile(
      {
        buffer: params.fileBuffer,
        originalname: storedName,
        mimetype: this.getMimeType(params.originalFileName),
      },
      "financial-reports"
    );

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports
          SET reportUrl = ?,
              storagePath = ?,
              updatedAt = NOW()
        WHERE id = ?`,
      uploadResult.downloadURL,
      uploadResult.filePath,
      report.id
    );

    const url = uploadResult.downloadURL;
    return {
      id: report.id,
      reportUrl: url,
      fileUrl: url,
      storagePath: uploadResult.filePath,
    };
  }

  static async listReportsForApplicant(userId: string, opts?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(opts?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(opts?.limit || 20)));
    const offset = (page - 1) * limit;

    const companies = await prisma.portfolioCompany.findMany({
      where: { userId },
      select: { id: true, name: true }
    });

    if (companies.length === 0) {
      return { page, limit, total: 0, items: [] };
    }

    const companyIds = companies.map(c => c.id);
    const placeholders = companyIds.map(() => '?').join(',');

    /** Load a bounded window so legacy duplicate rows (same period + type) collapse before pagination. */
    const RAW_CAP = Math.min(500, Math.max(limit * page + 100, 200));

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT fr.id,
              fr.portfolioCompanyId,
              fr.reportType,
              fr.periodType,
              fr.periodStart,
              fr.periodEnd,
              fr.reportingPeriod,
              fr.title,
              fr.description,
              fr.reportUrl,
              fr.storagePath,
              fr.templateVersion,
              fr.status,
              fr.totalRevenue,
              fr.netProfit,
              fr.cashFlowNet,
              fr.parsedSnapshot,
              fr.createdAt,
              fr.updatedAt,
              pc.name AS companyName
         FROM financial_reports fr
         JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
        WHERE fr.portfolioCompanyId IN (${placeholders})
        ORDER BY fr.createdAt DESC
        LIMIT ?`,
      ...companyIds,
      RAW_CAP
    );

    const allItems = rows.map((row) => {
      const urls = this.reportPublicUrlsForListRow(row);
      const data = this.parseParsedSnapshotColumn(row.parsedSnapshot ?? row.parsedsnapshot);
      const item: any = {
        id: row.id,
        portfolioCompanyId: row.portfolioCompanyId,
        companyName: row.companyName,
        reportType: row.reportType,
        periodType: row.periodType,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        reportingPeriod: row.reportingPeriod,
        title: row.title,
        description: row.description,
        ...urls,
        templateVersion: row.templateVersion,
        status: row.status,
        totalRevenue: row.totalRevenue,
        netProfit: row.netProfit,
        cashFlowNet: row.cashFlowNet,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isDraft: row.status === "DRAFT",
        canSubmit: ["DRAFT", "NEEDS_REVISION"].includes(row.status),
        canDownload: row.status !== "DRAFT",
      };
      if (data !== null) item.data = data;
      return item;
    });

    const deduped = this.dedupeFinancialReportListItems(allItems);
    const total = deduped.length;
    const items = deduped.slice(offset, offset + limit);

    return {
      page,
      limit,
      total,
      items,
    };
  }

  static async downloadReportTemplate(reportType: string): Promise<Buffer> {
    const normalized = reportType?.toUpperCase();
    let filePath: string;

    switch (normalized) {
      // New XLSX templates
      case 'INCOME_STATEMENTS':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'income_statement_template.xlsx');
        break;
      case 'STATEMENT_OF_FINANCIAL_POSITION':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'statement_of_financial_position_template.xlsx');
        break;
      case 'CASHFLOW_STATEMENTS':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'cashflow_statement_template.xlsx');
        break;
      case 'NON_FINANCIAL_KPIS':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'non_financial_kpis_template.xlsx');
        break;
      // Old CSV templates (backward compatibility)
      case 'BALANCE_SHEET':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'balance_sheet_template.csv');
        break;
      case 'CASHFLOW_STATEMENT':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'cashflow_statement_template.csv');
        break;
      case 'INCOME_STATEMENT':
      default:
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'income_statement_template.csv');
        break;
    }

    return readFileSync(filePath);
  }

  static async listReportsForCompany(portfolioCompanyId: string, opts?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(opts?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(opts?.limit || 20)));
    const offset = (page - 1) * limit;
    const RAW_CAP = Math.min(500, Math.max(limit * page + 100, 200));

    const reports: any[] = await prisma.$queryRawUnsafe(
      `SELECT fr.id,
              fr.portfolioCompanyId,
              fr.reportType,
              fr.periodType,
              fr.periodStart,
              fr.periodEnd,
              fr.reportingPeriod,
              fr.title,
              fr.description,
              fr.reportUrl,
              fr.storagePath,
              fr.templateVersion,
              fr.status,
              fr.reviewerId,
              fr.reviewedAt,
              fr.reviewerComment,
              fr.parsedSnapshot,
              fr.createdAt,
              fr.updatedAt,
              u.firstName as submittedByFirstName,
              u.lastName as submittedByLastName
       FROM financial_reports fr
       JOIN users u ON u.id = fr.submittedById
       WHERE fr.portfolioCompanyId = ?
         AND fr.status <> 'DRAFT'
       ORDER BY fr.createdAt DESC
       LIMIT ?`,
      portfolioCompanyId,
      RAW_CAP
    );

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { financialKpis: true }
    });

    const kpiValues = company?.financialKpis?.kpiValues || {};

    const kpiFor = (report: any) => {
      try {
        const periodKey = new Date(report.reportingPeriod || report.periodEnd).toISOString().split("T")[0];
        return kpiValues[periodKey] || {};
      } catch {
        return {};
      }
    };

    const allItems = reports.map((report: any) => {
      const periodKPIs = kpiFor(report);
      const urls = this.reportPublicUrlsForListRow(report);
      const data = this.parseParsedSnapshotColumn(report.parsedSnapshot ?? report.parsedsnapshot);

      const item: any = {
        id: report.id,
        portfolioCompanyId: report.portfolioCompanyId,
        reportType: report.reportType,
        periodType: report.periodType,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        reportingPeriod: report.reportingPeriod,
        title: report.title,
        description: report.description,
        ...urls,
        templateVersion: report.templateVersion,
        status: report.status,
        reviewerId: report.reviewerId,
        reviewedAt: report.reviewedAt,
        reviewerComment: report.reviewerComment,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        submittedByFirstName: report.submittedByFirstName,
        submittedByLastName: report.submittedByLastName,
        totalRevenue: periodKPIs.TOTAL_REVENUE ?? null,
        netProfit: periodKPIs.NET_PROFIT ?? null,
        cashFlowNet: periodKPIs.CASH_FLOW_NET ?? null,
      };
      if (data !== null) item.data = data;
      return item;
    });

    const deduped = this.dedupeFinancialReportListItems(allItems);
    const total = deduped.length;
    const items = deduped.slice(offset, offset + limit);

    return {
      page,
      limit,
      total,
      items,
    };
  }

  static async getReportById(reportId: string) {
    const [report] = await prisma.$queryRawUnsafe(
      `SELECT fr.*, 
              pc.contactEmail, 
              pc.name as companyName, 
              pc.id as portfolioCompanyId
       FROM financial_reports fr
       JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
       WHERE fr.id = ?
       LIMIT 1`,
      reportId
    );

    return report || null;
  }

  static async reviewReport(params: ReviewReportParams) {
    const report = await this.getReportById(params.reportId);
    if (!report) {
      throw new Error('Financial report not found');
    }

    if (report.status === 'DRAFT') {
      throw new Error('Report has not been submitted for review');
    }

    let status: FinancialReportStatus =
      params.action === "ACCEPT" ? "ACCEPTED" : params.action === "NEEDS_REVISION" ? "NEEDS_REVISION" : "REJECTED";

    // Parse numeric values (allow null/undefined)
    const parseNumeric = (value: any): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = Number(value);
      return isNaN(parsed) ? null : parsed;
    };

    const totalRevenue = parseNumeric(params.totalRevenue);
    const netProfit = parseNumeric(params.netProfit);
    const cashFlowNet = parseNumeric(params.cashFlowNet);

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports
       SET status = ?,
           reviewerId = ?,
           reviewedAt = NOW(),
           reviewerComment = ?,
           totalRevenue = ?,
           netProfit = ?,
           cashFlowNet = ?
       WHERE id = ?`,
      status,
      params.reviewerId,
      params.comment || null,
      totalRevenue,
      netProfit,
      cashFlowNet,
      params.reportId
    );

    if (params.action === 'ACCEPT') {
      try {
        const automationPayload: any = {
          valuationAdjustment: params.valuationAdjustment,
          valuation: params.valuation,
          dividend: params.dividend,
          dividends: params.dividends,
          authToken: params.authToken || process.env.ACCOUNTING_API_SERVICE_TOKEN,
        };
        const hasAutomation =
          automationPayload.valuationAdjustment ||
          automationPayload.valuation ||
          automationPayload.dividend ||
          (Array.isArray(automationPayload.dividends) && automationPayload.dividends.length > 0);
        if (!hasAutomation) {
          throw new Error(
            "ACCEPT must include accounting automation payload (valuationAdjustment/valuation and/or dividend/dividends)."
          );
        }

        // Sync approved KPI values to portfolio company
        if (totalRevenue !== null || netProfit !== null || cashFlowNet !== null) {
          await this.syncApprovedKPIsToPortfolioCompany(
            report.portfolioCompanyId,
            report.reportingPeriod || report.periodEnd,
            totalRevenue,
            netProfit,
            cashFlowNet
          );
        }

        const rpDate = report.reportingPeriod || report.periodEnd;
        const rpIso =
          rpDate instanceof Date
            ? rpDate.toISOString().split("T")[0]
            : new Date(rpDate).toISOString().split("T")[0];
        await InvestmentMonitoringKpiService.recomputeAndPersistForPeriod(report.portfolioCompanyId, rpIso);

        // Run valuation/dividend automations on ACCEPT (explicit payload)
        await this.runPostApprovalAutomations(report, params.reviewerId, automationPayload);
        await this.notifyOutcome(report, 'ACCEPTED', params.comment);
      } catch (error: any) {
        console.error('❌ Failed to sync accepted financial report:', error);
        await prisma.$executeRawUnsafe(
          `UPDATE financial_reports
           SET status = 'NEEDS_REVISION',
               reviewerComment = CONCAT(COALESCE(reviewerComment, ''), '\nSync error: ', ?)
           WHERE id = ?`,
          error.message || 'Sync error',
          params.reportId
        );
        await this.notifyOutcome(report, 'REJECTED', `${params.comment ? params.comment + '\n' : ''}Sync error: ${error.message || error}`);
        throw error;
      }
    } else {
      await this.notifyOutcome(report, status, params.comment);
    }
  }

  static async enqueueProcessingJob(reportId: string) {
    console.log(`🧾 Queueing financial report processing for report ${reportId}`);
    // Placeholder for queue integration – hook into background worker
  }

  static async submitDraft(reportId: string, userId: string) {
    await this.submitDrafts([reportId], userId);
  }

  static async submitDrafts(reportIds: string[], userId: string) {
    if (!reportIds || reportIds.length === 0) {
      throw new Error('No reports provided');
    }

    const reports = await prisma.$queryRawUnsafe<any[]>(
      `SELECT fr.*
       FROM financial_reports fr
       WHERE fr.id IN (${reportIds.map(() => '?').join(',')})`,
      ...reportIds
    );

    if (reports.length !== reportIds.length) {
      throw new Error('One or more reports not found');
    }

    const invalidOwner = reports.find(report => report.submittedById !== userId);
    if (invalidOwner) {
      throw new Error('One or more reports do not belong to you');
    }

    const invalidStatus = reports.find(report => !['DRAFT', 'NEEDS_REVISION'].includes(report.status));
    if (invalidStatus) {
      throw new Error('Only draft or needs revision reports can be submitted');
    }

    // Submission is allowed even if not all document categories are present.
    // We only require that an admin opened a reporting request for that company+period.
    const groups = new Map<string, { portfolioCompanyId: string; reportingPeriod: string; present: Set<string> }>();
    for (const r of reports) {
      const rp = r.reportingPeriod || r.periodEnd; // defensive fallback for older rows
      if (!rp) {
        throw new Error('Cannot submit: report is missing reportingPeriod');
      }
      const rpIso = new Date(rp).toISOString().split('T')[0];
      const key = `${r.portfolioCompanyId}::${rpIso}`;
      const g = groups.get(key) || {
        portfolioCompanyId: r.portfolioCompanyId,
        reportingPeriod: rpIso,
        present: new Set<string>(),
      };
      g.present.add(String(r.reportType || '').toUpperCase());
      groups.set(key, g);
    }

    for (const g of groups.values()) {
      await this.assertOpenReportingRequestExists(g.portfolioCompanyId, g.reportingPeriod);
    }

    // Submit the full bundle for each period group (so the user doesn't need to pass all IDs).
    const idsToSubmit: string[] = [];
    for (const g of groups.values()) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id
           FROM financial_reports
          WHERE portfolioCompanyId = ?
            AND reportingPeriod = ?
            AND status IN ('DRAFT','NEEDS_REVISION')`,
        g.portfolioCompanyId,
        g.reportingPeriod
      );
      for (const r of rows) idsToSubmit.push(r.id);
    }
    const uniqueIds = [...new Set(idsToSubmit)];
    if (uniqueIds.length === 0) {
      throw new Error("No draft reports found to submit");
    }

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports
       SET status = 'PENDING',
           updatedAt = NOW()
       WHERE id IN (${uniqueIds.map(() => '?').join(',')})`,
      ...uniqueIds
    );

    await Promise.all(
      reports.map(report =>
        this.notifySubmission(report.portfolioCompanyId, report.reportType, report.title, report.periodStart, report.periodEnd)
      )
    );
  }

  private static async notifySubmission(portfolioCompanyId: string, reportType: string, title: string, periodStart: Date, periodEnd: Date) {
    const investmentRoles = ["BOARD_CHAIR", "CIO", "INV_ANALYST"];

    const recipients = await prisma.user.findMany({
      where: {
        userDepartment: 'Investments',
        roleCode: { in: investmentRoles }
      },
      select: {
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (recipients.length === 0) {
      return;
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { name: true }
    });

    await EmailNotificationService.sendFinancialReportSubmittedEmail({
      recipients,
      companyName: company?.name || 'Portfolio Company',
      reportType,
      title,
      periodStart,
      periodEnd
    });
  }

  private static async notifyOutcome(report: any, status: FinancialReportStatus, comment?: string) {
    const contactEmail = report.contactEmail || (await this.findApplicantEmail(report.portfolioCompanyId));
    if (!contactEmail) {
      return;
    }

    const payload = {
      recipientEmail: contactEmail,
      companyName: report.companyName,
      reportType: report.reportType,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status,
      comment: comment || ''
    };

    if (status === 'ACCEPTED') {
      await EmailNotificationService.sendFinancialReportAcceptedEmail(payload);
    } else {
      await EmailNotificationService.sendFinancialReportRejectedEmail(payload);
    }
  }

  private static async findApplicantEmail(portfolioCompanyId: string) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: {
        user: {
          select: { email: true }
        }
      }
    });

    return company?.user?.email || null;
  }

  private static formatDate(date: Date) {
    const instance = date instanceof Date ? date : new Date(date);
    return instance.toISOString().split('T')[0];
  }

  private static getMimeType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel',
      'csv': 'text/csv',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  }

  private static async runPostApprovalAutomations(report: any, reviewerId: string, mapping: any): Promise<void> {
    if (!mapping) {
      // No mapping provided, nothing to automate
      return;
    }

    const automations: Promise<any>[] = [];

    const valuationPayload = mapping?.valuationAdjustment || mapping?.valuation;
    if (valuationPayload) {
      const newAmount = this.ensureNumeric(
        valuationPayload.newAmount ?? valuationPayload.amount ?? valuationPayload.value,
        'Valuation automation requires a numeric newAmount'
      );
      const previousAmount = await this.resolvePreviousValuationAmount(
        report.portfolioCompanyId,
        valuationPayload.previousAmount
      );
      const valuationDate = valuationPayload.valuationDate || valuationPayload.date || report.periodEnd || new Date();
      const difference = Number((newAmount - previousAmount).toFixed(2));

      if (difference !== 0) {
        automations.push(
          PortfolioCompanyAccountingService.recordValuationAdjustment({
            portfolioCompanyId: report.portfolioCompanyId,
            previousAmount,
            newAmount,
            valuationDate,
            approvedById: reviewerId,
            notes: valuationPayload.notes || valuationPayload.comment || null,
            authToken: mapping?.authToken || process.env.ACCOUNTING_API_SERVICE_TOKEN
          })
        );
      }
    }

    const dividendPayloads = this.normalizeDividends(mapping);
    for (const dividend of dividendPayloads) {
      const amount = this.ensureNumeric(
        dividend.amount ?? dividend.value,
        'Dividend automation requires a numeric amount'
      );

      if (amount <= 0) {
        throw new Error('Dividend automation requires amount greater than zero');
      }

      const dividendDate = dividend.dividendDate || dividend.date || report.periodEnd || new Date();

      automations.push(
        PortfolioCompanyAccountingService.recordDividend({
          portfolioCompanyId: report.portfolioCompanyId,
          amount,
          dividendDate,
          approvedById: reviewerId,
          notes: dividend.notes || dividend.comment || null,
          bankId: dividend.bankId || dividend.bankID || dividend.bank_id || null,
          authToken: mapping?.authToken || process.env.ACCOUNTING_API_SERVICE_TOKEN
        })
      );
    }

    await Promise.all(automations);
  }


  private static normalizeDividends(mapping: any): any[] {
    if (!mapping) {
      return [];
    }

    if (Array.isArray(mapping.dividends)) {
      return mapping.dividends;
    }

    if (mapping.dividend) {
      return [mapping.dividend];
    }

    return [];
  }

  private static ensureNumeric(value: any, errorMessage: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(errorMessage);
    }
    return Number(parsed.toFixed(2));
  }

  private static async resolvePreviousValuationAmount(portfolioCompanyId: string, provided?: any): Promise<number> {
    if (provided !== undefined && provided !== null && Number.isFinite(Number(provided))) {
      return Number(Number(provided).toFixed(2));
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { financialKpis: true }
    });

    const kpis = company?.financialKpis;
    const latest = kpis?.latestValuation?.amount ?? kpis?.latest?.PORTFOLIO_FAIR_VALUE;

    if (latest !== undefined && latest !== null && Number.isFinite(Number(latest))) {
      return Number(Number(latest).toFixed(2));
    }

    return 0;
  }

  /**
   * Sync approved KPI values from financial report to portfolio company
   * Called when a report is accepted with KPI values
   */
  private static async syncApprovedKPIsToPortfolioCompany(
    portfolioCompanyId: string,
    reportingPeriod: Date,
    totalRevenue: number | null,
    netProfit: number | null,
    cashFlowNet: number | null
  ): Promise<void> {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { financialKpis: true }
    });

    if (!company) {
      throw new Error('Portfolio company not found');
    }

    const snapshot = company.financialKpis || {};
    const periodKey = new Date(reportingPeriod).toISOString().split('T')[0];

    // Update period-specific KPIs
    snapshot.kpiValues = snapshot.kpiValues || {};
    snapshot.kpiValues[periodKey] = snapshot.kpiValues[periodKey] || {};
    
    if (totalRevenue !== null) {
      snapshot.kpiValues[periodKey].TOTAL_REVENUE = totalRevenue;
    }
    
    if (netProfit !== null) {
      snapshot.kpiValues[periodKey].NET_PROFIT = netProfit;
    }
    
    if (cashFlowNet !== null) {
      snapshot.kpiValues[periodKey].CASH_FLOW_NET = cashFlowNet;
    }

    // Update latest KPI values (use the most recent period)
    snapshot.latestKpiValues = snapshot.latestKpiValues || {};
    if (totalRevenue !== null) {
      snapshot.latestKpiValues.TOTAL_REVENUE = totalRevenue;
    }
    if (netProfit !== null) {
      snapshot.latestKpiValues.NET_PROFIT = netProfit;
    }
    if (cashFlowNet !== null) {
      snapshot.latestKpiValues.CASH_FLOW_NET = cashFlowNet;
    }
    // Doc naming: keep a friendly alias for dashboard consumers.
    snapshot.latestMetrics = snapshot.latestKpiValues;

    // Update metadata
    snapshot.lastReportDate = periodKey;
    snapshot.lastUpdatedAt = new Date().toISOString();

    // Save to database
    await prisma.portfolioCompany.update({
      where: { id: portfolioCompanyId },
      data: { financialKpis: snapshot }
    });

    console.log(`✅ Synced approved KPIs to portfolio company ${portfolioCompanyId}, period: ${periodKey}`);
  }

  /**
   * Save period-level KPI values (not tied to a specific report)
   * Used when user enters KPIs in the stepper after uploading files
   */
  static async savePeriodKPIs(params: {
    portfolioCompanyId: string;
    periodStart: Date;
    periodEnd: Date;
    totalRevenue?: number | null;
    netProfit?: number | null;
    cashFlowNet?: number | null;
    // New: structured manual entry sections (front-end form line items)
    incomeStatement?: any;
    statementOfFinancialPosition?: any;
    cashflowStatement?: any;
    nonFinancialKpis?: any;
  }): Promise<{
    periodStart: string;
    periodEnd: string;
    totalRevenue: number | null;
    netProfit: number | null;
    cashFlowNet: number | null;
  }> {
    await this.assertOpenReportingRequestExists(params.portfolioCompanyId, params.periodEnd);
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: params.portfolioCompanyId },
      select: { financialKpis: true }
    });

    if (!company) {
      throw new Error('Portfolio company not found');
    }

    const snapshot = company.financialKpis || {};
    const periodKey = new Date(params.periodEnd).toISOString().split('T')[0];

    // Parse numeric values (allow null/undefined)
    const parseNumeric = (value: any): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = Number(value);
      return isNaN(parsed) ? null : parsed;
    };

    const totalRevenue = parseNumeric(params.totalRevenue);
    const netProfit = parseNumeric(params.netProfit);
    const cashFlowNet = parseNumeric(params.cashFlowNet);

    // Update period-specific KPIs
    snapshot.kpiValues = snapshot.kpiValues || {};
    snapshot.kpiValues[periodKey] = snapshot.kpiValues[periodKey] || {};

    // Store manual-entry form payloads (line items) keyed by reporting period.
    snapshot.kpiValues[periodKey].manualEntries = snapshot.kpiValues[periodKey].manualEntries || {};
    if (params.incomeStatement && typeof params.incomeStatement === "object") {
      snapshot.kpiValues[periodKey].manualEntries.incomeStatement = this.normalizeReportDataOrThrow(
        "INCOME_STATEMENTS",
        params.incomeStatement
      );
    }
    if (params.statementOfFinancialPosition && typeof params.statementOfFinancialPosition === "object") {
      snapshot.kpiValues[periodKey].manualEntries.statementOfFinancialPosition = this.normalizeReportDataOrThrow(
        "STATEMENT_OF_FINANCIAL_POSITION",
        params.statementOfFinancialPosition
      );
    }
    if (params.cashflowStatement && typeof params.cashflowStatement === "object") {
      snapshot.kpiValues[periodKey].manualEntries.cashflowStatement = this.normalizeReportDataOrThrow(
        "CASHFLOW_STATEMENTS",
        params.cashflowStatement
      );
    }
    if (params.nonFinancialKpis && typeof params.nonFinancialKpis === "object") {
      snapshot.kpiValues[periodKey].manualEntries.nonFinancialKpis = this.normalizeNumericObjectDeep(params.nonFinancialKpis);
    }
    
    if (totalRevenue !== null) {
      snapshot.kpiValues[periodKey].TOTAL_REVENUE = totalRevenue;
    }
    
    if (netProfit !== null) {
      snapshot.kpiValues[periodKey].NET_PROFIT = netProfit;
    }
    
    if (cashFlowNet !== null) {
      snapshot.kpiValues[periodKey].CASH_FLOW_NET = cashFlowNet;
    }

    // Update latest KPI values (use the most recent period)
    snapshot.latestKpiValues = snapshot.latestKpiValues || {};
    if (totalRevenue !== null) {
      snapshot.latestKpiValues.TOTAL_REVENUE = totalRevenue;
    }
    if (netProfit !== null) {
      snapshot.latestKpiValues.NET_PROFIT = netProfit;
    }
    if (cashFlowNet !== null) {
      snapshot.latestKpiValues.CASH_FLOW_NET = cashFlowNet;
    }
    snapshot.latestMetrics = snapshot.latestKpiValues;

    // Update metadata
    snapshot.lastReportDate = periodKey;
    snapshot.lastUpdatedAt = new Date().toISOString();

    // Save to database
    await prisma.portfolioCompany.update({
      where: { id: params.portfolioCompanyId },
      data: { financialKpis: snapshot }
    });

    console.log(`✅ Saved period KPIs for ${params.portfolioCompanyId}, period: ${periodKey}`);

    // Return the saved values
    return {
      periodStart: this.formatDate(params.periodStart),
      periodEnd: periodKey,
      totalRevenue,
      netProfit,
      cashFlowNet
    };
  }
}
