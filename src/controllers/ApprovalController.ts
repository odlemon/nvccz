// @ts-nocheck
import { Request, Response } from "express";
import { ApprovalService } from "../services/ApprovalService";

export class ApprovalController {
  /**
   * Get my pending approvals
   */
  static async getMyPendingApprovals(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const approvals = await ApprovalService.getMyPendingApprovals(userId);

      res.status(200).json({
        success: true,
        message: "Pending approvals retrieved successfully",
        data: approvals,
        count: approvals.length
      });
    } catch (error: any) {
      console.error("Error fetching pending approvals:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch pending approvals"
      });
    }
  }

  /**
   * Approve an approval
   */
  static async approveApproval(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { comments, signatureData } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await ApprovalService.approveApproval({
        approvalId: id,
        approverId: userId,
        comments,
        signatureData
      });

      res.status(200).json({
        success: true,
        message: "Approval approved successfully",
        data: result
      });
    } catch (error: any) {
      console.error("Error approving approval:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to approve approval"
      });
    }
  }

  /**
   * Reject an approval
   */
  static async rejectApproval(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { comments } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!comments) {
        return res.status(400).json({
          success: false,
          message: "Comments are required when rejecting an approval"
        });
      }

      const result = await ApprovalService.rejectApproval({
        approvalId: id,
        approverId: userId,
        comments
      });

      res.status(200).json({
        success: true,
        message: "Approval rejected successfully",
        data: result
      });
    } catch (error: any) {
      console.error("Error rejecting approval:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to reject approval"
      });
    }
  }
}


