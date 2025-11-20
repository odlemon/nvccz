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

      // Only include fields that are actually provided in the request body
      // Note: Signature fields are NOT allowed in updates (signatures are immutable)
      const updateData: UpdateTermSheetRequest = {};
      
      if (req.body && typeof req.body === 'object') {
        // Reject any signature-related fields
        if (req.body.applicantSignatureUrl || req.body.investorSignatureUrl || 
            req.body.applicantSignatureFileName || req.body.investorSignatureFileName ||
            req.body.applicantSignedById || req.body.investorSignedById ||
            req.body.applicantSignedAt || req.body.investorSignedAt) {
          res.status(400).json({
            success: false,
            message: 'Signature fields cannot be updated. Signatures are immutable once uploaded.'
          });
          return;
        }

        if (req.body.title !== undefined) updateData.title = req.body.title;
        if (req.body.investmentAmount !== undefined) updateData.investmentAmount = req.body.investmentAmount;
        if (req.body.equityPercentage !== undefined) updateData.equityPercentage = req.body.equityPercentage;
        if (req.body.valuation !== undefined) updateData.valuation = req.body.valuation;
        if (req.body.keyTerms !== undefined) updateData.keyTerms = req.body.keyTerms;
        if (req.body.conditions !== undefined) updateData.conditions = req.body.conditions;
        if (req.body.timeline !== undefined) updateData.timeline = req.body.timeline;
        if (req.body.documentUrl !== undefined) updateData.documentUrl = req.body.documentUrl;
        if (req.body.documentFileName !== undefined) updateData.documentFileName = req.body.documentFileName;
        if (req.body.documentSize !== undefined) updateData.documentSize = req.body.documentSize;
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.isDraft !== undefined) updateData.isDraft = req.body.isDraft;
        if (req.body.isFinal !== undefined) updateData.isFinal = req.body.isFinal;
      }

      // Check if any fields were provided
      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No update fields provided'
        });
        return;
      }

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
   * Sign term sheet with signature
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

      // Check if user is applicant or investor/admin
      const isApplicant = await TermSheetController.isApplicant(reqUser);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true }
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Determine signature type based on user
      let signatureType: 'applicant' | 'investor';
      if (isApplicant && user.email === application.applicantEmail) {
        signatureType = 'applicant';
      } else if (user.role?.name === 'admin' || user.role?.name === 'fund_manager') {
        signatureType = 'investor';
      } else {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to sign this term sheet'
        });
        return;
      }

      // Get signature file from request
      const signatureFile = (req as any).file;
      if (!signatureFile) {
        res.status(400).json({
          success: false,
          message: 'Signature file is required'
        });
        return;
      }

      // Validate file type (must be image)
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(signatureFile.mimetype.toLowerCase())) {
        res.status(400).json({
          success: false,
          message: 'Signature must be an image file (PNG, JPEG, JPG, GIF, or WEBP)'
        });
        return;
      }

      const termSheet = await TermSheetService.signTermSheet(
        applicationId,
        userId,
        signatureType,
        {
          buffer: signatureFile.buffer,
          fileName: signatureFile.originalname,
          mimetype: signatureFile.mimetype
        }
      );

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
