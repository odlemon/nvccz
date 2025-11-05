//@ts-nocheck
import { Request, Response } from 'express';
import { ApplicationService, CreateApplicationRequest, UpdateApplicationRequest } from '../services/ApplicationService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { ResponseHelper } from '../utils/responseHelper';
import { logger } from '../utils/logger';
import { FirebaseStorageService } from '../services/FirebaseStorageService';
import { prisma } from '../utils/database';

export class ApplicationController {
  /**
   * Create a new application (PUBLIC - no authentication required)
   */
  static async createApplication(req: Request, res: Response): Promise<void> {
    try {
      const {
        applicantName,
        applicantEmail,
        applicantPhone,
        applicantAddress,
        businessName,
        businessDescription,
        industry,
        businessStage,
        foundingDate,
        requestedAmount,
        fundId,
        documents
      } = req.body;

      // Validate required fields
      if (!applicantName || !applicantEmail || !businessName || !requestedAmount) {
        ResponseHelper.error(res, "Missing required fields: applicantName, applicantEmail, businessName, requestedAmount", undefined, 400);
        return;
      }

      const applicationParams: CreateApplicationRequest = {
        applicantName,
        applicantEmail,
        applicantPhone,
        applicantAddress,
        businessName,
        businessDescription,
        industry,
        businessStage,
        foundingDate: foundingDate ? new Date(foundingDate) : undefined,
        requestedAmount: Number(requestedAmount),
        fundId,
        documents: documents || []
      };

      const application = await ApplicationService.createApplication(applicationParams);

      // Send application received email notification
      try {
        await EmailNotificationService.sendApplicationReceivedEmail({
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          businessName: application.businessName,
          applicationId: application.id,
          currentStage: application.currentStage
        });
        logger.info("Application received email sent successfully", {
          applicationId: application.id,
          applicantEmail: application.applicantEmail
        });
      } catch (emailError) {
        logger.error("Failed to send application received email", {
          applicationId: application.id,
          error: emailError.message
        });
        // Don't fail the application creation if email fails
      }

      logger.info("Application created successfully", {
        applicationId: application.id,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail
      });

      ResponseHelper.success(res, "Application created successfully", application, 201);
    } catch (error: any) {
      logger.error("Error creating application", { error: error.message });
      ResponseHelper.error(res, `Failed to create application: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Upload application documents (PUBLIC - no authentication required)
   * Handles multipart/form-data file uploads and uploads to Firebase
   */
  static async uploadDocuments(req: Request, res: Response): Promise<void> {
    try {
      // Handle both single file and array of files
      const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
      const { applicationId, documentTypes } = req.body;

      if (!files || files.length === 0) {
        ResponseHelper.error(res, "No files uploaded", undefined, 400);
        return;
      }

      // Parse documentTypes if it's a string (JSON)
      let docTypes: string[] = [];
      if (documentTypes) {
        try {
          docTypes = typeof documentTypes === 'string' ? JSON.parse(documentTypes) : documentTypes;
        } catch (e) {
          ResponseHelper.error(res, "Invalid documentTypes format. Expected JSON array.", undefined, 400);
          return;
        }
      }

      if (docTypes.length !== files.length) {
        ResponseHelper.error(res, "Number of document types must match number of files", undefined, 400);
        return;
      }

      const uploadedDocuments = [];

      // If applicationId is provided, update existing application
      if (applicationId) {
        const application = await prisma.application.findUnique({
          where: { id: applicationId }
        });

        if (!application) {
          ResponseHelper.error(res, "Application not found", undefined, 404);
          return;
        }

        // Upload files to Firebase and create document records
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const documentType = docTypes[i] || 'OTHER';

          // Upload to Firebase
          const { filePath, downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
            file.buffer,
            file.originalname,
            applicationId,
            documentType
          );

          // Create document record
          const document = await prisma.applicationDocument.create({
            data: {
              applicationId: applicationId,
              documentType: documentType,
              fileName: file.originalname,
              fileUrl: downloadURL,
              fileSize: file.size,
              isRequired: ['BUSINESS_PLAN', 'PROOF_OF_CONCEPT', 'MARKET_RESEARCH', 'PROJECTED_CASH_FLOWS'].includes(documentType),
              isSubmitted: true
            }
          });

          uploadedDocuments.push({
            id: document.id,
            documentType: document.documentType,
            fileName: document.fileName,
            fileUrl: document.fileUrl,
            fileSize: document.fileSize
          });
        }

        ResponseHelper.success(res, "Documents uploaded successfully", {
          applicationId,
          documents: uploadedDocuments
        }, 201);
      } else {
        // If no applicationId, just upload files and return URLs
        // This allows frontend to upload files first, then create application
        const uploadedFiles = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const documentType = docTypes[i] || 'OTHER';
          
          // Generate temporary application ID for upload
          const tempId = `temp-${Date.now()}`;
          
          // Upload to Firebase
          const { filePath, downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
            file.buffer,
            file.originalname,
            tempId,
            documentType
          );

          uploadedFiles.push({
            documentType: documentType,
            fileName: file.originalname,
            fileUrl: downloadURL,
            fileSize: file.size,
            filePath: filePath
          });
        }

        ResponseHelper.success(res, "Documents uploaded successfully. Use these URLs when creating application.", {
          documents: uploadedFiles
        }, 201);
      }
    } catch (error: any) {
      logger.error("Error uploading documents", { error: error.message });
      ResponseHelper.error(res, `Failed to upload documents: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get application by ID (PROTECTED - admin/fund manager access)
   */
  static async getApplicationById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const application = await ApplicationService.getApplicationById(id);

      if (!application) {
        ResponseHelper.error(res, "Application not found", undefined, 404);
        return;
      }

      ResponseHelper.success(res, "Application retrieved successfully", application);
    } catch (error: any) {
      logger.error("Error getting application", { error: error.message });
      ResponseHelper.error(res, `Failed to get application: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get application status (PUBLIC - no authentication required)
   */
  static async getApplicationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const status = await ApplicationService.getApplicationStatus(id);

      ResponseHelper.success(res, "Application status retrieved successfully", status);
    } catch (error: any) {
      logger.error("Error getting application status", { error: error.message });
      ResponseHelper.error(res, `Failed to get application status: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update application (PROTECTED - admin/fund manager access)
   */
  static async updateApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const updateParams: UpdateApplicationRequest = {
        applicantName: updateData.applicantName,
        applicantEmail: updateData.applicantEmail,
        applicantPhone: updateData.applicantPhone,
        applicantAddress: updateData.applicantAddress,
        businessName: updateData.businessName,
        businessDescription: updateData.businessDescription,
        industry: updateData.industry,
        businessStage: updateData.businessStage,
        foundingDate: updateData.foundingDate ? new Date(updateData.foundingDate) : undefined,
        requestedAmount: updateData.requestedAmount ? Number(updateData.requestedAmount) : undefined,
        fundId: updateData.fundId
      };

      const application = await ApplicationService.updateApplication(id, updateParams);

      logger.info("Application updated successfully", {
        applicationId: application.id,
        updatedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Application updated successfully", application);
    } catch (error: any) {
      logger.error("Error updating application", { error: error.message });
      ResponseHelper.error(res, `Failed to update application: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Submit application (PUBLIC - no authentication required)
   */
  static async submitApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const application = await ApplicationService.submitApplication(id);

      logger.info("Application submitted successfully", {
        applicationId: application.id,
        businessName: application.businessName
      });

      ResponseHelper.success(res, "Application submitted successfully", application);
    } catch (error: any) {
      logger.error("Error submitting application", { error: error.message });
      ResponseHelper.error(res, `Failed to submit application: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Change application stage (PROTECTED - admin/fund manager access)
   */
  static async changeApplicationStage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { newStage, notes } = req.body;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      if (!newStage) {
        ResponseHelper.error(res, "New stage is required", undefined, 400);
        return;
      }

      const application = await ApplicationService.changeApplicationStage(id, newStage, notes);

      // Send stage-specific email notifications
      try {
        await this.sendStageSpecificEmail(application, newStage);
        logger.info("Stage-specific email sent successfully", {
          applicationId: application.id,
          newStage: newStage,
          applicantEmail: application.applicantEmail
        });
      } catch (emailError) {
        logger.error("Failed to send stage-specific email", {
          applicationId: application.id,
          newStage: newStage,
          error: emailError.message
        });
        // Don't fail the stage change if email fails
      }

      logger.info("Application stage changed", {
        applicationId: application.id,
        oldStage: application.currentStage,
        newStage,
        changedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Application stage changed successfully", application);
    } catch (error: any) {
      logger.error("Error changing application stage", { error: error.message });
      ResponseHelper.error(res, `Failed to change application stage: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get all applications (PROTECTED - admin/fund manager access)
   */
  static async getAllApplications(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        stage,
        fundId
      } = req.query;

      const result = await ApplicationService.getAllApplications(
        Number(page),
        Number(limit),
        stage as string,
        fundId as string
      );

      logger.info("Applications retrieved successfully", {
        total: result.total,
        page: result.page,
        requestedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Applications retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting applications", { error: error.message });
      ResponseHelper.error(res, `Failed to get applications: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Delete application (PROTECTED - admin only)
   */
  static async deleteApplication(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      await ApplicationService.deleteApplication(id);

      logger.info("Application deleted successfully", {
        applicationId: id,
        deletedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Application deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting application", { error: error.message });
      ResponseHelper.error(res, `Failed to delete application: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Send stage-specific email notifications
   */
  private static async sendStageSpecificEmail(application: any, newStage: string): Promise<void> {
    const emailData = {
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      businessName: application.businessName,
      applicationId: application.id,
      currentStage: newStage
    };

    switch (newStage) {
      case 'SHORTLISTED':
        await EmailNotificationService.sendApplicationShortlistedEmail(emailData);
        break;
      case 'UNDER_DUE_DILIGENCE':
        await EmailNotificationService.sendDueDiligenceStartedEmail(emailData);
        break;
      case 'DUE_DILIGENCE_COMPLETED':
        await EmailNotificationService.sendDueDiligenceCompletedEmail(emailData);
        break;
      case 'UNDER_BOARD_REVIEW':
        await EmailNotificationService.sendBoardReviewStartedEmail(emailData);
        break;
      case 'BOARD_APPROVED':
        await EmailNotificationService.sendInvestmentDecisionEmail(emailData);
        break;
      case 'BOARD_REJECTED':
        await EmailNotificationService.sendApplicationRejectedEmail(emailData);
        break;
      case 'BOARD_CONDITIONAL':
        await EmailNotificationService.sendInvestmentDecisionEmail(emailData);
        break;
      case 'INVESTMENT_IMPLEMENTATION':
        await EmailNotificationService.sendInvestmentImplementationStartedEmail(emailData);
        break;
      case 'REJECTED':
      case 'NOT_SELECTED':
        await EmailNotificationService.sendApplicationRejectedEmail(emailData);
        break;
      default:
        // Send generic stage update for other stages
        await EmailNotificationService.sendStageUpdateEmail(emailData);
        break;
    }
  }
}
