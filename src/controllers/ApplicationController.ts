//@ts-nocheck
import { Request, Response } from 'express';
import { ApplicationService, CreateApplicationRequest, UpdateApplicationRequest } from '../services/ApplicationService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { ResponseHelper } from '../utils/responseHelper';
import { logger } from '../utils/logger';
import { FirebaseStorageService } from '../services/FirebaseStorageService';
import { prisma } from '../utils/database';
import { parseDate } from "../utils/dateHelper";
import { userCanAccessApplication } from "../utils/applicationFundAccess";
import { RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE } from "../config/applicationStatutoryCompliance";
import { DealCollaborationService } from "../services/DealCollaborationService";

export class ApplicationController {
  /**
   * Create a new application (PUBLIC - no authentication required)
   * Supports both multipart/form-data (with files) and application/json (with document URLs)
   */
  static async createApplication(req: Request, res: Response): Promise<void> {
    // Declare files outside try block so it's accessible in catch
    let files: Express.Multer.File[] = [];
    let isMultipart = false;

    try {
      try {
        if (req.files) {
          const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };
          files = filesObj.files || [];
        }
        isMultipart = files.length > 0;
      } catch (filesError: any) {
        logger.warn("Error extracting files from request", { error: filesError.message });
        files = [];
        isMultipart = false;
      }

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
        let docTypes: string[] = [];
        if (documentTypes) {
          try {
            docTypes =
              typeof documentTypes === "string" ? JSON.parse(documentTypes) : documentTypes;
          } catch (e) {
            ResponseHelper.error(res, "Invalid documentTypes format. Expected JSON array.", undefined, 400);
            return;
          }
        }

        if (docTypes.length !== files.length) {
          logger.info("Auto-detecting document types from filenames", {
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

          try {
            logger.info(`Uploading document ${i + 1}/${files.length}: ${file.originalname}`, {
              fileName: file.originalname,
              fileSize: file.size,
              documentType: documentType
            });

            // Upload to Firebase
            const { filePath, downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
              file.buffer,
              file.originalname,
              tempApplicationId,
              documentType
            );

            logger.info(`✅ Successfully uploaded document ${i + 1}/${files.length}`, {
              fileName: file.originalname,
              downloadURL: downloadURL
            });

            processedDocuments.push({
              documentType: documentType,
              fileName: file.originalname,
              fileUrl: downloadURL,
              fileSize: file.size,
              isRequired: ['BUSINESS_PLAN', 'PROOF_OF_CONCEPT', 'MARKET_RESEARCH', 'PROJECTED_CASH_FLOWS'].includes(documentType)
            });
          } catch (uploadError: any) {
            logger.error(`❌ Failed to upload document ${i + 1}/${files.length}`, {
              fileName: file.originalname,
              fileSize: file.size,
              documentType: documentType,
              error: uploadError.message,
              stack: uploadError.stack
            });
            
            // Provide detailed error message
            const errorMessage = uploadError.message || 'Unknown upload error';
            throw new Error(`Failed to upload document "${file.originalname}" (${i + 1} of ${files.length}): ${errorMessage}`);
          }
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
        foundingDate: foundingDate ? parseDate(foundingDate) : undefined,
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

      logger.info("Application created - starting shortlisting pipeline", {
        applicationId: application.id,
        businessName: application.businessName,
        applicantEmail: application.applicantEmail
      });

      try {
        await ApplicationController.startShortlisting(application.id);
      } catch (shortlistingError: any) {
        logger.error("Failed to process shortlisting after creation", {
          applicationId: application.id,
          error: shortlistingError.message
        });
      }

      ResponseHelper.success(res, "Application created successfully", application, 201);
    } catch (error: any) {
      const fileCount = files ? files.length : 0;
      const hasFiles = isMultipart || false;

      logger.error("❌ Error creating application", {
        error: error?.message,
        stack: error?.stack,
        applicantEmail: req.body?.applicantEmail,
        businessName: req.body?.businessName,
        fileCount,
        hasFiles,
        errorName: error?.name,
        errorCode: error?.code
      });

      const msg =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "An unexpected error occurred";

      const statusCode = ApplicationController.resolveCreateApplicationErrorStatus(error, msg);
      ResponseHelper.error(res, msg, msg, statusCode);
    }
  }

  /** Maps thrown errors to HTTP status; response body uses the real `message` (no generic wrapper). */
  private static resolveCreateApplicationErrorStatus(err: any, msg: string): number {
    if (err?.name === "ReferenceError") {
      return 500;
    }
    if (err?.code === "P2002") {
      return 409;
    }
    const clientError =
      msg.includes("Missing required fields") ||
      msg.includes("Missing required documents") ||
      msg.includes("At least one document is required") ||
      msg.includes("Requested amount must be greater than zero") ||
      msg.includes("Invalid email format") ||
      msg.includes("already applied for investment") ||
      msg.includes("already linked to an internal user account") ||
      msg.includes("Fund not found") ||
      msg.includes("Fund is not accepting applications") ||
      msg.includes("Invalid documentTypes format") ||
      msg.includes("Failed to upload document") ||
      msg.includes("Either files must be uploaded") ||
      msg.includes("This email already applied");
    if (clientError) {
      return 400;
    }
    return 500;
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

      const gate = await prisma.application.findUnique({
        where: { id },
        select: {
          id: true,
          fundId: true,
          assignedAnalystId: true,
          dueDiligenceReview: { select: { reviewerId: true } }
        }
      });

      if (!gate) {
        ResponseHelper.error(res, "Application not found", undefined, 404);
        return;
      }

      const user = (req as any).user;
      if (!(await userCanAccessApplication(user, gate))) {
        ResponseHelper.error(res, "Forbidden: you cannot access this deal", undefined, 403);
        return;
      }

      const light =
        req.query.light === "true" ||
        req.query.light === "1" ||
        String(req.query.light || "").toLowerCase() === "yes";

      const application = await ApplicationService.getApplicationById(id, { light });

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
        foundingDate: updateData.foundingDate ? parseDate(updateData.foundingDate) : undefined,
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

      const application = await ApplicationService.changeApplicationStage(
        id,
        newStage,
        notes,
        (req as any).user?.id
      );

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
   * Legal/compliance — KYC + RBZ document gate for fund disbursement (statutory guardrail).
   */
  static async assignLeadAnalyst(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const analystUserId = req.body?.analystUserId;
      const actorId = (req as any).user?.id;

      if (!id || !analystUserId || !actorId) {
        ResponseHelper.error(res, "Application id, analystUserId, and authentication are required", undefined, 400);
        return;
      }

      const application = await ApplicationService.assignLeadAnalyst(id, analystUserId, actorId);

      const an = application.assignedAnalyst;
      if (an?.email) {
        void EmailNotificationService.sendLeadAnalystAssignedEmail({
          analystName: `${an.firstName} ${an.lastName}`.trim() || "Analyst",
          analystEmail: an.email,
          businessName: application.businessName,
          dealReference: application.dealReference ?? null
        });
      }

      ResponseHelper.success(res, "Lead analyst assigned", application);
    } catch (error: any) {
      logger.error("assignLeadAnalyst", { error: error.message });
      const msg = error.message || "Failed to assign analyst";
      let status = 400;
      if (
        msg.includes("Application not found") ||
        msg.includes("Analyst user not found") ||
        msg.includes("Actor not found")
      ) {
        status = 404;
      } else if (msg.includes("Only fund managers or executives")) {
        status = 403;
      }
      ResponseHelper.error(res, msg, undefined, status);
    }
  }

  static async recordAnalystScreeningScore(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const score = req.body?.score;
      const actorId = (req as any).user?.id;

      if (!id || actorId == null) {
        ResponseHelper.error(res, "Application id and authentication are required", undefined, 400);
        return;
      }

      if (typeof score !== "number") {
        ResponseHelper.error(res, "score (number 0-100) is required", undefined, 400);
        return;
      }

      const application = await ApplicationService.recordAnalystScreeningScore(id, actorId, score);
      ResponseHelper.success(res, "Screening score recorded", application);
    } catch (error: any) {
      logger.error("recordAnalystScreeningScore", { error: error.message });
      const msg = error.message || "Failed to record screening score";
      let status = 500;
      if (msg.includes("not found")) {
        status = 404;
      } else if (msg.includes("Only the assigned lead analyst")) {
        status = 403;
      } else if (
        msg.includes("Assign a lead analyst before") ||
        msg.includes("SCREENING stage") ||
        msg.includes("score must be a number")
      ) {
        status = 400;
      }
      ResponseHelper.error(res, msg, undefined, status);
    }
  }

  /**
   * RBZ Exchange Control approval upload: multipart/form-data, `:id` = application id, field `file`.
   * UAT: any authenticated user (Legal/Compliance role check disabled for testing).
   */
  static async uploadRbzExchangeControlDocument(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id || "").trim();
      const file = req.file as Express.Multer.File | undefined;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }
      if (!file) {
        ResponseHelper.error(
          res,
          "file is required (multipart/form-data, field name: file)",
          undefined,
          400
        );
        return;
      }

      const { downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
        file.buffer,
        file.originalname,
        id,
        RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE
      );

      const document = await ApplicationService.replaceRbzExchangeControlDocument(id, {
        fileName: file.originalname,
        fileUrl: downloadURL,
        fileSize: file.size
      });

      ResponseHelper.success(
        res,
        "RBZ Exchange Control document uploaded",
        {
          applicationId: id,
          document: {
            id: document.id,
            documentType: document.documentType,
            fileName: document.fileName,
            fileUrl: document.fileUrl,
            fileSize: document.fileSize
          }
        },
        201
      );
    } catch (error: any) {
      logger.error("Error uploading RBZ Exchange Control document", { error: error.message });
      const msg = error.message || "Failed to upload document";
      const notFound = msg.includes("Application not found");
      ResponseHelper.error(res, msg, undefined, notFound ? 404 : 500);
    }
  }

  static async updateStatutoryCompliance(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const kycVerified = req.body?.kycVerified;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      if (typeof kycVerified !== "boolean") {
        ResponseHelper.error(res, "kycVerified (boolean) is required", undefined, 400);
        return;
      }

      const application = await ApplicationService.updateStatutoryCompliance(id, kycVerified);
      ResponseHelper.success(res, "Statutory compliance updated", application);
    } catch (error: any) {
      logger.error("Error updating statutory compliance", { error: error.message });
      const msg = error.message || "Failed to update statutory compliance";
      const isValidation =
        msg.includes("RBZ Exchange Control") || msg.includes("Application not found");
      ResponseHelper.error(
        res,
        msg,
        undefined,
        isValidation ? (msg.includes("not found") ? 404 : 400) : 500
      );
    }
  }

  /** Portfolio deal collaboration — mirrors task `GET /api/tasks/:id/messages` shape. */
  static async getDealCollaborationMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      if (!id?.trim() || !userId) {
        return res.status(400).json({ success: false, message: "Application ID required" });
      }
      const messages = await DealCollaborationService.listMessages(id.trim(), userId);
      return res.status(200).json({
        success: true,
        messages,
        realtime: {
          subscribeEvent: "deal_collaboration_message",
          roomPattern: `deal:${id.trim()}`
        }
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /** JSON-only deal message (no attachments). Same persistence + Socket.IO as multipart `.../collaboration/comments`. */
  static async createDealCollaborationMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const { content, mentionUserIds: rawMentions } = req.body || {};
      const mentionUserIds = Array.isArray(rawMentions)
        ? rawMentions
        : rawMentions != null && rawMentions !== ""
          ? [String(rawMentions)]
          : [];

      if (!id?.trim() || !userId) {
        return res.status(400).json({ success: false, message: "Application ID required" });
      }

      const data = await DealCollaborationService.createMessage({
        applicationId: id.trim(),
        actorId: userId,
        content: String(content || ""),
        mentionUserIds,
        files: []
      });

      return res.status(201).json({
        success: true,
        message: "Deal collaboration message sent successfully",
        data,
        realtime: {
          event: "deal_collaboration_message",
          room: `deal:${id.trim()}`,
          hint: "Subscribe via Socket.IO after emit join_deal { applicationId }"
        }
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /** Multipart deal comment with optional attachments (mirrors `POST /api/tasks/:id/comments`). */
  static async createDealCollaborationComment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      if (!id?.trim() || !userId) {
        return res.status(400).json({ success: false, message: "Application ID required" });
      }

      const mentionUserIds = Array.isArray(req.body.mentionUserIds)
        ? req.body.mentionUserIds
        : typeof req.body.mentionUserIds === "string"
          ? JSON.parse(req.body.mentionUserIds)
          : [];

      const comment = await DealCollaborationService.createMessage({
        applicationId: id.trim(),
        actorId: userId,
        content: req.body.content,
        mentionUserIds,
        files: Array.isArray(req.files) ? req.files : []
      });

      return res.status(201).json({
        success: true,
        message: "Deal collaboration comment created successfully",
        comment,
        realtime: {
          event: "deal_collaboration_message",
          room: `deal:${id.trim()}`
        }
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async deleteDealCollaborationMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id, msgId } = req.params;
      const userId = (req as any).user?.id;
      if (!id?.trim() || !msgId || !userId) {
        return res.status(400).json({ success: false, message: "Application ID and message ID required" });
      }

      const result = await DealCollaborationService.deleteMessage(id.trim(), msgId, userId);

      return res.status(200).json({
        success: true,
        message: "Deal collaboration message deleted successfully",
        result,
        realtime: {
          events: ["deal_collaboration_message", "deal_comment_deleted"],
          roomPattern: `deal:${id.trim()}`,
          hint: "Payload includes isDeleted: true; remove row from UI by id"
        }
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /** Single message row (mirrors `GET /api/tasks/:id/chats/:msgId`). */
  static async getDealCollaborationChatMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id, msgId } = req.params;
      const userId = (req as any).user?.id;
      if (!id?.trim() || !msgId || !userId) {
        return res.status(400).json({ success: false, message: "Application ID and message ID required" });
      }
      const message = await DealCollaborationService.getChatMessage(id.trim(), msgId, userId);
      return res.status(200).json({ success: true, message });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getDealCollaborationMentionSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const q = req.query.q as string | undefined;
      if (!id?.trim() || !userId) {
        return res.status(400).json({ success: false, message: "Application ID required" });
      }
      const users = await DealCollaborationService.getMentionSuggestions(id.trim(), userId, q);
      return res.status(200).json({ success: true, users });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
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

      if (application.currentStage !== "SCREENING_PENDING") {
        ResponseHelper.error(
          res,
          `Application is currently in ${application.currentStage}. Only applications in SCREENING_PENDING can be processed.`,
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

  /**
   * Get applications below threshold (PROTECTED - admin/fund manager access)
   * Returns both REJECTED and BELOW_THRESHOLD applications
   */
  static async getBelowThresholdApplications(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const result = await ApplicationService.getAllApplications(
        page,
        limit,
        ["REJECTED", "REJECTED_SCREENING", "AUTO_REJECTED", "BELOW_THRESHOLD"],
        undefined,
        true
      );

      logger.info("Below threshold applications retrieved", {
        count: result.applications.length,
        total: result.total,
        requestedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Below threshold applications retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting below threshold applications", { error: error.message });
      ResponseHelper.error(res, `Failed to get below threshold applications: ${error.message}`, undefined, 500);
    }
  }

}
