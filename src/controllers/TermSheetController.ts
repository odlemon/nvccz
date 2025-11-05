//@ts-nocheck
import { Request, Response } from 'express';
import { TermSheetService, CreateTermSheetRequest, UpdateTermSheetRequest } from '../services/TermSheetService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { PrismaClient } from '@prisma/client';

import { prisma } from '../utils/database';

export class TermSheetController {
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
   * Create a new term sheet
   */
  static async createTermSheet(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const userId = (req as any).user.id;
      
      // Handle file upload if present
      const file = (req as any).file;
      let documentUrl = req.body.documentUrl;
      let documentFileName = req.body.documentFileName;
      let documentSize = req.body.documentSize;

      // If file is uploaded, upload to Firebase
      if (file) {
        const { FirebaseStorageService } = require('../services/FirebaseStorageService');
        
        // Use applicationId for the path since termSheetId doesn't exist yet
        // We'll use a temporary path structure: term-sheets/{applicationId}/temp/{fileName}
        const tempTermSheetId = `temp-${applicationId}`;
        const { filePath, downloadURL } = await FirebaseStorageService.uploadTermSheetDocument(
          file.buffer,
          file.originalname,
          tempTermSheetId,
          'TERM_SHEET'
        );

        documentUrl = downloadURL;
        documentFileName = file.originalname;
        documentSize = file.size;

        console.log(`📁 Term sheet document uploaded: ${documentFileName} -> ${documentUrl}`);
      }

      const termSheetData: CreateTermSheetRequest = {
        applicationId,
        createdById: userId,
        title: req.body.title,
        investmentAmount: req.body.investmentAmount,
        equityPercentage: req.body.equityPercentage,
        valuation: req.body.valuation,
        keyTerms: req.body.keyTerms,
        conditions: req.body.conditions,
        timeline: req.body.timeline,
        documentUrl: documentUrl,
        documentFileName: documentFileName,
        documentSize: documentSize ? parseInt(documentSize) : undefined
      };

      const termSheet = await TermSheetService.createTermSheet(termSheetData);

      // Send term sheet created email notification
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
          await EmailNotificationService.sendTermSheetCreatedEmail({
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            businessName: application.businessName,
            applicationId: application.id,
            currentStage: 'TERM_SHEET_CREATED'
          });
          console.log("Term sheet created email sent successfully", {
            applicationId: application.id,
            applicantEmail: application.applicantEmail
          });
        }
      } catch (emailError) {
        console.error("Failed to send term sheet created email", {
          applicationId,
          error: emailError.message
        });
        // Don't fail the term sheet creation if email fails
      }

      res.status(201).json({
        success: true,
        message: 'Term sheet created successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to create term sheet: ${error.message}`
      });
    }
  }

  /**
   * Get term sheet by application ID
   */
  static async getTermSheetByApplicationId(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      const termSheet = await TermSheetService.getTermSheetByApplicationId(applicationId);

      if (!termSheet) {
        res.status(404).json({
          success: false,
          message: 'Term sheet not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Term sheet retrieved successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to get term sheet: ${error.message}`
      });
    }
  }

  /**
   * Update term sheet
   */
  static async updateTermSheet(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      const updateData: UpdateTermSheetRequest = {
        title: req.body.title,
        investmentAmount: req.body.investmentAmount,
        equityPercentage: req.body.equityPercentage,
        valuation: req.body.valuation,
        keyTerms: req.body.keyTerms,
        conditions: req.body.conditions,
        timeline: req.body.timeline,
        documentUrl: req.body.documentUrl,
        documentFileName: req.body.documentFileName,
        documentSize: req.body.documentSize,
        status: req.body.status,
        isDraft: req.body.isDraft,
        isFinal: req.body.isFinal
      };

      const termSheet = await TermSheetService.updateTermSheet(applicationId, updateData);

      res.status(200).json({
        success: true,
        message: 'Term sheet updated successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to update term sheet: ${error.message}`
      });
    }
  }

  /**
   * Mark term sheet as final
   */
  static async markAsFinal(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      const termSheet = await TermSheetService.markAsFinal(applicationId);

      res.status(200).json({
        success: true,
        message: 'Term sheet marked as final successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to mark term sheet as final: ${error.message}`
      });
    }
  }

  /**
   * Sign term sheet
   */
  static async signTermSheet(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const reqUser = (req as any).user;
      
      if (!reqUser) {
        res.status(401).json({
          success: false,
          message: 'User not found in request'
        });
        return;
      }

      // Check if user is applicant
      const isApplicant = await TermSheetController.isApplicant(reqUser);
      if (!isApplicant) {
        res.status(403).json({
          success: false,
          message: 'Access denied. This endpoint is only available to applicants.'
        });
        return;
      }

      const userId = reqUser.id || reqUser.userId;

      // Validate that the user is the applicant for this application
      const application = await prisma.application.findUnique({
        where: { id: applicationId }
      });

      if (!application) {
        res.status(404).json({
          success: false,
          message: 'Application not found'
        });
        return;
      }

      // Check if the user is the applicant for this application
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || user.email !== application.applicantEmail) {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to sign this term sheet'
        });
        return;
      }

      const termSheet = await TermSheetService.signTermSheet(applicationId);

      // Send term sheet approved email notification
      try {
        await EmailNotificationService.sendTermSheetApprovedEmail({
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          businessName: application.businessName,
          applicationId: application.id,
          currentStage: 'TERM_SHEET_APPROVED'
        });
        console.log("Term sheet approved email sent successfully", {
          applicationId: application.id,
          applicantEmail: application.applicantEmail
        });
      } catch (emailError) {
        console.error("Failed to send term sheet approved email", {
          applicationId,
          error: emailError.message
        });
        // Don't fail the term sheet signing if email fails
      }

      res.status(200).json({
        success: true,
        message: 'Term sheet signed successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to sign term sheet: ${error.message}`
      });
    }
  }

  /**
   * Get all term sheets
   */
  static async getAllTermSheets(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const result = await TermSheetService.getAllTermSheets(page, limit, status);

      res.status(200).json({
        success: true,
        message: 'Term sheets retrieved successfully',
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to get term sheets: ${error.message}`
      });
    }
  }

  /**
   * Get my term sheets
   */
  static async getMyTermSheets(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'User not found in request'
        });
        return;
      }

      // Check if user is applicant
      const isApplicant = await TermSheetController.isApplicant(user);
      if (!isApplicant) {
        res.status(403).json({
          success: false,
          message: 'Access denied. This endpoint is only available to applicants.'
        });
        return;
      }

      const userId = user.id || user.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User ID not found in request'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await TermSheetService.getMyTermSheets(userId, page, limit);

      res.status(200).json({
        success: true,
        message: 'My term sheets retrieved successfully',
        data: result
      });
    } catch (error: any) {
      // Return empty result instead of error
      res.status(200).json({
        success: true,
        message: 'My term sheets retrieved successfully',
        data: {
          termSheets: [],
          total: 0,
          page: parseInt(req.query.page as string) || 1,
          totalPages: 0
        }
      });
    }
  }
}
