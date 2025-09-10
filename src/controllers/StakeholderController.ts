// @ts-nocheck
import { Request, Response } from "express";
import { StakeholderService } from "../services/StakeholderService";
import { responseHelper } from "../utils/responseHelper";

export class StakeholderController {
  // ===== STAKEHOLDER CRUD OPERATIONS =====

  static async createStakeholder(req: Request, res: Response) {
    try {
      const {
        stakeholderId,
        type,
        legalName,
        email,
        phone,
        address,
        country,
        organizationName,
        industry,
        taxId,
        registrationNumber,
        totalCommitment,
        currency,
        investmentFocus,
        riskTolerance,
        relationshipManagerId,
        relationshipStartDate,
        contactFrequency,
        preferredContactMethod
      } = req.body;

      const request = {
        stakeholderId,
        type,
        legalName,
        email,
        phone,
        address,
        country,
        organizationName,
        industry,
        taxId,
        registrationNumber,
        totalCommitment,
        currency,
        investmentFocus,
        riskTolerance,
        relationshipManagerId,
        relationshipStartDate,
        contactFrequency,
        preferredContactMethod
      };

      const stakeholder = await StakeholderService.createStakeholder(request);
      
      return responseHelper.success(res, stakeholder, "Stakeholder created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getAllStakeholders(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const filters: any = {};
      
      if (req.query.type) {
        filters.type = req.query.type as string;
      }
      
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      
      if (req.query.relationshipManagerId) {
        filters.relationshipManagerId = req.query.relationshipManagerId as string;
      }
      
      if (req.query.search) {
        filters.search = req.query.search as string;
      }

      const result = await StakeholderService.getAllStakeholders(page, limit, filters);
      
      return responseHelper.success(res, result, "Stakeholders retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getStakeholderById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const stakeholder = await StakeholderService.getStakeholderById(id);
      
      return responseHelper.success(res, stakeholder, "Stakeholder retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getStakeholderByStakeholderId(req: Request, res: Response) {
    try {
      const { stakeholderId } = req.params;
      
      const stakeholder = await StakeholderService.getStakeholderByStakeholderId(stakeholderId);
      
      return responseHelper.success(res, stakeholder, "Stakeholder retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async updateStakeholder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        type,
        legalName,
        email,
        phone,
        address,
        country,
        organizationName,
        industry,
        taxId,
        registrationNumber,
        totalCommitment,
        currency,
        investmentFocus,
        riskTolerance,
        relationshipManagerId,
        relationshipStartDate,
        contactFrequency,
        preferredContactMethod,
        relationshipStatus,
        status,
        isActive
      } = req.body;

      const request = {
        type,
        legalName,
        email,
        phone,
        address,
        country,
        organizationName,
        industry,
        taxId,
        registrationNumber,
        totalCommitment,
        currency,
        investmentFocus,
        riskTolerance,
        relationshipManagerId,
        relationshipStartDate,
        contactFrequency,
        preferredContactMethod,
        relationshipStatus,
        status,
        isActive
      };

      const stakeholder = await StakeholderService.updateStakeholder(id, request);
      
      return responseHelper.success(res, stakeholder, "Stakeholder updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async deleteStakeholder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await StakeholderService.deleteStakeholder(id);
      
      return responseHelper.success(res, result, "Stakeholder deleted successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== STAKEHOLDER ONBOARDING OPERATIONS =====

  static async createStakeholderOnboarding(req: Request, res: Response) {
    try {
      const {
        stakeholderId,
        stage,
        initiatedBy,
        assignedTo,
        startDate,
        expectedCompletionDate,
        requiredDocuments,
        notes,
        internalNotes
      } = req.body;

      const request = {
        stakeholderId,
        stage,
        initiatedBy,
        assignedTo,
        startDate,
        expectedCompletionDate,
        requiredDocuments,
        notes,
        internalNotes
      };

      const onboarding = await StakeholderService.createStakeholderOnboarding(request);
      
      return responseHelper.success(res, onboarding, "Stakeholder onboarding created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async updateStakeholderOnboarding(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        stage,
        status,
        assignedTo,
        startDate,
        completedDate,
        expectedCompletionDate,
        requiredDocuments,
        submittedDocuments,
        kycStatus,
        complianceStatus,
        notes,
        internalNotes
      } = req.body;

      const request = {
        stage,
        status,
        assignedTo,
        startDate,
        completedDate,
        expectedCompletionDate,
        requiredDocuments,
        submittedDocuments,
        kycStatus,
        complianceStatus,
        notes,
        internalNotes
      };

      const onboarding = await StakeholderService.updateStakeholderOnboarding(id, request);
      
      return responseHelper.success(res, onboarding, "Stakeholder onboarding updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== STAKEHOLDER ENGAGEMENT OPERATIONS =====

  static async createStakeholderEngagement(req: Request, res: Response) {
    try {
      const {
        stakeholderId,
        engagementType,
        subject,
        description,
        duration,
        satisfaction,
        followUpRequired,
        followUpDate,
        initiatedBy,
        participants,
        outcome,
        nextSteps,
        actionItems
      } = req.body;

      const request = {
        stakeholderId,
        engagementType,
        subject,
        description,
        duration,
        satisfaction,
        followUpRequired,
        followUpDate,
        initiatedBy,
        participants,
        outcome,
        nextSteps,
        actionItems
      };

      const engagement = await StakeholderService.createStakeholderEngagement(request);
      
      return responseHelper.success(res, engagement, "Stakeholder engagement created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== STAKEHOLDER ANALYTICS =====

  static async getStakeholderAnalytics(req: Request, res: Response) {
    try {
      const analytics = await StakeholderService.getStakeholderAnalytics();
      
      return responseHelper.success(res, analytics, "Stakeholder analytics retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }
}
