// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { promises as fs } from "fs";
import path from "path";
import { ApplicantPortalService } from "../services/ApplicantPortalService";
import { ResponseHelper } from "../utils/responseHelper";
import { prisma } from "../utils/database";
import { FinancialReportService } from "../services/FinancialReportService";

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

      if (!req.file) {
        return ResponseHelper.error(res, "Financial report file is required", undefined, 400);
      }

      // Validate file extension (accept .xlsx and .csv)
      const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
      if (!fileExtension || !['xlsx', 'csv'].includes(fileExtension)) {
        return ResponseHelper.error(res, "Invalid file type. Only .xlsx and .csv files are allowed", undefined, 400);
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
        reportType,
        periodType,
        periodStart,
        periodEnd,
        title,
        description,
        templateVersion
      } = req.body;

      if (!reportType || !periodType || !periodStart || !periodEnd || !title) {
        return ResponseHelper.error(res, "Missing required fields", undefined, 400);
      }

      const createResult = await FinancialReportService.createReport({
        portfolioCompanyId: portfolioCompany.id,
        submittedById: userId,
        reportType,
        periodType,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        title,
        description,
        templateVersion,
        fileBuffer: req.file.buffer,
        originalFileName: req.file.originalname
      });

      return ResponseHelper.success(res, "Financial report submitted successfully", createResult, 201);
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

      const { periodStart, periodEnd, totalRevenue, netProfit, cashFlowNet } = req.body;

      if (!periodStart || !periodEnd) {
        return ResponseHelper.error(res, "periodStart and periodEnd are required", undefined, 400);
      }

      const savedKPIs = await FinancialReportService.savePeriodKPIs({
        portfolioCompanyId: portfolioCompany.id,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalRevenue,
        netProfit,
        cashFlowNet
      });

      return ResponseHelper.success(res, "Period KPIs saved successfully", savedKPIs, 200);
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

      const reports = await FinancialReportService.listReportsForApplicant(userId);
      return ResponseHelper.success(res, "Financial reports retrieved successfully", reports);
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
        return res.status(400).json({ success: false, message: 'Provide reportId or reportIds in the request body' });
      }

      await FinancialReportService.submitDrafts(reportIds, user.id || user.userId);

      return res.status(200).json({ success: true, message: 'Financial report(s) submitted for review' });
    } catch (error: any) {
      next(error);
    }
  }
}

export const applicantPortalController = new ApplicantPortalController();
