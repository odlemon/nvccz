// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PortfolioCompanyService, CreatePortfolioCompanyRequest, UpdatePortfolioCompanyRequest, CreatePortfolioCompanyByAdminRequest } from "../services/PortfolioCompanyService";
import { EmailNotificationService } from "../services/EmailNotificationService";
import { FinancialReportService } from "../services/FinancialReportService";
import { FirebaseStorageService } from "../services/FirebaseStorageService";
import { PortfolioCompanyAccountingService } from "../services/PortfolioCompanyAccountingService";
import { ReportingReminderService } from "../services/ReportingReminderService";
import { ReportingCalendarService } from "../services/ReportingCalendarService";
import { parseDate } from "../utils/dateHelper";
import {
  MANDATORY_REPORTING_ATTACHMENTS,
  parseMandatoryAttachmentsInput,
  REPORTING_MANDATORY_ATTACHMENT_OPTIONS,
  resolveMandatoryAttachmentsFromOptionIds,
  type ReportingMandatoryAttachment,
} from "../utils/reportingEmail";
import { PortfolioCompanyLetterheadService } from "../services/PortfolioCompanyLetterheadService";
import { RemoteUploadService } from "../services/RemoteUploadService";
export class PortfolioCompanyController {
  // Create portfolio company with user
  static async createPortfolioCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const request: CreatePortfolioCompanyRequest = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        registrationNumber: req.body.registrationNumber,
        industry: req.body.industry,
        foundingDate: parseDate(req.body.foundingDate),
        address: req.body.address,
        website: req.body.website,
        description: req.body.description,
        logoUrl: req.body.logoUrl,
        status: req.body.status,
        companySize: req.body.companySize,
        employeeCount: req.body.employeeCount,
        annualRevenue: req.body.annualRevenue,
        fundingStage: req.body.fundingStage,
        contactPerson: req.body.contactPerson,
        contactPhone: req.body.contactPhone,
        contactEmail: req.body.contactEmail,
        socialMedia: req.body.socialMedia,
        // Enhanced fields
        fundId: req.body.fund_id,
        startDate: req.body.start_date ? parseDate(req.body.start_date) : undefined,
        endDate: req.body.end_date ? parseDate(req.body.end_date) : undefined,
        capTable: req.body.cap_table,
        financialKpis: req.body.financial_kpis,
        financialHistoryExcel: req.body.financial_history_excel,
        eSign: req.body.e_sign
      };

      const portfolioCompany = await PortfolioCompanyService.createPortfolioCompany(request);

      // Send portfolio company created email notification
      try {
        await EmailNotificationService.sendPortfolioCompanyCreatedEmail({
          applicantName: `${request.firstName} ${request.lastName}`,
          applicantEmail: request.email,
          businessName: request.name,
          applicationId: portfolioCompany.id,
          currentStage: 'PORTFOLIO_COMPANY_CREATED'
        });
        console.log("Portfolio company created email sent successfully", {
          portfolioCompanyId: portfolioCompany.id,
          applicantEmail: request.email
        });
      } catch (emailError) {
        console.error("Failed to send portfolio company created email", {
          portfolioCompanyId: portfolioCompany.id,
          error: emailError.message
        });
        // Don't fail the portfolio company creation if email fails
      }

      res.status(201).json({
        success: true,
        message: "Portfolio company created successfully",
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Create portfolio company by admin (internal creation)
  static async createPortfolioCompanyByAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const request: CreatePortfolioCompanyByAdminRequest = {
        // User details (optional)
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: req.body.password,
        userId: req.body.user_id,
        
        // Company details
        name: req.body.name,
        registrationNumber: req.body.registrationNumber,
        industry: req.body.industry,
        foundingDate: req.body.foundingDate ? parseDate(req.body.foundingDate) : undefined,
        address: req.body.address,
        website: req.body.website,
        description: req.body.description,
        logoUrl: req.body.logoUrl,
        status: req.body.status,
        companySize: req.body.companySize,
        employeeCount: req.body.employeeCount,
        annualRevenue: req.body.annualRevenue,
        fundingStage: req.body.fundingStage,
        contactPerson: req.body.contactPerson,
        contactPhone: req.body.contactPhone,
        contactEmail: req.body.contactEmail,
        socialMedia: req.body.socialMedia,
        
        // Enhanced fields
        fundId: req.body.fund_id && req.body.fund_id.trim() !== "" ? req.body.fund_id : undefined,
        startDate: req.body.start_date ? parseDate(req.body.start_date) : undefined,
        endDate: req.body.end_date ? parseDate(req.body.end_date) : undefined,
        capTable: req.body.cap_table,
        financialKpis: req.body.financial_kpis,
        financialHistoryExcel: req.body.financial_history_excel,
        eSign: req.body.e_sign
      };

      const portfolioCompany = await PortfolioCompanyService.createPortfolioCompanyByAdmin(request);

      res.status(201).json({
        success: true,
        message: "Portfolio company created successfully by admin",
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get portfolio company by ID
  static async getPortfolioCompanyById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const portfolioCompany = await PortfolioCompanyService.getPortfolioCompanyById(id);

      res.status(200).json({
        success: true,
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get portfolio company by user ID
  static async getPortfolioCompanyByUserId(req: Request, res: Response, next: NextFunction) {
    try {
      const { user_id } = req.params;
      const portfolioCompany = await PortfolioCompanyService.getPortfolioCompanyByUserId(user_id);

      res.status(200).json({
        success: true,
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get current user's portfolio company
  static async getCurrentUserPortfolioCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const portfolioCompany = await PortfolioCompanyService.getCurrentUserPortfolioCompany(userId);

      res.status(200).json({
        success: true,
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Update portfolio company
  static async updatePortfolioCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const request: UpdatePortfolioCompanyRequest = {
        name: req.body.name,
        industry: req.body.industry,
        foundingDate: req.body.foundingDate ? parseDate(req.body.foundingDate) : undefined,
        address: req.body.address,
        website: req.body.website,
        description: req.body.description,
        logoUrl: req.body.logoUrl,
        status: req.body.status,
        companySize: req.body.companySize,
        employeeCount: req.body.employeeCount,
        annualRevenue: req.body.annualRevenue,
        fundingStage: req.body.fundingStage,
        contactPerson: req.body.contactPerson,
        contactPhone: req.body.contactPhone,
        contactEmail: req.body.contactEmail,
        socialMedia: req.body.socialMedia,
        // Enhanced fields
        fundId: req.body.fund_id,
        startDate: req.body.start_date ? parseDate(req.body.start_date) : undefined,
        endDate: req.body.end_date ? parseDate(req.body.end_date) : undefined,
        capTable: req.body.cap_table,
        financialKpis: req.body.financial_kpis,
        financialHistoryExcel: req.body.financial_history_excel,
        eSign: req.body.e_sign
      };

      const portfolioCompany = await PortfolioCompanyService.updatePortfolioCompany(id, request);

      res.status(200).json({
        success: true,
        message: "Portfolio company updated successfully",
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Update current user's portfolio company
  static async updateCurrentUserPortfolioCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const request: UpdatePortfolioCompanyRequest = {
        name: req.body.name,
        industry: req.body.industry,
        foundingDate: req.body.foundingDate ? parseDate(req.body.foundingDate) : undefined,
        address: req.body.address,
        website: req.body.website,
        description: req.body.description,
        logoUrl: req.body.logoUrl,
        status: req.body.status,
        companySize: req.body.companySize,
        employeeCount: req.body.employeeCount,
        annualRevenue: req.body.annualRevenue,
        fundingStage: req.body.fundingStage,
        contactPerson: req.body.contactPerson,
        contactPhone: req.body.contactPhone,
        contactEmail: req.body.contactEmail,
        socialMedia: req.body.socialMedia,
        // Enhanced fields
        fundId: req.body.fund_id,
        startDate: req.body.start_date ? parseDate(req.body.start_date) : undefined,
        endDate: req.body.end_date ? parseDate(req.body.end_date) : undefined,
        capTable: req.body.cap_table,
        financialKpis: req.body.financial_kpis,
        financialHistoryExcel: req.body.financial_history_excel,
        eSign: req.body.e_sign
      };

      const portfolioCompany = await PortfolioCompanyService.updateCurrentUserPortfolioCompany(userId, request);

      res.status(200).json({
        success: true,
        message: "Your portfolio company updated successfully",
        data: portfolioCompany
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get all portfolio companies
  static async getAllPortfolioCompanies(req: Request, res: Response, next: NextFunction) {
    try {
      const portfolioCompanies = await PortfolioCompanyService.getAllPortfolioCompanies();

      res.status(200).json({
        success: true,
        data: portfolioCompanies
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get all portfolio companies with investment amounts
  static async getAllPortfolioCompaniesWithInvestments(req: Request, res: Response, next: NextFunction) {
    try {
      const portfolioCompanies = await PortfolioCompanyService.getAllPortfolioCompaniesWithInvestments();

      res.status(200).json({
        success: true,
        data: portfolioCompanies
      });
    } catch (error: any) {
      next(error);
    }
  }

  static async getFinancialReports(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: "Portfolio company ID is required" });
      }

      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const reports = await FinancialReportService.listReportsForCompany(id, { page, limit });
      return res.status(200).json({ success: true, data: reports });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Per-company document library: Financial / Operational / Investment folders with fixed subfolders.
   */
  static async getDocumentOrganisation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: "Portfolio company ID is required" });
      }
      const statusQ = req.query.status;
      const statuses =
        typeof statusQ === "string" && statusQ.trim()
          ? statusQ
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const data = await FinancialReportService.getDocumentOrganisationForCompany(id, {
        statuses,
        limit,
      });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error?.message === "Portfolio company not found") {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /** Reporting audit trail: submissions, reviews, uploads, period KPI saves (per company). */
  static async getReportingAudit(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: "Portfolio company ID is required" });
      }
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const data = await FinancialReportService.listReportingAuditForCompany(id, { page, limit });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error?.message === "Portfolio company not found") {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  static async downloadFinancialReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { reportId } = req.params;
      if (!reportId) {
        return res.status(400).json({ success: false, message: "Report ID is required" });
      }

      const report = await FinancialReportService.getReportById(reportId);
      if (!report) {
        return res.status(404).json({ success: false, message: "Report not found" });
      }

      if (report.status === 'DRAFT') {
        return res.status(403).json({ success: false, message: "Report has not been submitted" });
      }

      const fileBuffer = await FirebaseStorageService.downloadImportFile(report.storagePath);
      const safeName = `${report.title || 'financial-report'}-${reportId}.csv`.replace(/[^a-zA-Z0-9.\-_]/g, '_');

      res.setHeader('Content-Disposition', `attachment; filename=${safeName}`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send(fileBuffer);
    } catch (error: any) {
      next(error);
    }
  }

  static async reviewFinancialReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { reportId } = req.params;
      if (!reportId) {
        return res.status(400).json({ success: false, message: "Report ID is required" });
      }

      const { action, comment, totalRevenue, netProfit, cashFlowNet, valuationAdjustment, valuation, dividend, dividends } = req.body;
      if (!action || !['ACCEPT', 'REJECT', 'NEEDS_REVISION'].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid action" });
      }

      const authHeader = String(req.headers.authorization || "");
      const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

      await FinancialReportService.reviewReport({
        reportId,
        reviewerId: user.id || user.userId,
        action,
        comment,
        valuationAdjustment: valuationAdjustment || null,
        valuation: valuation || null,
        dividend: dividend || null,
        dividends: Array.isArray(dividends) ? dividends : null,
        authToken: jwt || undefined,
        totalRevenue: totalRevenue !== undefined ? totalRevenue : null,
        netProfit: netProfit !== undefined ? netProfit : null,
        cashFlowNet: cashFlowNet !== undefined ? cashFlowNet : null
      });

      const updated = await FinancialReportService.getReportById(reportId);
      return res.status(200).json({
        success: true,
        message: "Financial report review recorded",
        data: FinancialReportService.mergeReportFileUrlsForApi(updated),
      });
    } catch (error: any) {
      next(error);
    }
  }

  static async recordValuationAdjustment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const authHeader = String(req.headers.authorization || "");
      const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

      const previousAmount = Number(req.body.previousAmount);
      const newAmount = Number(req.body.newAmount);

      if (!Number.isFinite(previousAmount) || !Number.isFinite(newAmount)) {
        return res.status(400).json({ success: false, message: "previousAmount and newAmount must be numeric" });
      }

      const reasonRaw =
        req.body.reasonForAdjustment != null && String(req.body.reasonForAdjustment).trim() !== ""
          ? String(req.body.reasonForAdjustment).trim()
          : req.body.notes != null
            ? String(req.body.notes).trim()
            : "";
      if (!reasonRaw) {
        return res.status(400).json({
          success: false,
          message:
            "reasonForAdjustment is required (non-empty). You may send `notes` instead for backward compatibility.",
        });
      }

      const result = await PortfolioCompanyAccountingService.recordValuationAdjustment({
        portfolioCompanyId: id,
        previousAmount,
        newAmount,
        valuationDate: req.body.valuationDate,
        approvedById: userId,
        reasonForAdjustment: reasonRaw,
        notes: reasonRaw,
        authToken: jwt
      });

      res.status(201).json({
        success: true,
        message: "Valuation adjustment recorded successfully",
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  static async recordDividend(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const authHeader = String(req.headers.authorization || "");
      const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount)) {
        return res.status(400).json({ success: false, message: "Dividend amount must be numeric" });
      }

      const result = await PortfolioCompanyAccountingService.recordDividend({
        portfolioCompanyId: id,
        amount,
        dividendDate: req.body.dividendDate,
        approvedById: userId,
        notes: req.body.notes,
        bankId: req.body.bankId,
        authToken: jwt
      });

      res.status(201).json({
        success: true,
        message: "Dividend recorded successfully",
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  static async nudgeReporting(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const { reportingPeriod, dueDate, message, notes } = req.body || {};
      const analystMessage = String(message ?? notes ?? "").trim();
      if (!id || !reportingPeriod || !dueDate) {
        return res
          .status(400)
          .json({ success: false, message: "portfolioCompanyId, reportingPeriod, dueDate are required" });
      }
      if (!analystMessage) {
        return res.status(400).json({
          success: false,
          message: "message (or notes) is required — this text is emailed to the investee",
        });
      }

      let nudgeAttachments;
      const nudgeIds = req.body?.attachmentOptionIds;
      if (Array.isArray(nudgeIds) && nudgeIds.length > 0) {
        const resolved = resolveMandatoryAttachmentsFromOptionIds(nudgeIds);
        if (!resolved) {
          return res.status(400).json({
            success: false,
            message:
              "attachmentOptionIds must contain only ids from GET /api/portfolio-companies/reporting/mandatory-attachment-options",
          });
        }
        nudgeAttachments = resolved;
      } else {
        nudgeAttachments =
          parseMandatoryAttachmentsInput(req.body?.mandatoryAttachments, { required: false }) ||
          [...MANDATORY_REPORTING_ATTACHMENTS];
      }

      const result = await ReportingReminderService.run({
        reportingPeriod,
        dueDate,
        asOfDate: new Date().toISOString().split("T")[0],
        phase: "MANUAL_NUDGE",
        portfolioCompanyId: id,
        analystMessage,
        analystUserId: user.id || user.userId || null,
        mandatoryAttachments: nudgeAttachments,
      });

      return res.status(200).json({ success: true, message: "Nudge sent", data: result });
    } catch (error: any) {
      next(error);
    }
  }

  static async openReportingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { reportingPeriod, dueDate, phase } = req.body || {};
      if (!reportingPeriod || !dueDate) {
        return res.status(400).json({ success: false, message: "reportingPeriod and dueDate are required" });
      }

      const effectivePhase = String(phase || "REQUEST").toUpperCase();
      const periodDate = new Date(reportingPeriod);
      if (Number.isNaN(periodDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid reportingPeriod; use YYYY-MM-DD" });
      }
      const reportingIso = periodDate.toISOString().split("T")[0];

      if (effectivePhase === "REQUEST") {
        const already = await ReportingCalendarService.isReportingCalendarPeriodAlreadyOpen(reportingIso);
        if (already) {
          return res.status(409).json({
            success: false,
            message:
              "This reporting period is already on the calendar. You cannot open more than one reporting calendar for the same period.",
            data: { reportingPeriod: reportingIso },
          });
        }
      }

      let attachmentList: ReportingMandatoryAttachment[] | null = null;
      const optionIds = req.body?.attachmentOptionIds;

      if (Array.isArray(optionIds) && optionIds.length > 0) {
        attachmentList = resolveMandatoryAttachmentsFromOptionIds(optionIds);
        if (!attachmentList) {
          return res.status(400).json({
            success: false,
            message:
              "attachmentOptionIds must be non-empty and each value must be a valid id from GET /api/portfolio-companies/reporting/mandatory-attachment-options",
          });
        }
      } else if (effectivePhase === "REQUEST") {
        attachmentList = parseMandatoryAttachmentsInput(req.body?.mandatoryAttachments, { required: true });
        if (!attachmentList) {
          return res.status(400).json({
            success: false,
            message:
              "When opening the calendar (REQUEST), send either attachmentOptionIds (multi-select catalog ids) or mandatoryAttachments (non-empty { name, formats }[]). GET .../reporting/mandatory-attachment-options for ids.",
          });
        }
      } else {
        attachmentList =
          parseMandatoryAttachmentsInput(req.body?.mandatoryAttachments, { required: false }) ||
          [...MANDATORY_REPORTING_ATTACHMENTS];
      }

      const result = await ReportingReminderService.run({
        reportingPeriod: reportingIso,
        dueDate,
        asOfDate: new Date().toISOString().split("T")[0],
        phase: effectivePhase as any,
        mandatoryAttachments: attachmentList!,
      });

      return res.status(200).json({
        success: true,
        message:
          "Request for data sent: emails dispatched to eligible portfolio companies; investees see this period as open in the portal.",
        data: result,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /** Investor: selectable rows for mandatory-attachment multi-select (open calendar, nudge). */
  static async getMandatoryAttachmentOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      return res.status(200).json({
        success: true,
        data: { options: [...REPORTING_MANDATORY_ATTACHMENT_OPTIONS] },
      });
    } catch (error: any) {
      next(error);
    }
  }

  /** Investor: full reporting calendar list (periods + notification + submission snapshot). */
  static async getReportingCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
      const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
      const data = await ReportingCalendarService.listCalendarPeriods({
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      next(error);
    }
  }

  /** Investor: one period — due date, portal link, mandatory doc list, sample sent email from DB. */
  static async getReportingCalendarPeriodDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const rp =
        typeof req.query.reportingPeriod === "string" && req.query.reportingPeriod.trim()
          ? req.query.reportingPeriod.trim()
          : "";
      if (!rp) {
        return res.status(400).json({ success: false, message: "reportingPeriod query (YYYY-MM-DD) is required" });
      }
      const data = await ReportingCalendarService.getPeriodDetail(rp);
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      if (error?.message?.includes("Invalid reportingPeriod")) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  // Delete portfolio company
  static async deletePortfolioCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await PortfolioCompanyService.deletePortfolioCompany(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      next(error);
    }
  }

  /** Letterhead CRUD for one portfolio company (not report-scoped); any authenticated user. */
  static async getPortfolioCompanyLetterhead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await PortfolioCompanyLetterheadService.ensurePortfolioCompanyExists(id);
      const data = await PortfolioCompanyLetterheadService.getByPortfolioCompanyId(id);
      return res.status(200).json({ success: true, data: data ?? null });
    } catch (error: any) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  static async upsertPortfolioCompanyLetterhead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await PortfolioCompanyLetterheadService.ensurePortfolioCompanyExists(id);
      const payload = PortfolioCompanyLetterheadService.pickUpsertPayload(req.body || {});
      const data = await PortfolioCompanyLetterheadService.upsert(id, payload);
      return res.status(200).json({
        success: true,
        message: "Portfolio company letterhead saved",
        data,
      });
    } catch (error: any) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  static async deletePortfolioCompanyLetterhead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await PortfolioCompanyLetterheadService.ensurePortfolioCompanyExists(id);
      const deleted = await PortfolioCompanyLetterheadService.deleteForPortfolioCompany(id);
      return res.status(200).json({
        success: true,
        message: deleted ? "Letterhead removed" : "No letterhead record existed",
        deleted: deleted > 0,
      });
    } catch (error: any) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  static async uploadPortfolioCompanyLetterheadLogo(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await PortfolioCompanyLetterheadService.ensurePortfolioCompanyExists(id);
      const file = (req as any).file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "logo file is required (multipart field: logo)" });
      }
      const upload = await new RemoteUploadService().uploadFiles(file, "portfolio-company-letterhead-logos");
      if (!upload?.success || !upload.files?.length) {
        return res.status(400).json({ success: false, message: upload?.error || "Logo upload failed" });
      }
      const logoUrl = upload.files[0].url;
      const data = await PortfolioCompanyLetterheadService.setLogoUrl(id, logoUrl);
      return res.status(200).json({
        success: true,
        message: "Logo uploaded",
        data: { logoUrl, letterhead: data },
      });
    } catch (error: any) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      next(error);
    }
  }
}

export const portfolioCompanyController = new PortfolioCompanyController();
