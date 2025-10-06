// @ts-nocheck
import { Request, Response } from "express";
import { ApprovalWorkflowService } from "../services/ApprovalWorkflowService";

export class ApprovalWorkflowController {
  /**
   * Create a new approval workflow
   */
  static async createApprovalWorkflow(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        module,
        entityType,
        steps
      } = req.body;

      const createdById = req.user?.id;

      if (!createdById) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!name || !module || !entityType || !steps || steps.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Name, module, entityType, and steps are required"
        });
      }

      const workflow = await ApprovalWorkflowService.createApprovalWorkflow({
        name,
        description,
        module,
        entityType,
        createdById,
        steps
      });

      res.status(201).json({
        success: true,
        message: "Approval workflow created successfully",
        data: workflow
      });
    } catch (error: any) {
      console.error("Error creating approval workflow:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create approval workflow"
      });
    }
  }

  /**
   * Get all approval workflows
   */
  static async getAllApprovalWorkflows(req: Request, res: Response) {
    try {
      const { module, entityType } = req.query;

      const workflows = await ApprovalWorkflowService.getAllApprovalWorkflows(
        module as string,
        entityType as string
      );

      res.status(200).json({
        success: true,
        message: "Approval workflows retrieved successfully",
        data: workflows
      });
    } catch (error: any) {
      console.error("Error getting approval workflows:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get approval workflows"
      });
    }
  }

  /**
   * Get approval workflow by ID
   */
  static async getApprovalWorkflowById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const workflow = await ApprovalWorkflowService.getApprovalWorkflowById(id);

      res.status(200).json({
        success: true,
        message: "Approval workflow retrieved successfully",
        data: workflow
      });
    } catch (error: any) {
      console.error("Error getting approval workflow:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get approval workflow"
      });
    }
  }

  /**
   * Create an approval request
   */
  static async createApprovalRequest(req: Request, res: Response) {
    try {
      const {
        workflowId,
        entityType,
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

      if (!workflowId || !entityType || !entityId) {
        return res.status(400).json({
          success: false,
          message: "WorkflowId, entityType, and entityId are required"
        });
      }

      const request = await ApprovalWorkflowService.createApprovalRequest({
        workflowId,
        entityType,
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
      const { requestId, stepId } = req.params;
      const { status, comments, delegatedToId } = req.body;

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

      const approval = await ApprovalWorkflowService.processApproval({
        requestId,
        stepId,
        approverId,
        status,
        comments,
        delegatedToId
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

      const requests = await ApprovalWorkflowService.getApprovalRequestsForUser(
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

  /**
   * Get workflow by module and entity type
   */
  static async getWorkflowByModuleAndEntity(req: Request, res: Response) {
    try {
      const { module, entityType } = req.params;

      const workflow = await ApprovalWorkflowService.getWorkflowByModuleAndEntity(
        module,
        entityType
      );

      if (!workflow) {
        return res.status(404).json({
          success: false,
          message: "No active workflow found for this module and entity type"
        });
      }

      res.status(200).json({
        success: true,
        message: "Workflow retrieved successfully",
        data: workflow
      });
    } catch (error: any) {
      console.error("Error getting workflow:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get workflow"
      });
    }
  }
}
