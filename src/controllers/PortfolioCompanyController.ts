// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PortfolioCompanyService, CreatePortfolioCompanyRequest, UpdatePortfolioCompanyRequest, CreatePortfolioCompanyByAdminRequest } from "../services/PortfolioCompanyService";
import { EmailNotificationService } from "../services/EmailNotificationService";
import { FinancialReportService } from "../services/FinancialReportService";
import { FirebaseStorageService } from "../services/FirebaseStorageService";
import { PortfolioCompanyAccountingService } from "../services/PortfolioCompanyAccountingService";
import { parseDate } from "../utils/dateHelper";

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

      const reports = await FinancialReportService.listReportsForCompany(id);
      return res.status(200).json({ success: true, data: reports });
    } catch (error: any) {
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

      const { action, comment, mapping, totalRevenue, netProfit, cashFlowNet } = req.body;
      if (!action || !['ACCEPT', 'REJECT'].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid action" });
      }

      await FinancialReportService.reviewReport({
        reportId,
        reviewerId: user.id || user.userId,
        action,
        comment,
        mappingSnapshot: mapping || null,
        totalRevenue: totalRevenue !== undefined ? totalRevenue : null,
        netProfit: netProfit !== undefined ? netProfit : null,
        cashFlowNet: cashFlowNet !== undefined ? cashFlowNet : null
      });

      return res.status(200).json({ success: true, message: "Financial report review recorded" });
    } catch (error: any) {
      next(error);
    }
  }

  static async recordValuationAdjustment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const previousAmount = Number(req.body.previousAmount);
      const newAmount = Number(req.body.newAmount);

      if (!Number.isFinite(previousAmount) || !Number.isFinite(newAmount)) {
        return res.status(400).json({ success: false, message: "previousAmount and newAmount must be numeric" });
      }

      const result = await PortfolioCompanyAccountingService.recordValuationAdjustment({
        portfolioCompanyId: id,
        previousAmount,
        newAmount,
        valuationDate: req.body.valuationDate,
        approvedById: userId,
        notes: req.body.notes
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

      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount)) {
        return res.status(400).json({ success: false, message: "Dividend amount must be numeric" });
      }

      const result = await PortfolioCompanyAccountingService.recordDividend({
        portfolioCompanyId: id,
        amount,
        dividendDate: req.body.dividendDate,
        approvedById: userId,
        notes: req.body.notes
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
}

export const portfolioCompanyController = new PortfolioCompanyController();
