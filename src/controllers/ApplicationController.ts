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
   * Supports both multipart/form-data (with files) and application/json (with document URLs)
   */
  static async createApplication(req: Request, res: Response): Promise<void> {
    try {
      // Handle both multipart/form-data (with files) and application/json
      const files = (req.files as { [fieldname: string]: Express.Multer.File[] })?.['files'] || [];
      const isMultipart = files.length > 0;

      let {
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
        documents,
        documentTypes
      } = req.body;

      // Validate required fields
      if (!applicantName || !applicantEmail || !businessName || !requestedAmount) {
        ResponseHelper.error(res, "Missing required fields: applicantName, applicantEmail, businessName, requestedAmount", undefined, 400);
        return;
      }

      // Check if email already exists in applications (BEFORE any file uploads)
      logger.info('🔍 Checking if email already exists (before file uploads)', {
        applicantEmail: applicantEmail.toLowerCase().trim(),
        hasFiles: isMultipart && files.length > 0,
        fileCount: files.length
      });

      const existingApplication = await prisma.application.findFirst({
        where: { applicantEmail: applicantEmail.toLowerCase().trim() }
      });

      if (existingApplication) {
        logger.warn('⚠️ Email already exists - rejecting application before file upload', {
          applicantEmail: applicantEmail.toLowerCase().trim(),
          existingApplicationId: existingApplication.id,
          existingBusinessName: existingApplication.businessName
        });
        ResponseHelper.error(res, "This email already applied for investment", undefined, 400);
        return;
      }

      logger.info('✅ Email validation passed - proceeding with file uploads', {
        applicantEmail: applicantEmail.toLowerCase().trim()
      });

      // If files are provided, upload them to Firebase first
      let processedDocuments: Array<{
        documentType: string;
        fileName: string;
        fileUrl: string;
        fileSize: number;
        isRequired: boolean;
      }> = [];

      if (isMultipart && files.length > 0) {
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

        // If documentTypes not provided or doesn't match, auto-detect from filenames
        if (docTypes.length !== files.length) {
          logger.info('Auto-detecting document types from filenames', {
            filesCount: files.length,
            docTypesCount: docTypes.length
          });
          
          docTypes = files.map(file => {
            const fileName = file.originalname.toUpperCase();
            // Auto-detect document type from filename
            if (fileName.includes('BUSINESS_PLAN') || fileName.includes('BUSINESS')) {
              return 'BUSINESS_PLAN';
            } else if (fileName.includes('PROOF_OF_CONCEPT') || fileName.includes('POC')) {
              return 'PROOF_OF_CONCEPT';
            } else if (fileName.includes('MARKET_RESEARCH') || fileName.includes('MARKET')) {
              return 'MARKET_RESEARCH';
            } else if (fileName.includes('PROJECTED_CASH_FLOWS') || fileName.includes('CASH_FLOW') || fileName.includes('CASH_FLOWS')) {
              return 'PROJECTED_CASH_FLOWS';
            } else {
              return 'OTHER';
            }
          });
          
          logger.info('Auto-detected document types', { docTypes });
        }

        // Generate temporary application ID for upload (will be replaced after creation)
        const tempApplicationId = `temp-${Date.now()}`;

        // Upload files to Firebase and prepare document objects
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const documentType = docTypes[i] || 'OTHER';

          // Upload to Firebase
          const { filePath, downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
            file.buffer,
            file.originalname,
            tempApplicationId,
            documentType
          );

          processedDocuments.push({
            documentType: documentType,
            fileName: file.originalname,
            fileUrl: downloadURL,
            fileSize: file.size,
            isRequired: ['BUSINESS_PLAN', 'PROOF_OF_CONCEPT', 'MARKET_RESEARCH', 'PROJECTED_CASH_FLOWS'].includes(documentType)
          });
        }
      } else if (documents && Array.isArray(documents)) {
        // Use provided document URLs (from JSON request)
        processedDocuments = documents;
      } else {
        ResponseHelper.error(res, "Either files must be uploaded or documents array must be provided", undefined, 400);
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
        documents: processedDocuments
      };

      const application = await ApplicationService.createApplication(applicationParams);

      // If files were uploaded with temporary ID, update Firebase paths if needed
      // (The upload already happened with temp ID, but files are linked to application now)
      // Note: Firebase paths are already set, so this is fine

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

      logger.info("Application created successfully - shortlisting pipeline scheduled", {
        applicationId: application.id,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail
      });

      ResponseHelper.success(res, "Application created successfully", application, 201);

      setTimeout(() => {
        ApplicationController.startShortlisting(application.id)
          .catch((error: any) => {
            logger.error("Failed to process shortlisting after creation", {
              applicationId: application.id,
              error: error.message
            });
          });
      }, 0);
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
   * Internal helper to start shortlisting asynchronously
   */
  private static async startShortlisting(applicationId: string): Promise<void> {
    try {
      const { ApplicationScoringService } = require('../services/ApplicationScoringService');

      logger.info("➡️ Initiating shortlisting pipeline", { applicationId });

      await ApplicationScoringService.processApplicationForShortlisting(applicationId);

      logger.info("✅ Shortlisting pipeline finished", { applicationId });
    } catch (error: any) {
      logger.error("❌ Shortlisting pipeline error", {
        applicationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Trigger shortlisting (PROTECTED - admin/fund manager access)
   */
  static async triggerShortlisting(req: Request, res: Response): Promise<void> {
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

      if (application.currentStage !== "PENDING_SHORTLISTING") {
        ResponseHelper.error(
          res,
          `Application is currently in ${application.currentStage}. Only applications pending shortlisting can be processed.`,
          undefined,
          400
        );
        return;
      }

      const { ApplicationScoringService } = require('../services/ApplicationScoringService');

      ApplicationScoringService.processApplicationForShortlisting(id)
        .then(() => {
          logger.info("Shortlisting completed", {
            applicationId: id,
            applicantEmail: application.applicantEmail
          });
        })
        .catch((error: any) => {
          logger.error("Shortlisting failed", {
            applicationId: id,
            error: error.message
          });
        });

      logger.info("Shortlisting triggered", {
        applicationId: id,
        requestedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Shortlisting process started", { applicationId: id }, 202);
    } catch (error: any) {
      logger.error("Error triggering shortlisting", { error: error.message });
      ResponseHelper.error(res, `Failed to trigger shortlisting: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get all applications (PROTECTED - admin/fund manager access)
   */
  static async getAllApplications(req: Request, res: Response): Promise<void> {
    try {
      const {
        page: pageParam,
        limit: limitParam,
        stage,
        fundId,
        paginate: paginateParam
      } = req.query;

      const paginationExplicit = typeof paginateParam !== 'undefined' || typeof pageParam !== 'undefined' || typeof limitParam !== 'undefined';
      const paginate = paginationExplicit ? paginateParam !== 'false' && paginateParam !== '0' : false;

      const page = paginate ? Number(pageParam ?? 1) : undefined;
      const limit = paginate ? Number(limitParam ?? 10) : undefined;

      const result = await ApplicationService.getAllApplications(
        page,
        limit,
        stage as string,
        fundId as string,
        paginate
      );

      logger.info("Applications retrieved successfully", {
        total: result.total,
        page: result.page,
        paginate,
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

}
