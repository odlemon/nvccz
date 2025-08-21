// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PortfolioCompanyService, CreatePortfolioCompanyRequest, UpdatePortfolioCompanyRequest } from "../services/PortfolioCompanyService";

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
        foundingDate: new Date(req.body.foundingDate),
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
        socialMedia: req.body.socialMedia
      };

      const portfolioCompany = await PortfolioCompanyService.createPortfolioCompany(request);

      res.status(201).json({
        success: true,
        message: "Portfolio company created successfully",
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
        foundingDate: req.body.foundingDate ? new Date(req.body.foundingDate) : undefined,
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
        socialMedia: req.body.socialMedia
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
        foundingDate: req.body.foundingDate ? new Date(req.body.foundingDate) : undefined,
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
        socialMedia: req.body.socialMedia
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
