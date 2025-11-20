//@ts-nocheck
import { Request, Response } from 'express';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { InvestmentImplementationService } from '../services/InvestmentImplementationService';
import { PrismaClient } from '@prisma/client';

import { prisma } from '../utils/database';

export class InvestmentImplementationController {
  /**
   * Get applications with signed term sheets
   */
  static async getApplicationsWithSignedTermSheets(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await InvestmentImplementationService.getApplicationsWithSignedTermSheets(page, limit);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Initiate investment implementation
   */
  static async initiateInvestmentImplementation(req: Request, res: Response) {
    try {
      const { portfolioCompanyId, applicationId, fundId, implementationPlan, notes, disbursementMode, totalCommittedAmount } = req.body;
      const initiatedById = (req as any).user.id;

      const implementation = await InvestmentImplementationService.initiateInvestmentImplementation({
        portfolioCompanyId,
        applicationId,
        fundId, // Required - must link to a fund
        initiatedById,
        implementationPlan,
        notes,
        disbursementMode, // ONE_TIME or MILESTONE_BASED
        totalCommittedAmount // Required if MILESTONE_BASED
      });

      // Send investment implementation started email notification
      try {
        // Get application details for email
        const application = await prisma.application.findUnique({
          where: { id: applicationId },
          select: {
            applicantName: true,
            applicantEmail: true,
            businessName: true,
            id: true
          }
        });

        if (application) {
          await EmailNotificationService.sendInvestmentImplementationStartedEmail({
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            businessName: application.businessName,
            applicationId: application.id,
            currentStage: 'INVESTMENT_IMPLEMENTATION'
          });
          console.log("Investment implementation started email sent successfully", {
            applicationId: application.id,
            applicantEmail: application.applicantEmail
          });
        }
      } catch (emailError) {
        console.error("Failed to send investment implementation started email", {
          applicationId,
          error: emailError.message
        });
        // Don't fail the implementation initiation if email fails
      }

      res.status(201).json({
        success: true,
        data: implementation,
        message: "Investment implementation initiated successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get investment implementation by portfolio company ID
   */
  static async getInvestmentImplementationByPortfolioCompanyId(req: Request, res: Response) {
    try {
      const { portfolioCompanyId } = req.params;

      const implementation = await InvestmentImplementationService.getInvestmentImplementationByPortfolioCompanyId(portfolioCompanyId);

      if (!implementation) {
        return res.status(404).json({
          success: false,
          message: "Investment implementation not found"
        });
      }

      res.status(200).json({
        success: true,
        data: implementation
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update implementation checklist
   */
  static async updateImplementationChecklist(req: Request, res: Response) {
    try {
      const { portfolioCompanyId } = req.params;
      const { finalDueDiligence, contractsSigned, fundsDisbursed, notes } = req.body;

      const implementation = await InvestmentImplementationService.updateImplementationChecklist(
        portfolioCompanyId,
        {
          finalDueDiligence,
          contractsSigned,
          fundsDisbursed,
          notes
        }
      );

      res.status(200).json({
        success: true,
        data: implementation,
        message: "Implementation checklist updated successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Add milestone to implementation
   */
  static async addMilestone(req: Request, res: Response) {
    try {
      const { portfolioCompanyId } = req.params;
      const { title, description, amount, dueDate, deliverables } = req.body;

      const milestone = await InvestmentImplementationService.addMilestone(
        portfolioCompanyId,
        {
          title,
          description,
          amount,
          dueDate: new Date(dueDate),
          deliverables
        }
      );

      res.status(201).json({
        success: true,
        data: milestone,
        message: "Milestone added successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Complete milestone
   */
  static async completeMilestone(req: Request, res: Response) {
    try {
      const { milestoneId } = req.params;
      const { notes } = req.body;

      const milestone = await InvestmentImplementationService.completeMilestone(milestoneId, notes);

      res.status(200).json({
        success: true,
        data: milestone,
        message: "Milestone completed successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get disbursement summary for an investment implementation
   */
  static async getDisbursementSummary(req: Request, res: Response) {
    try {
      const { investmentImplementationId } = req.params;

      const summary = await InvestmentImplementationService.getDisbursementSummary(investmentImplementationId);

      res.status(200).json({
        success: true,
        data: summary,
        message: "Disbursement summary retrieved successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Create fund disbursement
   */
  static async createFundDisbursement(req: Request, res: Response) {
    try {
      const { investmentImplementationId, milestoneId, amount, disbursementDate, disbursementType, notes } = req.body;

      const disbursement = await InvestmentImplementationService.createFundDisbursement({
        investmentImplementationId,
        milestoneId,
        amount,
        disbursementDate: new Date(disbursementDate),
        disbursementType,
        notes
      });

      res.status(201).json({
        success: true,
        data: disbursement,
        message: "Fund disbursement created successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Approve fund disbursement
   */
  static async approveFundDisbursement(req: Request, res: Response) {
    try {
      const { disbursementId } = req.params;
      const approvedById = (req as any).user.id;

      const disbursement = await InvestmentImplementationService.approveFundDisbursement(
        disbursementId,
        approvedById
      );

      res.status(200).json({
        success: true,
        data: disbursement,
        message: "Fund disbursement approved successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mark disbursement as disbursed
   */
  static async markDisbursementAsDisbursed(req: Request, res: Response) {
    try {
      const { disbursementId } = req.params;
      const { transactionReference } = req.body;
      const disbursedById = (req as any).user.id;

      const disbursement = await InvestmentImplementationService.markDisbursementAsDisbursed(
        disbursementId,
        disbursedById,
        transactionReference
      );

      // Send disbursement completed email notification
      try {
        // Get application details for email through investment implementation
        const investmentImplementation = await prisma.investmentImplementation.findUnique({
          where: { id: disbursement.investmentImplementationId },
          select: {
            application: {
              select: {
                applicantName: true,
                applicantEmail: true,
                businessName: true,
                id: true,
                currentStage: true
              }
            }
          }
        });

        const application = investmentImplementation?.application;

        if (application) {
          await EmailNotificationService.sendDisbursementCompletedEmail({
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            businessName: application.businessName,
            applicationId: application.id,
            currentStage: application.currentStage,
            disbursementAmount: disbursement.amount.toNumber(),
            transactionReference: transactionReference
          });
          console.log("Disbursement completed email sent successfully", {
            applicationId: application.id,
            applicantEmail: application.applicantEmail
          });
        }
      } catch (emailError) {
        console.error("Failed to send disbursement completed email", {
          disbursementId,
          error: emailError.message
        });
      }

      res.status(200).json({
        success: true,
        data: disbursement,
        message: "Fund disbursement marked as disbursed successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get all investment implementations (for admin/fund manager)
   */
  static async getAllInvestmentImplementations(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const result = await InvestmentImplementationService.getAllInvestmentImplementations(page, limit, status);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}
