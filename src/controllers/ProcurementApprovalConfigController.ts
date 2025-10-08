// @ts-nocheck
import { Request, Response } from "express";
import { ProcurementApprovalConfigService } from "../services/ProcurementApprovalConfigService";

export class ProcurementApprovalConfigController {
  /**
   * Create a new procurement approval configuration
   */
  static async createProcurementApprovalConfig(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        stages
      } = req.body;

      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!name || !stages || stages.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Name and stages are required"
        });
      }

      // Validate stage types
      const validStageTypes = ['PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'INVOICE', 'GRN'];
      for (const stage of stages) {
        if (!validStageTypes.includes(stage.stageType)) {
          return res.status(400).json({
            success: false,
            message: `Invalid stage type: ${stage.stageType}. Valid types are: ${validStageTypes.join(', ')}`
          });
        }
      }

      const config = await ProcurementApprovalConfigService.createProcurementApprovalConfig({
        name,
        description,
        createdById,
        stages
      });

      res.status(201).json({
        success: true,
        message: "Procurement approval configuration created successfully",
        data: config
      });
    } catch (error: any) {
      console.error("Error creating procurement approval configuration:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create procurement approval configuration"
      });
    }
  }

  /**
   * Get all procurement approval configurations
   */
  static async getAllProcurementApprovalConfigs(req: Request, res: Response) {
    try {
      const configs = await ProcurementApprovalConfigService.getAllProcurementApprovalConfigs();

      res.status(200).json({
        success: true,
        message: "Procurement approval configurations retrieved successfully",
        data: configs
      });
    } catch (error: any) {
      console.error("Error getting procurement approval configurations:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get procurement approval configurations"
      });
    }
  }

  /**
   * Get procurement approval configuration by ID
   */
  static async getProcurementApprovalConfigById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const config = await ProcurementApprovalConfigService.getProcurementApprovalConfigById(id);

      res.status(200).json({
        success: true,
        message: "Procurement approval configuration retrieved successfully",
        data: config
      });
    } catch (error: any) {
      console.error("Error getting procurement approval configuration:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get procurement approval configuration"
      });
    }
  }

  /**
   * Get active procurement approval configuration
   */
  static async getActiveProcurementApprovalConfig(req: Request, res: Response) {
    try {
      const config = await ProcurementApprovalConfigService.getActiveProcurementApprovalConfig();

      if (!config) {
        return res.status(404).json({
          success: false,
          message: "No active procurement approval configuration found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Active procurement approval configuration retrieved successfully",
        data: config
      });
    } catch (error: any) {
      console.error("Error getting active procurement approval configuration:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get active procurement approval configuration"
      });
    }
  }

  /**
   * Get approval steps for a specific stage type
   */
  static async getApprovalStepsForStage(req: Request, res: Response) {
    try {
      const { stageType } = req.params;

      const validStageTypes = ['PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'INVOICE', 'GRN'];
      if (!validStageTypes.includes(stageType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid stage type: ${stageType}. Valid types are: ${validStageTypes.join(', ')}`
        });
      }

      const steps = await ProcurementApprovalConfigService.getApprovalStepsForStage(stageType);

      res.status(200).json({
        success: true,
        message: `Approval steps for ${stageType} retrieved successfully`,
        data: steps
      });
    } catch (error: any) {
      console.error("Error getting approval steps for stage:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get approval steps for stage"
      });
    }
  }

  /**
   * Create an approval request for a specific stage
   */
  static async createApprovalRequest(req: Request, res: Response) {
    try {
      const {
        configId,
        stageType,
        entityId,
        entityData
      } = req.body;

      const requestedById = req.user?.id;

      if (!requestedById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!configId || !stageType || !entityId) {
        return res.status(400).json({
          success: false,
          message: "ConfigId, stageType, and entityId are required"
        });
      }

      const validStageTypes = ['PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'INVOICE', 'GRN'];
      if (!validStageTypes.includes(stageType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid stage type: ${stageType}. Valid types are: ${validStageTypes.join(', ')}`
        });
      }

      const request = await ProcurementApprovalConfigService.createApprovalRequest({
        configId,
        stageType,
        entityId,
        entityData,
        requestedById
      });

      res.status(201).json({
        success: true,
        message: "Approval request created successfully",
        data: request
      });
    } catch (error: any) {
      console.error("Error creating approval request:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create approval request"
      });
    }
  }

  /**
   * Process an approval (approve/reject)
   */
  static async processApproval(req: Request, res: Response) {
    try {
      const { requestId, stageId } = req.params;
      const { status, comments, delegatedToId, signatureData } = req.body;

      const approverId = req.user?.id;

      if (!approverId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be APPROVED or REJECTED"
        });
      }

      const approval = await ProcurementApprovalConfigService.processApproval({
        requestId,
        stageId,
        approverId,
        status,
        comments,
        delegatedToId,
        signatureData
      });

      res.status(200).json({
        success: true,
        message: `Approval ${status.toLowerCase()} successfully`,
        data: approval
      });
    } catch (error: any) {
      console.error("Error processing approval:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to process approval"
      });
    }
  }

  /**
   * Get approval requests for current user
   */
  static async getApprovalRequestsForUser(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const requests = await ProcurementApprovalConfigService.getApprovalRequestsForUser(
        userId,
        status as string
      );

      res.status(200).json({
        success: true,
        message: "Approval requests retrieved successfully",
        data: requests
      });
    } catch (error: any) {
      console.error("Error getting approval requests:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get approval requests"
      });
    }
  }
}
