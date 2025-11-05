// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { ApplicantPortalService } from "../services/ApplicantPortalService";
import { ResponseHelper } from "../utils/responseHelper";

export class ApplicantPortalController {
  /**
   * Get applicant profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      if (!user) {
        return ResponseHelper.error(res, "User not found in request", undefined, 401);
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
        return ResponseHelper.error(res, "User ID not found in request", undefined, 401);
      }
      
      const updateData = req.body;
      const updatedCompany = await ApplicantPortalService.updateApplicantCompany(userId, updateData);
      
      return ResponseHelper.success(res, "Company updated successfully", updatedCompany);
    } catch (error) {
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
}

export const applicantPortalController = new ApplicantPortalController();
