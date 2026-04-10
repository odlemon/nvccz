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
import {
  normalizeOperationalKpiPayload,
  OPERATIONAL_KPI_NUMERIC_INVALID,
} from "../config/operationalKpiFieldSchema";
import { totalsFromIncomeLineItems, totalsFromSofpCurrent } from "../utils/reportingDerivedKpis";
import { InvestmentMonitoringKpiService } from "./InvestmentMonitoringKpiService";
import AuditService from "./AuditService";
import { ReportingPeriodKpiService, priorPeriodRevenueFromSnapshot } from "./ReportingPeriodKpiService";
import { isReportTypeAcceptWithoutAccounting } from "../config/financialReportAcceptPolicy";

export type FinancialReportType = 
  'INCOME_STATEMENTS' | 
  'STATEMENT_OF_FINANCIAL_POSITION' | 
  'CASHFLOW_STATEMENTS' | 
  'NON_FINANCIAL_KPIS' |
  /** JSON-only operational / unit-economics KPIs; draft → submit like other reports. */
  'OPERATIONAL_KPIS' |
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
  /** Applicant-facing statuses that allow file attach + resubmit. */
  private static readonly resubmittableStatuses = ["DRAFT", "NEEDS_REVISION", "REJECTED"] as const;

  /** Investee user is linked PC owner and/or original submitter. */
  private static async assertApplicantOwnsFinancialReport(report: any, applicantUserId: string): Promise<void> {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: report.portfolioCompanyId },
      select: { userId: true },
    });
    const ownsCompany = company?.userId === applicantUserId;
    const isSubmitter = report.submittedById === applicantUserId;
    if (!ownsCompany && !isSubmitter) {
      throw new Error("Report does not belong to you");
    }
  }

  private static reportTypeAcceptsManualDataSnapshot(reportType: string): boolean {
    const u = String(reportType || "").toUpperCase();
    return (
      u === "INCOME_STATEMENTS" ||
      u === "INCOME_STATEMENT" ||
      u === "BALANCE_SHEET" ||
      u === "STATEMENT_OF_FINANCIAL_POSITION" ||
      u === "CASHFLOW_STATEMENTS" ||
      u === "CASHFLOW_STATEMENT" ||
      u === "NON_FINANCIAL_KPIS" ||
      u === "OPERATIONAL_KPIS"
    );
  }

  private static toEmailDate(value: any): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const d = value != null ? new Date(value) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  private static async auditFinancialReportEvent(opts: {
    userId?: string | null;
    action: string;
    reportId: string;
    portfolioCompanyId: string;
    companyName?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  }): Promise<void> {
    await AuditService.log({
      userId: opts.userId ?? null,
      action: opts.action,
      entityType: "FinancialReport",
      entityId: opts.reportId,
      oldValues: opts.oldValues ?? undefined,
      newValues: {
        portfolioCompanyId: opts.portfolioCompanyId,
        ...(opts.companyName ? { companyName: opts.companyName } : {}),
        ...(opts.newValues || {}),
      },
    });
  }

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

  private static parseStrictLineItemNumber(fieldKey: string, value: unknown, defaultWhenEmpty: number): number {
    if (value === null || value === undefined || value === "") {
      return defaultWhenEmpty;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(OPERATIONAL_KPI_NUMERIC_INVALID);
      }
      return value;
    }
    if (typeof value === "string") {
      const t = value.trim();
      if (t === "") return defaultWhenEmpty;
      const n = Number(t);
      if (!Number.isFinite(n)) {
        throw new Error(OPERATIONAL_KPI_NUMERIC_INVALID);
      }
      return n;
    }
    throw new Error(OPERATIONAL_KPI_NUMERIC_INVALID);
  }

  /** UAT 5.3: assets must equal liabilities + equity (from line-item rollups). */
  private static assertStatementOfFinancialPositionBalanced(periodLabel: string, periodLineItems: Record<string, number>) {
    const t = totalsFromSofpCurrent(periodLineItems);
    const rhs = t.totalLiabilities + t.equity;
    const diff = Math.abs(t.totalAssets - rhs);
    if (diff > 0.02) {
      throw new Error(
        `Accounting Error: Balance Sheet is out of balance by $${diff.toFixed(2)}. (${periodLabel})`
      );
    }
  }

  private static sofpPeriodHasAnyNonZero(period: Record<string, number>): boolean {
    return Object.values(period).some((v) => Number(v) !== 0);
  }

  /**
   * Investee uploads: core statements must be Excel (.xlsx / .xls) for parsing; PDF allowed for other categories.
   * Matches ApplicantPortalController rules (defense in depth if another caller hits the service).
   */
  static assertInvesteeReportUploadExtension(reportType: string, originalFileName: string): void {
    const ext = originalFileName.split(".").pop()?.toLowerCase() || "";
    const u = String(reportType || "").toUpperCase();
    const isCore =
      u === "INCOME_STATEMENTS" ||
      u === "INCOME_STATEMENT" ||
      u === "BALANCE_SHEET" ||
      u === "STATEMENT_OF_FINANCIAL_POSITION" ||
      u === "CASHFLOW_STATEMENTS" ||
      u === "CASHFLOW_STATEMENT";
    if (!ext || !["xlsx", "xls", "csv", "pdf"].includes(ext)) {
      throw new Error("Invalid file type. Only .xlsx, .xls, .csv, and .pdf files are allowed");
    }
    if (isCore) {
      if (ext === "pdf") {
        throw new Error(
          "Invalid file type for this reportType: core financial statements must be .xlsx or .xls (PDFs are for narrative/compliance categories only)."
        );
      }
      if (ext !== "xlsx" && ext !== "xls") {
        throw new Error(
          "Mandatory Requirement: Core financial statements must be uploaded in Excel (.xlsx or .xls) format for system parsing."
        );
      }
    }
  }

  private static normalizeNonFinancialKpisStrict(dataSnapshot: any): any {
    if (dataSnapshot === null || dataSnapshot === undefined) return null;
    if (Array.isArray(dataSnapshot)) {
      return dataSnapshot.map((x) => this.normalizeNonFinancialKpisStrict(x));
    }
    if (typeof dataSnapshot !== "object") {
      throw new Error("NON_FINANCIAL_KPIS data must be a JSON object");
    }
    const out: any = {};
    for (const [k, v] of Object.entries(dataSnapshot)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        out[k] = this.normalizeNonFinancialKpisStrict(v);
      } else {
        out[k] = this.parseStrictLineItemNumber(k, v, 0);
      }
    }
    return out;
  }

  private static diffReportingManualLeaves(
    oldRoot: Record<string, unknown> | null | undefined,
    newRoot: Record<string, unknown> | null | undefined,
    maxEntries = 80
  ): Record<string, { from: unknown; to: unknown }> {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    const walk = (prefix: string, a: any, b: any) => {
      if (Object.keys(out).length >= maxEntries) return;
      if (a === b) return;
      const aObj = a !== null && typeof a === "object" && !Array.isArray(a);
      const bObj = b !== null && typeof b === "object" && !Array.isArray(b);
      if (aObj && bObj) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
          if (Object.keys(out).length >= maxEntries) break;
          const p = prefix ? `${prefix}.${k}` : k;
          walk(p, a[k], b[k]);
        }
        return;
      }
      try {
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          out[prefix || "(root)"] = { from: a, to: b };
        }
      } catch {
        out[prefix || "(root)"] = { from: a, to: b };
      }
    };
    walk("", oldRoot || {}, newRoot || {});
    return out;
  }

  private static revenueFromIncomeSnapshot(raw: any): number | null {
    if (raw == null) return null;
    let o = raw;
    if (typeof raw === "string" && String(raw).trim()) {
      try {
        o = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!o || typeof o !== "object") return null;
    const t = totalsFromIncomeLineItems(o as Record<string, unknown>);
    return t.revenue > 0 ? t.revenue : null;
  }

  /**
   * UAT 5.10: if revenue falls more than 50% vs prior posted period, require variance explanation text
   * (or a dedicated VARIANCE_EXPLANATION report / PDF with "variance" in title in the submit bundle).
   */
  private static async assertVarianceExplanationIfRequiredForSubmit(opts: {
    portfolioCompanyId: string;
    reportingPeriodIso: string;
    bundleForPeriod: any[];
    financialKpisSnapshot: any;
  }): Promise<void> {
    const { portfolioCompanyId, reportingPeriodIso, bundleForPeriod, financialKpisSnapshot } = opts;
    const periodKey = reportingPeriodIso;
    const prior = priorPeriodRevenueFromSnapshot(financialKpisSnapshot, periodKey);
    if (prior == null || prior <= 0) return;

    let current: number | null = null;
    const manualInc = financialKpisSnapshot?.kpiValues?.[periodKey]?.manualEntries?.incomeStatement;
    if (manualInc && typeof manualInc === "object") {
      const t = totalsFromIncomeLineItems(manualInc);
      if (t.revenue > 0) current = t.revenue;
    }
    if (current == null) {
      for (const r of bundleForPeriod) {
        const rt = String(r.reportType || "").toUpperCase();
        if (rt !== "INCOME_STATEMENTS" && rt !== "INCOME_STATEMENT") continue;
        const rev = this.revenueFromIncomeSnapshot(r.parsedSnapshot ?? r.parsedsnapshot);
        if (rev != null) {
          current = rev;
          break;
        }
      }
    }
    if (current == null || current >= prior * 0.5) return;

    const noteRaw = financialKpisSnapshot?.kpiValues?.[periodKey]?.manualEntries?.varianceExplanationNote;
    const noteOk = noteRaw != null && String(noteRaw).trim().length >= 20;
    const hasVarianceDoc = bundleForPeriod.some((r) => {
      const rt = String(r.reportType || "").toUpperCase();
      const title = String(r.title || "").toLowerCase();
      const url = String(r.reportUrl || r.reporturl || "").toLowerCase();
      return (
        rt === "VARIANCE_EXPLANATION" ||
        (url.endsWith(".pdf") && (title.includes("variance") || title.includes("explanation")))
      );
    });
    if (!noteOk && !hasVarianceDoc) {
      throw new Error(
        "Variance validation: Revenue is more than 50% below the prior reporting period. " +
          "Add `varianceExplanationNote` (min 20 characters) on **POST .../period-kpis**, " +
          "attach a PDF whose title mentions variance/explanation, or add a report with reportType **VARIANCE_EXPLANATION**, " +
          "then submit again."
      );
    }
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
    if (data.operational && typeof data.operational === "object") {
      extra = Math.max(extra, Object.keys(data.operational).length);
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
      const src = dataSnapshot && typeof dataSnapshot === "object" ? dataSnapshot : {};
      const out: any = {};
      for (const k of Object.keys(defaults)) {
        out[k] = this.parseStrictLineItemNumber(k, src[k], defaults[k]);
      }
      return out;
    }

    if (rt === "STATEMENT_OF_FINANCIAL_POSITION" || rt === "BALANCE_SHEET") {
      const defaults = canonicalFieldDefaults(statementOfFinancialPositionLineItemsSchema);
      const raw = dataSnapshot && typeof dataSnapshot === "object" ? dataSnapshot : {};
      const hasNested =
        Object.prototype.hasOwnProperty.call(raw, "currentPeriod") ||
        Object.prototype.hasOwnProperty.call(raw, "priorPeriod");

      const mergePeriod = (obj: any) => {
        const src = obj && typeof obj === "object" ? obj : {};
        const o: any = {};
        for (const k of Object.keys(defaults)) {
          o[k] = this.parseStrictLineItemNumber(k, src[k], defaults[k]);
        }
        return o;
      };

      let result: { currentPeriod: Record<string, number>; priorPeriod: Record<string, number> };
      if (hasNested) {
        result = {
          currentPeriod: mergePeriod((raw as any).currentPeriod),
          priorPeriod: mergePeriod((raw as any).priorPeriod),
        };
      } else {
        const flat: any = { ...raw };
        delete flat.currentPeriod;
        delete flat.priorPeriod;
        result = {
          currentPeriod: mergePeriod(flat),
          priorPeriod: mergePeriod({}),
        };
      }

      this.assertStatementOfFinancialPositionBalanced("current period", result.currentPeriod);
      if (this.sofpPeriodHasAnyNonZero(result.priorPeriod)) {
        this.assertStatementOfFinancialPositionBalanced("prior period", result.priorPeriod);
      }
      return result;
    }

    if (rt === "CASHFLOW_STATEMENTS" || rt === "CASHFLOW_STATEMENT") {
      const defaults = canonicalFieldDefaults(cashflowStatementSchema);
      const src = dataSnapshot && typeof dataSnapshot === "object" ? dataSnapshot : {};
      const out: any = {};
      for (const k of Object.keys(defaults)) {
        out[k] = this.parseStrictLineItemNumber(k, src[k], defaults[k]);
      }
      return out;
    }

    if (rt === "OPERATIONAL_KPIS") {
      const raw =
        dataSnapshot &&
        typeof dataSnapshot === "object" &&
        Object.prototype.hasOwnProperty.call(dataSnapshot, "operational")
          ? (dataSnapshot as any).operational
          : dataSnapshot;
      const operational = normalizeOperationalKpiPayload(raw ?? {});
      return { operational };
    }

    if (rt === "NON_FINANCIAL_KPIS") {
      return this.normalizeNonFinancialKpisStrict(dataSnapshot);
    }

    return this.normalizeNumericObjectDeep(dataSnapshot);
  }
  /** Public guard for investee endpoints that write period-scoped reporting data. */
  static async assertOpenReportingRequestExists(portfolioCompanyId: string, reportingPeriod: Date | string) {
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
    this.assertInvesteeReportUploadExtension(params.reportType, params.originalFileName);

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

    await this.auditFinancialReportEvent({
      userId: params.submittedById,
      action: "FINANCIAL_REPORT_CREATED_WITH_FILE",
      reportId: id,
      portfolioCompanyId: params.portfolioCompanyId,
      companyName: params.portfolioCompanyName,
      newValues: {
        reportType: params.reportType,
        status: "DRAFT",
        hasManualData: !!params.dataSnapshot,
        reportUrl: url,
      },
    });

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
    await this.assertApplicantOwnsFinancialReport(report, params.submittedById);
    if (!["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(String(report.status))) {
      throw new Error("Only draft, needs-revision, or rejected reports can accept file uploads");
    }
    this.assertInvesteeReportUploadExtension(String(report.reportType), params.originalFileName);

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

    await this.auditFinancialReportEvent({
      userId: params.submittedById,
      action: "FINANCIAL_REPORT_FILE_ATTACHED",
      reportId: report.id,
      portfolioCompanyId: report.portfolioCompanyId,
      companyName: report.companyName,
      newValues: {
        fileName: params.originalFileName,
        reportUrl: url,
      },
    });

    return {
      id: report.id,
      reportUrl: url,
      fileUrl: url,
      storagePath: uploadResult.filePath,
    };
  }

  /** Investee: one report for detail/edit screen (includes `data` and reviewer feedback when present). */
  static async getFinancialReportDetailForApplicant(reportId: string, applicantUserId: string) {
    const report = await this.getReportById(reportId);
    if (!report) return null;
    try {
      await this.assertApplicantOwnsFinancialReport(report, applicantUserId);
    } catch {
      return null;
    }
    const merged = this.mergeReportFileUrlsForApi(report);
    if (!merged) return null;
    const s = String(merged.status || "");
    return {
      ...merged,
      reviewerId: report.reviewerId ?? null,
      reviewedAt: report.reviewedAt ?? null,
      reviewerComment: report.reviewerComment ?? null,
      canSubmit: ["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(s),
      canUploadFile: ["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(s),
    };
  }

  /**
   * Investee: replace manual line-item JSON (`parsedSnapshot`) for core statements / NON_FINANCIAL_KPIS.
   * Allowed when status is DRAFT, NEEDS_REVISION, or REJECTED. Does not change status (use submit after).
   */
  static async updateReportParsedSnapshotForApplicant(params: {
    reportId: string;
    applicantUserId: string;
    data: any;
  }) {
    const report = await this.getReportById(params.reportId);
    if (!report) throw new Error("Financial report not found");
    await this.assertApplicantOwnsFinancialReport(report, params.applicantUserId);
    if (!["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(String(report.status))) {
      throw new Error("Only draft, needs-revision, or rejected reports can be updated");
    }
    if (!this.reportTypeAcceptsManualDataSnapshot(report.reportType)) {
      throw new Error(
        "This report type does not support updating form data here; upload a new file instead."
      );
    }
    if (params.data === undefined || params.data === null || typeof params.data !== "object") {
      throw new Error("data must be a JSON object");
    }
    const normalized = this.normalizeReportDataOrThrow(report.reportType, params.data);
    const json = JSON.stringify(normalized);
    const oldParsedRoot = this.parseParsedSnapshotColumn(report.parsedSnapshot ?? report.parsedsnapshot);
    const oldFlat =
      oldParsedRoot && typeof oldParsedRoot === "object" && !Array.isArray(oldParsedRoot)
        ? (oldParsedRoot as Record<string, unknown>)
        : {};
    const newFlat = normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : {};
    const parsedFieldChanges = this.diffReportingManualLeaves(oldFlat, newFlat as Record<string, unknown>);
    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports SET parsedSnapshot = ?, updatedAt = NOW(3) WHERE id = ?`,
      json,
      params.reportId
    );

    await this.auditFinancialReportEvent({
      userId: params.applicantUserId,
      action: "FINANCIAL_REPORT_DATA_UPDATED",
      reportId: params.reportId,
      portfolioCompanyId: report.portfolioCompanyId,
      companyName: report.companyName,
      oldValues: { hadParsedSnapshot: !!(report.parsedSnapshot || report.parsedsnapshot) },
      newValues: {
        reportType: report.reportType,
        status: report.status,
        reportingPeriod: report.reportingPeriod
          ? this.toEmailDate(report.reportingPeriod).toISOString().split("T")[0]
          : null,
        ...(Object.keys(parsedFieldChanges).length > 0 ? { fieldChanges: parsedFieldChanges } : {}),
      },
    });

    const fresh = await this.getReportById(params.reportId);
    const merged = fresh ? this.mergeReportFileUrlsForApi(fresh) : null;
    const s = String(merged?.status || "");
    return merged
      ? {
          ...merged,
          reviewerId: fresh?.reviewerId ?? null,
          reviewedAt: fresh?.reviewedAt ?? null,
          reviewerComment: fresh?.reviewerComment ?? null,
          canSubmit: ["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(s),
          canUploadFile: ["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(s),
        }
      : null;
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
              fr.reviewerId,
              fr.reviewedAt,
              fr.reviewerComment,
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
        reviewerId: row.reviewerId ?? null,
        reviewedAt: row.reviewedAt ?? null,
        reviewerComment: row.reviewerComment ?? null,
        isDraft: row.status === "DRAFT",
        canSubmit: ["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(String(row.status)),
        canUploadFile: ["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(String(row.status)),
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
      case 'OPERATIONAL_KPIS':
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

  /**
   * Per-company document organisation for investors: Financial | Operational | Investment,
   * each with fixed subfolders (empty arrays when no files). Maps `reportType` into the
   * closest subfolder; unknown types land in Financial → Other documents.
   */
  static async getDocumentOrganisationForCompany(
    portfolioCompanyId: string,
    opts?: { statuses?: string[] | null; limit?: number }
  ) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new Error("Portfolio company not found");
    }

    const limit = Math.min(5000, Math.max(1, Number(opts?.limit ?? 2000)));
    const params: any[] = [];
    let whereStatus = `fr.status <> 'DRAFT'`;
    if (opts?.statuses?.length) {
      const ph = opts.statuses.map(() => "?").join(",");
      whereStatus = `fr.status IN (${ph})`;
      params.push(...opts.statuses);
    }
    params.push(portfolioCompanyId);
    params.push(limit);

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
              fr.status,
              fr.createdAt,
              fr.updatedAt
         FROM financial_reports fr
        WHERE ${whereStatus}
          AND fr.portfolioCompanyId = ?
        ORDER BY fr.reportingPeriod DESC, fr.periodEnd DESC, fr.updatedAt DESC
        LIMIT ?`,
      ...params
    );

    const DOMAIN_ORDER = ["financial", "operational", "investment"] as const;
    type Domain = (typeof DOMAIN_ORDER)[number];

    const SUBFOLDER_TEMPLATE: Record<Domain, Array<{ key: string; label: string }>> = {
      financial: [
        { key: "income_statement", label: "Income statement" },
        { key: "balance_sheet", label: "Balance sheet" },
        { key: "cash_flow", label: "Cash flow" },
        { key: "bank_statements", label: "Bank statements" },
        { key: "tax_documents", label: "Tax documents" },
        { key: "audits", label: "Audits" },
        { key: "management_accounts", label: "Management accounts" },
        { key: "other", label: "Other documents" },
      ],
      operational: [
        { key: "hr", label: "HR" },
        { key: "payroll", label: "Payroll" },
        { key: "sales_reports", label: "Sales reports" },
        { key: "inventory", label: "Inventory" },
        { key: "production", label: "Production" },
        { key: "non_financial_kpis", label: "Non-financial KPIs" },
      ],
      investment: [
        { key: "business_plans", label: "Business plans" },
        { key: "investor_reports", label: "Investor reports" },
        { key: "compliance_documents", label: "Compliance documents" },
      ],
    };

    const DOMAIN_LABELS: Record<Domain, string> = {
      financial: "Financial",
      operational: "Operational",
      investment: "Investment",
    };

    const classify = (reportType: string): { domain: Domain; subfolderKey: string } => {
      const canonical = this.canonicalReportTypeLabelForList(reportType);
      const u = String(canonical || "").toUpperCase();
      const r = String(reportType || "").toUpperCase();

      if (u === "INCOME_STATEMENTS" || r === "INCOME_STATEMENT") {
        return { domain: "financial", subfolderKey: "income_statement" };
      }
      if (u === "STATEMENT_OF_FINANCIAL_POSITION" || r === "BALANCE_SHEET") {
        return { domain: "financial", subfolderKey: "balance_sheet" };
      }
      if (u === "CASHFLOW_STATEMENTS" || r === "CASHFLOW_STATEMENT") {
        return { domain: "financial", subfolderKey: "cash_flow" };
      }
      if (u === "BANK_STATEMENTS") return { domain: "financial", subfolderKey: "bank_statements" };
      if (u === "TAX_COMPLIANCE") return { domain: "financial", subfolderKey: "tax_documents" };
      if (u === "MANAGEMENT_ACCOUNTS") {
        return { domain: "financial", subfolderKey: "management_accounts" };
      }
      if (r.includes("AUDIT")) return { domain: "financial", subfolderKey: "audits" };

      if (u === "NON_FINANCIAL_KPIS" || u === "OPERATIONAL_KPIS") {
        return { domain: "operational", subfolderKey: "non_financial_kpis" };
      }
      if (r.includes("PAYROLL")) return { domain: "operational", subfolderKey: "payroll" };
      if (
        r.includes("HUMAN_RESOURCE") ||
        r === "HR" ||
        r.startsWith("HR_") ||
        r.endsWith("_HR") ||
        r.includes("_HR_")
      ) {
        return { domain: "operational", subfolderKey: "hr" };
      }
      if (r.includes("SALES")) return { domain: "operational", subfolderKey: "sales_reports" };
      if (r.includes("INVENTORY")) return { domain: "operational", subfolderKey: "inventory" };
      if (r.includes("PRODUCTION")) return { domain: "operational", subfolderKey: "production" };

      if (u === "BUSINESS_PLAN") return { domain: "investment", subfolderKey: "business_plans" };
      if (r.includes("INVESTOR") && r.includes("REPORT")) {
        return { domain: "investment", subfolderKey: "investor_reports" };
      }
      if (
        r === "COMPLIANCE_DOCUMENTS" ||
        r === "INVESTMENT_COMPLIANCE" ||
        r === "REGULATORY_COMPLIANCE" ||
        (r.includes("COMPLIANCE") && !r.includes("TAX"))
      ) {
        return { domain: "investment", subfolderKey: "compliance_documents" };
      }

      return { domain: "financial", subfolderKey: "other" };
    };

    const buckets: Record<Domain, Record<string, any[]>> = {
      financial: {},
      operational: {},
      investment: {},
    };
    for (const d of DOMAIN_ORDER) {
      for (const { key } of SUBFOLDER_TEMPLATE[d]) {
        buckets[d][key] = [];
      }
    }

    const toIso = (d: any) => {
      if (d == null) return null;
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt.toISOString();
    };

    const sortFiles = (files: any[]) =>
      files.sort(
        (x, y) =>
          new Date(y.updatedAt || y.createdAt || 0).getTime() -
          new Date(x.updatedAt || x.createdAt || 0).getTime()
      );

    for (const row of rows) {
      const { domain, subfolderKey } = classify(row.reportType);
      const urls = this.reportPublicUrlsForListRow(row);
      const canonicalType = this.canonicalReportTypeLabelForList(row.reportType);
      const hasFile = !!(urls.reportUrl && String(urls.reportUrl).trim());
      const fileNode = {
        id: row.id,
        reportType: row.reportType,
        reportTypeCanonical: canonicalType,
        title: row.title ?? null,
        description: row.description ?? null,
        status: row.status,
        periodType: row.periodType ?? null,
        periodStart: toIso(row.periodStart),
        periodEnd: toIso(row.periodEnd),
        reportingPeriod: toIso(row.reportingPeriod),
        reportUrl: urls.reportUrl,
        fileUrl: urls.fileUrl,
        hasFile,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      };
      const list = buckets[domain][subfolderKey];
      if (list) list.push(fileNode);
      else buckets.financial.other.push(fileNode);
    }

    const documentOrganisation = DOMAIN_ORDER.map((domain) => ({
      folderKey: domain,
      folderLabel: DOMAIN_LABELS[domain],
      subfolders: SUBFOLDER_TEMPLATE[domain].map(({ key, label }) => {
        const files = sortFiles([...(buckets[domain][key] || [])]);
        return {
          subfolderKey: key,
          folderLabel: label,
          fileCount: files.length,
          files,
        };
      }),
    }));

    return {
      portfolioCompanyId: company.id,
      companyName: company.name,
      documentOrganisation,
      meta: {
        totalReports: rows.length,
        generatedAt: new Date().toISOString(),
      },
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

    const reviewAuditAction =
      params.action === "ACCEPT"
        ? "FINANCIAL_REPORT_REVIEW_ACCEPTED"
        : params.action === "NEEDS_REVISION"
          ? "FINANCIAL_REPORT_REVIEW_NEEDS_REVISION"
          : "FINANCIAL_REPORT_REVIEW_REJECTED";

    if (params.action === 'ACCEPT') {
      try {
        const skipAccountingAutomation = isReportTypeAcceptWithoutAccounting(report.reportType);

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

        if (!skipAccountingAutomation) {
          if (!hasAutomation) {
            throw new Error(
              "ACCEPT must include accounting automation payload (valuationAdjustment/valuation and/or dividend/dividends)."
            );
          }
        }

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
        const rpIso = rpDate
          ? rpDate instanceof Date
            ? rpDate.toISOString().split("T")[0]
            : new Date(rpDate).toISOString().split("T")[0]
          : null;
        if (rpIso) {
          await InvestmentMonitoringKpiService.recomputeAndPersistForPeriod(report.portfolioCompanyId, rpIso);
        }

        if (!skipAccountingAutomation) {
          await this.runPostApprovalAutomations(report, params.reviewerId, automationPayload);
        } else if (hasAutomation) {
          console.info(
            `[reviewReport] Ignoring valuation/dividend payload for non-accounting report type ${report.reportType}`
          );
        }

        if (skipAccountingAutomation) {
          const fresh = await this.getReportById(params.reportId);
          if (fresh && String(fresh.reportType || "").toUpperCase() === "OPERATIONAL_KPIS") {
            await ReportingPeriodKpiService.syncFromSubmittedOperationalReport(fresh, params.reviewerId);
          }
        }

        await this.notifyOutcome(report, 'ACCEPTED', params.comment);
        await this.auditFinancialReportEvent({
          userId: params.reviewerId,
          action: reviewAuditAction,
          reportId: params.reportId,
          portfolioCompanyId: report.portfolioCompanyId,
          companyName: report.companyName,
          oldValues: {
            status: report.status,
            reviewerComment: report.reviewerComment ?? null,
          },
          newValues: {
            status: "ACCEPTED",
            reviewerComment: params.comment ?? null,
            reviewerId: params.reviewerId,
            reportingPeriod: report.reportingPeriod
              ? this.toEmailDate(report.reportingPeriod).toISOString().split("T")[0]
              : null,
            accountingAutomationRan: !skipAccountingAutomation,
          },
        });
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
        await this.notifyOutcome(
          report,
          "NEEDS_REVISION",
          `${params.comment ? params.comment + "\n" : ""}Accept could not complete (accounting sync): ${error.message || error}. Please contact support or resubmit after corrections.`
        );
        await this.auditFinancialReportEvent({
          userId: params.reviewerId,
          action: "FINANCIAL_REPORT_ACCEPT_SYNC_FAILED",
          reportId: params.reportId,
          portfolioCompanyId: report.portfolioCompanyId,
          companyName: report.companyName,
          oldValues: { status: report.status },
          newValues: {
            status: "NEEDS_REVISION",
            error: error.message || "Sync error",
          },
        });
        throw error;
      }
    } else {
      await this.auditFinancialReportEvent({
        userId: params.reviewerId,
        action: reviewAuditAction,
        reportId: params.reportId,
        portfolioCompanyId: report.portfolioCompanyId,
        companyName: report.companyName,
        oldValues: {
          status: report.status,
          reviewerComment: report.reviewerComment ?? null,
        },
        newValues: {
          status,
          reviewerComment: params.comment ?? null,
          reviewerId: params.reviewerId,
          reportingPeriod: report.reportingPeriod
            ? this.toEmailDate(report.reportingPeriod).toISOString().split("T")[0]
            : null,
        },
      });
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
      `SELECT fr.*, pc.name AS companyName
       FROM financial_reports fr
       JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
       WHERE fr.id IN (${reportIds.map(() => '?').join(',')})`,
      ...reportIds
    );

    if (reports.length !== reportIds.length) {
      throw new Error('One or more reports not found');
    }

    for (const r of reports) {
      await this.assertApplicantOwnsFinancialReport(r, userId);
    }

    // Submission is allowed even if not all document categories are present.
    // We only require that an admin opened a reporting request for that company+period.
    const groups = new Map<string, { portfolioCompanyId: string; reportingPeriod: string; present: Set<string> }>();
    for (const r of reports) {
      const rp = r.reportingPeriod || r.periodEnd;
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
      g.present.add(String(r.reportType || "").toUpperCase());
      groups.set(key, g);
    }

    for (const g of groups.values()) {
      await this.assertOpenReportingRequestExists(g.portfolioCompanyId, g.reportingPeriod);
    }

    const stPh = this.resubmittableStatuses.map(() => "?").join(",");
    const idsToSubmit: string[] = [];
    for (const g of groups.values()) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id
           FROM financial_reports
          WHERE portfolioCompanyId = ?
            AND reportingPeriod = ?
            AND status IN (${stPh})`,
        g.portfolioCompanyId,
        g.reportingPeriod,
        ...this.resubmittableStatuses
      );
      for (const r of rows) idsToSubmit.push(r.id);
    }
    const uniqueIds = [...new Set(idsToSubmit)];
    if (uniqueIds.length === 0) {
      throw new Error("No draft, needs-revision, or rejected reports found to submit");
    }

    const bundle = await prisma.$queryRawUnsafe<any[]>(
      `SELECT fr.*, pc.name AS companyName
       FROM financial_reports fr
       JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
       WHERE fr.id IN (${uniqueIds.map(() => "?").join(",")})`,
      ...uniqueIds
    );

    if (bundle.length !== uniqueIds.length) {
      throw new Error("One or more reports not found for submission bundle");
    }

    const badStatus = bundle.find((r) => !["DRAFT", "NEEDS_REVISION", "REJECTED"].includes(String(r.status)));
    if (badStatus) {
      throw new Error("Only draft, needs-revision, or rejected reports can be submitted");
    }

    for (const r of bundle) {
      await this.assertApplicantOwnsFinancialReport(r, userId);
    }

    const kpiSnapshotByCompany = new Map<string, any>();
    for (const g of groups.values()) {
      if (!kpiSnapshotByCompany.has(g.portfolioCompanyId)) {
        const row = await prisma.portfolioCompany.findUnique({
          where: { id: g.portfolioCompanyId },
          select: { financialKpis: true },
        });
        kpiSnapshotByCompany.set(g.portfolioCompanyId, row?.financialKpis || {});
      }
      const snap = kpiSnapshotByCompany.get(g.portfolioCompanyId);
      const bundleSlice = bundle.filter((r) => {
        const rp = r.reportingPeriod || r.periodEnd;
        if (!rp) return false;
        const iso = new Date(rp).toISOString().split("T")[0];
        return r.portfolioCompanyId === g.portfolioCompanyId && iso === g.reportingPeriod;
      });
      await this.assertVarianceExplanationIfRequiredForSubmit({
        portfolioCompanyId: g.portfolioCompanyId,
        reportingPeriodIso: g.reportingPeriod,
        bundleForPeriod: bundleSlice,
        financialKpisSnapshot: snap,
      });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports
       SET status = 'PENDING',
           updatedAt = NOW()
       WHERE id IN (${uniqueIds.map(() => "?").join(",")})`,
      ...uniqueIds
    );

    for (const r of bundle) {
      await this.auditFinancialReportEvent({
        userId,
        action: "FINANCIAL_REPORT_SUBMITTED",
        reportId: r.id,
        portfolioCompanyId: r.portfolioCompanyId,
        companyName: r.companyName,
        oldValues: { status: r.status },
        newValues: {
          status: "PENDING",
          reportType: r.reportType,
          title: r.title,
          reportingPeriod: r.reportingPeriod
            ? this.toEmailDate(r.reportingPeriod).toISOString().split("T")[0]
            : null,
        },
      });
    }

    await Promise.all(
      bundle.map((r) => ReportingPeriodKpiService.syncFromSubmittedOperationalReport(r, userId))
    );

    void Promise.all(
      bundle.map((report) =>
        this.notifySubmission(report.portfolioCompanyId, report.reportType, report.title, report.periodStart, report.periodEnd)
      )
    ).catch((err) => console.error("[submitDrafts] notifySubmission:", err));
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

    const periodStart = this.toEmailDate(report.periodStart);
    const periodEnd = this.toEmailDate(report.periodEnd);
    const base = {
      recipientEmail: contactEmail,
      companyName: report.companyName,
      reportType: report.reportType,
      title: report.title || "",
      periodStart,
      periodEnd,
      comment: comment || "",
    };

    if (status === "ACCEPTED") {
      await EmailNotificationService.sendFinancialReportAcceptedEmail({ ...base, status });
    } else if (status === "NEEDS_REVISION") {
      await EmailNotificationService.sendFinancialReportNeedsRevisionEmail(base);
    } else {
      await EmailNotificationService.sendFinancialReportRejectedEmail({ ...base, status });
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
        const autoReason =
          String(
            valuationPayload.reasonForAdjustment ||
              valuationPayload.notes ||
              valuationPayload.comment ||
              ""
          ).trim() || "Valuation adjustment from accepted financial report";
        automations.push(
          PortfolioCompanyAccountingService.recordValuationAdjustment({
            portfolioCompanyId: report.portfolioCompanyId,
            previousAmount,
            newAmount,
            valuationDate,
            approvedById: reviewerId,
            reasonForAdjustment: autoReason,
            notes: autoReason,
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
    /** Investee user (for audit trail). */
    submittedById?: string | null;
    // New: structured manual entry sections (front-end form line items)
    incomeStatement?: any;
    statementOfFinancialPosition?: any;
    cashflowStatement?: any;
    nonFinancialKpis?: any;
    /** UAT 5.10: required text when revenue drops >50% vs prior period before submit. */
    varianceExplanationNote?: string | null;
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
    const oldManualEntries = JSON.parse(
      JSON.stringify(snapshot.kpiValues?.[periodKey]?.manualEntries || {})
    );

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
      snapshot.kpiValues[periodKey].manualEntries.nonFinancialKpis = this.normalizeNonFinancialKpisStrict(
        params.nonFinancialKpis
      );
    }

    if (params.varianceExplanationNote !== undefined) {
      const ve = params.varianceExplanationNote;
      if (ve === null || String(ve).trim() === "") {
        delete snapshot.kpiValues[periodKey].manualEntries.varianceExplanationNote;
      } else {
        snapshot.kpiValues[periodKey].manualEntries.varianceExplanationNote = String(ve).trim();
      }
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

    const newManualEntries = snapshot.kpiValues[periodKey].manualEntries || {};
    const fieldChanges = this.diffReportingManualLeaves(oldManualEntries, newManualEntries);

    // Save to database
    await prisma.portfolioCompany.update({
      where: { id: params.portfolioCompanyId },
      data: { financialKpis: snapshot }
    });

    console.log(`✅ Saved period KPIs for ${params.portfolioCompanyId}, period: ${periodKey}`);

    const sectionsPresent: string[] = [];
    if (params.incomeStatement && typeof params.incomeStatement === "object") sectionsPresent.push("incomeStatement");
    if (params.statementOfFinancialPosition && typeof params.statementOfFinancialPosition === "object") {
      sectionsPresent.push("statementOfFinancialPosition");
    }
    if (params.cashflowStatement && typeof params.cashflowStatement === "object") {
      sectionsPresent.push("cashflowStatement");
    }
    if (params.nonFinancialKpis && typeof params.nonFinancialKpis === "object") sectionsPresent.push("nonFinancialKpis");

    await AuditService.log({
      userId: params.submittedById || null,
      action: "FINANCIAL_REPORTING_PERIOD_DATA",
      entityType: "PortfolioCompany",
      entityId: params.portfolioCompanyId,
      newValues: {
        reportingPeriod: periodKey,
        sectionsPresent,
        summary: {
          totalRevenue,
          netProfit,
          cashFlowNet,
        },
        ...(Object.keys(fieldChanges).length > 0 ? { fieldChanges } : {}),
      },
    });

    try {
      await ReportingPeriodKpiService.recomputeAndPersist({
        portfolioCompanyId: params.portfolioCompanyId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        submittedById: params.submittedById,
      });
    } catch (e) {
      console.error("[savePeriodKPIs] derive KPIs:", e);
    }

    // Return the saved values
    return {
      periodStart: this.formatDate(params.periodStart),
      periodEnd: periodKey,
      totalRevenue,
      netProfit,
      cashFlowNet
    };
  }

  /** Investor: auditable timeline for reporting (submissions, reviews, file uploads, period KPI saves). */
  static async listReportingAuditForCompany(
    portfolioCompanyId: string,
    opts?: { page?: number; limit?: number }
  ) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new Error("Portfolio company not found");
    }

    const page = Math.max(1, Number(opts?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(opts?.limit || 50)));
    const offset = (page - 1) * limit;

    const auditWhere = `(al.entityType = 'FinancialReport' AND fr.portfolioCompanyId = ?)
           OR (al.entityType = 'PortfolioCompany' AND al.entityId = ? AND al.action = 'FINANCIAL_REPORTING_PERIOD_DATA')`;

    const [events, countRows, notifRows]: [any[], any[], any[]] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT al.id,
                al.userId AS actorUserId,
                al.action,
                al.entityType,
                al.entityId,
                al.oldValues,
                al.newValues,
                al.createdAt,
                u.email AS actorEmail,
                u.firstName AS actorFirstName,
                u.lastName AS actorLastName
           FROM audit_logs al
           LEFT JOIN financial_reports fr
             ON fr.id = al.entityId AND al.entityType = 'FinancialReport'
           LEFT JOIN users u ON u.id = al.userId
          WHERE ${auditWhere}
          ORDER BY al.createdAt DESC
          LIMIT ? OFFSET ?`,
        portfolioCompanyId,
        portfolioCompanyId,
        limit,
        offset
      ),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c
           FROM audit_logs al
           LEFT JOIN financial_reports fr
             ON fr.id = al.entityId AND al.entityType = 'FinancialReport'
          WHERE ${auditWhere}`,
        portfolioCompanyId,
        portfolioCompanyId
      ),
      prisma.$queryRawUnsafe(
        `SELECT id,
                reporting_period AS reportingPeriod,
                event_type AS eventType,
                channel,
                recipient_email AS recipientEmail,
                status,
                meta,
                created_at AS createdAt
           FROM reporting_notification_logs
          WHERE portfolio_company_id = ?
          ORDER BY created_at DESC
          LIMIT 500`,
        portfolioCompanyId
      ),
    ]);

    const total = Number(countRows[0]?.c || 0);

    const notificationLabel: Record<string, string> = {
      REQUEST: "Original request",
      REMINDER_T_MINUS_3: "T−3 reminder",
      OVERDUE_T_PLUS_1: "Overdue alert",
      MANUAL_NUDGE: "Manual nudge",
      VIEWED_BY_INVESTEE: "Viewed by investee",
    };

    const communicationLog = notifRows.map((r) => {
      const rp = r.reportingPeriod;
      const reportingPeriodIso =
        rp instanceof Date ? rp.toISOString().split("T")[0] : String(rp || "").slice(0, 10);
      const ca = r.createdAt;
      const createdAtIso = ca instanceof Date ? ca.toISOString() : ca;
      return {
        id: r.id,
        reportingPeriod: reportingPeriodIso,
        eventType: r.eventType,
        eventLabel: notificationLabel[r.eventType] || r.eventType,
        channel: r.channel,
        recipientEmail: r.recipientEmail,
        status: r.status,
        meta: r.meta,
        createdAt: createdAtIso,
      };
    });

    return {
      portfolioCompanyId: company.id,
      companyName: company.name,
      page,
      limit,
      total,
      events,
      communicationLog,
    };
  }
}
