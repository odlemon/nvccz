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
      const normalizedType = (reportType || '').toUpperCase();
      const templateMap: Record<string, string> = {
        BALANCE_SHEET: 'balance_sheet_template.csv',
        INCOME_STATEMENT: 'income_statement_template.csv',
        CASHFLOW_STATEMENT: 'cashflow_statement_template.csv'
      };

      const fileName = templateMap[normalizedType];
      if (!fileName) {
        return ResponseHelper.error(res, "Unknown report type", undefined, 400);
      }

      const filePath = path.join(process.cwd(), 'templates', 'financial-reports', fileName);
      const fileBuffer = await fs.readFile(filePath);

      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send(fileBuffer);
    } catch (error: any) {
      next(error);
    }
  }
}

export const applicantPortalController = new ApplicantPortalController();
