// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { promises as fs } from "fs";
import path from "path";
import { ApplicantPortalService } from "../services/ApplicantPortalService";
import { ResponseHelper } from "../utils/responseHelper";
import { prisma } from "../utils/database";
import { FinancialReportService } from "../services/FinancialReportService";
import { ProcurementService, Department } from "../services/ProcurementService";
import { InvesteeDrawdownProcurementService } from "../services/InvesteeDrawdownProcurementService";
import { ReportingPeriodKpiService } from "../services/ReportingPeriodKpiService";
import axios from "axios";

/** Income statement, balance sheet, cash flow (incl. legacy type names) — file uploads must be .xlsx only. */
function isCoreFinancialStatementReportType(rt: string): boolean {
  const u = String(rt || "").toUpperCase();
  return (
    u === "INCOME_STATEMENTS" ||
    u === "INCOME_STATEMENT" ||
    u === "BALANCE_SHEET" ||
    u === "STATEMENT_OF_FINANCIAL_POSITION" ||
    u === "CASHFLOW_STATEMENTS" ||
    u === "CASHFLOW_STATEMENT"
  );
}

/** Report types that may send optional `data` JSON (line items / KPI form). File-only docs ignore `data`. */
function reportTypeAcceptsManualDataJson(rt: string): boolean {
  const u = String(rt || "").toUpperCase();
  return (
    isCoreFinancialStatementReportType(u) ||
    u === "NON_FINANCIAL_KPIS" ||
    u === "OPERATIONAL_KPIS"
  );
}

function stripUploadedFilenameBase(file: Express.Multer.File): string {
  const n = String(file?.originalname || "").trim();
  if (!n) return "Document";
  return n.replace(/\.[^./\\]+$/, "") || "Document";
}

/** GRN detail shape for investee procurement APIs (PO includes linked PR for portfolio checks). */
const investeeGrnApiInclude = {
  purchaseOrder: {
    include: {
      vendor: true,
      items: true,
      requisition: {
        select: {
          id: true,
          requisitionNumber: true,
          portfolioCompanyId: true,
        },
      },
    },
  },
  receivedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  approvedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  items: { include: { purchaseOrderItem: true } },
  returnToVendors: {
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
};

/** Multer `.fields([{ name: 'file' }, { name: 'files' }])` → flat list (order: `file` first, then `files`). */
function collectFinancialReportUploadFiles(req: Request): Express.Multer.File[] {
  const buckets = req.files;
  const out: Express.Multer.File[] = [];
  if (buckets && typeof buckets === "object" && !Array.isArray(buckets)) {
    for (const key of ["file", "files"]) {
      const arr = buckets[key];
      if (Array.isArray(arr)) out.push(...arr);
    }
  }
  return out;
}

function financialReportFileExtension(file: Express.Multer.File): string | null {
  return file.originalname.split(".").pop()?.toLowerCase() || null;
}

/** Returns error message or null if OK. */
function validateFinancialReportFileExtension(ext: string | null, reportType: string): string | null {
  if (!ext || !["xlsx", "xls", "csv", "pdf"].includes(ext)) {
    return "Invalid file type. Only .xlsx, .xls, .csv, and .pdf files are allowed";
  }
  const rt = String(reportType || "").toUpperCase();
  const isCore = isCoreFinancialStatementReportType(rt);
  if (ext === "pdf" && isCore) {
    return "Invalid file type for this reportType: core financial statements must be .xlsx or .xls (PDFs are for narrative/compliance categories only).";
  }
  if (isCore && ext !== "xlsx" && ext !== "xls") {
    return "Mandatory Requirement: Core financial statements must be uploaded in Excel (.xlsx or .xls) format for system parsing.";
  }
  return null;
}

function parseDataSnapshotFragment(raw: any): any {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") return JSON.parse(raw);
  return null;
}

/**
 * Module-level so Express can call `controller.createIncomeStatementDraft` without losing `this`
 * (handlers must not rely on private instance methods for core logic).
 */
async function createFinancialReportDraftInternal(
  req: Request,
  res: Response,
  next: NextFunction,
  fixedReportType?: string
) {
  try {
    const user = (req as any).user;
    if (!user) {
      return ResponseHelper.error(res, "User not found in request", undefined, 401);
    }

    const userId = user.id || user.userId;
    if (!userId) {
      return ResponseHelper.error(res, "User ID not provided", undefined, 400);
    }

    const portfolioCompany = await prisma.portfolioCompany.findFirst({
      where: { userId },
      select: { id: true, name: true },
    });

    if (!portfolioCompany) {
      return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
    }

    const { reportType, reportingPeriod, periodType, periodStart, periodEnd, title, description, templateVersion, data } =
      req.body || {};

    const rt = fixedReportType || reportType;
    if (!rt || !reportingPeriod || !periodType || !periodStart || !periodEnd || !title) {
      return ResponseHelper.error(
        res,
        fixedReportType
          ? "Missing required fields (reportingPeriod, periodType, periodStart, periodEnd, title)"
          : "Missing required fields (reportType, reportingPeriod, periodType, periodStart, periodEnd, title)",
        undefined,
        400
      );
    }

    const rp = new Date(reportingPeriod);
    if (Number.isNaN(rp.getTime())) {
      return ResponseHelper.error(res, "Invalid reportingPeriod (expected YYYY-MM-DD)", undefined, 400);
    }

    let dataSnapshot: any = null;
    if (data !== undefined && data !== null && data !== "") {
      dataSnapshot = typeof data === "string" ? JSON.parse(data) : data;
    }

    const result = await FinancialReportService.createDraftReport({
      portfolioCompanyId: portfolioCompany.id,
      submittedById: userId,
      reportType: rt,
      reportingPeriod: rp,
      periodType,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      title,
      description,
      templateVersion,
      dataSnapshot,
    });

    return ResponseHelper.success(res, "Draft report created", result, 201);
  } catch (error: any) {
    next(error);
  }
}

export class ApplicantPortalController {
  /**
   * Check if user is an applicant
   * Applicants are identified by having an application, not by roles
   */
  private static async isApplicant(user: any): Promise<boolean> {
    if (!user || !user.email) return false;
    
    // Applicants don't have roles - they are identified by having an application
    try {
      const application = await prisma.application.findFirst({
        where: { applicantEmail: user.email }
      });
      return !!application;
    } catch (error) {
      // If check fails, user is not an applicant
      return false;
    }
  }

  /** Read-receipt: log once per quiet window so dashboards / polling do not flood the audit trail. */
  private static async logReportingViewedByInvesteeIfQuiet(
    portfolioCompanyId: string,
    reportingPeriodIso: string
  ): Promise<void> {
    const recent = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c
         FROM reporting_notification_logs
        WHERE portfolio_company_id = ?
          AND reporting_period = ?
          AND event_type = 'VIEWED_BY_INVESTEE'
          AND created_at > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)`,
      portfolioCompanyId,
      reportingPeriodIso
    );
    if (Number(recent[0]?.c || 0) > 0) return;
    await prisma.$executeRawUnsafe(
      `INSERT INTO reporting_notification_logs
         (id, portfolio_company_id, reporting_period, event_type, channel, recipient_email, status, meta, created_at)
       VALUES
         (?, ?, ?, 'VIEWED_BY_INVESTEE', 'PORTAL', NULL, 'OK', NULL, NOW(3))`,
      require("crypto").randomUUID(),
      portfolioCompanyId,
      reportingPeriodIso
    );
  }

  /**
   * Get applicant profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const profile = await ApplicantPortalService.getApplicantProfile(userId);
      
      return ResponseHelper.success(res, "Profile retrieved successfully", profile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update applicant profile
   */
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const updateData = req.body;
      const updatedProfile = await ApplicantPortalService.updateApplicantProfile(userId, updateData);
      
      return ResponseHelper.success(res, "Profile updated successfully", updatedProfile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get applicant's application details
   */
  async getApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const application = await ApplicantPortalService.getApplicantApplication(userId);
      
      return ResponseHelper.success(res, "Application retrieved successfully", application);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get applicant's portfolio company
   */
  async getCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const company = await ApplicantPortalService.getApplicantCompany(userId);
      
      return ResponseHelper.success(res, "Company retrieved successfully", company);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update applicant's portfolio company
   */
  async updateCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      const userId = user.id || user.userId;

      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }

      const updateData = req.body;
      const updatedCompany = await ApplicantPortalService.updateApplicantCompany(userId, updateData);

      return ResponseHelper.success(res, "Company updated successfully", updatedCompany);
    } catch (error: any) {
      next(error);
    }
  }

  async uploadFinancialReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      const uploaded = collectFinancialReportUploadFiles(req);
      if (uploaded.length === 0) {
        return ResponseHelper.error(
          res,
          "At least one file is required (multipart field `file` for a single upload, or `files` for one or more)",
          undefined,
          400
        );
      }

      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }

      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true, name: true }
      });

      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }

      const {
        reportType,
        reportingPeriod,
        periodType,
        periodStart,
        periodEnd,
        title,
        description,
        templateVersion,
        data,
        items: itemsRaw,
      } = req.body;

      if (!reportingPeriod || !periodType || !periodStart || !periodEnd) {
        return ResponseHelper.error(
          res,
          "Missing required fields (reportingPeriod, periodType, periodStart, periodEnd)",
          undefined,
          400
        );
      }

      const rp = new Date(reportingPeriod);
      if (Number.isNaN(rp.getTime())) {
        return ResponseHelper.error(res, "Invalid reportingPeriod (expected YYYY-MM-DD)", undefined, 400);
      }

      let itemSpecs: any[] | null = null;
      if (itemsRaw !== undefined && itemsRaw !== null && String(itemsRaw).trim() !== "") {
        try {
          itemSpecs = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : itemsRaw;
        } catch {
          return ResponseHelper.error(res, "Invalid items JSON (expect an array of { reportType, title, ... })", undefined, 400);
        }
        if (!Array.isArray(itemSpecs)) {
          return ResponseHelper.error(res, "items must be a JSON array", undefined, 400);
        }
        if (itemSpecs.length !== uploaded.length) {
          return ResponseHelper.error(
            res,
            `items must have one entry per file (${uploaded.length} file(s) uploaded, ${itemSpecs.length} item(s))`,
            undefined,
            400
          );
        }
      }

      if (!itemSpecs && !reportType) {
        return ResponseHelper.error(
          res,
          "Missing reportType (or send items[] with one object per file: reportType, optional title for file-only docs)",
          undefined,
          400
        );
      }

      const ps = new Date(periodStart);
      const pe = new Date(periodEnd);
      if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
        return ResponseHelper.error(res, "Invalid periodStart or periodEnd", undefined, 400);
      }

      let sharedDataSnapshot: any = null;
      if (
        !itemSpecs &&
        reportType &&
        reportTypeAcceptsManualDataJson(reportType) &&
        data !== undefined &&
        data !== null &&
        data !== ""
      ) {
        try {
          sharedDataSnapshot = parseDataSnapshotFragment(data);
        } catch {
          return ResponseHelper.error(res, "Invalid data JSON for report fields", undefined, 400);
        }
      }

      const results: any[] = [];

      for (let i = 0; i < uploaded.length; i++) {
        const file = uploaded[i];
        const ext = financialReportFileExtension(file);

        let rowReportType: string;
        let rowTitle: string;
        let rowDescription: string | undefined;
        let rowTemplateVersion: string | undefined;
        let rowData: any = null;

        if (itemSpecs) {
          const it = itemSpecs[i];
          if (!it || !it.reportType) {
            return ResponseHelper.error(res, `items[${i}] must include reportType`, undefined, 400);
          }
          rowReportType = it.reportType;
          const tit = it.title != null ? String(it.title).trim() : "";
          if (isCoreFinancialStatementReportType(rowReportType) && !tit) {
            return ResponseHelper.error(
              res,
              `items[${i}]: title is required for income statement, balance sheet, and cash flow`,
              undefined,
              400
            );
          }
          rowTitle = tit || stripUploadedFilenameBase(file);
          rowDescription = it.description ?? description;
          rowTemplateVersion = it.templateVersion ?? templateVersion;
          if (
            reportTypeAcceptsManualDataJson(rowReportType) &&
            it.data !== undefined &&
            it.data !== null &&
            it.data !== ""
          ) {
            try {
              rowData = parseDataSnapshotFragment(it.data);
            } catch {
              return ResponseHelper.error(res, `Invalid data JSON in items[${i}]`, undefined, 400);
            }
          }
        } else {
          rowReportType = reportType;
          const trimmedTitle = title != null ? String(title).trim() : "";
          if (isCoreFinancialStatementReportType(rowReportType)) {
            if (!trimmedTitle) {
              return ResponseHelper.error(
                res,
                "title is required for income statement, balance sheet, and cash flow uploads",
                undefined,
                400
              );
            }
            rowTitle = uploaded.length === 1 ? trimmedTitle : `${trimmedTitle} (${file.originalname})`;
          } else {
            const base = trimmedTitle || stripUploadedFilenameBase(file);
            rowTitle = uploaded.length === 1 ? base : `${base} (${file.originalname})`;
          }
          rowDescription = description;
          rowTemplateVersion = templateVersion;
          rowData = sharedDataSnapshot;
        }

        const extErr = validateFinancialReportFileExtension(ext, rowReportType);
        if (extErr) {
          return ResponseHelper.error(res, extErr, undefined, 400);
        }

        const createResult = await FinancialReportService.createReport({
          portfolioCompanyId: portfolioCompany.id,
          portfolioCompanyName: portfolioCompany.name,
          submittedById: userId,
          reportType: rowReportType,
          reportingPeriod: rp,
          periodType,
          periodStart: ps,
          periodEnd: pe,
          title: rowTitle,
          description: rowDescription,
          templateVersion: rowTemplateVersion,
          dataSnapshot: rowData,
          fileBuffer: file.buffer,
          originalFileName: file.originalname,
        });
        results.push(createResult);
      }

      const payload = results.length === 1 ? results[0] : { reports: results, count: results.length };
      const msg =
        results.length === 1
          ? "Financial report submitted successfully"
          : `${results.length} financial reports submitted successfully`;
      return ResponseHelper.success(res, msg, payload, 201);
    } catch (error: any) {
      next(error);
    }
  }

  async createIncomeStatementDraft(req: Request, res: Response, next: NextFunction) {
    return createFinancialReportDraftInternal(req, res, next, "INCOME_STATEMENTS");
  }

  async createBalanceSheetDraft(req: Request, res: Response, next: NextFunction) {
    return createFinancialReportDraftInternal(req, res, next, "STATEMENT_OF_FINANCIAL_POSITION");
  }

  async createCashFlowStatementDraft(req: Request, res: Response, next: NextFunction) {
    return createFinancialReportDraftInternal(req, res, next, "CASHFLOW_STATEMENTS");
  }

  /** Data-only operational KPIs report: **DRAFT** only (fast). Submit via **`POST .../financial-reports/submit`** to sync KPI tables + derived metrics. */
  async createOperationalKpisDraft(req: Request, res: Response, next: NextFunction) {
    return createFinancialReportDraftInternal(req, res, next, "OPERATIONAL_KPIS");
  }

  async uploadFinancialReportFile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }

      const reportId = String(req.params.reportId || req.query.reportId || "").trim();
      if (!reportId) {
        return ResponseHelper.error(
          res,
          "reportId is required (path /financial-reports/:reportId/file or query ?reportId=)",
          undefined,
          400
        );
      }

      if (!req.file) {
        return ResponseHelper.error(res, "File is required", undefined, 400);
      }

      const fileExtension = req.file.originalname.split(".").pop()?.toLowerCase();
      if (!fileExtension || !["xlsx", "xls", "csv", "pdf"].includes(fileExtension)) {
        return ResponseHelper.error(
          res,
          "Invalid file type. Only .xlsx, .xls, .csv, and .pdf files are allowed",
          undefined,
          400
        );
      }

      // Validate by reportType stored on the report (PDF rules)
      const report = await FinancialReportService.getReportById(reportId);
      if (!report) {
        return ResponseHelper.error(res, "Report not found", undefined, 404);
      }
      const rt = String(report.reportType || "").toUpperCase();
      const isCoreStatement = isCoreFinancialStatementReportType(rt);
      if (fileExtension === "pdf" && isCoreStatement) {
        return ResponseHelper.error(
          res,
          "Invalid file type for this reportType: core financial statements must be .xlsx or .xls (PDFs are for narrative/compliance categories only).",
          undefined,
          400
        );
      }
      if (isCoreStatement && fileExtension !== "xlsx" && fileExtension !== "xls") {
        return ResponseHelper.error(
          res,
          "Mandatory Requirement: Core financial statements must be uploaded in Excel (.xlsx or .xls) format for system parsing.",
          undefined,
          400
        );
      }

      const attach = await FinancialReportService.attachFileToReport({
        reportId,
        submittedById: userId,
        originalFileName: req.file.originalname,
        fileBuffer: req.file.buffer,
      });

      return ResponseHelper.success(
        res,
        "File uploaded and attached (replaces previous file URL for this report)",
        attach,
        201
      );
    } catch (error: any) {
      next(error);
    }
  }

  async createProcurementRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }

      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true, fundId: true },
      });

      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }

      const baseUrl = process.env.PROCUREMENT_API_BASE_URL;
      if (!baseUrl) {
        return ResponseHelper.error(res, "PROCUREMENT_API_BASE_URL is not configured", undefined, 500);
      }

      const url = `${String(baseUrl).replace(/\/+$/, "")}/procurement/api/new_external_request`;
      const payload = {
        ...req.body,
        originModule: "PMS",
        investeeId: portfolioCompany.id,
        fundId: req.body.fundId || portfolioCompany.fundId,
      };

      const authHeader = String(req.headers.authorization || "");
      const headers: any = { "Content-Type": "application/json" };
      if (authHeader) headers.Authorization = authHeader;

      const maxAttempts = 2;
      let lastErr: any = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const resp = await axios.post(url, payload, { headers, timeout: 4500 });
          return ResponseHelper.success(res, "Procurement request submitted", resp.data, 201);
        } catch (e: any) {
          lastErr = e;
          if (attempt === maxAttempts) break;
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }

      const status = lastErr?.response?.status;
      const message =
        lastErr?.response?.data?.message ||
        lastErr?.response?.data?.error ||
        lastErr?.message ||
        "Failed to submit procurement request";

      return ResponseHelper.error(res, `Procurement API error${status ? ` (${status})` : ""}: ${message}`, undefined, 502);
    } catch (error: any) {
      next(error);
    }
  }

  async savePeriodKPIs(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }

      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true }
      });

      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }

      const {
        periodStart,
        periodEnd,
        totalRevenue,
        netProfit,
        cashFlowNet,
        incomeStatement,
        statementOfFinancialPosition,
        cashflowStatement,
        nonFinancialKpis,
        varianceExplanationNote,
      } = req.body;

      if (!periodStart || !periodEnd) {
        return ResponseHelper.error(res, "periodStart and periodEnd are required", undefined, 400);
      }

      const savedKPIs = await FinancialReportService.savePeriodKPIs({
        portfolioCompanyId: portfolioCompany.id,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalRevenue,
        netProfit,
        cashFlowNet,
        submittedById: userId,
        incomeStatement,
        statementOfFinancialPosition,
        cashflowStatement,
        nonFinancialKpis,
        varianceExplanationNote,
      });

      return ResponseHelper.success(res, "Period KPIs saved successfully", savedKPIs, 200);
    } catch (error: any) {
      next(error);
    }
  }

  /** Period tab: income statement line items only (`data` matches draft `data` for INCOME_STATEMENTS). */
  async savePeriodKPIsIncomeStatement(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }
      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }
      const { periodStart, periodEnd, data, totalRevenue, netProfit, cashFlowNet } = req.body || {};
      if (!periodStart || !periodEnd) {
        return ResponseHelper.error(res, "periodStart and periodEnd are required", undefined, 400);
      }
      if (data === undefined || data === null || typeof data !== "object") {
        return ResponseHelper.error(res, "data (object) is required with income statement line-item fields", undefined, 400);
      }
      const savedKPIs = await FinancialReportService.savePeriodKPIs({
        portfolioCompanyId: portfolioCompany.id,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalRevenue,
        netProfit,
        cashFlowNet,
        submittedById: userId,
        incomeStatement: data,
      });
      return ResponseHelper.success(
        res,
        "Period KPIs saved successfully",
        { ...savedKPIs, reportType: "INCOME_STATEMENTS" },
        200
      );
    } catch (error: any) {
      next(error);
    }
  }

  async savePeriodKPIsBalanceSheet(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }
      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }
      const { periodStart, periodEnd, data, totalRevenue, netProfit, cashFlowNet } = req.body || {};
      if (!periodStart || !periodEnd) {
        return ResponseHelper.error(res, "periodStart and periodEnd are required", undefined, 400);
      }
      if (data === undefined || data === null || typeof data !== "object") {
        return ResponseHelper.error(res, "data (object) is required with balance sheet line-item fields", undefined, 400);
      }
      const savedKPIs = await FinancialReportService.savePeriodKPIs({
        portfolioCompanyId: portfolioCompany.id,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalRevenue,
        netProfit,
        cashFlowNet,
        submittedById: userId,
        statementOfFinancialPosition: data,
      });
      return ResponseHelper.success(
        res,
        "Period KPIs saved successfully",
        { ...savedKPIs, reportType: "STATEMENT_OF_FINANCIAL_POSITION" },
        200
      );
    } catch (error: any) {
      next(error);
    }
  }

  async savePeriodKPIsCashFlow(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }
      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }
      const { periodStart, periodEnd, data, totalRevenue, netProfit, cashFlowNet } = req.body || {};
      if (!periodStart || !periodEnd) {
        return ResponseHelper.error(res, "periodStart and periodEnd are required", undefined, 400);
      }
      if (data === undefined || data === null || typeof data !== "object") {
        return ResponseHelper.error(res, "data (object) is required with cash flow line-item fields", undefined, 400);
      }
      const savedKPIs = await FinancialReportService.savePeriodKPIs({
        portfolioCompanyId: portfolioCompany.id,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalRevenue,
        netProfit,
        cashFlowNet,
        submittedById: userId,
        cashflowStatement: data,
      });
      return ResponseHelper.success(
        res,
        "Period KPIs saved successfully",
        { ...savedKPIs, reportType: "CASHFLOW_STATEMENTS" },
        200
      );
    } catch (error: any) {
      next(error);
    }
  }

  /** Combined view: stored operational payload + last derived block for the period. */
  async getPeriodKpiSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }
      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!portfolioCompany) {
        return ResponseHelper.error(res, "No portfolio company found for this applicant", undefined, 400);
      }
      const periodEnd = String(req.query.periodEnd || "").trim();
      if (!periodEnd) {
        return ResponseHelper.error(res, "periodEnd query param (YYYY-MM-DD) is required", undefined, 400);
      }
      const summary = await ReportingPeriodKpiService.getPeriodSummaryForApplicant({
        portfolioCompanyId: portfolioCompany.id,
        periodEnd,
      });
      return ResponseHelper.success(res, "Period KPI summary", summary, 200);
    } catch (error: any) {
      next(error);
    }
  }

  async getFinancialReports(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }

      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const reports = await FinancialReportService.listReportsForApplicant(userId, { page, limit });
      return ResponseHelper.success(res, "Financial reports retrieved successfully", reports);
    } catch (error: any) {
      next(error);
    }
  }

  /** Single report detail: `data` (line items), reviewer feedback, `canSubmit` / `canUploadFile`. */
  async getFinancialReportById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }
      const reportId = String(req.params.reportId || "").trim();
      if (!reportId) {
        return ResponseHelper.error(res, "reportId is required", undefined, 400);
      }
      const detail = await FinancialReportService.getFinancialReportDetailForApplicant(reportId, userId);
      if (!detail) {
        return ResponseHelper.error(res, "Report not found", undefined, 404);
      }
      return ResponseHelper.success(res, "Financial report retrieved successfully", detail);
    } catch (error: any) {
      next(error);
    }
  }

  /** Update manual form `data` on a report (NEEDS_REVISION / REJECTED / DRAFT); then call submit separately. */
  async updateFinancialReportData(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not provided", undefined, 400);
      }
      const reportId = String(req.params.reportId || "").trim();
      if (!reportId) {
        return ResponseHelper.error(res, "reportId is required", undefined, 400);
      }
      const { data } = req.body || {};
      if (data === undefined || data === null || typeof data !== "object") {
        return ResponseHelper.error(res, "body.data (object) is required", undefined, 400);
      }
      const updated = await FinancialReportService.updateReportParsedSnapshotForApplicant({
        reportId,
        applicantUserId: userId,
        data,
      });
      return ResponseHelper.success(res, "Report data updated successfully", updated, 200);
    } catch (error: any) {
      const msg = error?.message || "Failed to update report";
      if (msg === "Financial report not found") {
        return ResponseHelper.error(res, msg, undefined, 404);
      }
      if (
        msg.includes("not support") ||
        msg.includes("not be updated") ||
        msg.includes("must be a JSON")
      ) {
        return ResponseHelper.error(res, msg, undefined, 400);
      }
      if (msg.includes("does not belong")) {
        return ResponseHelper.error(res, msg, undefined, 403);
      }
      next(error);
    }
  }

  async getOpenReportingRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }

      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(
          res,
          "Access denied. This endpoint is only available to applicants.",
          undefined,
          403
        );
      }

      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }

      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId },
        select: { id: true, name: true },
      });
      if (!portfolioCompany) {
        return ResponseHelper.success(res, "No portfolio company found", []);
      }

      // Requests are derived from REQUEST logs + dueDate stored in meta (take latest by created_at per period).
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT l.reporting_period as reportingPeriod,
                l.created_at as lastRequestedAt,
                JSON_UNQUOTE(JSON_EXTRACT(l.meta, '$.dueDate')) as dueDate
           FROM reporting_notification_logs l
           JOIN (
             SELECT reporting_period, MAX(created_at) AS max_created_at
               FROM reporting_notification_logs
              WHERE portfolio_company_id = ?
                AND event_type = 'REQUEST'
              GROUP BY reporting_period
           ) latest
             ON latest.reporting_period = l.reporting_period
            AND latest.max_created_at = l.created_at
          WHERE l.portfolio_company_id = ?
            AND l.event_type = 'REQUEST'
          ORDER BY l.reporting_period DESC`,
        portfolioCompany.id,
        portfolioCompany.id
      );

      const periodIsoList: string[] = [];
      for (const r of rows) {
        periodIsoList.push(new Date(r.reportingPeriod).toISOString().split("T")[0]);
      }

      let submittedSet = new Set<string>();
      if (periodIsoList.length > 0) {
        const ph = periodIsoList.map(() => "?").join(", ");
        const subRows = await prisma.$queryRawUnsafe<Array<{ reportingPeriod: Date | string }>>(
          `SELECT DISTINCT reportingPeriod
             FROM financial_reports
            WHERE portfolioCompanyId = ?
              AND status IN ('PENDING','ACCEPTED')
              AND reportingPeriod IN (${ph})`,
          portfolioCompany.id,
          ...periodIsoList
        );
        submittedSet = new Set(
          subRows.map((s) =>
            s.reportingPeriod instanceof Date
              ? s.reportingPeriod.toISOString().split("T")[0]
              : String(s.reportingPeriod).slice(0, 10)
          )
        );
      }

      const out: any[] = [];
      const viewReceipts: Promise<void>[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rpIso = periodIsoList[i];
        const isSubmitted = submittedSet.has(rpIso);
        out.push({
          portfolioCompanyId: portfolioCompany.id,
          companyName: portfolioCompany.name,
          reportingPeriod: rpIso,
          dueDate: r.dueDate || null,
          lastRequestedAt: r.lastRequestedAt,
          status: isSubmitted ? "SUBMITTED" : "OPEN",
          /** Product label: investee portal treats open periods as “Reporting open” after admin Request for data. */
          portalStatus: isSubmitted ? "SUBMITTED" : "REPORTING_OPEN",
        });
        if (!isSubmitted) {
          viewReceipts.push(
            ApplicantPortalController.logReportingViewedByInvesteeIfQuiet(portfolioCompany.id, rpIso).catch(() => {})
          );
        }
      }

      await Promise.all(viewReceipts);

      return ResponseHelper.success(res, "Reporting requests retrieved successfully", out);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get applicant dashboard
   */
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const dashboard = await ApplicantPortalService.getApplicantDashboard(userId);

      const reportingPeriod = typeof req.query.reportingPeriod === "string" ? req.query.reportingPeriod.trim() : null;
      if (reportingPeriod) {
        const portfolioCompany = await prisma.portfolioCompany.findFirst({
          where: { userId },
          select: { id: true },
        });
        if (portfolioCompany?.id) {
          try {
            const d = new Date(reportingPeriod);
            if (!Number.isNaN(d.getTime())) {
              const rpIso = d.toISOString().split("T")[0];
              await ApplicantPortalController.logReportingViewedByInvesteeIfQuiet(portfolioCompany.id, rpIso);
            }
          } catch (e) {
            // Don't block dashboard if logging fails (e.g. table not present in some env)
          }
        }
      }
      
      return ResponseHelper.success(res, "Dashboard retrieved successfully", dashboard);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get application timeline
   */
  async getApplicationTimeline(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const timeline = await ApplicantPortalService.getApplicationTimeline(userId);
      
      return ResponseHelper.success(res, "Application timeline retrieved successfully", timeline);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get investment details
   */
  async getInvestmentDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const investmentDetails = await ApplicantPortalService.getInvestmentDetails(userId);
      
      return ResponseHelper.success(res, "Investment details retrieved successfully", investmentDetails);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get portfolio valuations
   */
  async getPortfolioValuations(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const valuations = await ApplicantPortalService.getPortfolioValuations(userId);
      
      return ResponseHelper.success(res, "Portfolio valuations retrieved successfully", valuations);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get performance reports
   */
  async getPerformanceReports(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      
      // Check if user is applicant
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const reports = await ApplicantPortalService.getPerformanceReports(userId);
      
      return ResponseHelper.success(res, "Performance reports retrieved successfully", reports);
    } catch (error) {
      next(error);
    }
  }

  async downloadFinancialReportTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { reportType } = req.params;
      const template = await FinancialReportService.downloadReportTemplate(reportType);

      // Determine if it's XLSX or CSV based on report type
      const normalizedType = reportType?.toUpperCase();
      const isXLSX = ['INCOME_STATEMENTS', 'STATEMENT_OF_FINANCIAL_POSITION', 
                      'CASHFLOW_STATEMENTS', 'NON_FINANCIAL_KPIS'].includes(normalizedType);
      
      if (isXLSX) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${reportType.toLowerCase()}_template.xlsx`);
      } else {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${reportType.toLowerCase()}_template.csv`);
      }
      
      return res.send(template);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Suite 02: committed / reserved / available drawdown + all investee PRs for this portfolio.
   */
  async getInvesteeDrawdownSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      const pc = await prisma.portfolioCompany.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!pc) {
        return ResponseHelper.error(res, "No portfolio company found for this user", undefined, 404);
      }
      const data = await InvesteeDrawdownProcurementService.getDrawdownSummaryForPortfolio(pc.id);
      return ResponseHelper.success(res, "Drawdown summary retrieved successfully", data);
    } catch (error) {
      next(error);
    }
  }

  async createInvesteePurchaseRequisition(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      const pc = await prisma.portfolioCompany.findUnique({
        where: { userId },
        select: { id: true, fundId: true },
      });
      if (!pc) {
        return ResponseHelper.error(res, "No portfolio company found for this user", undefined, 404);
      }
      const {
        title,
        description,
        priority,
        justification,
        sourcingCategory,
        items,
        drawdownRequestAmount,
        useOfFundsDocumentUrl,
        department,
      } = req.body || {};
      if (!title || !items || !Array.isArray(items) || items.length === 0) {
        return ResponseHelper.error(res, "title and items are required", undefined, 400);
      }
      if (drawdownRequestAmount == null || Number(drawdownRequestAmount) <= 0) {
        return ResponseHelper.error(res, "drawdownRequestAmount is required and must be positive", undefined, 400);
      }
      if (!useOfFundsDocumentUrl || String(useOfFundsDocumentUrl).trim() === "") {
        return ResponseHelper.error(
          res,
          "useOfFundsDocumentUrl is required (use of funds / business case attachment — Suite 02).",
          undefined,
          400
        );
      }
      const dept =
        department && Object.values(Department).includes(department)
          ? department
          : Department.PROCUREMENT;
      const created = await ProcurementService.createPurchaseRequisition({
        title,
        description,
        department: dept,
        requestedById: userId,
        priority,
        justification,
        sourcingCategory,
        portfolioCompanyId: pc.id,
        fundId: pc.fundId ?? undefined,
        useOfFundsDocumentUrl,
        drawdownRequestAmount: Number(drawdownRequestAmount),
        items,
      });
      return ResponseHelper.success(res, "Purchase requisition created successfully", created, 201);
    } catch (error: any) {
      next(error);
    }
  }

  async submitInvesteePurchaseRequisition(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      const { id } = req.params;
      if (!id) {
        return ResponseHelper.error(res, "Requisition id is required", undefined, 400);
      }
      const updated = await ProcurementService.submitPurchaseRequisition(id, userId);
      return ResponseHelper.success(res, "Requisition submitted for VC executive review", updated);
    } catch (error: any) {
      next(error);
    }
  }

  async cancelInvesteePurchaseRequisition(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied. This endpoint is only available to applicants.", undefined, 403);
      }
      const userId = user.id || user.userId;
      if (!userId) {
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      const { id } = req.params;
      if (!id) {
        return ResponseHelper.error(res, "Requisition id is required", undefined, 400);
      }
      const updated = await ProcurementService.cancelInvesteePurchaseRequisition(id, userId);
      return ResponseHelper.success(
        res,
        "Requisition returned to Draft; drawdown capacity restored (Suite 02).",
        updated
      );
    } catch (error: any) {
      next(error);
    }
  }

  /** Suite 05 — investee-submitted GRN (requires PO tied to this portfolio company’s PR). */
  async createInvesteeGoodsReceivedNote(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied.", undefined, 403);
      }
      const userId = user.id || user.userId;
      const { prisma } = await import("../utils/database");
      const { ProcurementService } = await import("../services/ProcurementService");
      const pc = await prisma.portfolioCompany.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!pc) {
        return ResponseHelper.error(res, "No portfolio company for this applicant", undefined, 404);
      }
      const { purchaseOrderId, items, receivedDate, attachmentUrls, latitude, longitude, geoCapturedAt } =
        req.body;
      if (!purchaseOrderId || !items?.length) {
        return ResponseHelper.error(res, "purchaseOrderId and items are required", undefined, 400);
      }
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { requisition: { select: { portfolioCompanyId: true } } },
      });
      if (!po?.requisition?.portfolioCompanyId || po.requisition.portfolioCompanyId !== pc.id) {
        return ResponseHelper.error(
          res,
          "Purchase order is not linked to your investee requisition",
          undefined,
          403
        );
      }
      const grn = await ProcurementService.createGoodsReceivedNote(
        purchaseOrderId,
        userId,
        items,
        {
          receivedDate: receivedDate ? new Date(receivedDate) : undefined,
          attachmentUrls,
          latitude: latitude != null ? Number(latitude) : undefined,
          longitude: longitude != null ? Number(longitude) : undefined,
          geoCapturedAt: geoCapturedAt ? new Date(geoCapturedAt) : undefined,
          submittedByInvestee: true,
        }
      );
      return ResponseHelper.success(res, "Goods received note created (pending GP review if applicable)", grn);
    } catch (error: any) {
      next(error);
    }
  }

  /** Suite 05 — list GRNs for POs tied to this portfolio company’s PRs only. */
  async listInvesteeGoodsReceivedNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied.", undefined, 403);
      }
      const userId = user.id || user.userId;
      const pc = await prisma.portfolioCompany.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!pc) {
        return ResponseHelper.error(res, "No portfolio company for this applicant", undefined, 404);
      }

      const {
        purchaseOrderId,
        status,
        qualityStatus,
        grnNumber,
        limit = 50,
        offset = 0,
      } = req.query;

      const where: any = {
        purchaseOrder: {
          requisition: { portfolioCompanyId: pc.id },
          ...(purchaseOrderId ? { id: String(purchaseOrderId) } : {}),
        },
      };
      if (status) where.status = String(status);
      if (qualityStatus) where.qualityStatus = String(qualityStatus);
      if (grnNumber != null && String(grnNumber).trim() !== "") {
        where.grnNumber = { contains: String(grnNumber).trim() };
      }

      const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
      const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

      const [rows, total] = await Promise.all([
        prisma.goodsReceivedNote.findMany({
          where,
          include: investeeGrnApiInclude as any,
          orderBy: { createdAt: "desc" },
          take,
          skip,
        }),
        prisma.goodsReceivedNote.count({ where }),
      ]);

      return ResponseHelper.success(res, "Goods received notes retrieved successfully", {
        items: rows,
        total,
        limit: take,
        offset: skip,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /** Suite 05 — GRN detail if it belongs to this portfolio company’s PR chain. */
  async getInvesteeGoodsReceivedNoteById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
      }
      if (!(await ApplicantPortalController.isApplicant(user))) {
        return ResponseHelper.error(res, "Access denied.", undefined, 403);
      }
      const userId = user.id || user.userId;
      const pc = await prisma.portfolioCompany.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!pc) {
        return ResponseHelper.error(res, "No portfolio company for this applicant", undefined, 404);
      }

      const { id } = req.params;
      const grn = await prisma.goodsReceivedNote.findUnique({
        where: { id },
        include: investeeGrnApiInclude as any,
      });
      if (!grn) {
        return ResponseHelper.error(res, "Goods received note not found", undefined, 404);
      }
      const pid = grn.purchaseOrder?.requisition?.portfolioCompanyId;
      if (!pid || pid !== pc.id) {
        return ResponseHelper.error(res, "Goods received note not found", undefined, 404);
      }

      return ResponseHelper.success(res, "Goods received note retrieved successfully", grn);
    } catch (error: any) {
      next(error);
    }
  }

  async submitFinancialReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const body = req.body;
      let reportIds: string[] = [];

      if (Array.isArray(body?.reportIds)) {
        reportIds = body.reportIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
      } else if (typeof body?.reportId === 'string' && body.reportId.trim().length > 0) {
        reportIds = [body.reportId.trim()];
      } else if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          if (Array.isArray(parsed?.reportIds)) {
            reportIds = parsed.reportIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
          }
        } catch (error) {
          // ignore JSON parse errors, will fall back to params
        }
      }

      if (reportIds.length === 0 && req.params.reportId) {
        reportIds = [req.params.reportId];
      }

      if (reportIds.length === 0) {
        const q: any = req.query || {};
        const qReportId = typeof q.reportId === "string" ? q.reportId.trim() : "";
        const qReportIds = q.reportIds;
        if (qReportId) {
          reportIds = [qReportId];
        } else if (typeof qReportIds === "string" && qReportIds.trim()) {
          // allow comma-separated list
          reportIds = qReportIds
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        } else if (Array.isArray(qReportIds)) {
          reportIds = qReportIds
            .map((s: any) => (typeof s === "string" ? s.trim() : ""))
            .filter((s: string) => s.length > 0);
        }
      }

      if (reportIds.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Provide reportId/reportIds in the request body, or reportId/reportIds in query params (e.g. ?reportId=...)",
        });
      }

      await FinancialReportService.submitDrafts(reportIds, user.id || user.userId);

      return res.status(200).json({ success: true, message: 'Financial report(s) submitted for review' });
    } catch (error: any) {
      next(error);
    }
  }
}

export const applicantPortalController = new ApplicantPortalController();
